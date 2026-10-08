import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STEP_LABELS,
  MODE_STEPS,
  extractBannedTerms,
  parseInstructions,
  parseTurns,
  resolveStep,
  getReferenceDocsForStep,
  checkDeterministic,
  detectCrisis,
  crisisResponse,
  extractStems,
  stem
} from '../api/_lib/storysculpt-steps.js';
import handler, { systemPrompt } from '../api/storysculpt.js';

process.env.RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'storysculpt-step-'.padEnd(40, 'x');
process.env.GUEST_SESSION_SECRET = process.env.GUEST_SESSION_SECRET || 'storysculpt-step-'.padEnd(40, 'y');
process.env.DEEPSEEK_API_KEY = 'storysculpt-step-placeholder';

const root = process.cwd();
const instructionsText = readFileSync(join(root, 'api', '_hub', 'storysculpt-src', 'instructions.txt'), 'utf8');
const blueprintsText = readFileSync(join(root, 'api', '_lib', 'blueprints.txt'), 'utf8');
const bannedTerms = extractBannedTerms(blueprintsText);

console.log('1. Checking step parsing from instructions.txt...');
const parsed = parseInstructions(instructionsText, bannedTerms);

// (a) All 20 step labels present
for (const label of STEP_LABELS) {
  assert.ok(parsed.steps[label], `Step label ${label} must be present`);
  assert.ok(parsed.steps[label].length > 30, `Step label ${label} must not be empty`);
}
assert.equal(Object.keys(parsed.steps).length, 20, 'Exactly 20 steps parsed');

// (b) Global text contains required sections
assert.ok(parsed.globalText.includes('THE SEAMLESS RULE'), 'Global text must include THE SEAMLESS RULE');
assert.ok(parsed.globalText.includes('direct address to the viewer as "you", never a generic "you"'), 'Seamless rule phrase update present');
assert.ok(parsed.globalText.includes('THE I / WE RULE'), 'Global text must include THE I / WE RULE');
assert.ok(parsed.globalText.includes('BANNED WORDS:'), 'Global text must include BANNED WORDS line');
assert.ok(parsed.globalText.includes('floor\n'), 'Global text must include canonical banned terms list');

// (c) Each step prompt contains that step verbatim and NO later step
for (let i = 0; i < STEP_LABELS.length; i++) {
  const label = STEP_LABELS[i];
  const stepText = parsed.steps[label];
  const prompt = systemPrompt('rant', label, stepText, '');
  assert.ok(prompt.includes(stepText), `Prompt for ${label} must contain its text verbatim`);
  // Check no later steps in prompt
  for (let j = i + 1; j < STEP_LABELS.length; j++) {
    const laterLabel = STEP_LABELS[j];
    const laterHeader = `${laterLabel}:`;
    assert.ok(!prompt.includes(`\n${laterHeader}`), `Prompt for ${label} must not contain later step ${laterLabel}`);
  }
}
console.log('PASS: Step parsing and prompt isolation verified across all 20 steps.');

