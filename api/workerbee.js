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
  'create_item_note', 'create_task_note', 'acknowledge_task_note',
  'create_update', 'update_update', 'create_journal', 'update_journal', 'mark_viewed',
  'reorder_outcomes', 'upsert_client', 'upsert_event', 'upsert_product'
]);
// WBR-347. `urgent` and `important` are the quadrant, and both are tri-state:
// true, false, or absent meaning nobody has decided yet. `routed_at` is
// deliberately not here. It is stamped inside workerbee_mutate by the act of
// deciding, so a caller cannot claim an item was routed without saying which
// quadrant it went into.
const TASK_FIELDS = new Set(['id', 'title', 'section_id', 'sort_order', 'status', 'owner', 'due_date', 'follow_up_date', 'work_area', 'source_url', 'urgent', 'important']);
// A note carries nothing but the task it belongs to and the words. `author` is
// derived inside workerbee_mutate from the call itself, never from the payload,
// so a note cannot claim to be David's because a caller said so.
const ITEM_NOTE_FIELDS = new Set(['id', 'task_id', 'update_id', 'body']);
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
  else if (action.includes('item_note') || action.includes('task_note')) payload = pick(input, ITEM_NOTE_FIELDS);
  else if (action.includes('task')) payload = pick(input, TASK_FIELDS);
  else if (action.includes('journal')) payload = pick(input, JOURNAL_FIELDS);
  else if (action.includes('update')) payload = pick(input, UPDATE_FIELDS);
  else payload = { surface: input.surface === 'todo' ? 'todo' : 'dashboard' };

  if ('title' in payload) {
    const max = action.includes('section') ? 120 : action.includes('task') ? 500 : 300;
    payload.title = cleanText(payload.title, max, true);
  }
  if (action === 'create_item_note' || action === 'create_task_note') {
    payload.task_id = cleanText(payload.task_id, 64);
    payload.update_id = cleanText(payload.update_id, 64);
    if (Boolean(payload.task_id) === Boolean(payload.update_id)) throw new Error('A note has to belong to exactly one ToDo item.');
    payload.body = cleanText(payload.body, 4000);
    if (!payload.body) throw new Error('A note needs something written in it.');
  }
  if (action === 'acknowledge_task_note') {
    payload.id = cleanText(payload.id, 64);
    if (!payload.id) throw new Error('Acknowledging a note needs the note.');
  }
  if (action === 'create_journal' || (action === 'update_journal' && 'body' in payload)) payload.body = cleanText(payload.body, 30000, true);
  if (action === 'create_update' || action === 'update_update') {
    if ('body' in payload) payload.body = cleanText(payload.body, 10000) || '';
  }
  // A quadrant flag is a decision, so only a real boolean counts as one. Null
  // clears it back to undecided, and anything else is refused rather than
  // quietly coerced into a `false` that reads on the page as "not important".
  for (const flag of ['urgent', 'important']) {
    if (!(flag in payload)) continue;
    const value = payload[flag];
    if (value === null || value === '') { payload[flag] = null; continue; }
    if (typeof value === 'boolean') continue;
    if (value === 'true' || value === 'false') { payload[flag] = value === 'true'; continue; }
    throw new Error(`${flag} has to be true, false, or null for undecided.`);
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
    tasks: (result.tasks || []).filter(item => !item.deleted_at).slice(0, 8).map(item => pick(item, new Set([
      'id', 'title', 'status', 'owner', 'due_date', 'follow_up_date', 'work_area'
    ]))),
    clients: (result.clients || []).filter(item => !item.archived_at).slice(0, 12).map(item => pick(item, new Set([
      'id', 'name', 'relationship_status', 'current_focus', 'next_meeting_at', 'follow_up_date', 'nearest_deadline'
    ]))),
    events: (result.events || []).filter(item => !item.archived_at).slice(0, 12).map(item => pick(item, new Set([
      'id', 'title', 'event_type', 'status', 'starts_at', 'ends_at', 'next_action'
    ]))),
    products: (result.products || []).filter(item => !item.archived_at).slice(0, 12).map(item => pick(item, new Set([
      'id', 'name', 'status', 'priority', 'current_objective', 'next_improvement', 'important_risk'
    ]))),
    updates: (result.updates || []).slice(0, 5).map(item => ({
      id: item.id, kind: item.kind, title: item.title, status: item.status, due_at: item.due_at,
      body: excerpt(item.body, 140)
    })),
    journal: (result.journal || []).slice(0, 2).map(item => ({
      id: item.id, entry_date: item.entry_date, category: item.category, title: item.title,
      status: item.status, body: excerpt(item.body, 120)
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
    // WBR-336. `mark_viewed` records that David has seen the board, and the
    // Dashboard's "new since your last visit" marker is computed from it. A
    // caller holding the server secret is a run, not David, so letting it
    // through means a run that opens the page to check it also spends the
    // window it is checking. That is how the empty progress panel stayed
    // invisible to me and not to him. Refuse, rather than attribute a machine's
    // read to a person.
    if (action === 'mark_viewed' && auth.serverSecret) {
      return json(res, 200, { result: { skipped: 'mark_viewed is David\u2019s, not a run\u2019s.' } });
    }
    const payload = sanitize(action, body.payload || {});
    const operatingAction = action === 'reorder_outcomes' || action.startsWith('upsert_');
    const noteAction = action.includes('item_note') || action.includes('task_note');
    const mutation = noteAction ? 'workerbee_note_mutate' : operatingAction ? 'workerbee_operating_mutate' : 'workerbee_mutate';
    const result = await rpc(mutation, { p_action: action, p_payload: payload, p_server_secret: auth.serverSecret }, auth.token);
    return json(res, 200, { result });
  } catch (error) {
    console.error('WorkerBee API error:', error);
    return json(res, 500, { error: error.message || 'WorkerBee could not save that change.' });
  }
}
