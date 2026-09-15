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

export function describeSystemeTagWrite(action) {
  if (!action || action.configured !== true) {
    return {
      status: 'skipped',
      reason: action?.reason || 'tag_not_configured'
    };
  }

  const tagId = Number(action.tag_id);
  const contactId = Number(action.contact_id);
  const contactEmail = String(action.contact_email || '').trim().toLowerCase();
  if (!Number.isInteger(tagId) || tagId < 1 || (!contactEmail && (!Number.isInteger(contactId) || contactId < 1))) {
    throw new Error('Systeme tag action is missing a valid contact identity or tag ID.');
  }

  return {
    status: 'ready',
    contactId: Number.isInteger(contactId) && contactId > 0 ? contactId : null,
    contactEmail: contactEmail || null,
    tagId,
    event: String(action.event || ''),
    productKey: String(action.product_key || '')
  };
}

export async function applySystemeTag(action, options = {}) {
  const write = describeSystemeTagWrite(action);
  if (write.status !== 'ready') return write;
  if (options.dryRun === true) return { ...write, status: 'dry_run' };

  const apiKey = String(options.apiKey || '').trim();
  if (!apiKey) throw new Error('SYSTEME_API_KEY is not configured.');

  const fetchImpl = options.fetchImpl || fetch;
  let contactId = write.contactId;
  if (!contactId) {
    const lookup = await fetchImpl(`https://api.systeme.io/api/contacts?email=${encodeURIComponent(write.contactEmail)}&limit=10`, {
      headers: { 'X-API-Key': apiKey }
    });
    if (!lookup.ok) throw new Error(`Systeme contact lookup failed with HTTP ${lookup.status}.`);
    const body = await lookup.json();
    const exact = (body.items || []).filter(item => String(item.email || '').trim().toLowerCase() === write.contactEmail);
    if (exact.length !== 1 || !Number.isInteger(Number(exact[0].id))) {
      throw new Error(`Systeme contact lookup returned ${exact.length} exact matches.`);
    }
    contactId = Number(exact[0].id);
  }

  const response = await fetchImpl(`https://api.systeme.io/api/contacts/${contactId}/tags`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify({ tagId: write.tagId })
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`Systeme tag write failed with HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
  }

  return { ...write, contactId, status: 'applied', httpStatus: response.status };
}

async function deliverSystemeTag(messageId, secret, env, options = {}) {
  const action = await callSupabaseRpc('prepare_systeme_contact_tag', {
    p_secret: secret,
    p_message_id: messageId
  }, env);

  if (action?.duplicate === true) {
    return { status: 'already_applied', event: action.event || null, productKey: action.product_key || null };
  }

  let outcome;
  try {
    outcome = await applySystemeTag(action, options);
  } catch (error) {
    await callSupabaseRpc('record_systeme_contact_tag_outcome', {
      p_secret: secret,
      p_message_id: messageId,
      p_status: 'failed',
      p_detail: { error: error.message }
    }, env);
    throw error;
  }

  await callSupabaseRpc('record_systeme_contact_tag_outcome', {
    p_secret: secret,
    p_message_id: messageId,
    p_status: outcome.status,
    p_detail: outcome
  }, env);
  return outcome;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const env = {
    secret: process.env.SYSTEME_WEBHOOK_SECRET,
    url: process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co',
    systemeApiKey: process.env.SYSTEME_API_KEY
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

    const systemeTag = await deliverSystemeTag(messageId, env.secret, env, {
      apiKey: env.systemeApiKey
    });

    return sendJson(res, 200, { ok: true, result, systemeTag });
  } catch (error) {
    console.error('Systeme webhook failed:', error);
    return sendJson(res, 500, { error: 'Webhook processing failed.' });
  }
}
