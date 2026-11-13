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
import vm from 'node:vm';

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
process.env.RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'storysculpt-state-'.padEnd(40, 'x');
process.env.GUEST_SESSION_SECRET = process.env.GUEST_SESSION_SECRET || 'storysculpt-state-'.padEnd(40, 'y');
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

  projectRow = { ...projectRow, output: 'Finished script', status: 'finished' };
  const finished = await call({ ...body, idempotencyKey: 'gen:finished1' });
  assert.equal(finished.statusCode, 409, 'Stranger 75 / Developer 65: a finished script refuses interview generation');
  assert.match(finished.data.error, /Use Refine/, 'Stranger 75: the member is routed to Refine');
  assert.equal(modelCalls, 0, 'Developer 65: the finished lock runs before the model');

  projectRow = { ...projectRow, output: null, status: 'drafting', intake: { current_step: 'R1' }, conversation: [{ role: 'assistant', content: 'Type the raw rant.' }] };
  const empty = await call({ ...body, messages: [{ role: 'assistant', content: 'Type the raw rant.' }, { role: 'user', content: '   ' }], idempotencyKey: 'gen:empty001' });
  assert.equal(empty.statusCode, 400, 'Stranger 39: an empty answer never advances the interview');
  assert.match(empty.data.error, /needs an answer[\s\S]*unchanged/, 'Stranger 39: the empty answer gets a clear recovery explanation');
  assert.equal(modelCalls, 0, 'Developer 59: empty input does not call the model');

  const keptAnswer = 'My exact pottery story about the cracked blue bowl';
  projectRow = { ...projectRow, intake: { current_step: 'R1' }, conversation: [{ role: 'assistant', content: 'Type the raw rant.' }, { role: 'user', content: keptAnswer, key: 'turn:failed01' }] };
  const failed = await call({ ...body, messages: projectRow.conversation, idempotencyKey: 'gen:failed01' });
  assert.equal(failed.statusCode, 502, 'Stranger 40: a provider failure is returned as a failed generation: ' + JSON.stringify(failed.data));
  assert.equal(failed.data.step, 'R2', 'Stranger 51 / Developer 59: the error names the exact attempted step, not the previous step');
  assert.equal(projectRow.conversation.at(-1).content, keptAnswer, 'Stranger 58: the member words survive the failed generation');
  assert.equal(projectRow.intake.current_step, 'R1', 'Stranger 51: a failed generation does not advance the saved position');
  assert.ok(modelCalls > 0, 'Stranger 40: only the real generation reached the model');
  const callsAfterFailure = modelCalls;

  projectRow = { ...projectRow, intake: { current_step: 'R7' }, conversation: [{ role: 'user', content: '2', key: 'turn:sparse01' }] };
  const premature = await call({ ...body, messages: projectRow.conversation, idempotencyKey: 'gen:sparse01' });
  assert.equal(premature.statusCode, 409, 'Stranger 83: the final script waits for required interview material');
  assert.equal(premature.data.step, 'R8', 'Stranger 83: the gated final position is explicit');
  assert.match(premature.data.error, /saved|unchanged|still waiting/, 'Stranger 83: the gate explains that saved work is safe');
  assert.equal(modelCalls, callsAfterFailure, 'Developer 65: required-answer gating runs before the model');

  projectRow = { ...projectRow, intake: {}, status: 'archived' };
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

