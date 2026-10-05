// Fault-injection proof for the Navigator's transient-failure retry. WBR-005
// (300 Developer B#15, C#26).
//
// Before this, api/navigator.js made exactly one model call: a single network
// blip, a 429, or an upstream 5xx surfaced to the member as the safe fallback
// even though a second attempt would have succeeded. The retry wrapper
// (callModelWithRetry) now tries a transient failure again with bounded backoff
// and records the attempt count on the terminal usage event, while a permanent
// failure (missing key, 4xx) still stops after one attempt.
//
// None of this can be proven by reading the code, and it must not depend on a
// real upstream outage. So this harness drives the real handler with a mocked
// fetch whose DeepSeek branch fails on demand, and reads back the recorded
// event detail. The retry backoff and bound are turned down through the env the
// module reads at load, which is why the handler is imported dynamically after
// the env is set.

import assert from 'node:assert/strict';

process.env.NAVIGATOR_RETRY_ATTEMPTS = '2';
process.env.NAVIGATOR_RETRY_BASE_MS = '1';
process.env.NAVIGATOR_MODEL_TIMEOUT_MS = '2000';
process.env.RATE_LIMIT_SECRET = 'fixture-rate-limit-secret-at-least-32-characters';
process.env.GUEST_SESSION_SECRET = 'fixture-guest-secret-at-least-32-characters';

const { default: handler } = await import('../api/navigator.js');

const MOVE = {
  next_action: 'Draft the first paragraph of the welcome email.',
  first_15_minutes: 'Open a blank draft and write three plain sentences, no editing.',
  done_when: 'Three sentences are saved in the draft.',
  why_this_now: 'The blank page is the blocker; three rough sentences dissolve it.'
};

// A fetch mock that answers every call the handler makes and routes the DeepSeek
// call through `deepseek`, a function of the attempt number (1-based). Captured
// terminal event detail is returned alongside.
function makeFetch(deepseek) {
  const state = { attempts: 0, event: null };
  const fetch = async (url, options = {}) => {
    if (url.endsWith('/auth/v1/user')) return reply({ id: 'test-user' });
    if (url.includes('has_studio_app_access')) return reply(true);
    if (url.includes('/navigator_moves?')) return reply([]);
    if (url.includes('consume_api_quota')) return reply(true);
    if (url.includes('record_log_event')) {
      const body = JSON.parse(options.body || '{}');
      state.event = { type: body.p_event_type, detail: body.p_detail };
      return reply(null);
    }
    if (url.includes('deepseek.com')) {
      state.attempts += 1;
      return deepseek(state.attempts);
    }
    return reply({});
  };
  return { fetch, state };
}

function reply(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload, headers: new Headers() };
}

function makeReqRes() {
  const req = { method: 'POST', headers: { authorization: 'Bearer member-token' }, body: {
    objective: 'Launch the welcome email', current_reality: 'List is ready', blocker: 'Blank page', available_time: '30 minutes'
  }, socket: {} };
  const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(value) { this.body = value; return value; } };
  return { req, res };
}

async function run(deepseek, { withKey = true } = {}) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  if (withKey) process.env.DEEPSEEK_API_KEY = 'fixture-not-a-secret';
  else delete process.env.DEEPSEEK_API_KEY;
  const { fetch, state } = makeFetch(deepseek);
  globalThis.fetch = fetch;
  const { req, res } = makeReqRes();
  try {
    await handler(req, res);
    return { res, state };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey;
  }
}

// Case 1: a transient 503 on the first attempt, success on the second. The retry
// recovers; the member gets a generated move and the event records two attempts.
{
  const { res, state } = await run((attempt) =>
    attempt < 2
      ? reply({ error: { message: 'upstream busy' } }, { ok: false, status: 503 })
      : reply({ choices: [{ message: { content: JSON.stringify(MOVE) } }] }));
  assert.equal(res.code, 200, 'a recovered transient failure answers 200');
  assert.equal(res.body.source, 'generated', 'the retry returns the real generation, not the fallback');
  assert.equal(state.attempts, 2, 'the model was called a second time after the transient failure');
  assert.equal(state.event.type, 'navigator_generation');
  assert.equal(state.event.detail.attempts, 2, 'the event records both attempts');
  assert.equal(state.event.detail.retried, true, 'the event marks the request as retried');
}

// Case 2: every attempt is a transient network failure. The retry is bounded: it
// stops at RETRY_ATTEMPTS and ships the safe fallback with the failure class
// recorded, never an endless loop and never a raw error to the member.
{
  const { res, state } = await run(() => { throw new Error('socket hang up'); });
  assert.equal(res.code, 200, 'an exhausted retry still degrades to the fallback, not an error');
  assert.equal(res.body.source, 'fallback');
  assert.equal(state.attempts, 2, 'the retry is bounded at two attempts, not unbounded');
  assert.equal(state.event.type, 'navigator_fallback');
  assert.equal(state.event.detail.failureClass, 'generation', 'the recorded failure class names a generation failure');
  assert.equal(state.event.detail.attempts, 2);
}

// Case 3: a permanent failure (no model key configured) is not retried. One
// attempt only, classified as config, so a misconfiguration is not mistaken for
// a flaky upstream and hammered.
{
  const { res, state } = await run(() => reply({ choices: [{ message: { content: JSON.stringify(MOVE) } }] }), { withKey: false });
  assert.equal(res.code, 200);
  assert.equal(res.body.source, 'fallback');
  assert.equal(state.attempts, 0, 'a missing key never reaches the model at all');
  assert.equal(state.event.type, 'navigator_fallback');
  assert.equal(state.event.detail.failureClass, 'config', 'a permanent config failure is labelled config, not generation');
  assert.equal(state.event.detail.attempts, 1, 'a permanent failure is a single attempt, not a retry');
}

console.log('PASS: transient model failures are retried and recorded; the retry is bounded; a permanent failure is not retried.');
