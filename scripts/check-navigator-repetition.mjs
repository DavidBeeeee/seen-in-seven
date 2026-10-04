import assert from 'node:assert/strict';
import { coerceResult, SAFE_FALLBACK } from '../api/_lib/navigator-core.js';
import handler from '../api/navigator.js';
const move = { ...SAFE_FALLBACK, next_action: 'Draft the invitation for Alex.' };
assert.equal(coerceResult(move, [{ next_action: 'DRAFT the invitation for Alex!' }]).source, 'fallback');
assert.notEqual(coerceResult(move, [move]).result.next_action, move.next_action);
assert.notEqual(coerceResult(null, [SAFE_FALLBACK]).result.next_action, SAFE_FALLBACK.next_action);
assert.equal(coerceResult(move, []).source, 'generated');
const originalFetch = globalThis.fetch;
const originalKey = process.env.DEEPSEEK_API_KEY;
const originalRateKey = process.env.RATE_LIMIT_SECRET;
const originalGuestKey = process.env.GUEST_SESSION_SECRET;
process.env.DEEPSEEK_API_KEY = 'fixture-not-a-secret';
process.env.RATE_LIMIT_SECRET = 'fixture-rate-limit-secret-at-least-32-characters';
process.env.GUEST_SESSION_SECRET = 'fixture-guest-secret-at-least-32-characters';
let modelInput;
globalThis.fetch = async (url, options = {}) => {
  let payload = {};
  if (url.endsWith('/auth/v1/user')) payload = { id: 'test-auth' };
  else if (url.includes('has_studio_app_access')) payload = true;
  else if (url.includes('/navigator_moves?')) {
    assert.equal(options.headers.Authorization, 'Bearer member-token');
    assert.ok(!url.includes('user_id='));
    payload = [move];
  } else if (url.includes('deepseek.com')) {
    modelInput = JSON.parse(JSON.parse(options.body).messages[1].content);
    payload = { choices: [{ message: { content: JSON.stringify(move) } }] };
  } else if (url.includes('consume_api_quota')) payload = true;
  return { ok: true, json: async () => payload, headers: new Headers() };
};
const req = { method: 'POST', headers: { authorization: 'Bearer member-token' }, body: {
  objective: 'Invite one prospect', current_reality: 'Draft ready', blocker: 'No response', available_time: '15 minutes'
}, socket: {} };
const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(value) { this.body = value; return value; } };
try {
  await handler(req, res);
  assert.equal(res.code, 200);
  assert.deepEqual(modelInput.recent_moves, [move]);
  assert.notEqual(res.body.next_action, move.next_action);
  console.log('PASS: authenticated history reaches generation; repeated model output is not returned; fallback does not repeat.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey;
  if (originalRateKey === undefined) delete process.env.RATE_LIMIT_SECRET; else process.env.RATE_LIMIT_SECRET = originalRateKey;
  if (originalGuestKey === undefined) delete process.env.GUEST_SESSION_SECRET; else process.env.GUEST_SESSION_SECRET = originalGuestKey;
}
