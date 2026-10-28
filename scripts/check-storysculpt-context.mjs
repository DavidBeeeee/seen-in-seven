import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

process.env.RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'storysculpt-context-'.padEnd(40, 'x');
process.env.GUEST_SESSION_SECRET = process.env.GUEST_SESSION_SECRET || 'storysculpt-context-'.padEnd(40, 'y');
process.env.DEEPSEEK_API_KEY = 'storysculpt-context-placeholder';
const { default: handler, composeVersionedContext } = await import('../api/storysculpt.js');

const PROJECT = '44444444-4444-4444-8444-444444444444';
const originalFetch = globalThis.fetch;
let scene;
let modelPayloads;
const storedProject = {
  id: PROJECT,
  output: null,
  content_type: 'bold',
  intake: { current_step: 'B1', context: 'The stored project stays intact.' },
  conversation: [{ role: 'user', content: 'A stored answer', excludeFromGeneration: true }]
};
const reply = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });

function newest(scope) {
  const rows = scene.versions.filter(row => row.scope === scope);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)[0];
}

globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.endsWith('/auth/v1/user')) return reply({ id: 'context-member' });
  if (path.endsWith('/rest/v1/rpc/has_studio_app_access')) return reply(true);
  if (path.endsWith('/rest/v1/rpc/record_log_event')) return reply(null);
  if (path.includes('/rest/v1/storysculpt_projects?')) {
    if (options.method === 'PATCH') return reply(null);
    return reply([storedProject]);
  }
  if (path.includes('/rest/v1/storysculpt_context_versions?')) {
    assert.match(path, /order=created_at\.desc,id\.desc&limit=1/, 'newest-first timestamp and identity ordering');
    if (scene.contextError) return reply({ message: 'unavailable' }, 500);
    if (scene.race) scene.versions = scene.race;
    const scope = path.includes('scope=eq.profile') ? 'profile' : 'project';
    const row = newest(scope);
    return reply(row ? [row] : []);
  }
  if (path.includes('quota')) return reply(true);
  if (path.includes('deepseek.com')) {
    const payload = JSON.parse(options.body);
    modelPayloads.push(payload);
    return reply({ choices: [{ message: { content: 'NEXT QUESTION: Pick a direction.\n1. The workshop correction\n2. The Thursday change\n3. The member answer' } }] });
  }
  throw new Error('Unexpected fetch in context check: ' + path);
};

async function generate(messages, context = 'STALE POSTED FACT') {
  modelPayloads = [];
  const req = { method: 'POST', headers: { authorization: 'Bearer context-token' }, body: {
    mode: 'bold', projectId: PROJECT, intent: 'interview', projectTitle: 'Context check', context, messages
  } };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res);
  return res;
}

const version = (scope, context, created_at, id) => ({ scope, context, created_at, id });
const projectOnly = (context) => [version('project', context, '2026-10-27T12:00:00Z', 2)];
const payloadText = () => JSON.stringify(modelPayloads);

