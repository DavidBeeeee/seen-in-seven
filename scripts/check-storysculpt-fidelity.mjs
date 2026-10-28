#!/usr/bin/env node

// StorySculpt output fidelity eval (WBR-458; Momentum 300 StorySculpt
// Developer 41-47, 63, 64, 68, 78, Stranger 77, 78).
//
// Part 1 grades api/_lib/storysculpt-fidelity.js on its own: every planted
// invention (credential, result, testimonial, number, date, diagnosis, memory,
// overconfident promise, lost voice) must be flagged with its kind, and every
// good script, including ones that use the member's own figures, dates and
// credentials, must pass untouched.
//
// Part 2 runs the real api/storysculpt.js handler with DeepSeek replaced by a
// scripted reply per attempt: a clean script is delivered with no retry; a
// flagged script is retried exactly once; a clean retry replaces it with no
// note; a retry that is still flagged is delivered with a plain note and logs
// storysculpt_output_rejected with the kinds and delivered: true. Events never
// carry member words.

import assert from 'node:assert/strict';
import { checkFidelity, fidelityNote, VOICE_SHARE_MIN } from '../api/_lib/storysculpt-fidelity.js';
import { incidentSignal } from '../api/_lib/storysculpt-observability.js';

let n = 0;
const pass = (msg) => { n += 1; console.log(`  PASS [${n}]: ${msg}`); };

const MEMBER = [
  'I run a tiny bakery in Pueblo and I wake up at 4am every day.',
  'Last spring my oven broke the week before Easter and I baked 200 hot cross buns in my neighbor\'s kitchen.',
  'People think baking is relaxing but it is mostly dishes and math.',
  'I want people to stop asking me for free samples. Everyone wants a free sample and nobody thinks about the butter.'
].join(' ');

const GOOD = 'Everybody thinks running a tiny bakery is relaxing. It is mostly dishes and math. I wake up at 4am every day. Last spring my oven broke the week before Easter, and I baked 200 hot cross buns in my neighbor\'s kitchen. So when you ask me for a free sample, think about the butter. Think about the dishes. Think about the math. Then buy the bun. What would you do with a broken oven the week before Easter? Come by the bakery in Pueblo and tell me.';

const plant = (sentence) => GOOD.replace('Then buy the bun.', sentence + ' Then buy the bun.');

// Planted inventions: [name, script, expected kind]
const INVENTED = [
  ['invented credential', plant('As a certified master baker, I know.'), 'credential'],
  ['invented years of experience', plant('With 20 years of experience behind me, I know.'), 'credential'],
  ['invented result', plant('That week I doubled my sales.'), 'result'],
  ['invented result, six figures', plant('Now the bakery does six figures.'), 'result'],
  ['invented testimonial', plant('One customer told me they were the best buns in Colorado.'), 'testimonial'],
  ['invented number', plant('I sell 600 loaves a week.'), 'number'],
  ['invented spelled number', plant('Fifteen years in, I still do the dishes.'), 'number'],
  ['invented year', plant('Back in 2019 it was worse.'), 'date'],
  ['invented month', plant('Every December it gets worse.'), 'date'],
  ['invented weekday', plant('On Saturdays the line is out the door.'), 'date'],
  ['invented diagnosis', plant('Baking got me through my anxiety.'), 'diagnosis'],
  ['false memory claim', plant('Remember when you told me about your first oven?'), 'memory'],
  ['overconfident promise', plant('This works every single time, guaranteed.'), 'overconfident'],
  ['lost voice', 'Entrepreneurship demands resilience. Visionary founders cultivate unstoppable momentum, leverage authentic storytelling, and transform obstacles into opportunities. Successful brands nurture loyal communities through consistent engagement, strategic positioning, and memorable experiences. Leaders embrace discomfort, iterate relentlessly, celebrate progress, and inspire audiences everywhere. Growth follows clarity, courage, and purposeful action. Start building your legacy today with intention and heart.', 'voice']
];

