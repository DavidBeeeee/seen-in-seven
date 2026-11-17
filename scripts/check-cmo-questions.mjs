import assert from 'node:assert/strict';
import fs from 'node:fs';
import cmoHandler, { isCmoEmail, parseCmoEmails, projectCmoQuestions } from '../api/_lib/cmo-questions.js';
import workerbeeHandler from '../api/workerbee.js';

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return payload; },
  };
}

const sampleArtifact = {
  generatedAt: '2026-11-16T12:00:00Z',
  updatedAt: '2026-11-16T12:00:00Z',
  cadence: 'one app-day at a time',
  scoredAgainst: 'main',
  lists: [
    { id: 'stranger', label: 'Stranger', asks: 'first impression' },
    { id: 'graduation', label: 'Hundred 5, graduation, guardian, bond and look', asks: 'hundred 5' },
  ],
  apps: [
    { key: 'storysculpt', name: 'StorySculpt', scoredOn: '2026-11-13', status: 'scored' },
    { key: 'ward', name: 'Ward', questionSet: 'ward-five-hundred', questionCount: 500, status: 'needs-score' },
  ],
  scored: {
    storysculpt: {
      tally: { PASS: 1, FAIL: 0 },
      rows: [{ list: 'stranger', number: 1, section: 'A', question: 'StorySculpt Q1', verdict: 'PASS', note: 'ok' }],
    },
    ward: {
      tally: { UNSCORED: 2 },
      rows: [
        { list: 'graduation', number: 31, section: 'C', question: 'Ward H5 Q31 text', verdict: 'UNSCORED', note: 'check 31' },
        { list: 'graduation', number: 100, section: 'J', question: 'Ward H5 Q100 text', verdict: 'PASS', note: 'check 100' },
      ],
    },
  },
  journal: [{ body: 'private journal' }],
  clients: [{ name: 'private client' }],
  tasks: [{ title: 'private task' }],
};

// 1. Projection puts Ward first and strips all private fields.
const projected = projectCmoQuestions(sampleArtifact);
assert.equal(projected.apps[0].key, 'ward');
assert.equal(projected.apps[1].key, 'storysculpt');
const wardH5Q31 = projected.apps[0].rows.find((r) => r.list === 'graduation' && r.number === 31);
const wardH5Q100 = projected.apps[0].rows.find((r) => r.list === 'graduation' && r.number === 100);
assert.equal(wardH5Q31.question, 'Ward H5 Q31 text');
assert.equal(wardH5Q31.score, 'UNSCORED');
assert.equal(wardH5Q31.check, 'check 31');
assert.equal(wardH5Q100.question, 'Ward H5 Q100 text');
assert.equal(wardH5Q100.score, 'PASS');
assert.doesNotMatch(JSON.stringify(projected), /private journal|private client|private task/);

// 2. Allowlist helper checks.
assert.equal(isCmoEmail('davidkamau.t+cmo@gmail.com', parseCmoEmails('davidkamau.t+cmo@gmail.com')), true);
assert.equal(isCmoEmail('member@example.com', parseCmoEmails('davidkamau.t+cmo@gmail.com')), false);
assert.equal(isCmoEmail('davidkamau.t@gmail.com', parseCmoEmails('davidkamau.t+cmo@gmail.com')), false);

// 3. Handler authorization matrix: CMO caller, anonymous caller, non-CMO member, admin caller.
const priorFetch = globalThis.fetch;
const priorSecret = process.env.WORKERBEE_STUDIO_SECRET;
const priorCmoEmails = process.env.CMO_EMAILS;
process.env.WORKERBEE_STUDIO_SECRET = 'test-only-secret-not-a-real-credential-1234';
process.env.CMO_EMAILS = 'davidkamau.t+cmo@gmail.com';

const TOKENS = {
  'cmo-token': { user: { id: 'u-cmo', email: 'davidkamau.t+cmo@gmail.com' }, isAdmin: false },
  'member-token': { user: { id: 'u-mem', email: 'member@example.com' }, isAdmin: false },
  'admin-token': { user: { id: 'u-adm', email: 'davidkamau.t@gmail.com' }, isAdmin: true },
};

