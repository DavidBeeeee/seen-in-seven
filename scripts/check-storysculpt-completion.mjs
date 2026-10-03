import assert from 'node:assert/strict';
import handler from '../api/storysculpt.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const originalFetch = globalThis.fetch;
let deepSeekCalls = 0;
let quotaCalls = 0;
let savedOutput = 'FINAL SCRIPT: A finished script.';

function reply(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value };
}

globalThis.fetch = async (url) => {
  const path = String(url);
  if (path.endsWith('/auth/v1/user')) return reply({ id: 'member-auth-id' });
  if (path.endsWith('/rest/v1/rpc/has_studio_app_access')) return reply(true);
  if (path.includes('/rest/v1/storysculpt_projects?')) return reply([{ id: projectId, output: savedOutput, content_type: 'bold' }]);
  if (path.endsWith('/rest/v1/rpc/record_log_event')) return reply(null);
  if (path.includes('quota')) { quotaCalls += 1; return reply(true); }
  if (path.includes('deepseek.com')) { deepSeekCalls += 1; return reply({ choices: [{ message: { content: 'FINAL SCRIPT: Revised.' } }] }); }
  throw new Error('Unexpected fetch in completion test: ' + path);
};

async function request(intent, id = projectId) {
  const req = { method: 'POST', headers: { authorization: 'Bearer test-member-token' }, body: {
    mode: 'bold', projectId: id, intent, projectTitle: 'Test', context: '', messages: [{ role: 'user', content: 'Continue' }]
  } };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res);
  return res;
}

try {
  const continued = await request('interview');
  assert.equal(continued.code, 409);
  assert.match(continued.body.error, /Refine/);
  assert.equal(deepSeekCalls, 0);
  assert.equal(quotaCalls, 0);

  const invalid = await request('interview', 'not-a-uuid');
  assert.equal(invalid.code, 400);
  assert.equal(deepSeekCalls, 0);

  savedOutput = null;
  const prematureRefine = await request('refine');
  assert.equal(prematureRefine.code, 409);
  assert.equal(deepSeekCalls, 0);
  console.log('StorySculpt completion guard passed: final interview and premature refine rejected before quota or generation.');
} finally {
  globalThis.fetch = originalFetch;
}
