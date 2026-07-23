import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const COOKIE_NAME = 'sis_guest';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function authenticatedUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const response = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user && user.id ? user : null;
}

async function authenticatedAdmin(req) {
  const token = bearerToken(req);
  const user = await authenticatedUser(req);
  if (!user) return null;
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/is_admin', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  if (!response.ok || (await response.json().catch(() => false)) !== true) return null;
  return user;
}

function guestSecret() {
  const secret = process.env.GUEST_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Guest access is not configured.');
  return secret;
}

function encode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value) {
  return createHmac('sha256', guestSecret()).update(value).digest('base64url');
}

function signedGuest(payload) {
  const encoded = encode(JSON.stringify(payload));
  return encoded + '.' + sign(encoded);
}

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    return cookies;
  }, {});
}

function readGuest(req) {
  try {
    const raw = parseCookies(req)[COOKIE_NAME] || '';
    const [encoded, signature] = raw.split('.');
    if (!encoded || !signature) return null;
    const expected = sign(encoded);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    const payload = JSON.parse(decode(encoded));
    if (!payload.id || !payload.createdAt) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function writeGuest(res, payload) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    COOKIE_NAME + '=' + signedGuest(payload) +
      '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + COOKIE_MAX_AGE + secure
  );
}

function ensureGuest(req, res) {
  const existing = readGuest(req);
  if (existing) return existing;
  const guest = { id: randomUUID(), createdAt: Date.now(), verifiedAt: null };
  writeGuest(res, guest);
  return guest;
}

function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket && req.socket.remoteAddress || 'unknown');
}

function ipHash(req) {
  return createHash('sha256').update(requestIp(req) + ':' + guestSecret()).digest('hex');
}

async function consumeQuota({ subject, endpoint, limit, req, userId = null }) {
  const rateSecret = process.env.RATE_LIMIT_SECRET;
  if (!rateSecret || rateSecret.length < 32) throw new Error('Usage protection is not configured.');
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/consume_api_quota', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_server_secret: rateSecret,
      p_subject_key: subject,
      p_user_id: userId,
      p_ip_hash: ipHash(req),
      p_endpoint: endpoint,
      p_hourly_limit: limit,
      p_ip_hourly_limit: Math.max(limit * 3, 15)
    })
  });
  if (!response.ok) throw new Error('Usage protection could not be checked.');
  return (await response.json().catch(() => false)) === true;
}

async function verifyTurnstile(token, req) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error('Human verification is not configured.');
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', String(token || ''));
  form.set('remoteip', requestIp(req));
  form.set('idempotency_key', randomUUID());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    const isTestKey = secret === '1x0000000000000000000000000000000AA';
    return result.success === true && (isTestKey || result.action === 'sis_guest_unlock');
  } finally {
    clearTimeout(timeout);
  }
}

export {
  json,
  authenticatedUser,
  authenticatedAdmin,
  ensureGuest,
  readGuest,
  writeGuest,
  consumeQuota,
  verifyTurnstile
};
