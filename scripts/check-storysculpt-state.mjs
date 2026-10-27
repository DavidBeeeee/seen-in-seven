// StorySculpt state and idempotency (WBR-435 overflow; StorySculpt Developer 1,
// 3, 4, 5, 6, 7, 9, 13, 15, 16, 18, 19, 20, 33, 34).
//
// Proves, against the migration that is live on Supabase, the endpoint, and the
// browser save path:
// 1. A repeated idempotency key appends once: the database keeps the first
//    message per key, the append RPC returns early on a known key, and the
//    endpoint replays a saved reply instead of generating a second one.
// 2. A stale version is refused: the trigger owns version and refuses an
//    expected_version the row has moved past, and the browser names the version
//    it read, one save at a time.
// 3. An illegal state transition is refused: status is explicit, transitions
//    are declared, and drafting to filmed (or filmed without a script) fails.
//
// The same three rules were exercised live in a rolled-back transaction on
// 2026-10-22 (state/evidence in WorkerBee); this check keeps the contract from
// drifting in source.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const sql = read('supabase_migrations', '2026-10-22-storysculpt-state-and-idempotency.sql');
const client = read('js', 'storysculpt.js');

// ── Migration contract ─────────────────────────────────────────────────────
assert.match(sql, /add column if not exists status text not null default 'drafting'/, 'explicit status column');
assert.match(sql, /add column if not exists version integer not null default 1/, 'version column');
assert.match(sql, /add column if not exists expected_version integer/, 'expected_version claim column');
assert.match(sql, /check \(status in \('drafting', 'finished', 'filmed', 'archived'\)\)/, 'status values constrained');
assert.match(sql, /create table if not exists public\.storysculpt_status_transitions/, 'declared transitions table');
const declared = [...sql.matchAll(/\('(drafting|finished|filmed|archived)', '(drafting|finished|filmed|archived)'\)/g)].map(m => m[1] + '>' + m[2]);
assert.ok(declared.includes('drafting>finished') && declared.includes('finished>filmed'), 'normal path declared');
assert.ok(!declared.includes('drafting>filmed'), 'drafting to filmed is not declared');
assert.ok(!declared.includes('filmed>drafting'), 'filmed to drafting is not declared');
assert.match(sql, /raise exception 'ILLEGAL_TRANSITION'/, 'undeclared transition refused');
assert.match(sql, /filmed needs a finished script/, 'filmed without a script refused');
assert.match(sql, /new\.expected_version is not null and new\.expected_version <> old\.version[\s\S]*?raise exception 'STALE_VERSION'/, 'stale version refused');
assert.match(sql, /new\.expected_version := null;/, 'claim column never persists');
assert.match(sql, /new\.conversation := public\.storysculpt_dedupe_conversation\(new\.conversation\)/, 'every write dedupes keyed turns');
assert.match(sql, /m\.ord = \(\s*select min\(o\.ord\)/, 'first message per key is kept');
assert.match(sql, /m->>'key' = p_key\s*\) then\s*return v_row;/, 'append RPC returns early on a known key');
assert.match(sql, /security invoker/, 'append RPC runs under member RLS');
assert.match(sql, /before insert or update on public\.storysculpt_projects/, 'guard trigger covers inserts and updates');
console.log('PASS: migration declares status, transitions, version check and keyed de-duplication.');

// ── Endpoint: a known key is replayed, never regenerated ───────────────────
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'test-key';
const { default: handler, replayFor, IDEMPOTENCY_KEY } = await import('../api/storysculpt.js');

assert.ok(IDEMPOTENCY_KEY.test('gen:3f1c2b9e-1111-4222-8333-944455556666'), 'browser key shape accepted');
assert.ok(!IDEMPOTENCY_KEY.test('bad key with spaces'), 'malformed key refused');
const project = {
  conversation: [
    { role: 'user', content: 'idea', key: 'turn:abc12345' },
    { role: 'assistant', content: 'saved reply', step: 'R2', key: 'gen:abc12345' }
  ]
};
assert.deepEqual(replayFor(project, { intent: 'interview', idempotencyKey: 'gen:abc12345' }),
  { final: false, content: 'saved reply', step: 'R2', idempotencyKey: 'gen:abc12345', replayed: true });
assert.equal(replayFor(project, { intent: 'interview', idempotencyKey: 'gen:zzz99999' }), null, 'new key is not replayed');
assert.equal(replayFor(project, { intent: 'refine', idempotencyKey: 'gen:abc12345' }), null, 'only interview replies replay');