// ── WBR-462: execute the browser recovery paths, not just their source ──────
const statesSource = read('js', 'storysculpt-member-states.js');
const pageHtml = read('api', '_hub', 'storysculpt.html');
function recoveryBrowser(project) {
  const elements = new Map();
  const element = id => {
    // Only ids the real page has. A fake that invents any id let an empty send
    // write to a status line production does not have (2026-11-08 walk).
    if (!pageHtml.includes(`id="${id}"`)) throw new Error(`StorySculpt client looked up #${id}, which api/_hub/storysculpt.html does not have`);
    if (!elements.has(id)) elements.set(id, {
      id, value: '', textContent: '', hidden: false, disabled: false, style: {}, scrollHeight: 100,
      className: '', classList: { add() {}, remove() {}, contains() { return false; } }, focus() {}
    });
    return elements.get(id);
  };
  const stateContext = {};
  vm.createContext(stateContext);
  vm.runInContext(statesSource, stateContext);
  const c = {
    console, Date, activeStory: project, STATES: stateContext.StorySculptStates, memoryProfile: {},
    STEP_GUIDE: { R1: { title: 'Raw story' }, R2: { title: 'Choose the tension' } },
    STEP_NAMES: { R1: { title: 'Raw story' }, R2: { title: 'Choose the tension' } },
    STORY_MODE_LABELS: { rant: '5E Talking Head', bold: 'Controversial Take', mini: 'Mini-Webinar' },
    storyEl: element, storyReturnNotice: null, innerWidth: 800,
    EEEStudio: { refreshIcons() {} }, storyContext: { session: { access_token: 'fixture' } },
    composeContext: () => '', storyTurnKey: () => 'turn:fixture01', generateSmartTitle: () => '',
    autoGrow() {}, dismissReturnNotice() {}, renderConversation() {}, scrollThread() {},
    showThinkingIndicator() {}, hideThinkingIndicator() {}, hideErrorInConversation() {},
    showErrorInConversation() {}, announceToReader() {}, recordStoryFailure() {}, adoptScriptTitle() {},
    renderProjectList() {}, renderScriptPanel() {}, renderSettingsSummary() {}, setStoryEditing() {},
    switchMobileTab() {}, isStoryPhone: () => false, restoreUnsavedStory: () => false,
    ensureVersions: () => [], saveActiveStory: async () => {}
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(client.slice(client.indexOf('function emptyAnswerStatus('), client.indexOf('// One request path for both')), c);
  vm.runInContext(client.slice(client.indexOf('async function sendStoryAnswer('), client.indexOf('async function retryRefineGeneration(')), c);
  vm.runInContext('let storySending = false;', c);
  return { c, element };
}

{
  const project = { id: 'empty', content_type: 'rant', output: null, intake: { current_step: 'R1' }, conversation: [{ role: 'assistant', content: 'Type the raw rant.' }] };
  const app = recoveryBrowser(project);
  await vm.runInContext('sendStoryAnswer()', app.c);
  assert.equal(project.conversation.length, 1, 'Stranger 39 browser: empty send adds no turn');
  assert.match(app.element('story-generation-status').textContent, /Raw story[\s\S]*unchanged[\s\S]*exact step/, 'Stranger 39 browser: empty send names the waiting step and next action');

  const broadProject = { id: 'broad', content_type: 'rant', title: 'Kept title', output: null, intake: { current_step: 'R1' }, conversation: [{ role: 'assistant', content: 'Type the raw rant.' }] };
  const broadApp = recoveryBrowser(broadProject);
  broadApp.element('story-answer').value = broadApp.c.STATES.BROAD_ANSWER_FIXTURE.fiveTopics;
  let generations = 0;
  broadApp.c.executeInterviewGeneration = async () => { generations++; };
  await vm.runInContext('sendStoryAnswer()', broadApp.c);
  assert.equal(generations, 0, 'Stranger 43: broad input is bounded before generation');
  assert.equal(broadProject.intake.current_step, 'R1', 'Stranger 43: narrowing stays on the exact current step');
  assert.equal(broadProject.conversation.at(-1).narrowingQuestion, true, 'Stranger 43: deterministic code adds the narrowing question');
  assert.ok(broadProject.conversation.some(message => message.content === broadApp.c.STATES.BROAD_ANSWER_FIXTURE.fiveTopics), 'Stranger 43: the broad answer itself is preserved');

  // Stranger 43: short but broad opening ('confidence for everyone about everything')
  const shortBroadProject = { id: 'short-broad', content_type: 'rant', title: 'New rant', output: null, intake: { current_step: 'R1' }, conversation: [{ role: 'assistant', content: 'Type the raw rant.' }] };
  const shortBroadApp = recoveryBrowser(shortBroadProject);
  shortBroadApp.element('story-answer').value = 'confidence for everyone about everything';
  let shortGenerations = 0;
  shortBroadApp.c.executeInterviewGeneration = async () => { shortGenerations++; };
  await vm.runInContext('sendStoryAnswer()', shortBroadApp.c);
  assert.equal(shortGenerations, 0, 'Stranger 43: short broad opening is bounded before generation');
  assert.equal(shortBroadProject.intake.current_step, 'R1', 'Stranger 43: short broad narrowing stays on current step');
  assert.equal(shortBroadProject.conversation.at(-1).narrowingQuestion, true, 'Stranger 43: short broad narrowing question added');
  assert.match(shortBroadProject.conversation.at(-1).content, /takes in everyone and everything/i, 'Stranger 43: narrowing question addresses universal scope');
  const broadOpenings = [
    'I want to help all people feel better about their lives',
    'how to be happy in general',
    'I want everybody to find confidence',
    'Teaching anybody to succeed at everything',
    'Making the world happier',
    'I want to discuss all of it',
    'Changing my whole life',
    'Helping anyone feel successful',
    'Everything about motivation',
    'Being all things to all people'
  ];
  for (const answer of broadOpenings) {
    const p = { id: 'general-broad', content_type: 'rant', title: 'New rant', output: null, intake: { current_step: 'R1' }, conversation: [{ role: 'assistant', content: 'Type the raw rant.' }] };
    const app = recoveryBrowser(p);
    app.element('story-answer').value = answer;
    let calls = 0;
    app.c.executeInterviewGeneration = async () => { calls++; };
    await vm.runInContext('sendStoryAnswer()', app.c);
    assert.equal(calls, 0, answer + ': no generation before narrowing');
    assert.equal(p.intake.current_step, 'R1', answer + ': same step');
    assert.equal(p.conversation.filter(m => m.narrowingQuestion).length, 1, answer + ': one narrowing question');
    assert.ok(p.conversation.some(m => m.content === answer), answer + ': words kept');
  }
  for (const answer of ['the day my mom handed me her car keys', 'Everything changed when my dad called', 'Helping everyone at our kitchen table']) {
    const app = recoveryBrowser(shortBroadProject);
    assert.equal(app.c.STATES.broadAnswerCheck(answer, [], 'R1').broad, false, answer + ': focused scene not narrowed');
  }
}

{
  const answer = 'The cracked blue bowl stayed on the shelf';
  const project = { id: 'retry', content_type: 'rant', title: 'Kept title', output: null, intake: { current_step: 'R1' }, conversation: [{ role: 'user', content: answer, key: 'turn:failed01' }] };
  const app = recoveryBrowser(project);
  const requests = [];
  app.c.reply = { ok: false, status: 502, json: async () => ({ error: 'Writing failed.', step: 'R2' }) };
  app.c.fetch = async (url, init) => { requests.push(JSON.parse(init.body)); return app.c.reply; };
  vm.runInContext(client.slice(client.indexOf('function storyRecoveryMessage('), client.indexOf('let thinkingInterval = null;')), app.c);
  vm.runInContext(client.slice(client.indexOf('async function retryInterviewGeneration('), client.indexOf('async function sendStoryAnswer(')), app.c);
  await vm.runInContext('executeInterviewGeneration()', app.c);
  assert.equal(project.intake.interruptedStep.step, 'R2', 'Stranger 51 browser: interruption records the attempted step');
  assert.equal(project.intake.interruptedStep.lastAnswer, answer, 'Stranger 58 browser: interruption keeps the exact member answer');
  assert.match(app.element('story-generation-status').textContent, /Choose the tension[\s\S]*Resume this step/, 'Developer 59 browser: the recovery notice names the step and Resume action');

  app.c.reply = { ok: true, status: 200, json: async () => ({ final: false, content: 'NEXT QUESTION: What made the bowl matter?', step: 'R2', idempotencyKey: 'gen:failed01' }) };
  await vm.runInContext('retryInterviewGeneration()', app.c);
  assert.equal(project.conversation.filter(message => message.role === 'user').length, 1, 'Stranger 40 browser: retry never duplicates the member answer');
  assert.equal(project.conversation.at(-1).step, 'R2', 'Stranger 40 browser: retry resumes R2');
  assert.equal(project.intake.interruptedStep, null, 'Developer 59 browser: successful retry clears the interruption');
  assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey, 'Stranger 51 browser: retry uses the same generation key');
}