// Good scripts that must pass untouched: [name, script, member text]
const GOOD_CASES = [
  ['the member\'s own story, their words and figures', GOOD, MEMBER],
  ['fresh imagery still anchored in their words', 'A free sample is a tiny loan you never pay back. I run a tiny bakery in Pueblo, up at 4am every day, and most of it is dishes and math. Last spring the oven broke the week before Easter, so I baked 200 hot cross buns in my neighbor\'s kitchen. Every crumb you taste for free is butter I bought. Buy the bun. What would you do if your oven quit the week before Easter?', MEMBER],
  ['their figure spelled out', GOOD.replace('200 hot cross buns', 'two hundred hot cross buns'), MEMBER],
  ['a figure of speech, not a claim', GOOD.replace('Then buy the bun.', 'I have heard it a hundred times. Then buy the bun.'), MEMBER],
  ['a credential the member stated', 'I am a licensed electrician and I hate when people say a breaker is just a switch. A breaker is the one thing standing between your toaster and a fire. Respect the breaker. Call a licensed electrician. What is the scariest thing you have seen in a fuse box?', 'I am a licensed electrician and people treat the breaker like it is just a switch. It is the thing between your toaster and a fire.'],
  ['"may" as a verb, not a month', GOOD.replace('Then buy the bun.', 'You may think a sample is harmless. Then buy the bun.'), MEMBER],
  ['an overconfident word the member used themself', 'My dad said a cast iron pan is guaranteed to outlive you. He was right. I still cook in his pan every morning, guaranteed to outlive me too. Treat it like family. What pan in your kitchen will outlive you?', 'My dad always said a cast iron pan is guaranteed to outlive you. I still cook in his pan every morning.'],
  ['a date and weekday the member gave', 'I quit drinking on a Tuesday in 2021. Not a Monday, not New Year, a Tuesday. Nothing special happened. I just poured it out. What ordinary day changed something for you?', 'I quit drinking on a random Tuesday in 2021. Nothing special happened that day, I just poured it out.']
];

console.log('--- StorySculpt fidelity eval (WBR-458) ---');
console.log('Part 1: the check on its own');

for (const [name, script, kind] of INVENTED) {
  const r = checkFidelity(script, { source: MEMBER, memberText: MEMBER });
  assert.ok(!r.ok && r.kinds.includes(kind), `${name}: expected ${kind}, got ${JSON.stringify(r.kinds)} (voice ${r.voiceShare})`);
  pass(`${name} is flagged as ${kind}`);
}
for (const [name, script, member] of GOOD_CASES) {
  const r = checkFidelity(script, { source: member, memberText: member });
  assert.ok(r.ok, `${name}: expected pass, got ${JSON.stringify(r.kinds)} (voice ${r.voiceShare})`);
  pass(`${name} passes (voice share ${r.voiceShare})`);
}
{
  const good = checkFidelity(GOOD, { source: MEMBER, memberText: MEMBER });
  const lost = checkFidelity(INVENTED[INVENTED.length - 1][1], { source: MEMBER, memberText: MEMBER });
  assert.ok(good.voiceShare >= VOICE_SHARE_MIN && lost.voiceShare < VOICE_SHARE_MIN);
  pass(`voice threshold ${VOICE_SHARE_MIN} separates the good script (${good.voiceShare}) from the lost-voice one (${lost.voiceShare})`);
  const note = fidelityNote(checkFidelity(plant('Back in 2019 I sold 600 loaves.'), { source: MEMBER, memberText: MEMBER }));
  assert.ok(/a date or a number you did not give StorySculpt/.test(note) && !/2019|600/.test(note), note);
  pass('the member\'s note is plain and repeats none of the script\'s words');
}

console.log('Part 2: through the real handler');

process.env.RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'storysculpt-fidelity-'.padEnd(40, 'x');
process.env.GUEST_SESSION_SECRET = process.env.GUEST_SESSION_SECRET || 'storysculpt-fidelity-'.padEnd(40, 'y');
process.env.DEEPSEEK_API_KEY = 'storysculpt-fidelity-placeholder';
const { default: handler } = await import('../api/storysculpt.js');

