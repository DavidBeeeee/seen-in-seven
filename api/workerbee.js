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
  const internalSecret = process.env.WORKERBEE_STUDIO_SECRET;
  const chatgptSecret = process.env.WORKERBEE_CHATGPT_SECRET;
  if (internalSecret && internalSecret.length >= 32 && safeEqual(supplied, internalSecret)) {
    return { serverSecret: internalSecret, token: SUPABASE_ANON_KEY };
  }
  if (internalSecret && internalSecret.length >= 32 && chatgptSecret && chatgptSecret.length >= 32 && safeEqual(supplied, chatgptSecret)) {
    return { serverSecret: internalSecret, token: SUPABASE_ANON_KEY, compact: true };
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
  'create_update', 'update_update', 'create_journal', 'update_journal', 'mark_viewed',
  'reorder_outcomes', 'upsert_client', 'upsert_event', 'upsert_product'
]);
const TASK_FIELDS = new Set(['id', 'title', 'section_id', 'sort_order', 'status', 'owner', 'due_date', 'follow_up_date', 'work_area', 'source_url']);
const UPDATE_FIELDS = new Set(['id', 'kind', 'title', 'body', 'status', 'action_id', 'due_at', 'metadata']);
const JOURNAL_FIELDS = new Set(['id', 'entry_date', 'category', 'title', 'body', 'fingerprint', 'status', 'evidence', 'reopening_condition', 'metadata']);
const SECTION_FIELDS = new Set(['id', 'title', 'sort_order', 'archived_at']);
const OPERATING_FIELDS = new Set([
  'ids', 'stable_key', 'name', 'family', 'relationship_status', 'current_focus', 'next_meeting_at',
  'follow_up_date', 'nearest_deadline', 'transcript_status', 'commitments', 'drive_url', 'client_thread_url',
  'living_plan_url', 'event_type', 'status', 'starts_at', 'ends_at', 'current_milestone', 'next_action',
  'registration_url', 'meeting_url', 'source_url', 'priority', 'current_objective', 'last_meaningful_change_at',
  'next_review_date', 'next_improvement', 'important_risk', 'route_url', 'repository_url', 'roadmap_url', 'metadata'
]);

function pick(input, fields) {
  return Object.fromEntries(Object.entries(input || {}).filter(([key]) => fields.has(key)));
}

function sanitize(action, input) {
  let payload;
  if (action === 'reorder_outcomes' || action.startsWith('upsert_')) payload = pick(input, OPERATING_FIELDS);
  else if (action.includes('section')) payload = pick(input, SECTION_FIELDS);
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
  if (action === 'reorder_outcomes') {
    if (!Array.isArray(payload.ids) || payload.ids.length > 3 || payload.ids.some(id => typeof id !== 'string')) throw new Error('A valid outcome order is required.');
  }
  if (action.startsWith('upsert_')) {
    payload.stable_key = cleanText(payload.stable_key, 120, true);
    if ('name' in payload) payload.name = cleanText(payload.name, 160, true);
  }
  return payload;
}

function excerpt(value, max = 900) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compactChatGPTState(result) {
  return {
    generatedAt: result.generatedAt,
    readState: result.readState,
    tasks: (result.tasks || []).filter(item => !item.deleted_at).slice(0, 12).map(item => pick(item, new Set([
      'id', 'title', 'status', 'owner', 'due_date', 'follow_up_date', 'work_area'
    ]))),
    clients: (result.clients || []).filter(item => !item.archived_at).slice(0, 12).map(item => pick(item, new Set([
      'id', 'name', 'relationship_status', 'current_focus', 'next_meeting_at', 'follow_up_date',
      'nearest_deadline', 'transcript_status'
    ]))),
    events: (result.events || []).filter(item => !item.archived_at).slice(0, 12).map(item => pick(item, new Set([
      'id', 'title', 'event_type', 'status', 'starts_at', 'ends_at', 'current_milestone', 'next_action'
    ]))),
    products: (result.products || []).filter(item => !item.archived_at).slice(0, 12).map(item => pick(item, new Set([
      'id', 'name', 'family', 'status', 'priority', 'current_objective', 'next_improvement',
      'important_risk', 'next_review_date'
    ]))),
    updates: (result.updates || []).slice(0, 8).map(item => ({
      id: item.id, kind: item.kind, title: item.title, status: item.status, due_at: item.due_at,
      body: excerpt(item.body, 260)
    })),
    journal: (result.journal || []).slice(0, 3).map(item => ({
      id: item.id, entry_date: item.entry_date, category: item.category, title: item.title,
      status: item.status, body: excerpt(item.body, 220), evidence: excerpt(item.evidence, 160)
    }))
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
  const auth = await authorize(req);
  if (!auth) return json(res, 403, { error: 'This private workspace is only available to David.' });
  try {
    if (req.method === 'GET') {
      const result = await rpc('workerbee_bootstrap', { p_server_secret: auth.serverSecret }, auth.token);
      return json(res, 200, auth.compact ? compactChatGPTState(result) : result);
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || '');
    if (!ACTIONS.has(action)) return json(res, 400, { error: 'Unknown WorkerBee action.' });
    const payload = sanitize(action, body.payload || {});
    const operatingAction = action === 'reorder_outcomes' || action.startsWith('upsert_');
    const result = await rpc(operatingAction ? 'workerbee_operating_mutate' : 'workerbee_mutate', { p_action: action, p_payload: payload, p_server_secret: auth.serverSecret }, auth.token);
    return json(res, 200, { result });
  } catch (error) {
    console.error('WorkerBee API error:', error);
    return json(res, 500, { error: error.message || 'WorkerBee could not save that change.' });
  }
}
