// WBR-462: cross-project StorySculpt opening repetition, through the real handler.
// DeepSeek and Supabase are deterministic fixtures. The checks cover the actual
// member-token query, bounded model retries, terminal events and saved-step writes.
import assert from 'node:assert/strict';

process.env.RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'storysculpt-repetition-'.padEnd(40, 'x');
process.env.GUEST_SESSION_SECRET = process.env.GUEST_SESSION_SECRET || 'storysculpt-repetition-'.padEnd(40, 'y');
process.env.DEEPSEEK_API_KEY = 'storysculpt-repetition-placeholder';
const { default: handler, checkCrossProjectRepetition } = await import('../api/storysculpt.js');

const PROJECT = '22222222-2222-4222-8222-222222222222';
const OLD_PROJECT = '33333333-3333-4333-8333-333333333333';
const REPEATED_OPENING = 'A mask cannot bleed in public.';
const recent = [{
  id: OLD_PROJECT,
  output: 'FINAL SCRIPT: Earlier\n\n' + REPEATED_OPENING + ' The old script continues here.',
  updated_at: '2026-10-30T00:00:00Z'
}];

// Pure fixtures: titles and punctuation do not hide a duplicate, one small
// wording change is still a duplicate, and a fresh image or shared topic passes.
assert.equal(checkCrossProjectRepetition(
  'FINAL SCRIPT: New title\n\nA mask cannot bleed in public! A new body.', recent
).ok, false, 'exact opening with different punctuation is refused');
assert.equal(checkCrossProjectRepetition(
  'FINAL SCRIPT: New title\n\nA mask cannot bleed in public today. A new body.', recent
).ok, false, 'one added word does not evade the guard');
assert.equal(checkCrossProjectRepetition(
  'FINAL SCRIPT: New title\n\nThe curtain refused to rise. A new body.', recent
).ok, true, 'a fresh opening passes');
assert.equal(checkCrossProjectRepetition(
  'FINAL SCRIPT: New title\n\nI quit. A new body.', [{ output: 'Title: Old\n\nI quit. An old body.' }]
).ok, true, 'a two-word generic phrase is not enough evidence of repetition');
assert.equal(checkCrossProjectRepetition(
  'NEXT QUESTION: Hook options\n1. A mask cannot bleed in public.\n2. The curtain ate the applause.\n3. The bucket took a bow.',
  recent,
  true
).issue, 'repeated-opening: hook option 1 matches another recent finished script');
assert.equal(checkCrossProjectRepetition(
  'NEXT QUESTION: Hook options\n1. The mask took the night off.\n2. The curtain ate the applause.\n3. The bucket took a bow.',
  recent,
  true
).ok, true, 'fresh hook options pass');

const originalFetch = globalThis.fetch;
let scene;
let events;
let modelCalls;
let recentRequests;
let intakeWrites;

function reply(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value };
}

globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.endsWith('/auth/v1/user')) return reply({ id: 'repetition-member' });
  if (path.endsWith('/rest/v1/rpc/has_studio_app_access')) return reply(true);
  if (path.endsWith('/rest/v1/rpc/record_log_event')) {
    events.push(JSON.parse(options.body));
    return reply(null);
  }
  if (path.includes('/rest/v1/storysculpt_context_versions?')) return reply([]);
  if (path.includes('quota')) return reply(true);
  if (path.includes('deepseek.com')) {
    modelCalls.push(JSON.parse(options.body));
    const content = scene.replies[Math.min(modelCalls.length - 1, scene.replies.length - 1)];
    return reply({ choices: [{ message: { content } }], usage: { total_tokens: 15 } });
  }
  if (path.includes('/rest/v1/storysculpt_projects?')) {
    if (options.method === 'PATCH') { intakeWrites++; return reply(null); }
    if (path.includes('id=neq.')) {
      recentRequests.push({ path, options });
      if (scene.recentError) return reply({ message: 'fixture unavailable' }, 500);
      // Deliberately include the current project in this mocked response. The
      // server must still exclude it if a datastore ignores the neq filter.
      return reply([{ id: PROJECT, output: scene.currentOutput || null }, ...recent]);
    }
    return reply([{
      id: PROJECT,
      output: null,
      content_type: 'rant',
      intake: { current_step: scene.step },
      conversation: [],
      status: 'drafting',
      version: 1
    }]);
  }
  throw new Error('Unexpected fetch in StorySculpt repetition check: ' + path);
};

const freshHooks = 'NEXT QUESTION: Hook options\n1. The curtain ate the applause.\n2. The bucket took a bow.\n3. The spotlight missed its cue.';
const repeatedHooks = 'NEXT QUESTION: Hook options\n1. ' + REPEATED_OPENING + '\n2. The curtain ate the applause.\n3. The bucket took a bow.';
const hookMessages = [
  { role: 'user', content: 'I make props for school plays. My leaky bucket upstaged an actor at the school show.' },
  { role: 'assistant', content: 'Here is the approved draft about the school play.' },
  { role: 'user', content: 'go for the hook' }
];

function finalWith(opening) {
  return 'FINAL SCRIPT: The School Play\n\n' + opening
    + ' Then the bucket overflowed.'
    + ' I make props for school plays, and my leaky bucket upstaged an actor at the school show.'
    + ' I had built it to hold water, but the split seam turned a quiet scene into a small disaster.'
    + ' The actor kept speaking while I stood behind the curtain, watching the puddle travel toward the shoes I had painted that morning.'
    + ' I wanted the curtain to hide the bucket, then me, then the entire stage.'
    + ' Instead I carried a mop out during intermission and accepted that the prop would be remembered longer than my careful paintwork.'
    + ' Does a familiar prop ever become the part of your story you cannot stop repeating?'
    + ' Follow along if you want to make a fresh choice at the next show.';
}

