// Solution Vault gift delivery (WBR-445), reached at /api/gift-delivery through
// the systeme-webhook dispatcher.
//
// The sender signs the raw JSON body with the Systeme webhook secret
// (x-webhook-signature, HMAC-SHA256 hex). The body names only a source key, an
// event id and an email. Which book, which grant kind and whether the source is
// live all come from solution_vault_gift_sources in the database, and
// receive_book_gift rechecks the credential against its stored hash, so no
// service-role key leaves Supabase. /yeees is an inactive source until its real
// form exists.
//
// Welcome mail goes out only when a mail route is configured (RESEND_API_KEY)
// and only for a delivery that has not already recorded a sent welcome, so a
// replayed event never sends twice and an unsent welcome stays retryable.
import { verifySystemeSignature } from '../systeme-webhook.js';

export const config = { maxDuration: 15 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || 'sb_publishable_v7gCCrxgx2854Q3x-JIptw_66DcZhnH';
const MAX_BODY_BYTES = 16 * 1024;
const STUDIO_ORIGIN = 'https://studio.coloradomastermind.com';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('Payload too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function rpc(name, args) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error((data && data.message) || 'Database call failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function welcomeEmail({ bookSlug, bookTitle }) {
  const link = STUDIO_ORIGIN + '/vault?book=' + encodeURIComponent(bookSlug);
  const title = escapeHtml(bookTitle);
  return {
    subject: 'Your copy of ' + bookTitle + ' is ready',
    html: '<p>Hi there,</p>' +
      '<p>Your copy of <strong>' + title + '</strong> is in your Solution Vault, inside Colorado Mastermind Studio.</p>' +
      '<p><a href="' + link + '">Open your book</a></p>' +
      '<p>Sign in with this email address and it opens straight to the book. It remembers your page, so you can pick up where you left off.</p>'
  };
}

async function sendWelcome(email, book) {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) return { status: 'pending', error: 'No mail route is configured on this host; the welcome stays pending.' };
  const message = welcomeEmail(book);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'David Bee <wbee@ancientcosmic.com>', to: [email], subject: message.subject, html: message.html })
    });
    if (response.ok) return { status: 'sent' };
    const data = await response.json().catch(() => ({}));
    return { status: 'failed', error: data.message || ('Mail route returned ' + response.status) };
  } catch (error) {
    return { status: 'failed', error: error.message || 'Mail route unreachable.' };
  }
}

export default async function giftDeliveryHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const secret = process.env.SYSTEME_WEBHOOK_SECRET || '';
  if (!secret) return sendJson(res, 503, { error: 'Gift delivery is not configured.' });

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    return sendJson(res, error.status || 400, { error: error.message });
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch (error) {
    return sendJson(res, 400, { error: 'Invalid JSON payload.' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return sendJson(res, 400, { error: 'Invalid JSON payload.' });
  }

  if (!verifySystemeSignature(rawBody, payload, req.headers['x-webhook-signature'], secret)) {
    return sendJson(res, 401, { error: 'Invalid delivery signature.' });
  }

  const sourceKey = String(payload.source_key || '').trim().toLowerCase();
  const eventId = String(req.headers['x-webhook-message-id'] || payload.event_id || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();

  let result;
  try {
    result = await rpc('receive_book_gift', { p_secret: secret, p_source_key: sourceKey, p_event_id: eventId, p_email: email });
  } catch (error) {
    console.error('Gift delivery failed:', error.message);
    return sendJson(res, 500, { error: 'Gift delivery could not be recorded.' });
  }

  if (!result || result.ok !== true) {
    const code = result && result.error;
    const status = code === 'source_inactive' ? 409 : 400;
    return sendJson(res, status, { ok: false, error: code || 'refused', note: result && result.note });
  }

  // A welcome goes out at most once per delivery: only while it is not sent.
  let notification = result.notification_status;
  if (notification !== 'sent') {
    const outcome = await sendWelcome(email, {
      bookSlug: result.book_slug || '5e-framework',
      bookTitle: result.book_title || 'your book'
    });
    if (outcome.status !== 'pending') {
      try {
        await rpc('record_book_gift_notification', {
          p_secret: secret, p_delivery_id: result.delivery_id, p_status: outcome.status, p_error: outcome.error || null
        });
      } catch (error) {
        console.error('Gift notification record failed:', error.message);
      }
    }
    notification = outcome.status;
  }

  return sendJson(res, 200, {
    ok: true,
    duplicate: Boolean(result.duplicate),
    grant_state: result.grant_state,
    notification_status: notification
  });
}