const PROJECT = '33333333-3333-4333-8333-333333333333';
const originalFetch = globalThis.fetch;
let replies;
let modelCalls;
let events;
const reply = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value, text: async () => JSON.stringify(value) });
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.endsWith('/auth/v1/user')) return reply({ id: 'fidelity-member' });
  if (path.endsWith('/rest/v1/rpc/has_studio_app_access')) return reply(true);
  if (path.endsWith('/rest/v1/rpc/record_log_event')) { events.push(JSON.parse(options.body)); return reply(null); }
  if (path.includes('/rest/v1/storysculpt_projects?')) {
    if (options.method === 'PATCH') return reply(null);
    return reply([{ id: PROJECT, output: GOOD, content_type: 'bold', intake: { current_step: 'F1' }, conversation: [] }]);
  }
  if (path.includes('/rest/v1/storysculpt_context_versions?')) return reply([]);
  if (path.includes('quota')) return reply(true);
  if (path.includes('deepseek.com')) {
    // Answer by what was asked: the fidelity retry carries its own directive.
    // Other calls (re-aiming the answers, style retries) get the first draft.
    const isRetry = String(options.body || '').includes('put things in the member');
    if (isRetry) modelCalls += 1;
    const next = isRetry ? replies.retry : replies.first;
    return reply({ choices: [{ message: { content: next } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  }
  throw new Error('Unexpected fetch in fidelity eval: ' + path);
};

async function refine(scripts) {
  const [first, retry = first] = scripts.map(s => 'FINAL SCRIPT: Free samples\n' + s);
  replies = { first, retry };
  modelCalls = 0;
  events = [];
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer fidelity-token' },
    body: {
      mode: 'bold', projectId: PROJECT, intent: 'refine', projectTitle: 'Free samples', context: '',
      messages: [{ role: 'user', content: MEMBER }, { role: 'assistant', content: GOOD }, { role: 'user', content: 'Make it a bit punchier.' }]
    }
  };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res);
  return res;
}
const types = () => events.map(e => e.p_event_type);
const rejected = () => events.find(e => e.p_event_type === 'storysculpt_output_rejected');

try {
  {
    const res = await refine([GOOD]);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.equal(modelCalls, 0, 'a clean script is not retried');
    assert.equal(res.body.fidelityNote, undefined);
    assert.ok(!rejected());
    pass('a clean finished script is delivered as written, no fidelity retry, no note');
  }
  {
    const res = await refine([plant('I sell 600 loaves a week.'), GOOD]);
    assert.equal(res.code, 200);
    assert.equal(modelCalls, 1, 'a flagged script is retried once');
    assert.ok(!/600/.test(res.body.content), 'the clean retry replaces the flagged draft');
    assert.equal(res.body.fidelityNote, undefined);
    assert.ok(!rejected(), 'nothing is logged as rejected when the retry is clean');
    pass('a flagged script is retried once and the clean retry is shown, no note');
  }
  {
    const flagged = plant('Back in 2019 I sold 600 loaves a week.');
    const res = await refine([flagged, flagged, flagged]);
    assert.equal(res.code, 200, 'the member still gets a script');
    assert.equal(modelCalls, 1, 'retried exactly once, not twice');
    assert.ok(res.body.content.includes('600'), 'the draft is shown');
    assert.ok(/^Check this draft before you film it/.test(res.body.fidelityNote || ''), 'with a plain note');
    const ev = rejected();
    assert.ok(ev, 'storysculpt_output_rejected is logged');
    assert.deepEqual(ev.p_detail.violations.sort(), ['fidelity-date', 'fidelity-number']);
    assert.equal(ev.p_detail.delivered, true);
    assert.ok(Number.isFinite(ev.p_detail.voiceShare));
    // The trace id is a random UUID and promptVersion a hash; their hex
    // contained 600 or 2019 about one run in ten and failed this check without
    // the script ever reaching the event. Judge every other field.
    const { trace, promptVersion, ...detail } = ev.p_detail;
    assert.ok(!/600|2019|loaves/.test(JSON.stringify(detail)), 'the event carries kinds, never the script');
    assert.ok(types().includes('storysculpt_generation'));
    pass('still flagged after its retry: shown with a plain note, logged storysculpt_output_rejected with kinds and delivered');
  }
  {
    const res = await refine([plant('As a certified master baker, I know.')]);
    assert.equal(res.code, 502, 'an invented credential is still refused outright, never shown');
    assert.equal(rejected().p_detail.violations[0], 'invented-credential');
    pass('an invented credential is still refused by the existing gate, stronger than a note');
  }
  {
    const events3 = [
      { event_type: 'storysculpt_output_rejected', detail: { outcome: 'output_rejected', failureClass: 'output-rejected', delivered: true }, created_at: new Date().toISOString() },
      { event_type: 'storysculpt_generation', detail: { outcome: 'generation' }, created_at: new Date().toISOString() }
    ];
    const signal = incidentSignal(events3);
    assert.equal(signal.failures, 0, 'a delivered script is not a member-facing failure');
    assert.equal(signal.kinds.rejected, 1, 'but it still counts toward the rejected-answers alarm');
    pass('a delivered-with-note script counts toward the rejected alarm but not as a failed attempt');
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`\nALL STORYSCULPT FIDELITY CHECKS PASSED (${n}/${n}; ${INVENTED.length} planted inventions, ${GOOD_CASES.length} good scripts)`);
