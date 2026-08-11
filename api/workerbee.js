import { timingSafeEqual } from 'node:crypto';
import { authenticatedAdmin, json } from './_lib/security.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function authorize(req) {
  const supplied = String(req.headers['x-workerbee-secret'] || '');
  const expected = process.env.WORKERBEE_STUDIO_SECRET;
  if (expected && expected.length >= 32 && safeEqual(supplied, expected)) {
    return { serverSecret: supplied, token: SUPABASE_ANON_KEY };
  }
  const admin = await authenticatedAdmin(req);
  return admin ? { serverSecret: null, token: bearerToken(req) } : null;
}

async function rpc(name, body, token) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`WorkerBee database request failed (${response.status}): ${detail.slice(0, 240)}`);
  }
  return response.json();
}

function cleanText(value, max = 500, required = false) {
  const text = String(value == null ? '' : value).trim().slice(0, max);
  if (required && !text) throw new Error('A title is required.');
  return text || null;
}

function cleanUrl(value) {
  const text = cleanText(value, 1000);
  if (!text) return null;
  const parsed = new URL(text);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Source links must use http or https.');
  return parsed.toString();
}

const ACTIONS = new Set([
  'create_section', 'update_section', 'create_task', 'update_task', 'delete_task', 'restore_task',
  'create_update', 'update_update', 'create_journal', 'update_journal', 'mark_viewed'
]);
const TASK_FIELDS = new Set(['id', 'title', 'section_id', 'sort_order', 'status', 'owner', 'due_date', 'follow_up_date', 'work_area', 'source_url']);
const UPDATE_FIELDS = new Set(['id', 'kind', 'title', 'body', 'status', 'action_id', 'due_at', 'metadata']);
const JOURNAL_FIELDS = new Set(['id', 'entry_date', 'category', 'title', 'body', 'fingerprint', 'status', 'evidence', 'reopening_condition', 'metadata']);
const SECTION_FIELDS = new Set(['id', 'title', 'sort_order', 'archived_at']);

function pick(input, fields) {
  return Object.fromEntries(Object.entries(input || {}).filter(([key]) => fields.has(key)));
}

function sanitize(action, input) {
  let payload;
  if (action.includes('section')) payload = pick(input, SECTION_FIELDS);
  else if (action.includes('task')) payload = pick(input, TASK_FIELDS);
  else if (action.includes('journal')) payload = pick(input, JOURNAL_FIELDS);
  else if (action.includes('update')) payload = pick(input, UPDATE_FIELDS);
  else payload = { surface: input.surface === 'todo' ? 'todo' : 'dashboard' };

  if ('title' in payload) {
    const max = action.includes('section') ? 120 : action.includes('task') ? 500 : 300;
    payload.title = cleanText(payload.title, max, true);
  }
  if (action === 'create_journal' || (action === 'update_journal' && 'body' in payload)) payload.body = cleanText(payload.body, 30000, true);
  if (action === 'create_update' || action === 'update_update') {
    if ('body' in payload) payload.body = cleanText(payload.body, 10000) || '';
  }
  if ('source_url' in payload) payload.source_url = cleanUrl(payload.source_url);
  if ('sort_order' in payload) payload.sort_order = Number(payload.sort_order) || 0;
  if ('metadata' in payload && (!payload.metadata || typeof payload.metadata !== 'object' || Array.isArray(payload.metadata))) payload.metadata = {};
  return payload;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
  const auth = await authorize(req);
  if (!auth) return json(res, 403, { error: 'This private workspace is only available to David.' });
  try {
    if (req.method === 'GET') {
      const result = await rpc('workerbee_bootstrap', { p_server_secret: auth.serverSecret }, auth.token);
      return json(res, 200, result);
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || '');
    if (!ACTIONS.has(action)) return json(res, 400, { error: 'Unknown WorkerBee action.' });
    const payload = sanitize(action, body.payload || {});
    const result = await rpc('workerbee_mutate', { p_action: action, p_payload: payload, p_server_secret: auth.serverSecret }, auth.token);
    return json(res, 200, { result });
  } catch (error) {
    console.error('WorkerBee API error:', error);
    return json(res, 500, { error: error.message || 'WorkerBee could not save that change.' });
  }
}
