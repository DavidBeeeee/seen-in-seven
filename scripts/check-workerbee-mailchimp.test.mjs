import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/workerbee.js';
import { mailchimpRequest } from '../api/_lib/workerbee-mailchimp.js';

const key = 'fixtureonly-us15';
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('missing key is an honest configuration failure, never a fake connection', async () => {
  assert.equal((await mailchimpRequest({}, { key: '' })).status, 503);
});
test('all methods use only the account datacenter; writes require intentional authorization', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    let called = false;
    const result = await mailchimpRequest({ method, path: '/campaigns/abc/content', query: { count: 5 }, authorizedWrite: true }, { key, fetchImpl: async (url, options) => {
      called = true;
      assert.equal(url.href, 'https://us15.api.mailchimp.com/3.0/campaigns/abc/content?count=5');
      assert.equal(options.method, method);
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, `Basic ${Buffer.from(`workerbee:${key}`).toString('base64')}`);
      return jsonResponse({ id: 'abc' });
    } });
    assert.equal(called, true);
    assert.equal(result.body.result.id, 'abc');
  }
  assert.equal((await mailchimpRequest({ method: 'POST', path: '/campaigns/abc/actions/send' }, { key })).status, 400);
});
test('URL substitution, traversal and header/query injection cannot move the secret', async () => {
  for (const path of ['https://evil.example', '//evil', '/lists/../campaigns', '/lists%2fcampaigns', '/lists?x=1', '/lists\\evil', '/lists#foo', '/lists/']) {
    const response = await mailchimpRequest({ path }, { key, fetchImpl: () => { throw Error('must not fetch'); } });
    assert.equal(response.status, 400, path);
  }
  assert.equal((await mailchimpRequest({ path: '/lists', query: { count: {} } }, { key })).status, 400);
  assert.equal((await mailchimpRequest({ method: 'GET', body: {} }, { key })).status, 400);
});
test('draft creation, content update and readback preserve the content in a faithful API fixture', async () => {
  let draft;
  let content;
  const fetchImpl = async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    if (url.pathname === '/3.0/campaigns' && options.method === 'POST') {
      draft = { ...body, id: 'draft1', status: 'save' };
      return jsonResponse(draft);
    }
    assert.equal(url.pathname, '/3.0/campaigns/draft1/content');
    if (options.method === 'PUT') content = body;
    return jsonResponse(content);
  };
  const create = await mailchimpRequest({ method: 'POST', path: '/campaigns', authorizedWrite: true, body: { type: 'regular', settings: { title: 'fixture draft' } } }, { key, fetchImpl });
  assert.equal(create.body.result.status, 'save');
  await mailchimpRequest({ method: 'PUT', path: '/campaigns/draft1/content', authorizedWrite: true, body: { plain_text: 'Exact approved text 😊' } }, { key, fetchImpl });
  assert.equal((await mailchimpRequest({ path: '/campaigns/draft1/content' }, { key, fetchImpl })).body.result.plain_text, 'Exact approved text 😊');
});
test('upstream errors, secrets, empty deletes and uncertain writes remain safe and honest', async () => {
  const options = { key, fetchImpl: async () => jsonResponse({ detail: `bad ${key}`, api_key: key, nested: { authorization: key }, _links: [{}] }, 402) };
  const failure = await mailchimpRequest({}, options);
  assert.equal(failure.status, 402);
  assert.equal(JSON.stringify(failure).includes(key), false);
  assert.deepEqual(failure.body.result.nested, {});
  let count = 0;
  const uncertain = await mailchimpRequest({ method: 'POST', path: '/campaigns', authorizedWrite: true }, { key, fetchImpl: async () => { count++; throw Error(key); } });
  assert.equal(count, 1);
  assert.equal(uncertain.status, 502);
  assert.equal(JSON.stringify(uncertain).includes(key), false);
  assert.match(uncertain.body.error, /may have succeeded/);
  const deleted = await mailchimpRequest({ method: 'DELETE', path: '/campaigns/a', authorizedWrite: true }, { key, fetchImpl: async () => new Response(null, { status: 204 }) });
  assert.equal(deleted.body.upstreamStatus, 204);
});
test('real API handler denies anonymous requests and accepts each existing private surface credential', async () => {
  const oldFetch = globalThis.fetch;
  const prior = Object.fromEntries(['MAILCHIMP_API_KEY', 'WORKERBEE_STUDIO_SECRET', 'WORKERBEE_CHATGPT_SECRET'].map(name => [name, process.env[name]]));
  process.env.MAILCHIMP_API_KEY = key;
  process.env.WORKERBEE_STUDIO_SECRET = 'studio-fixture-'.repeat(4);
  process.env.WORKERBEE_CHATGPT_SECRET = 'chatgpt-fixture-'.repeat(4);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return jsonResponse({ account_name: 'fixture' }); };
  try {
    for (const secret of ['', process.env.WORKERBEE_STUDIO_SECRET, process.env.WORKERBEE_CHATGPT_SECRET]) {
      const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ method: 'POST', headers: { 'x-workerbee-secret': secret }, query: { channel: 'mailchimp' }, body: { method: 'GET', path: '/' } }, res);
      assert.equal(res.code, secret ? 200 : 403);
      assert.equal(res.headers['Cache-Control'], 'no-store');
    }
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
