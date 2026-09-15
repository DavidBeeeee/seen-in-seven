import { createHmac, timingSafeEqual } from 'node:crypto';

export const config = {
  api: { bodyParser: false }
};

const MAX_BODY_BYTES = 1024 * 1024;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || 'sb_publishable_v7gCCrxgx2854Q3x-JIptw_66DcZhnH';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readRawBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error('Webhook payload is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function normalizeForSystemeSignature(payload) {
  return JSON.stringify(payload)
    .replace(/\//g, '\\/')
    .replace(/[\u007f-\uffff]/g, character => {
      return '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0');
    });
}

function digest(secret, value) {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

function signaturesMatch(received, expected) {
  const receivedBuffer = Buffer.from(String(received || '').trim().toLowerCase(), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || '').trim().toLowerCase(), 'utf8');
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function verifySystemeSignature(rawBody, payload, receivedSignature, secret) {
  if (!receivedSignature || !secret) return false;
  const normalizedSignature = digest(secret, normalizeForSystemeSignature(payload));
  if (signaturesMatch(receivedSignature, normalizedSignature)) return true;

  // Systeme normally sends the normalized representation. Accepting a valid
  // signature of the untouched body keeps the endpoint compatible with older
  // deliveries that were already normalized before transmission.
  return signaturesMatch(receivedSignature, digest(secret, rawBody));
}

async function callSupabaseRpc(name, args, env) {
  const response = await fetch(env.url + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (error) { body = { message: text }; }
  if (!response.ok) {
    const detail = body && (body.message || body.error || body.hint);
    throw new Error(detail || 'Supabase rejected the webhook event.');
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const env = {
    secret: process.env.SYSTEME_WEBHOOK_SECRET,
    url: process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co'
  };
  if (!env.secret) {
    return sendJson(res, 503, { error: 'Webhook processing is not configured.' });
  }

  try {
    const rawBody = await readRawBody(req);
    let payload;
    try { payload = JSON.parse(rawBody); } catch (error) {
      return sendJson(res, 400, { error: 'Invalid JSON payload.' });
    }

    const signature = req.headers['x-webhook-signature'];
    if (!verifySystemeSignature(rawBody, payload, signature, env.secret)) {
      return sendJson(res, 401, { error: 'Invalid webhook signature.' });
    }

    const messageId = String(req.headers['x-webhook-message-id'] || '').trim();
    const eventType = String(req.headers['x-webhook-event'] || '').trim();
    if (!messageId || !eventType) {
      return sendJson(res, 400, { error: 'Webhook message ID and event type are required.' });
    }

    const result = await callSupabaseRpc('receive_systeme_webhook_event', {
      p_secret: env.secret,
      p_message_id: messageId,
      p_delivery_attempt_id: String(req.headers['x-webhook-delivery-attempt-id'] || '').trim() || null,
      p_event_type: eventType,
      p_event_timestamp: String(req.headers['x-webhook-event-timestamp'] || '').trim() || null,
      p_payload: payload
    }, env);

    return sendJson(res, 200, { ok: true, result });
  } catch (error) {
    console.error('Systeme webhook failed:', error);
    return sendJson(res, 500, { error: 'Webhook processing failed.' });
  }
}