const projectId = '3f1c2b9e-1111-4222-8333-944455556666';
let modelCalls = 0;
let projectRow = { id: projectId, output: null, content_type: 'rant', intake: {}, status: 'drafting', version: 3, conversation: project.conversation };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  const reply = (status, payload) => ({ ok: status < 400, status, json: async () => payload, text: async () => JSON.stringify(payload) });
  if (u.includes('/auth/v1/user')) return reply(200, { id: 'auth-1' });
  if (u.includes('/rest/v1/users')) return reply(200, [{ id: 'user-1', name: 'Pat' }]);
  if (u.includes('has_studio_app_access')) return reply(200, true);
  if (u.includes('/rest/v1/storysculpt_projects')) return reply(200, [projectRow]);
  if (u.includes('consume_api_quota')) return reply(200, true);
  if (u.includes('record_log_event') || u.includes('/rest/v1/logs')) return reply(200, null);
  if (u.includes('deepseek')) { modelCalls += 1; return reply(500, {}); }
  return reply(200, null);
};
function call(body) {
  let statusCode = 200; let data = null;
  const res = { setHeader() {}, status(c) { statusCode = c; return res; }, json(d) { data = d; return res; } };
  return handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res).then(() => ({ statusCode, data }));
}
try {
  const body = { mode: 'rant', projectId, intent: 'interview', messages: [{ role: 'assistant', content: 'q' }, { role: 'user', content: 'idea' }], idempotencyKey: 'gen:abc12345' };
  const first = await call(body);
  const second = await call(body);
  assert.equal(first.statusCode, 200, 'replay answers 200');
  assert.equal(first.data.replayed, true, 'saved reply is replayed');
  assert.equal(first.data.content, 'saved reply');
  assert.deepEqual(second.data.content, first.data.content, 'a repeated key returns the same reply');
  assert.equal(modelCalls, 0, 'a repeated key never calls the model');

  projectRow = { ...projectRow, status: 'archived' };
  const archived = await call({ ...body, idempotencyKey: 'gen:new12345' });
  assert.equal(archived.statusCode, 409, 'archived project refuses generation');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('PASS: the endpoint replays a known key and refuses an archived chat.');

// ── Browser: one save at a time, naming the version it read ────────────────
assert.match(client, /let storySaveChain = Promise\.resolve\(\);/, 'saves are serialized');
assert.match(client, /storySaveChain = run\.catch\(\(\) => \{\}\);/, 'a failed save does not wedge the chain');
assert.match(client, /updates\.expected_version = Number\(saving\.version\) \|\| 1/, 'queued save names its captured project version at execution');
assert.match(client, /STALE_VERSION[\s\S]{0,200}Nothing newer was overwritten/, 'stale refusal is explained to the member');
assert.match(client, /\{ role: 'user', content: answer, key: turnKey \}/, 'each sent turn carries a key');
assert.match(client, /if \(!activeStory \|\| !answer \|\| storySending\) return;/, 'a double send is ignored while one is in flight');
assert.match(client, /idempotencyKey: generationKey/, 'generation carries its key');
assert.match(client, /'gen:' \+ lastUser\.key\.replace/, 'a retry of the same turn reuses its generation key');
assert.match(client, /findIndex\(m => m && m\.key === replyKey\)/, 'a replayed reply replaces, never duplicates, locally');
assert.match(client, /Finish the script before marking it filmed\./, 'drafting to filmed is explained, not attempted');
console.log('PASS: the browser serializes versioned saves and keys every turn.');

// ── Lifecycle trail as server events (Developer 23, 25, 72) ────────────────
const life = read('supabase_migrations', '2026-10-22-storysculpt-lifecycle-events.sql');
assert.match(life, /after update on public\.storysculpt_projects/, 'lifecycle trigger runs after every update');
assert.match(life, /security definer/, 'lifecycle trigger writes logs whatever the client');
for (const event of ['finished', 'filmed', 'unfilmed', 'restored', 'version_added']) {
  assert.ok(life.includes("'" + event + "'"), 'lifecycle logs ' + event);
}
assert.ok(!/'kind', left\(|'note', v_note|v_note\s*\)\s*\)/.test(life), 'a version note is never copied into the event');
assert.match(life, /else 'revision'/, 'unknown notes map to a fixed kind');
console.log('PASS: finish, filmed, unfilmed, restore and every new version are logged by the database without member text.');

console.log('StorySculpt state and idempotency: all checks pass.');