try {
  globalThis.fetch = async (url, options = {}) => {
    const authHeader = String(options.headers?.Authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const actor = TOKENS[token] || null;
    if (url.endsWith('/auth/v1/user')) {
      if (!actor) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => actor.user };
    }
    if (url.endsWith('/rest/v1/rpc/is_admin')) {
      return { ok: true, status: 200, json: async () => Boolean(actor?.isAdmin) };
    }
    if (url.endsWith('/rest/v1/rpc/workerbee_read')) {
      const body = JSON.parse(options.body || '{}');
      assert.equal(body.p_profile, 'cmo-questions');
      return { ok: true, status: 200, text: async () => JSON.stringify(sampleArtifact), json: async () => sampleArtifact };
    }
    if (url.endsWith('/rest/v1/rpc/workerbee_bootstrap')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ sections: [], tasks: [], updates: [], journal: [{ id: 'j1' }] }),
        json: async () => ({ sections: [], tasks: [], updates: [], journal: [{ id: 'j1' }] }),
      };
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  // CMO caller reads Ward Hundred 5 question 31 and question 100 text.
  {
    const res = mockRes();
    await cmoHandler({ method: 'GET', headers: { authorization: 'Bearer cmo-token' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.apps[0].key, 'ward');
    const q31 = res.body.apps[0].rows.find((r) => r.list === 'graduation' && r.number === 31);
    const q100 = res.body.apps[0].rows.find((r) => r.list === 'graduation' && r.number === 100);
    assert.equal(q31.question, 'Ward H5 Q31 text');
    assert.equal(q100.question, 'Ward H5 Q100 text');
  }

  // Same read through the production path: /api/cmo-questions rewrites to
  // /api/workerbee?channel=cmo-questions (12-function Hobby limit).
  {
    const res = mockRes();
    await workerbeeHandler({ method: 'GET', query: { channel: 'cmo-questions' }, headers: { authorization: 'Bearer cmo-token' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.apps[0].key, 'ward');
    assert.equal(res.body.journal, undefined);
  }

  // CMO caller gets 403 on default bootstrap GET, view=hub-scores, and every POST action.
  for (const req of [
    { method: 'GET', query: {}, headers: { authorization: 'Bearer cmo-token' } },
    { method: 'GET', query: { view: 'hub-scores' }, headers: { authorization: 'Bearer cmo-token' } },
    { method: 'POST', query: {}, headers: { authorization: 'Bearer cmo-token' }, body: { action: 'create_task', payload: { title: 'x' } } },
    { method: 'POST', query: {}, headers: { authorization: 'Bearer cmo-token' }, body: { action: 'create_journal', payload: { body: 'x' } } },
    { method: 'POST', query: {}, headers: { authorization: 'Bearer cmo-token' }, body: { action: 'mark_viewed', payload: { surface: 'dashboard' } } },
  ]) {
    const res = mockRes();
    await workerbeeHandler(req, res);
    assert.equal(res.statusCode, 403, `Expected 403 for CMO caller on ${req.method} ${req.query?.view || req.body?.action || 'bootstrap'}`);
  }

  // Anonymous caller gets 403 on both CMO and WorkerBee endpoints.
  {
    const cmoAnon = mockRes();
    await cmoHandler({ method: 'GET', headers: {} }, cmoAnon);
    assert.equal(cmoAnon.statusCode, 403);

    const wbAnon = mockRes();
    await workerbeeHandler({ method: 'GET', query: {}, headers: {} }, wbAnon);
    assert.equal(wbAnon.statusCode, 403);
  }

  // Non-CMO member gets 403 on CMO endpoint.
  {
    const res = mockRes();
    await cmoHandler({ method: 'GET', headers: { authorization: 'Bearer member-token' } }, res);
    assert.equal(res.statusCode, 403);
  }

  // Admin caller still gets the full bootstrap on /api/workerbee, and 403 on /api/cmo-questions.
  {
    const wbAdmin = mockRes();
    await workerbeeHandler({ method: 'GET', query: {}, headers: { authorization: 'Bearer admin-token' } }, wbAdmin);
    assert.equal(wbAdmin.statusCode, 200);
    assert.ok(Array.isArray(wbAdmin.body.journal));

    const cmoAdmin = mockRes();
    await cmoHandler({ method: 'GET', headers: { authorization: 'Bearer admin-token' } }, cmoAdmin);
    assert.equal(cmoAdmin.statusCode, 403);
  }
} finally {
  globalThis.fetch = priorFetch;
  if (priorSecret === undefined) delete process.env.WORKERBEE_STUDIO_SECRET;
  else process.env.WORKERBEE_STUDIO_SECRET = priorSecret;
  if (priorCmoEmails === undefined) delete process.env.CMO_EMAILS;
  else process.env.CMO_EMAILS = priorCmoEmails;
}

// 4. Static boundary checks.
const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const cmoHtml = read('cmo.html');
const cmoJs = read('js/cmo.js');
const cmoApi = read('api/_lib/cmo-questions.js');
const vercel = JSON.parse(read('vercel.json'));
const migration = read('supabase_migrations/2026-11-16-workerbee-cmo-questions.sql');

assert.match(cmoHtml, /data-workerbee-surface="cmo"/);
assert.match(cmoHtml, /noindex,nofollow/);
assert.doesNotMatch(cmoHtml, /href="\/(dashboard|todo|analytics|momentum300)"/);
assert.doesNotMatch(cmoJs, /\.innerHTML\s*=/);
assert.doesNotMatch(cmoJs, /SERVICE_ROLE|SUPABASE_SECRET|WORKERBEE_STUDIO_SECRET/);
assert.doesNotMatch(cmoApi, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|is_admin|provision_admin_account/);
assert.ok(vercel.rewrites.some((r) => r.source === '/cmo' && r.destination === '/cmo.html'));
assert.match(migration, /elsif p_profile = 'cmo-questions' then/);

// Hobby plan caps Vercel at 12 functions (the a8afcfd production deploy failed
// at 13). The CMO route rides /api/workerbee and must branch before authorize().
const functionCount = fs.readdirSync(new URL('../api/', import.meta.url)).filter((f) => /\.(js|mjs|ts)$/.test(f)).length;
assert.ok(functionCount <= 12, `api/ has ${functionCount} functions; Hobby allows 12`);
assert.ok(vercel.rewrites.some((r) => r.source === '/api/cmo-questions' && r.destination === '/api/workerbee?channel=cmo-questions'));
const workerbeeApi = read('api/workerbee.js');
assert.ok(workerbeeApi.indexOf("channel === 'cmo-questions'") > -1 && workerbeeApi.indexOf("channel === 'cmo-questions'") < workerbeeApi.indexOf('await authorize(req)'));
{
  const res = { statusCode: 0, body: null, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end(b) { this.body = b; return this; } };
  await workerbeeHandler({ method: 'GET', query: { channel: 'cmo-questions' }, headers: {} }, res);
  assert.equal(res.statusCode, 403, 'anonymous caller on the CMO channel gets 403');
}

console.log('CMO questions route, /cmo page, and 403 isolation checks passed.');