{
  const project = { id: 'lapsed', title: 'Blue bowl', content_type: 'rant', output: null, intake: { current_step: 'R2' }, conversation: [{ role: 'assistant', content: 'Type the raw rant.' }, { role: 'user', content: 'The cracked blue bowl stayed on the shelf' }, { role: 'assistant', content: 'What made it matter?' }] };
  const app = recoveryBrowser(project);
  app.c.activeStory = null;
  app.c.storySaveTimer = null;
  app.c.storyReturnNotice = { state: 'lapsed', projectId: 'lapsed' };
  app.c.document = app.c.document || { activeElement: null };
  vm.runInContext(client.slice(client.indexOf('function syncObjectiveInputs('), client.indexOf('function applyStoryObjective(')), app.c);
  vm.runInContext(client.slice(client.indexOf('function showProject('), client.indexOf('function showStart()')), app.c);
  vm.runInContext('showProject(activeStory || ' + JSON.stringify(project) + ')', app.c);
  const line = app.element('story-generation-status').textContent;
  assert.match(line, /cracked blue bowl[\s\S]*Choose the tension[\s\S]*carried forward/, 'Stranger 65: lapse recovery names the member material and step carried forward');
  assert.match(line, /Answer the current question above[\s\S]*do not need to start over/, 'Stranger 67: lapse recovery says exactly what to do now');
}
console.log('PASS: WBR-462 browser recovery executes empty, broad, failed-retry and lapse paths.');

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