const finalMessages = [
  { role: 'user', content: 'I make props for school plays. My leaky bucket upstaged an actor at the school show. I stood behind the curtain with a mop, painted shoes, a puddle, a split seam, and careful paintwork.' },
  { role: 'user', content: '45 seconds' },
  { role: 'assistant', content: 'Open loops\n1. Then the bucket overflowed.\n2. The actor looked down.\n3. The mop entered early.' },
  { role: 'user', content: '1' }
];

// The fresh control must pass every pre-existing final-script check. Otherwise
// this fixture would measure best-attempt selection rather than repetition.
const { readFileSync } = await import('node:fs');
const { checkDeterministic, parseTurns, extractBannedTerms } = await import('../api/_lib/storysculpt-steps.js');
const instructions = readFileSync('api/_hub/storysculpt-src/instructions.txt', 'utf8');
const blueprints = readFileSync('api/_lib/blueprints.txt', 'utf8');
const r8 = parseTurns(instructions).rant.turns.find(turn => turn.label === 'R8');
const freshControl = checkDeterministic({
  content: finalWith('The bucket upstaged the actor.'),
  stepLabel: 'R8',
  turnText: r8.text,
  memberMessages: finalMessages,
  bannedTerms: extractBannedTerms(blueprints),
  mode: 'rant',
  memberText: ['The School Play', ...finalMessages.filter(message => message.role === 'user').map(message => message.content)].join('\n')
});
assert.equal(freshControl.ok, true, 'fresh final control: ' + freshControl.issue);
assert.equal(checkCrossProjectRepetition(finalWith('The bucket upstaged the actor.'), recent).ok, true, 'fresh final repetition control');
const { classifyOutput } = await import('../api/_lib/storysculpt-observability.js');
const freshVerdict = classifyOutput(finalWith('The bucket upstaged the actor.'), {
  source: ['The School Play', ...finalMessages.map(message => message.content)].join('\n')
});
assert.equal(freshVerdict.ok, true, 'fresh final output contract: ' + JSON.stringify(freshVerdict));

async function run(nextScene) {
  scene = nextScene;
  events = [];
  modelCalls = [];
  recentRequests = [];
  intakeWrites = 0;
  const req = {
    method: 'POST',
    url: '/rant',
    headers: { authorization: 'Bearer repetition-token' },
    body: {
      mode: 'rant',
      projectId: PROJECT,
      intent: 'interview',
      projectTitle: 'The School Play',
      messages: scene.step === 'R7' ? finalMessages : hookMessages
    }
  };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res);
  return res;
}

try {
  // A finished script repeats its first sentence once, then accepts a fresh
  // retry. The current project's matching output cannot collide with itself.
  let res = await run({
    step: 'R7',
    currentOutput: finalWith('The bucket upstaged the actor.'),
    replies: [finalWith(REPEATED_OPENING), finalWith('The bucket upstaged the actor.')]
  });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.equal(res.body.final, true);
  assert.ok(res.body.content.startsWith('The bucket upstaged the actor.'), JSON.stringify(res.body));
  assert.equal(modelCalls.length, 2, 'the repeated final opening gets exactly one fresh retry');
  assert.match(modelCalls[1].messages.at(-1).content, /RETRY:[\s\S]*repeated-opening/);
  assert.equal(events.length, 1);
  assert.equal(events[0].p_event_type, 'storysculpt_generation');
  assert.equal(events[0].p_detail.attempts, 2);
  assert.equal(intakeWrites, 1);

  // A repeated hook is repaired in the option step, before a final exists.
  res = await run({ step: 'R5', replies: [repeatedHooks, freshHooks] });
  assert.equal(res.code, 200, JSON.stringify(res.body));
  assert.ok(!res.body.content.includes(REPEATED_OPENING));
  assert.equal(modelCalls.length, 2);
  assert.match(modelCalls[1].messages.at(-1).content, /hook option 1 matches another recent finished script/);

  // If all three attempts repeat, the option set is refused and the saved step
  // stays unchanged. Events carry the failure kind, never the opening itself.
  res = await run({ step: 'R5', replies: [repeatedHooks] });
  assert.equal(res.code, 502);
  assert.equal(res.body.rejected, 'repeated-opening');
  assert.equal(modelCalls.length, 3, 'initial attempt plus two bounded retries');
  assert.equal(intakeWrites, 0, 'a refused repetition cannot advance the saved step');
  assert.equal(events.at(-1).p_event_type, 'storysculpt_output_rejected');
  assert.ok(events.at(-1).p_detail.violations.includes('repeated-opening'));
  assert.ok(!JSON.stringify(events).includes('mask cannot bleed'), 'member script text stays out of logs');

  // The history read is part of the guard, not an optional best-effort extra.
  res = await run({ step: 'R5', replies: [freshHooks], recentError: true });
  assert.equal(res.code, 503);
  assert.equal(modelCalls.length, 0, 'generation does not fail open when history is unavailable');
  assert.equal(events.at(-1).p_detail.failureClass, 'database-error');

  // Every guarded path uses the member token, excludes this project, and reads
  // only six recent finished or filmed scripts with a non-null output.
  assert.ok(recentRequests.length === 1);
  const { path, options } = recentRequests[0];
  assert.ok(path.includes('id=neq.' + PROJECT));
  assert.ok(path.includes('status=in.(finished,filmed)'));
  assert.ok(path.includes('output=not.is.null'));
  assert.ok(path.includes('order=updated_at.desc'));
  assert.ok(path.includes('limit=6'));
  assert.equal(options.headers.Authorization, 'Bearer repetition-token');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('PASS: StorySculpt repetition fixtures: exact and near openings, fresh retry, bounded refusal, current-project exclusion, member-token recent-history query, and fail-closed database handling.');