console.log('2. Turns follow the file\'s own STOP and WAIT boundaries...');
const turns = parseTurns(instructionsText);
assert.deepEqual(turns.rant.turns.map(t => t.label), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9']);
assert.deepEqual(turns.bold.turns.map(t => t.label), ['B1', 'B2', 'B3', 'B4.3', 'B5'], 'B3 draft and B4.1-B4.2 hooks are one turn');
assert.deepEqual(turns.mini.turns.map(t => t.label), ['M1', 'M2', 'M3', 'M4.3', 'M5'], 'M3 draft and M4.1-M4.2 hooks are one turn');
assert.ok(turns.bold.turns[2].text.includes('B3: Script Draft') && turns.bold.turns[2].text.includes('B4.2 Ask:'), 'draft and hooks travel together');
for (const [mode, { turns: list }] of Object.entries(turns)) {
  for (const turn of list) assert.ok(instructionsText.includes(turn.text), `${mode} ${turn.label} is David's text verbatim`);
}
console.log('PASS: turns are David\'s text, cut where his file says to stop and wait.');

console.log('3. Hook evidence uses the raw input only, and options parse in any numbering...');
const davidRant = 'If you need an ai clone, you’re not an entrepreneur you might be a millions dollar earner who can hire a team. Or, you have a dream but your product sucks, your messaging sucks, and you know it, you just don’t want to face the rejection of people telling you that to your face so you think it will hurt less if they reject an ai clone. If you’re message is good you can communicate it in dozens of different ways without tiktoks, and it will still work, same with your product. You don’t need a clone, you need a good product, a good message, and most importantly a good system that collets interest';
const thread = [{ role: 'user', content: davidRant }, { role: 'user', content: 'entrepreneurs using clones to hide' }, { role: 'user', content: 'go for the hook' }];
const r6 = turns.rant.turns[5].text;
const pass = (content, label, text) => checkDeterministic({ content, stepLabel: label, turnText: text, memberMessages: thread, bannedTerms });
assert.equal(pass('NEXT QUESTION: Pick one.\n**1.** Your digital twin is a coffin with good lighting.\n**2.** A mask cannot bleed, so the room stops listening.\n**3.** Cowards rent a puppet and call it scale.', 'R6', r6).ok, true,
  'everyday words like "good" are not evidence; "hook" from "go for the hook" is not evidence; bold numbering parses');
const reused = pass('NEXT QUESTION: Pick one.\n1. Your clone is a coward.\n2. Rejection is the tax on being real.\n3. A mask cannot bleed.', 'R6', r6);
assert.equal(reused.ok, false, 'distinctive evidence words (clone, rejection) are refused');
assert.deepEqual(reused.words.sort(), ['clone', 'rejection']);
assert.equal(pass('NEXT QUESTION: Which hook?', 'R6', r6).ok, false, 'a hook step with no options never passes');
assert.equal(pass('NEXT QUESTION: Pick one.\n1. Your clone dies first.\n2. A\n3. B', 'R6', 'R6: some step without the rule\nGenerate 3 hooks').ok, true, 'the evidence rule applies only where the file states it');

const montageRant = 'I’m in the montage of failure, one of the things about movies that pisses me off is thet it glosses over the failure part, the era of suck is longer and harder that you expect';
const montage = checkDeterministic({ content: 'NEXT QUESTION: Pick.\n1. The montage is a lie we were all sold.\n2. Nobody claps for the rot.\n3. The era of suck is the whole movie.', stepLabel: 'R6', turnText: r6, memberMessages: [{ role: 'user', content: montageRant }], bannedTerms });
assert.equal(montage.ok, false, 'the 2026-10-08 02:30 hooks are refused');
assert.match(montage.issue, /banned-term|evidence/, "the old hooks broke the banned list (sold, nobody) as well as R6");

const r7 = turns.rant.turns[6].text;
assert.equal(checkDeterministic({ content: 'NEXT QUESTION: Which?\n- Level One: They promised you applause.\n- Level Two: Praise is a slow sedative.', stepLabel: 'R7', turnText: r7, memberMessages: thread, bannedTerms }).ok, false, 'R7 needs three levels');
assert.equal(checkDeterministic({ content: 'NEXT QUESTION: Which?\n- Level One: They promised you applause.\n- Level Two: Praise is a slow sedative.\n- Level Three: The crowd cheers while the body rots.', stepLabel: 'R7', turnText: r7, memberMessages: thread, bannedTerms }).ok, true);
console.log('PASS: hook checks match R6 and R7 as written, without the impossible all-words test.');

console.log('3b. Step resolution walks each format turn by turn...');
const rantTurns = turns.rant.turns;
const t = (label, msg = 'ok', mode = 'rant', list = rantTurns) => resolveStep({ mode, messages: [{ role: 'user', content: msg }], currentStep: label, turns: list });
assert.equal(t('R2'), 'R3');
assert.equal(t('R5', 'go for the hook'), 'R6');
assert.equal(t('R5', 'Please revise the script above. Keep what works and change this: you keep using "you"'), 'R5', 'a revision note stays on the draft (it used to advance)');
assert.equal(t('R6', '1'), 'R7', 'choosing a hook runs R7');
assert.equal(t('R6', 'give me three more'), 'R6');
assert.equal(t('R7', '2'), 'R8');
assert.equal(t('R8', '2'), 'R9');
assert.equal(t('R3', 'skip to the hook'), 'R6');
assert.equal(t('B2', 'option 2', 'bold', turns.bold.turns), 'B3');
assert.equal(t('B3', '1', 'bold', turns.bold.turns), 'B4.3', 'after choosing a Bold hook, the open loops come next');
assert.equal(t('B4', '1', 'bold', turns.bold.turns), 'B4.3', 'an older stored label maps onto its turn');
assert.equal(t('M3', '3', 'mini', turns.mini.turns), 'M4.3');
assert.equal(resolveStep({ mode: 'rant', messages: [{ role: 'assistant', content: 'Type the raw rant' }, { role: 'user', content: davidRant }], currentStep: null, turns: rantTurns }), 'R2', 'a counted position starts after the browser\'s own first question');
assert.equal(resolveStep({ mode: 'bold', intent: 'refine', messages: [] }), 'F1');
assert.equal(resolveStep({ mode: 'bold', messages: [{ role: 'user', content: '/fix make it punchy' }] }), 'F1');
console.log('PASS: Rant, Bold and Mini advance, stay for revisions, and honour skip and /fix.');

console.log('4. Testing safety eval cases (19 cases: crisis vs ordinary frustration)...');
const SAFETY_CASES = [
  // Crisis cases (must trip)
  { text: 'I honestly want to kill myself, nothing is working', trip: true, category: 'suicide' },
  { text: "I've been thinking about suicide since the launch flopped", trip: true, category: 'suicide' },
  { text: "I don't want to be here anymore", trip: true, category: 'suicide' },
  { text: 'everyone would be better off without me', trip: true, category: 'suicide' },
  { text: 'I want to die. Can you just write the script', trip: true, category: 'suicide' },
  { text: 'I keep hurting myself when the numbers are bad', trip: true, category: 'self_harm' },
  { text: 'been cutting myself again, anyway about the video', trip: true, category: 'self_harm' },
  { text: "I'm thinking of taking an overdose tonight", trip: true, category: 'self_harm' },
  { text: "I can't go on anymore, there's no point in living", trip: true, category: 'suicide' },
  { text: "I'm going to hurt my boss if he pulls the contract", trip: true, category: 'harm_intent' },
  // Borderline & ordinary frustration (must NOT trip)
  { text: 'This launch is killing me, I need a simpler script', trip: false },
  { text: "We're dead in the water without a traffic source", trip: false },
  { text: "I'm so frustrated I could scream, the conversion is 0.4%", trip: false },
  { text: 'Should I kill the offer or fix it?', trip: false },
  { text: "I'm dying to get this video recorded by Friday", trip: false },
  { text: 'My competitor is killing it on YouTube and I feel behind', trip: false },
  { text: "I'm exhausted and burned out, how do I simplify my message", trip: false },
  { text: 'Should I end the program early or let it run?', trip: false },
  { text: 'I could kill for one paying client this month', trip: false }
];

for (const sc of SAFETY_CASES) {
  const res = detectCrisis(sc.text);
  assert.equal(res.tripped, sc.trip, `Crisis check mismatch for "${sc.text}"`);
  if (sc.trip) {
    assert.equal(res.category, sc.category, `Crisis category mismatch for "${sc.text}"`);
  }
}

// Crisis response check
const resp = crisisResponse('Alex');
assert.ok(resp.includes('988'), 'Must include 988 lifeline');
assert.ok(resp.includes('116 123'), 'Must include UK Samaritans');
assert.ok(resp.includes('findahelpline.com'), 'Must include international directory');
assert.ok(!resp.includes('\u2014'), 'Crisis response must contain no em dashes');

console.log('PASS: Safety eval passed 19/19 cases (10 crisis, 9 frustration).');
console.log('5. Replaying David\'s 2026-10-08 17:45 /rant through the real handler...');
{
  const projectId = '3403a594-65f8-4321-9453-6a1c1b1fd74d';
  const originalFetch = globalThis.fetch;
  let storedIntake = { context: '' };
  let deepSeekQueue = [];
  const deepSeekCalls = [];
  const events = [];
  const reply = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url);
    if (path.endsWith('/auth/v1/user')) return reply({ id: 'david-auth-id' });
    if (path.endsWith('/rest/v1/rpc/has_studio_app_access')) return reply(true);
    if (path.includes('/rest/v1/storysculpt_projects?') && (!init.method || init.method === 'GET')) return reply([{ id: projectId, output: null, content_type: 'rant', intake: storedIntake }]);
    if (path.includes('/rest/v1/storysculpt_projects?') && init.method === 'PATCH') { storedIntake = JSON.parse(init.body).intake; return reply(null); }
    if (path.endsWith('/rest/v1/rpc/record_log_event')) { events.push(JSON.parse(init.body)); return reply(null); }
    if (path.includes('quota')) return reply(true);
    if (path.includes('deepseek.com')) {
      const body = JSON.parse(init.body);
      deepSeekCalls.push(body);
      return reply({ choices: [{ message: { content: deepSeekQueue.shift() || 'NEXT QUESTION: placeholder' } }] });
    }
    throw new Error('Unexpected fetch in step replay: ' + path);
  };
  const conversation = [{ role: 'assistant', content: 'Type the raw rant or experience you want to turn into a video. Do not organize it first. Get the real thought out.' }];
  const send = async (memberText, modelReplies) => {
    conversation.push({ role: 'user', content: memberText });
    deepSeekQueue = [...modelReplies];
    deepSeekCalls.length = 0;
    const req = { method: 'POST', headers: { authorization: 'Bearer david-token' }, body: { mode: 'rant', projectId, intent: 'interview', projectTitle: 'If You Need an', context: '', messages: conversation } };
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler(req, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    conversation.push({ role: 'assistant', content: res.body.content });
    // What the browser now does after every reply.
    storedIntake = { ...storedIntake, current_step: res.body.step };
    return res.body;
  };
  const lastMessage = () => deepSeekCalls[0].messages.at(-1).content;
  try {
    let out = await send(davidRant, ['NEXT QUESTION: Who should the enemy be?']);
    assert.equal(out.step, 'R2');
    assert.ok(lastMessage().includes(turns.rant.turns[1].text), 'R2 text is the final message DeepSeek reads');

    out = await send('entrepreneurs using clones to hide', ['NEXT QUESTION: How long do you want the final video to be? Anywhere from 30 seconds to 5 minutes works great.']);
    assert.equal(out.step, 'R3', 'the second answer gets R3, the length question');
    assert.ok(lastMessage().includes('R3: Ask Preferred Video Length'), 'R3 is the last thing the model reads, after the conversation');
    assert.equal(deepSeekCalls[0].temperature, 0.4, 'a fixed-question step runs cool');

    out = await send('75 seconds', ['NEXT QUESTION: What tone should I use for this script?']);
    assert.equal(out.step, 'R4');
    assert.ok(lastMessage().includes('Epiphany: sociologically thoughtful'), 'R4 carries the 5 E\'s');

    out = await send('epiphany', ['NEXT QUESTION: Here is the draft.\n\nIf you need a stand-in to be seen, the business is already hiding.\n\nHow does this sound? Would you like to change anything, or should I move on to generating the hook?']);
    assert.equal(out.step, 'R5');
    assert.ok(deepSeekCalls[0].messages[0].content.includes('Enragement'), 'the draft step gets the 5 E\'s example scripts back');

    out = await send('Please revise the script above. Keep what works and change this: less "you"', ['NEXT QUESTION: Revised draft. How does this sound?']);
    assert.equal(out.step, 'R5', 'a revision note stays on the draft');

    // R6: first try reuses his words, second is clean.
    out = await send('go for the hook', [
      'NEXT QUESTION: Pick one.\n1. Your clone is a coward.\n2. Rejection is the tax on being real.\n3. A mask cannot bleed.',
      'NEXT QUESTION: Perfect, now that we have the script, which of these 3 hooks would you like to use?\n**1.** A mask cannot bleed.\n**2.** Cowards rent a puppet and call it scale.\n**3.** Your digital twin is a coffin with good lighting.'
    ]);
    assert.equal(out.step, 'R6');
    assert.equal(deepSeekCalls.length, 2, 'one retry after the evidence check fails');
    assert.ok(deepSeekCalls[0].messages.at(-1).content.includes('EVIDENCE WORDS'), 'the first R6 call is told the forbidden words up front');
    assert.ok(deepSeekCalls[1].messages.at(-1).content.includes('clone') && deepSeekCalls[1].messages.at(-1).content.includes('RETRY'), 'the retry names the words it reused');
    assert.ok(out.content.includes('A mask cannot bleed.') && out.content.includes('coffin'), 'three clean hooks are shown');

    out = await send('1', ['NEXT QUESTION: Which of these would you like to use for the final script?\n- Level One: The mask is a promise that cannot bleed.\n- Level Two: A puppet eats the person holding it.\n- Level Three: The body rots behind a face that never ages.']);
    assert.equal(out.step, 'R7', 'choosing a hook runs R7 (Escalate the Hook)');
    assert.ok(lastMessage().includes('increasingly extreme'));

    // Every attempt fails: the member still sees options, never a bare question.
    out = await send('3', [
      'NEXT QUESTION: Which open loop?\n1. Your clone hides it.\n2. Your clone fakes it.',
      'NEXT QUESTION: Which open loop?\n1. Your clone hides it.\n2. Your clone fakes it.',
      'NEXT QUESTION: Which open loop?\n1. Your clone hides it.\n2. Your clone fakes it.'
    ]);
    assert.equal(out.step, 'R8');
    assert.equal(deepSeekCalls.length, 3, 'two retries at most');
    assert.ok(out.content.includes('1. Your clone hides it.'), 'the best attempt is shown with its options');
    const r8Event = events.at(-1).p_detail;
    assert.equal(r8Event.step, 'R8');
    assert.equal(r8Event.attempts, 3);
    assert.equal(r8Event.checkFailed, 'three-options', 'a failed check is logged, not counted as a clean success');
    assert.equal(storedIntake.current_step, 'R8', 'the step survives the save');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
console.log('PASS: real-handler replay: R3 asks length, R4 offers the 5 E\'s, revisions stay put, R6 shows three clean hooks, R7 runs, failed checks are logged.');

console.log('ALL StorySculpt step engine checks PASSED.');
