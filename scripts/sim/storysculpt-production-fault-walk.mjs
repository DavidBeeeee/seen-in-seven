// WBR-462: scoped production fault walk. Never uses David's browser profile.
// Only /api/storysculpt POSTs in this new test-member tab are intercepted.
// Authentication stays in memory; synthetic chats remain for later review.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'https://studio.coloradomastermind.com';
const base = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const email = 'momentum-hub-test@ancientcosmic.com';
const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!out) throw Error('Pass --out <local JSON receipt>; no token or browser state is saved.');
const modules = process.env.WALK_NODE_MODULES || '/private/tmp/certainty-walk-deps/node_modules';
const require = createRequire(path.join(modules, 'noop.js'));
const { chromium } = require('playwright-core');
const publicKey = fs.readFileSync(path.join(root, 'js/eee-common.js'), 'utf8').match(/const EEE_SUPABASE_KEY = '([^']+)'/)[1];
const password = execFileSync('/usr/bin/security', ['find-generic-password', '-a', email, '-s', 'workerbee-momentum-hub-test-password', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const login = await fetch(base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15000) });
if (!login.ok) throw Error('Test-member sign-in HTTP ' + login.status);
const session = await login.json();
assert.equal(session.user.email.toLowerCase(), email);
async function memberRead(query) {
  const r = await fetch(base + '/rest/v1/' + query, { headers: { apikey: publicKey, Authorization: 'Bearer ' + session.access_token }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error('Member readback HTTP ' + r.status);
  return r.json();
}
const [profile] = await memberRead('users?auth_id=eq.' + session.user.id + '&select=id,is_admin,is_paid');
assert.equal(profile.is_admin, false);
const receipt = { boardId: 'WBR-462', startedAt: new Date().toISOString(), origin, email, nonAdmin: true, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), faultScope: 'Only one fresh Chromium test-member tab, /api/storysculpt POST; real auth, live assets and real project persistence; successful Resume calls real production API.', cases: [], errors: [], saves: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(({ session }) => { if (location.origin === 'https://studio.coloradomastermind.com') localStorage.setItem('sb-zdtkwpzdwnzzmdwrvmka-auth-token', JSON.stringify(session)); }, { session });
const page = await context.newPage();
let generationRequestCount = 0;
page.on('request', request => { if (request.url() === origin + '/api/storysculpt' && request.method() === 'POST') generationRequestCount++; });
if (args.includes('--candidate-client')) {
  receipt.clientOverride = 'Candidate js/storysculpt.js only in this test tab; not a deployed-client result.';
  await page.route(origin + '/js/storysculpt.js*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'js/storysculpt.js'), 'utf8') }));
}
page.on('pageerror', e => receipt.errors.push(e.message));
page.on('response', async response => {
  if (response.request().method() !== 'PATCH' || !response.url().includes('/rest/v1/storysculpt_projects')) return;
  const body = response.request().postDataJSON();
  const result = await response.json().catch(() => null);
  receipt.saves.push({ at: new Date().toISOString(), expectedVersion: body.expected_version, status: response.status(), result });
});
async function visibleState() {
  return page.evaluate(() => ({ at: new Date().toISOString(), email: document.getElementById('eee-account-email')?.textContent, projectId: typeof activeStory !== 'undefined' ? activeStory?.id : null, version: typeof activeStory !== 'undefined' ? activeStory?.version : null, step: typeof activeStory !== 'undefined' ? activeStory?.intake?.current_step || 'opening' : null, title: document.getElementById('story-title')?.value, status: document.getElementById('story-generation-status')?.textContent, save: document.getElementById('story-save-status')?.textContent, interrupted: typeof activeStory !== 'undefined' ? activeStory?.intake?.interruptedStep : null, conversation: typeof activeStory !== 'undefined' ? activeStory?.conversation : [], retryLabels: [...document.querySelectorAll('button')].filter(x => x.offsetParent !== null && /Resume this step|Try Again/i.test(x.textContent)).map(x => x.textContent.trim()) }));
}
async function createChat(title) {
  await page.goto(origin + '/storysculpt', { waitUntil: 'domcontentloaded' });
  await page.locator('#eee-account-email').filter({ hasText: email }).waitFor({ timeout: 30000 });
  // Account chrome appears before the existing projects finish loading.
  // Wait for that read to settle before opening a new-chat format picker.
  await page.waitForFunction(() => typeof activeStory !== 'undefined' && activeStory?.id, null, { timeout: 30000 });
  await page.locator('#new-project-button').click();
  await page.locator('[data-mode="rant"]').click();
  await page.locator('#story-answer').waitFor();
  await page.locator('#story-title').fill(title);
  await page.locator('#story-title').blur();
  await page.waitForFunction(() => document.getElementById('story-save-status')?.textContent === 'Saved', null, { timeout: 20000 });
}
try {
  for (const fault of args.includes('--conflict-only') ? [] : ['network', 'http503']) {
    const title = 'WorkerBee November 11 scoped ' + fault + ' fault walk';
    const answer = fault === 'network' ? 'I teach pottery workshops. Yesterday a beginner hid her crooked cup under the table. I showed her the uneven cup I still use every morning. One imperfect attempt is not proof that she lacks talent.' : 'I teach pottery workshops. A student wanted to throw away her first bowl because the rim was uneven. I kept my own first bowl to remind her that making something imperfect is still making progress.';
    await createChat(title);
    const before = await visibleState();
    const intercepted = [];
    let inject = true;
    const routeHandler = async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataJSON();
      intercepted.push({ at: new Date().toISOString(), projectId: body.projectId, intent: body.intent, idempotencyKey: body.idempotencyKey, injected: inject });
      if (!inject) return route.continue();
      inject = false;
      await new Promise(r => setTimeout(r, 350));
      if (fault === 'network') return route.abort('internetdisconnected');
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'StorySculpt could not complete this step.' }) });
    };
    await page.route(origin + '/api/storysculpt', routeHandler);
    await page.locator('#story-answer').fill(answer);
    await page.locator('#story-send').click();
    await page.getByRole('button', { name: 'Resume this step', exact: true }).waitFor({ timeout: 25000 });
    const failed = await visibleState();
    assert.equal(intercepted.length, 1, 'Fault injection must actually be reached, not a pre-generation save error');
    const [savedAfterFault] = await memberRead('storysculpt_projects?id=eq.' + before.projectId + '&select=id,title,conversation,intake,version');
    assert(savedAfterFault.conversation.some(x => x.role === 'user' && x.content === answer), 'Answer must persist in the real database before Resume');
    assert.equal(failed.projectId, before.projectId);
    assert.equal(failed.interrupted?.lastAnswer, answer);
    assert.equal(failed.conversation.filter(x => x.role === 'user' && x.content === answer).length, 1);
    await page.getByRole('button', { name: 'Resume this step', exact: true }).click();
    await page.waitForFunction(() => typeof activeStory !== 'undefined' && !document.querySelector('#story-thinking-indicator') && !activeStory?.intake?.interruptedStep && activeStory?.conversation?.filter(x => x.role === 'assistant').length >= 2, null, { timeout: 90000 });
    await page.waitForTimeout(1600);
    const resumed = await visibleState();
    const [savedAfterResume] = await memberRead('storysculpt_projects?id=eq.' + before.projectId + '&select=id,title,conversation,intake,version');
    assert.equal(resumed.projectId, before.projectId);
    assert.equal(savedAfterResume.conversation.filter(x => x.role === 'user' && x.content === answer).length, 1);
    assert.equal(intercepted.length, 2, 'One failed request and one successful Resume request');
    assert.equal(intercepted[0].idempotencyKey, intercepted[1].idempotencyKey, 'Resume keeps the same member-turn key');
    receipt.cases.push({ name: fault, result: 'pass', before, failed, resumed, savedAfterFault, savedAfterResume, requests: intercepted });
    await page.unroute(origin + '/api/storysculpt', routeHandler);
    console.log(JSON.stringify({ case: fault, result: 'pass', at: resumed.at, status: failed.status }));
  }
  if (!args.includes('--conflict-only')) {
  await createChat('WorkerBee November 11 empty Send receiving review');
  const emptyRequestCount = generationRequestCount;
  const before = await visibleState();
  assert.equal(await page.locator('#story-answer').getAttribute('required'), null);
  await page.locator('#story-send').click();
  const empty = await visibleState();
  assert.match(empty.status, /Nothing was sent, so .* is still waiting/);
  assert.deepEqual(empty.conversation, before.conversation);
  await page.locator('#story-answer').fill('   ');
  await page.locator('#story-send').click();
  const whitespace = await visibleState();
  assert.match(whitespace.status, /Nothing was sent, so .* is still waiting/);
  assert.deepEqual(whitespace.conversation, before.conversation);
  assert.equal(generationRequestCount, emptyRequestCount);
  receipt.cases.push({ name: 'empty-and-whitespace', result: 'pass', before, empty, whitespace, generationCalls: generationRequestCount - emptyRequestCount });
  }
  if (args.includes('--conflict-only')) {
    await createChat('WorkerBee November 11 scoped save-conflict regression');
    const before = await visibleState();
    const answer = 'Synthetic save-conflict check: I kept making an uneven bowl rather than hiding my first attempt.';
    let refusals = 0;
    let generationCalls = 0;
    await page.route(base + '/rest/v1/storysculpt_projects*', async route => {
      if (route.request().method() !== 'PATCH') return route.continue();
      refusals++;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'STALE_VERSION', details: 'Synthetic scoped test refusal' }) });
    });
    await page.route(origin + '/api/storysculpt', async route => {
      generationCalls++;
      return route.abort('failed');
    });
    await page.locator('#story-answer').fill(answer);
    await page.locator('#story-send').click();
    await page.waitForFunction(() => document.getElementById('story-generation-status')?.classList.contains('error'));
    const refused = await visibleState();
    const [saved] = await memberRead('storysculpt_projects?id=eq.' + before.projectId + '&select=id,title,conversation,version');
    receipt.cases.push({ name: 'save-conflict', result: 'observed', before, refused, saved, refusals, generationCalls });
    assert(refusals > 0);
    assert.equal(generationCalls, 0);
    assert(!saved.conversation.some(x => x.role === 'user' && x.content === answer));
    assert.match(refused.status, /has not been saved/);
    assert.match(refused.status, /Copy.*before reloading/);
    assert(!refused.status.includes('STALE_VERSION'));
    assert(!refused.retryLabels.includes('Resume this step'));
    assert(refused.conversation.some(x => x.role === 'user' && x.content === answer));
    receipt.cases.at(-1).result = 'pass';
  }
  const asset = await context.request.get(origin + '/js/storysculpt.js');
  const servedHash = crypto.createHash('sha256').update(await asset.body()).digest('hex');
  const localHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'js/storysculpt.js'))).digest('hex');
  receipt.asset = { servedHash, localHash, exact: servedHash === localHash };
  if (!args.includes('--candidate-client')) assert(receipt.asset.exact);
} catch (e) {
  receipt.failure = e.message;
  receipt.lastState = await visibleState().catch(() => null);
  process.exitCode = 1;
} finally {
  receipt.finishedAt = new Date().toISOString();
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  await context.close();
  await browser.close();
  console.log(JSON.stringify({ status: receipt.failure ? 'failed' : 'completed', cases: receipt.cases.length, failure: receipt.failure, receipt: out }));
}
