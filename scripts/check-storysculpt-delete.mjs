// WBR-462: real deletion handler and the real ten-second browser path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const { default: handler } = await import('../api/storysculpt.js');
const ID = 'bcad0001-1111-4111-8111-111111111111';
const originalFetch = globalThis.fetch;
let outcome = 'ok', requests = [];
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
globalThis.fetch = async (url, init = {}) => {
  requests.push({ url: String(url), init });
  if (String(url).endsWith('/auth/v1/user')) return response({ id: 'member-auth' });
  assert.equal(init.method, 'DELETE', 'no model call, intake update or generation quota');
  assert.equal(init.headers.Authorization, 'Bearer member-fixture');
  assert.match(String(url), /storysculpt_projects\?id=eq\.[a-f0-9-]+&select=id$/);
  assert.equal(init.headers.Prefer, 'return=representation');
  if (outcome === 'offline') throw new Error('fixture disconnected');
  if (outcome === 'refused') return response({}, 403);
  return response(outcome === 'unowned' ? [] : [{ id: ID }]);
};
async function remove(body, auth = true) {
  requests = [];
  const req = { method: 'POST', headers: auth ? { authorization: 'Bearer member-fixture' } : {}, body };
  const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(x) { this.body = x; return this; } };
  await handler(req, res);
  return res;
}
try {
  assert.equal((await remove({ action: 'delete-project', projectId: ID }, false)).code, 401);
  assert.equal(requests.length, 0);
  assert.equal((await remove({ action: 'delete-project', projectId: 'bad&user_id=other' })).code, 400);
  assert.equal(requests.length, 1, 'invalid id never reaches delete');
  outcome = 'unowned';
  assert.equal((await remove({ action: 'delete-project', projectId: ID })).code, 404);
  outcome = 'refused';
  assert.equal((await remove({ action: 'delete-project', projectId: ID })).code, 503);
  outcome = 'offline';
  assert.equal((await remove({ action: 'delete-project', projectId: ID })).code, 503);
  outcome = 'ok';
  const result = await remove({ action: 'delete-project', projectId: ID });
  assert.equal(result.code, 200);
  assert.equal(result.body.projectId, ID);
  assert.equal(result.body.deleted, true);
} finally { globalThis.fetch = originalFetch; }

const source = fs.readFileSync(new URL('../js/storysculpt.js', import.meta.url), 'utf8');
const deletion = source.slice(source.indexOf('function queueStoryProjectDelete('), source.indexOf('const deleteBackdrop ='));
function browser(fails = false) {
  const timers = new Map(), status = { textContent: '', className: '' };
  let calls = 0;
  const c = vm.createContext({
    activeStory: null, storyProjects: [{ id: ID, title: 'Disposable fixture', intake: { versions: ['one'], answer: 'synthetic' } }, { id: 'neighbor' }],
    storyPendingDeletes: new Map(), storySaveTimer: null,
    storyContext: { session: { access_token: 'member-fixture' } }, EEEStudio: {},
    setTimeout(fn, ms) { assert.equal(ms, 10000); timers.set(1, fn); return 1; }, clearTimeout(id) { timers.delete(id); },
    renderProjectList() {}, showNextUnarchivedStory() {}, showProject() {}, storyEl: () => status,
    fetch: async (_url, init) => { calls++; assert.equal(JSON.parse(init.body).projectId, ID); return response(fails ? { error: 'fixture unavailable' } : { deleted: true, projectId: ID }, fails ? 503 : 200); }
  });
  vm.runInContext(deletion, c);
  return { c, timers, status, calls: () => calls };
}
let b = browser();
vm.runInContext(`queueStoryProjectDelete('${ID}')`, b.c);
assert.equal(b.calls(), 0, 'nothing is deleted inside the Undo window');
vm.runInContext(`undoStoryDelete('${ID}')`, b.c);
assert.equal(b.timers.size, 0);
assert.equal(b.c.storyProjects.length, 2);
b = browser();
vm.runInContext(`queueStoryProjectDelete('${ID}')`, b.c);
await b.timers.get(1)();
assert.equal(b.calls(), 1);
assert.equal(b.c.storyProjects.length, 1);
assert.equal(b.c.storyProjects[0].id, 'neighbor');
assert.match(b.status.textContent, /saved work deleted/);
b = browser(true);
vm.runInContext(`queueStoryProjectDelete('${ID}')`, b.c);
await b.timers.get(1)();
assert.equal(b.c.storyProjects.length, 2, 'unconfirmed deletion must not discard the row');
assert.equal(b.c.storyProjects[0].intake.answer, 'synthetic');
assert.match(b.status.textContent, /not confirmed[\s\S]*Reload/);
assert.equal(b.c.storyPendingDeletes.size, 0);
console.log('PASS deletion: authenticated RLS request, exact returned ID, refused/unowned/offline outcomes, ten-second Undo, confirmed-only removal and neighbor preservation. Cascade still requires a rolled-back database transaction; it is not simulated or verified here.');
