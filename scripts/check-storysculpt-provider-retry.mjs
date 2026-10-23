// StorySculpt provider failures (StorySculpt Developer 28, 29, 31).
//
// Proves: a temporary provider failure (429, 5xx, a dropped connection, an
// empty reply) is retried exactly once; a permanent one (400, 401, 402, 403,
// not configured) is not retried; a timeout is not retried; the member sees a
// plain line for each kind, never the provider's own wording; and the event
// records which kind it was and how many attempts it took.

import assert from 'node:assert/strict';

process.env.DEEPSEEK_API_KEY = 'test-key';
process.env.RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'test-rate-limit-secret-0123456789abcdef';
process.env.GUEST_SESSION_SECRET = process.env.GUEST_SESSION_SECRET || 'test-guest-session-secret-0123456789abcdef';
const {
  default: handler,
  callModelWithRetry,
  isTransientProviderStatus,
  PROVIDER_MESSAGES
} = await import('../api/storysculpt.js');

for (const status of [429, 500, 502, 503, 504]) assert.ok(isTransientProviderStatus(status), status + ' is temporary');
for (const status of [400, 401, 402, 403, 404, 422]) assert.ok(!isTransientProviderStatus(status), status + ' is permanent');

const noSleep = { sleepFn: async () => {} };
const tagged = (kind) => Object.assign(new Error(kind), { providerFailure: kind });

let calls = 0;
const recovered = await callModelWithRetry(async () => { calls += 1; if (calls === 1) throw tagged('transient'); return { content: 'ok' }; }, noSleep);
assert.equal(recovered.content, 'ok'); assert.equal(recovered.attempts, 2, 'a temporary failure is retried once and recovers');

calls = 0;
await assert.rejects(callModelWithRetry(async () => { calls += 1; throw tagged('transient'); }, noSleep), e => e.attempts === 2);
assert.equal(calls, 2, 'the retry is bounded at one');

calls = 0;
await assert.rejects(callModelWithRetry(async () => { calls += 1; throw tagged('permanent'); }, noSleep), e => e.attempts === 1);
assert.equal(calls, 1, 'a permanent failure is not retried');

calls = 0;
await assert.rejects(callModelWithRetry(async () => { calls += 1; const e = tagged('transient'); e.name = 'AbortError'; throw e; }, noSleep));
assert.equal(calls, 1, 'a timeout is not retried');

let clock = 0;
calls = 0;
await assert.rejects(callModelWithRetry(async () => { calls += 1; clock += 25000; throw tagged('transient'); }, { ...noSleep, now: () => clock }));
assert.equal(calls, 1, 'no retry once the time window is spent');
console.log('PASS: temporary failures retry once, permanent failures and timeouts do not.');

// ── Driving the endpoint ───────────────────────────────────────────────────
const projectId = '3f1c2b9e-1111-4222-8333-944455556666';
const events = [];
let providerCalls = 0;
let providerStatus = 503;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  let body = {}; try { body = JSON.parse(String(options.body || '{}')); } catch (e) {}
  const reply = (status, payload) => ({ ok: status < 400, status, json: async () => payload, text: async () => JSON.stringify(payload) });
  if (u.includes('deepseek')) { providerCalls += 1; return reply(providerStatus, { error: { message: 'Insufficient Balance (provider wording)' } }); }
  if (u.includes('/auth/v1/user')) return reply(200, { id: 'auth-1' });
  if (u.includes('has_studio_app_access')) return reply(200, true);
  if (u.includes('/rest/v1/storysculpt_projects')) return reply(200, [{ id: projectId, output: null, content_type: 'rant', intake: {}, status: 'drafting', version: 1, conversation: [] }]);
  if (u.includes('consume_api_quota')) return reply(200, true);
  if (u.includes('record_log_event')) { events.push(body.p_detail || {}); return reply(200, null); }
  return reply(200, []);
};
function call() {
  let statusCode = 200; let data = null;
  const res = { setHeader() {}, status(c) { statusCode = c; return res; }, json(d) { data = d; return res; } };
  return handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { mode: 'rant', projectId, intent: 'interview', messages: [{ role: 'assistant', content: 'What is the rant?' }, { role: 'user', content: 'Gyms that lock you in.' }] } }, res)
    .then(() => ({ statusCode, data }));
}
try {
  providerStatus = 503;
  const busy = await call();
  assert.equal(busy.statusCode, 502);
  assert.equal(busy.data.error, PROVIDER_MESSAGES.transient, 'temporary failure explained plainly');
  assert.ok(providerCalls >= 2, 'temporary failure was retried');
  const busyEvent = events.find(e => e.providerFailure === 'transient');
  assert.ok(busyEvent && busyEvent.attempts === 2, 'event records temporary and two attempts');

  providerCalls = 0; events.length = 0; providerStatus = 402;
  const broke = await call();
  assert.equal(broke.data.error, PROVIDER_MESSAGES.permanent, 'permanent failure explained plainly');
  assert.ok(!/Insufficient Balance/.test(JSON.stringify(broke.data)), 'provider wording never reaches the member');
  const brokeEvent = events.find(e => e.providerFailure === 'permanent');
  assert.ok(brokeEvent && brokeEvent.attempts === 1 && brokeEvent.status === 402, 'event records permanent, one attempt and the status');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('PASS: the endpoint retries once, explains both kinds plainly and records which it was.');
