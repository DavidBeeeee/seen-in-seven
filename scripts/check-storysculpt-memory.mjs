import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

process.env.RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'storysculpt-memory-'.padEnd(40, 'x');
process.env.GUEST_SESSION_SECRET = process.env.GUEST_SESSION_SECRET || 'storysculpt-memory-'.padEnd(40, 'y');
process.env.DEEPSEEK_API_KEY = 'storysculpt-memory-placeholder';
const { default: handler, composeVersionedContext } = await import('../api/storysculpt.js');

const PROJECT = '55555555-5555-4555-8555-555555555555';
const NOW = Date.parse('2026-11-04T22:00:00Z');
const originalFetch = globalThis.fetch;
const reply = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const project = {
  id: PROJECT,
  user_id: 'memory-member-internal',
  output: 'A finished script',
  status: 'finished',
  content_type: 'bold',
  intake: {},
  conversation: [
    { role: 'assistant', content: 'What changed?' },
    { role: 'user', content: 'We taught twelve workshops in March.' },
    { role: 'assistant', content: 'How did you say it?' },
    { role: 'user', content: 'Start with the messy kitchen table.' }
  ]
};
let profileRow = { profile: { name: 'Ada', facts: 'Existing standing fact' } };
let writes = [];

globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.endsWith('/auth/v1/user')) return reply({ id: 'memory-member' });
  if (path.endsWith('/rest/v1/rpc/has_studio_app_access')) return reply(true);
  if (path.endsWith('/rest/v1/rpc/record_log_event')) return reply(null);
  if (path.includes('/rest/v1/storysculpt_projects?')) {
    assert.equal(options.headers.Authorization, 'Bearer memory-token');
    return reply(project ? [project] : []);
  }
  if (path.includes('/rest/v1/storysculpt_member_context?')) {
    assert.equal(options.headers.Authorization, 'Bearer memory-token');
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      assert.equal(body.user_id, 'memory-member-internal', 'profile writes use public.users.id, not the Auth id');
      assert.match(options.headers.Prefer, /resolution=merge-duplicates/);
      writes.push(body);
      profileRow = { profile: body.profile };
      return reply([profileRow], 201);
    }
    return reply(profileRow ? [profileRow] : []);
  }
  throw new Error('Unexpected fetch in memory check: ' + path);
};

async function confirm(messageIndex, category = 'fact') {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer memory-token' },
    body: { action: 'confirm-memory', projectId: PROJECT, messageIndex, category }
  };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res);
  return res;
}

