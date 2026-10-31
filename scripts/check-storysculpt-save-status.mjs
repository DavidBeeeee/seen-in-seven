// WBR-462: execute the real browser save functions with a fake clock and DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/storysculpt.js', import.meta.url), 'utf8');
const saveSource = source.slice(source.indexOf('let storySaveChain = Promise.resolve();'), source.indexOf('// The connection came back:'));
const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
// Run the actual generation transport and recovery formatter, not copied prose.
// The save and fetch boundaries are isolated; no production request is made.
{
  const project = { id: 'recovery', content_type: 'rant', intake: {}, conversation: [{ role: 'user', content: 'My pottery answer', key: 'turn:recovery' }], output: null };
  let transport = 'offline', saveFails = false;
  const c = vm.createContext({
    project,
    EEEStudio: {}, storyContext: { session: { access_token: 'fixture' } },
    storyEl: () => ({ value: 'Recovery fixture' }), composeContext: () => '',
    storyTurnKey: () => 'turn:recovery', recordStoryFailure() {}, adoptScriptTitle() {},
    renderConversation() {}, scrollThread() {},
    saveActiveStory: async () => { if (saveFails) { const e = new Error('fixture save failed'); e.keptLocally = true; throw e; } },
    fetch: async () => {
      if (transport === 'offline') throw new TypeError('Failed to fetch');
      if (transport === 'generation') return { ok: false, status: 502, json: async () => ({ error: 'The writing attempt did not finish.' }) };
      if (transport === 'locked') return { ok: false, status: 409, json: async () => ({ error: 'This script is already finished. Use Refine.' }) };
      return { ok: true, json: async () => ({ final: true, content: 'A recovered script.', trace: 'fixture' }) };
    }
  });
  vm.runInContext('let activeStory = project;', c);
  vm.runInContext(source.slice(source.indexOf('function storyRecoveryMessage('), source.indexOf('let thinkingInterval = null;')), c);
  const fail = async () => {
    try { await vm.runInContext('runGeneration()', c); assert.fail('expected failure'); }
    catch (e) { c.failure = e; return vm.runInContext('storyRecoveryMessage(failure, "Fallback")', c); }
  };
  assert.match(await fail(), /^Connection lost\.[\s\S]*Reconnect[\s\S]*Try again/);
  assert.equal(project.conversation[0].content, 'My pottery answer');
  transport = 'generation';
  assert.match(await fail(), /writing attempt[\s\S]*saved chat is safe[\s\S]*same answer/);
  transport = 'locked';
  assert.equal(await fail(), 'This script is already finished. Use Refine.', 'lock instructions are not replaced by a retry');
  transport = 'ok'; saveFails = true;
  assert.match(await fail(), /kept on this device[\s\S]*not saved to your account/);
  assert.equal(project.output, 'A recovered script.', 'unsaved generated output stays in the current page');
  saveFails = false;
  await vm.runInContext('runGeneration()', c);
  assert.equal(project.conversation.filter(m => m.role === 'user').length, 1, 'retry does not duplicate the member answer');
  console.log('PASS real transport: connection, generation, lock, local-only save and successful retry recovery');
}
function boot() {
  let now = 0, next = 0;
  const timers = new Map(), storage = new Map(), writes = [];
  const elements = {
    'story-title': { value: 'First title' }, 'story-context': { value: 'Notes' },
    'story-save-status': { textContent: 'Saved', className: '' }
  };
  const project = { id: 'a', version: 1, status: 'drafting', intake: {}, conversation: [], output: null };
  const sb = { from: () => ({ update(updates) {
    const write = { updates: JSON.parse(JSON.stringify(updates)) };
    writes.push(write);
    return { eq: (_key, id) => { write.id = id; return { select: () => ({ single: () => new Promise((resolve, reject) => {
      write.resolve = resolve; write.reject = reject;
    }) }) }; } };
  } }) };
  const c = vm.createContext({ project, elements, sb, console,
    localStorage: { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k), removeItem: k => storage.delete(k) },
    setTimeout: (fn, delay) => { timers.set(++next, { fn, at: now + delay }); return next; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext('let activeStory = project; let storySaveTimer = null; const storyContext = { sb }; const storyEl = id => elements[id]; function renderProjectList() {}', c);
  vm.runInContext(saveSource, c);
  return { c, elements, project, writes, storage,
    call: code => vm.runInContext(code, c),
    status: () => elements['story-save-status'].textContent,
    async tick(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
      await drain();
    },
    async ack(i, version = i + 2) { writes[i].resolve({ data: { version, status: 'drafting', conversation: [] }, error: null }); await drain(); },
    async fail(i, message = 'offline') { writes[i].resolve({ data: null, error: { message } }); await drain(); }
  };
}

{
  const a = boot();
  a.call('queueStorySave()');
  assert.equal(a.status(), 'Saving', 'edit immediately invalidates Saved');
  assert.equal(a.storage.size, 1, 'edit survives a reload before debounce');
  await a.tick(499); assert.equal(a.writes.length, 0);
  await a.tick(1); assert.equal(a.writes.length, 1);
  assert.equal(a.status(), 'Saving', 'pending request is not Saved');
  await a.ack(0); assert.equal(a.status(), 'Saved'); assert.equal(a.storage.size, 0);
  console.log('PASS edit, debounce, pending, acknowledged Saved and local reload recovery');
}
{
  const a = boot(); a.call('queueStorySave()'); await a.tick(500);
  await a.fail(0); assert.equal(a.status(), 'Not saved, retrying');
  await a.tick(1199); assert.equal(a.writes.length, 1);
  await a.tick(1); assert.equal(a.status(), 'Saving');
  await a.ack(1); assert.equal(a.status(), 'Saved');
  console.log('PASS failed write, bounded retry and recovery');
}
{
  const a = boot(); a.call('queueStorySave()'); await a.tick(500);
  a.writes[0].reject(new Error('network disconnected')); await drain();
  await a.tick(1200); await a.fail(1);
  assert.match(a.status(), /^Not saved, retrying/); assert.equal(a.storage.size, 1);
  a.call('queueStorySave()'); await a.tick(500); await a.ack(2);
  assert.equal(a.status(), 'Saved', 'a failed write does not wedge the save queue');
  console.log('PASS thrown network error, exhausted retry, retained work and later save');
}
{
  const a = boot(); a.call('queueStorySave()'); await a.tick(500);
  a.elements['story-title'].value = 'Newest title'; a.call('queueStorySave()');
  await a.ack(0);
  assert.equal(a.status(), 'Saving', 'older acknowledgement cannot clear a newer edit');
  assert.equal(JSON.parse([...a.storage.values()][0]).title, 'Newest title');
  assert.equal(JSON.parse([...a.storage.values()][0]).expected_version, 2);
  await a.tick(500); assert.equal(a.writes[1].updates.expected_version, 2);
  await a.ack(1, 3); assert.equal(a.status(), 'Saved');
  assert.equal(a.project.title, 'Newest title');
  console.log('PASS edit during in-flight write, latest-only status and version advance');
}
{
  const a = boot();
  const done = a.call('saveActiveStory()');
  a.call("activeStory = { id: 'b', version: 1 }; elements['story-title'].value = 'Other chat'; elements['story-save-status'].textContent = 'Other status'");
  await drain(); assert.equal(a.writes[0].id, 'a');
  assert.equal(a.writes[0].updates.title, 'First title', 'queued save captured original fields');
  await a.ack(0); await done; assert.equal(a.status(), 'Other status');
  console.log('PASS navigation keeps write owner and does not overwrite another chat status');
}
{
  const a = boot(); a.call('queueStorySave()'); await a.tick(500);
  await a.fail(0, 'STALE_VERSION');
  assert.match(a.status(), /Nothing newer was overwritten/);
  await a.tick(1200); assert.equal(a.writes.length, 1, 'stale writes never retry');
  console.log('PASS stale-version refusal is distinct and never retried');
}

const html = fs.readFileSync(new URL('../api/_hub/storysculpt.html', import.meta.url), 'utf8');
const terms = fs.readFileSync(new URL('../terms.html', import.meta.url), 'utf8');
for (const text of [html.slice(html.indexOf('id="story-help"')), terms.slice(terms.indexOf('id="storysculpt-faq"'))]) {
  for (const pattern of [/format is locked/, /resume/, /clos(?:ed|es).*to new turns/, /Refine/, /Archive/, /Restore chat/, /irreversible|permanently/]) assert.match(text, pattern);
}
assert.match(html, /You can't change this later; start a new script for a different format\./);
console.log('PASS Help, shared FAQ and format-lock hint');
const help = html.slice(html.indexOf('id="story-help"'));
const membershipFaq = terms.slice(terms.indexOf('id="storysculpt-membership-faq"'), terms.indexOf('id="certainty-faq"'));
for (const text of [help, membershipFaq]) {
  assert.match(text, /\$250 USD monthly membership/);
  assert.match(text, /renews automatically each month until cancelled/);
  assert.match(text, /applicable tax/);
  assert.match(text, /without an automatic wait until/);
  assert.match(text, /not automatically delete|not automatically deleted/);
  assert.match(text, /before access ends/);
  assert.match(text, /pricing-cancellation/);
}
assert(!html.slice(0,html.indexOf('id="story-help"')).includes('$250 USD'), 'Membership detail stays in Help, not another main-screen card');
console.log('PASS membership Help and FAQ: current monthly amount, renewal, cancellation, retained work, and terms links');