// 2026-11-08 walk: every interview step a member can be paused on has a name,
// so no status line falls back to an internal code like "Step R2".
{
  const client = read('js', 'storysculpt.js');
  const steps = read('api', '_lib', 'storysculpt-steps.js');
  const names = vm.runInNewContext(client.slice(client.indexOf('const STEP_NAMES = '), client.indexOf('function stepGuideMarkup(')).replace('const STEP_NAMES = ', '(') .replace(/;\s*$/, ')'), { STEP_GUIDE: vm.runInNewContext('(' + client.slice(client.indexOf('const STEP_GUIDE = {') + 'const STEP_GUIDE = '.length, client.indexOf('};', client.indexOf('const STEP_GUIDE = {')) + 1) + ')', { LENGTH_GUIDE: { title: 'Choose your length' }, DRAFT_GUIDE: { title: 'Your first draft' }, HOOK_GUIDE: { title: 'Choose your hook' }, ESCALATE_GUIDE: { title: 'Make your chosen hook stronger' }, LOOP_GUIDE: { title: 'Choose your open loop' } }) });
  const order = vm.runInNewContext('(' + steps.slice(steps.indexOf('{', steps.indexOf('bold:') - 40), steps.indexOf('}', steps.indexOf('rant:')) + 1) + ')');
  const interview = [...order.bold, ...order.mini, ...order.rant].filter(step => !['B7', 'M7', 'R8'].includes(step));
  const unnamed = interview.filter(step => !(names[step] && names[step].title));
  assert.deepEqual(unnamed, [], 'every interview step has a member-facing name');
  console.log('PASS: every interview step has a member-facing name, so no line says "Step R2".');
}