try {
  // The model sees only the newest saved project and profile snapshots. Old
  // database versions and the request's stale posted context cannot leak back in.
  scene = { versions: [
    version('project', 'Old role: bakery owner', '2026-10-27T10:00:00Z', 1),
    version('project', 'Corrected role: workshop teacher', '2026-10-27T11:00:00Z', 2),
    version('profile', { role: 'Old profile role', facts: 'Old result' }, '2026-10-27T10:30:00Z', 3),
    version('profile', { role: 'Woodworker', facts: 'Twelve workshops taught' }, '2026-10-27T11:30:00Z', 4)
  ] };
  let res = await generate([{ role: 'user', content: 'Continue with my corrected background.' }], 'Old role: bakery owner');
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.match(payloadText(), /Corrected role: workshop teacher/);
  assert.match(payloadText(), /What they do: Woodworker/);
  assert.match(payloadText(), /Facts and results to reuse: Twelve workshops taught/);
  assert.doesNotMatch(payloadText(), /Old role: bakery owner|Old profile role|Old result|STALE POSTED FACT/);
  res = await generate([{ role: 'user', content: 'Ignore my legacy posted context.' }], 'x'.repeat(12001));
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.match(payloadText(), /Corrected role: workshop teacher/);
  console.log('PASS supersede: only the newest saved project and profile context reach the model; posted context is ignored before validation.');

  // Exclusion is enforced by the server, not merely by a CSS state. The answer
  // remains visible in the stored conversation and no project delete is issued.
  scene = { versions: projectOnly('Workshop notes') };
  res = await generate([
    { role: 'user', content: 'IGNORE THIS ANSWER COMPLETELY', excludeFromGeneration: true },
    { role: 'assistant', content: 'Earlier reply' },
    { role: 'user', content: 'Keep this answer in the interview.' }
  ]);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.doesNotMatch(payloadText(), /IGNORE THIS ANSWER COMPLETELY/);
  assert.match(payloadText(), /Keep this answer in the interview/);
  assert.equal(storedProject.conversation[0].excludeFromGeneration, true);
  assert.equal(storedProject.conversation[0].content, 'A stored answer');
  console.log('PASS exclude: flagged answer is absent, other answers remain, stored project remains intact.');

  // The project is read first. A newer version arrives before the context read,
  // exactly the immediate edit/generate interleaving this feature must win.
  scene = {
    versions: projectOnly('Before the edit: Tuesday workshop'),
    race: [version('project', 'After the edit: Thursday workshop', '2026-10-27T12:01:00Z', 3)]
  };
  res = await generate([{ role: 'user', content: 'Generate immediately.' }]);
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.match(payloadText(), /After the edit: Thursday workshop/);
  assert.doesNotMatch(payloadText(), /Before the edit: Tuesday workshop|STALE POSTED FACT/);
  console.log('PASS race: an edit landing after project read but before generation is the context used.');

  // A failed version read is a database refusal, never permission to silently
  // send the stale browser value to the model.
  scene = { versions: projectOnly('Current saved context'), contextError: true };
  res = await generate([{ role: 'user', content: 'Continue.' }]);
  assert.equal(res.code, 503, JSON.stringify(res.body));
  assert.equal(modelPayloads.length, 0);
  console.log('PASS failure: context database errors never fall back to posted context.');

  // Migration contract: database triggers version genuine edits for every write
  // path; backfill, RLS and newest ordering support the server read above.
  const migration = readFileSync(new URL('../supabase_migrations/2026-10-27-storysculpt-context-versions.sql', import.meta.url), 'utf8');
  for (const required of [
    'created_at timestamptz not null default now()',
    "new.intake->>'context' is distinct from old.intake->>'context'",
    'new.profile is distinct from old.profile',
    'after insert or update of intake on public.storysculpt_projects',
    'after insert or update of profile on public.storysculpt_member_context',
    'from public.storysculpt_projects p',
    'from public.storysculpt_member_context m',
    'security definer',
    "set search_path = ''",
    'enable row level security',
    "public.member_has_app(user_id, 'storysculpt')",
    'grant select on public.storysculpt_context_versions to authenticated'
  ]) assert.ok(migration.includes(required), 'migration includes ' + required);
  assert.match(migration, /created_at desc, id desc/);
  assert.equal((migration.match(/coalesce\(to_jsonb\(/g) || []).length, 2, 'empty project context stays JSON null, not a NOT NULL violation');
  assert.equal(composeVersionedContext(version('project', 'New notes'), version('profile', { name: 'Ada' })), 'MEMBER STORY PROFILE (standing facts the member set once):\nName: Ada\n\nNew notes');
  console.log('PASS migration: timestamped triggers, backfill, member RLS and deterministic newest read.');

  // Execute the real browser toggle in a small VM. Its save spy proves the flag
  // is passed through the existing serialized save entry point, not just drawn.
  const client = readFileSync(new URL('../js/storysculpt.js', import.meta.url), 'utf8');
  const start = client.indexOf('async function toggleMessageContext');
  const end = client.indexOf('\nasync function promoteMessageToScript', start);
  assert.ok(start >= 0 && end > start);
  let savedMessage = '';
  let renders = 0;
  const browser = {
    activeStory: { id: PROJECT, conversation: [{ role: 'user', content: 'Keep the answer visible.' }] },
    renderConversation() { renders += 1; },
    async saveActiveStory(message) { savedMessage = message; }
  };
  vm.createContext(browser);
  vm.runInContext(client.slice(start, end), browser);
  await browser.toggleMessageContext(0);
  assert.equal(browser.activeStory.conversation[0].excludeFromGeneration, true);
  assert.equal(browser.activeStory.conversation[0].content, 'Keep the answer visible.');
  assert.equal(savedMessage, 'Answer excluded from future drafts');
  assert.equal(renders, 1);
  await browser.toggleMessageContext(0);
  assert.equal(browser.activeStory.conversation[0].excludeFromGeneration, false);
  assert.equal(savedMessage, 'Answer included in future drafts');
  assert.match(client, /data-action="toggle-context-message"/);
  assert.match(client, /aria-pressed="/);
  assert.match(client, /Not used in future drafts/);
  console.log('PASS browser: toggle keeps the answer, persists both states, and exposes pressed/excluded UI.');
} finally {
  globalThis.fetch = originalFetch;
}