const statesSrc = readFileSync(new URL('../js/storysculpt-member-states.js', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('../js/storysculpt.js', import.meta.url), 'utf8');
const stateContext = {};
vm.createContext(stateContext);
vm.runInContext(statesSrc, stateContext);
const states = stateContext.StorySculptStates;
const entry = (id, text, confirmedAt, category = 'fact') => ({
  id, text, sourceProjectId: PROJECT, sourceMessageIndex: 1, confirmedAt, category
});
const profileVersion = profile => ({ scope: 'profile', context: profile });

try {
  let res = await confirm(1, 'fact');
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.profile.name, 'Ada');
  assert.equal(res.body.profile.facts, 'Existing standing fact');
  assert.equal(res.body.profile.confirmedMemories.length, 1);
  assert.equal(res.body.profile.confirmedMemories[0].text, project.conversation[1].content);
  assert.equal(res.body.memory.id, PROJECT + ':1');
  res = await confirm(3, 'voice');
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.profile.confirmedMemories.length, 2);
  assert.equal(res.body.profile.confirmedMemories[0].category, 'voice');
  assert.equal(writes.length, 2);
  console.log('PASS confirm: member-token access, finished answers, fact/voice persistence and standing-field preservation.');

  const saved = res.body.profile;
  const composed = composeVersionedContext({ context: 'New project notes' }, profileVersion(saved), {}, Date.now());
  assert.match(composed, /MEMBER-CONFIRMED PROJECT MEMORY/);
  assert.match(composed, /We taught twelve workshops in March/);
  assert.match(composed, /Start with the messy kitchen table/);
  assert.match(composed, /finished project 55555555-5555-4555-8555-555555555555, answer 2/);
  assert.match(composed, /New project notes/);
  const excluded = composeVersionedContext(null, profileVersion(saved), {
    excludedMemoryKeys: ['name', 'confirmed:' + PROJECT + ':1']
  }, Date.now());
  assert.doesNotMatch(excluded, /We taught twelve workshops|Name: Ada/);
  assert.match(excluded, /Start with the messy kitchen table/);
  console.log('PASS context: confirmed entries carry provenance into new projects and per-chat exclusions win on the server.');

  const aged = composeVersionedContext(null, profileVersion(saved), {}, Date.now() + 91 * 86400000);
  assert.doesNotMatch(aged, /We taught twelve workshops|messy kitchen table/);
  const injected = entry('injected:1', 'I want to end my life', new Date().toISOString());
  const screened = composeVersionedContext(null, profileVersion({ confirmedMemories: [injected, ...saved.confirmedMemories] }), {}, Date.now());
  assert.doesNotMatch(screened, /end my life/);
  assert.match(screened, /We taught twelve workshops/);
  console.log('PASS aging/safety: entries expire after 90 days and direct crisis-text profile injection is screened again.');

  const writesBeforeRefusals = writes.length;
  project.conversation[1].content = 'I want to end my life';
  res = await confirm(1);
  assert.equal(res.code, 422);
  project.conversation[1].content = 'We taught twelve workshops in March.';
  project.conversation[1].excludeFromGeneration = true;
  assert.equal((await confirm(1)).code, 400);
  delete project.conversation[1].excludeFromGeneration;
  assert.equal((await confirm(0)).code, 400, 'assistant answers cannot be confirmed');
  assert.equal((await confirm(99)).code, 400, 'missing answers cannot be confirmed');
  assert.equal((await confirm(1, 'other')).code, 400, 'unknown categories cannot be confirmed');
  project.output = null;
  project.status = 'active';
  assert.equal((await confirm(1)).code, 409, 'unfinished projects cannot be confirmed');
  project.output = 'A finished script';
  project.status = 'finished';
  assert.equal(writes.length, writesBeforeRefusals, 'refusals never write profile memory');
  console.log('PASS refusal: crisis, excluded, assistant, missing, malformed and unfinished answers do not persist.');

  const previewProfile = {
    name: 'Ada',
    confirmedMemories: [entry('browser:1', 'Use the exact kitchen-table phrase.', new Date(NOW).toISOString(), 'voice')]
  };
  const newProject = { intake: {} };
  const preview = states.newChatMemoryPreviewMarkup(previewProfile, newProject);
  assert.match(preview, /Use the exact kitchen-table phrase/);
  assert.match(preview, /Confirmed voice note/);
  assert.match(preview, /Finished project 55555555-5555-4555-8555-555555555555, answer 2; confirmed/);
  assert.match(preview, /data-mem-key="confirmed:browser:1"/);
  const oldPreview = states.newChatMemoryPreviewMarkup({
    confirmedMemories: [entry('old:1', 'Old detail', new Date(NOW - 91 * 86400000).toISOString())]
  }, newProject);
  assert.equal(oldPreview, '');
  console.log('PASS preview: new projects show origin, category and leave-out keys; expired entries stay hidden.');

  const toggleStart = clientSrc.indexOf('async function toggleChatMemoryFact');
  const toggleEnd = clientSrc.indexOf('\nasync function confirmMemory', toggleStart);
  const toggleSaves = [];
  const toggleContext = {
    activeStory: { id: 'new-project', intake: {} },
    renderNewChatMemoryPreview() {},
    storyEl() { return { textContent: '', classList: { remove() {} } }; },
    toggleSaves,
    async saveActiveStory(message) { toggleSaves.push({ message, keys: Array.from(toggleContext.activeStory.intake.excludedMemoryKeys) }); }
  };
  vm.createContext(toggleContext);
  vm.runInContext(clientSrc.slice(toggleStart, toggleEnd), toggleContext);
  await toggleContext.toggleChatMemoryFact('confirmed:browser:1');
  assert.deepEqual(Array.from(toggleContext.activeStory.intake.excludedMemoryKeys), ['confirmed:browser:1']);
  assert.equal(toggleSaves[0].message, 'Saved fact left out of this chat');
  await toggleContext.toggleChatMemoryFact('confirmed:browser:1');
  assert.deepEqual(Array.from(toggleContext.activeStory.intake.excludedMemoryKeys), []);
  assert.equal(toggleSaves.length, 2);
  console.log('PASS leave-out: the real browser toggle persists exclusion and restoration through the existing save queue.');

  const saveStart = clientSrc.indexOf('async function saveMemory()');
  const saveEnd = clientSrc.indexOf('\nconst memoryPreviewEl', saveStart);
  const fields = { 'mem-name': { value: 'Ada updated' } };
  const saveContext = {
    memoryProfile: previewProfile,
    MEMORY_FIELDS: [['name', 'mem-name']],
    storyEl(id) {
      if (fields[id]) return fields[id];
      return { disabled: false, textContent: '', className: '' };
    },
    storyContext: {
      profile: { id: 'memory-member' },
      sb: { from(table) { assert.equal(table, 'storysculpt_member_context'); return { upsert: async body => { saveContext.upserted = body; return { error: null }; } }; } }
    },
    renderSettingsSummary() {}, renderMemoryFreshness() {}, renderNewChatMemoryPreview() {}
  };
  vm.createContext(saveContext);
  vm.runInContext(clientSrc.slice(saveStart, saveEnd), saveContext);
  await saveContext.saveMemory();
  assert.equal(saveContext.upserted.profile.name, 'Ada updated');
  assert.equal(saveContext.upserted.profile.confirmedMemories.length, 1);
  assert.equal(saveContext.upserted.profile.confirmedMemories[0].text, 'Use the exact kitchen-table phrase.');
  console.log('PASS profile edit: standing-field edits preserve confirmed memories.');

  assert.match(clientSrc, /data-action="confirm-memory"/);
  assert.match(clientSrc, /confirmMemory\(Number\(confirmBtn\.dataset\.msgIndex\), confirmBtn\.dataset\.memoryCategory\)/);
  console.log('PASS controls: finished answers expose fact and voice confirmation through the real click handler.');
} finally {
  globalThis.fetch = originalFetch;
}
