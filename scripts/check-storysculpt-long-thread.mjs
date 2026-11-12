// WBR-462, UX 70, 71, 72: a 200-turn StorySculpt chat.
// Runs the shipped js/storysculpt.js against a stub DOM, the same way
// check-sculpt-member-states does, and measures what a member with a very long
// chat gets: render time, the last 12 messages with the rest behind "Show
// earlier answers", their reading position kept when they open the earlier
// answers, and one live region that speaks only a new reply.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const statesSrc = readFileSync('js/storysculpt-member-states.js', 'utf8');
const appSrc = readFileSync('js/storysculpt.js', 'utf8');
const page = readFileSync('api/_hub/storysculpt.html', 'utf8');
const NOW = Date.parse('2026-10-27T22:00:00Z');
const TURNS = 200;
const RENDER_BUDGET_MS = 50;

function stubElement(id) {
  const listeners = {};
  return {
    id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, readOnly: false,
    className: '', style: {}, scrollTop: 0, scrollHeight: 1000, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    focus() {}, requestSubmit() {}, appendChild() {}, parentNode: null,
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    listeners
  };
}

function boot(projects) {
  const elements = new Map();
  const document = {
    activeElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, stubElement(id)); return elements.get(id); },
    createElement() { return stubElement(''); }
  };
  // The scroller's height follows what the thread actually renders, so the
  // scroll-position check measures the real arithmetic, not a constant.
  const scroller = stubElement('story-scroll');
  Object.defineProperty(scroller, 'scrollHeight', { get: () => document.getElementById('story-conversation').innerHTML.length });
  elements.set('story-scroll', scroller);
  let init = null;
  const sb = {
    from() {
      const q = {
        select() { return q; }, eq() { return q; }, order() { return Promise.resolve({ data: projects, error: null }); },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        update() { return { eq: () => Promise.resolve({ error: null }) }; }
      };
      return q;
    },
    rpc() { return Promise.resolve({}); }
  };
  const RealDate = Date;
  class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const context = {
    document, console, setTimeout, clearTimeout, setInterval, clearInterval, Date: FixedDate,
    navigator: { clipboard: { writeText() {} } },
    EEEStudio: { initialize(fn) { init = fn; }, refreshIcons() {} },
    addEventListener() {}, innerWidth: 1440, confirm: () => true, fetch: () => Promise.reject(new Error('no network in test'))
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(statesSrc, context, { filename: 'storysculpt-member-states.js' });
  vm.runInContext(appSrc, context, { filename: 'storysculpt.js' });
  return { context, document, run: () => init({ sb, profile: { id: 'member-1' }, session: { access_token: 't' } }) };
}

function longThread(turns) {
  const out = [];
  for (let i = 0; i < turns; i++) out.push({ role: i % 2 ? 'user' : 'assistant', content: 'Turn ' + (i + 1) + ' marker. ' + 'A real answer runs a few sentences long. '.repeat(4) });
  return out;
}

const at = new Date(NOW - 60 * 60 * 1000).toISOString();
const app = boot([{ id: 'p-200', title: 'Two Hundred Turns', content_type: 'rant', conversation: longThread(TURNS), output: null, intake: { context: '', versions: [] }, created_at: at, updated_at: at }]);
await app.run();
const conv = app.document.getElementById('story-conversation');
const scroller = app.document.getElementById('story-scroll');
const live = app.document.getElementById('story-latest-live');
const render = () => vm.runInContext('renderConversation()', app.context);

// 1. Render time: the collapsed thread, measured over repeated renders.
const samples = [];
for (let i = 0; i < 20; i++) { const t = performance.now(); render(); samples.push(performance.now() - t); }
samples.sort((a, b) => a - b);
const median = samples[10];
const shown = conv.innerHTML.replace(/<p class="story-earlier-summary">[\s\S]*?<\/p>/g, '').match(/Turn \d+ marker/g) || [];
console.log(`200 turns collapsed -> ${shown.length} rendered (${shown[0]} to ${shown[shown.length - 1]}), median render ${median.toFixed(2)} ms, ${conv.innerHTML.length} bytes`);
check(median < RENDER_BUDGET_MS, `collapsed render must stay under ${RENDER_BUDGET_MS} ms (median ${median.toFixed(2)})`);
check(shown.length === 12 && shown[0] === 'Turn 189 marker' && shown[11] === 'Turn 200 marker', 'the last 12 messages render and nothing earlier');
check(conv.innerHTML.includes('Show earlier answers (188 messages)'), 'the control names how many are hidden');
check(conv.innerHTML.includes('Last earlier answer: “Turn 188 marker'), 'collapsed history includes an actual earlier answer, not a generated fact');
const excerpt = (messages, hidden) => app.context.StorySculptStates.earlierAnswerExcerpt(messages, hidden);
check(excerpt([{role:'user',content:'Keep this'}, {role:'user',content:'Do not recap this',excludeFromGeneration:true}], 2) === 'Keep this', 'excluded answers never enter the recap');
check(excerpt([{role:'assistant',content:'Not a member fact'}],1) === '', 'assistant output is not presented as the member answer');
check(excerpt([{role:'user',content:'Old answer'}, {role:'user',content:'Still visible'}],1) === 'Old answer', 'visible turns are outside the earlier-answer recap');
check(excerpt([{role:'user',content:'  My\n  actual words  '}],1) === 'My actual words', 'only whitespace is normalized');
check(Array.from(excerpt([{role:'user',content:'😀'.repeat(141)}],1)).length === 141, 'long excerpts are bounded without splitting surrogate pairs');
const escapedRecap = app.context.StorySculptStates.showEarlierMarkup(1,[{role:'user',content:'<img src=x onerror=alert(1)>'}]);
check(escapedRecap.includes('&lt;img') && !escapedRecap.includes('<img'), 'recap text is escaped');
check(app.context.StorySculptStates.showEarlierMarkup(0,[{role:'user',content:'No hidden history'}]) === '', 'short and expanded threads have no recap');
check(conv.innerHTML.indexOf('data-show-earlier') < conv.innerHTML.indexOf('Turn 189 marker'), 'the control sits above the visible answers');
check(/data-msg-index="198"/.test(conv.innerHTML), 'actions keep absolute indices');

// 2. Scroll position: the member is reading 80px from the bottom and opens the
// earlier answers. They must still be 80px from the bottom, not thrown to the top.
scroller.scrollTop = scroller.scrollHeight - 80;
const fromBottomBefore = scroller.scrollHeight - scroller.scrollTop;
const t0 = performance.now();
for (const fn of conv.listeners.click || []) fn({ target: { closest: (sel) => (sel === '[data-show-earlier]' ? {} : null) } });
const expandMs = performance.now() - t0;
const fromBottomAfter = scroller.scrollHeight - scroller.scrollTop;
const all = conv.innerHTML.match(/Turn \d+ marker/g) || [];
console.log(`after Show earlier answers -> ${all.length} rendered in ${expandMs.toFixed(2)} ms; distance from bottom ${fromBottomBefore} -> ${fromBottomAfter}, scrollTop ${scroller.scrollTop} of ${scroller.scrollHeight}`);
check(all.length === TURNS && !/data-show-earlier/.test(conv.innerHTML), 'every answer shows after the click');
check(fromBottomAfter === fromBottomBefore && scroller.scrollTop > 0, 'the reading position is kept when earlier answers open above it');
check(expandMs < 500, `opening 200 turns must stay under 500 ms (${expandMs.toFixed(2)})`);

// 3. Live region: opening and expanding said nothing; a new reply is spoken, once.
check(live.textContent === '', `opening a chat or showing earlier answers must not speak (heard "${live.textContent}")`);
vm.runInContext("activeStory.conversation.push({ role: 'user', content: 'One more thing' }, { role: 'assistant', content: 'Turn 202 marker. The newest reply.' })", app.context);
render();
console.log(`new reply -> live region: "${live.textContent}"`);
check(live.textContent === 'StorySculpt: Turn 202 marker. The newest reply.', 'the newest reply is announced');
live.textContent = '';
render();
check(live.textContent === '', 'a re-render with nothing new is silent');

// 4. The served page: one live region, and it is not the thread.
check(!/id="story-conversation"[^>]*aria-live/.test(page), 'the thread itself is not a live region');
check(/id="story-latest-live"[^>]*aria-live="polite"/.test(page), 'the page carries the newest-reply live region');

// 5. Developer 65 (WBR-462): 40-turn terminology check (one name per concept).
// Across a 40-turn thread (collapsed and expanded), step banners, message
// actions, status lines, and the served page, each concept uses one consistent
// member-facing name rather than drifting between synonyms or internal codes.
{
  const FORTY_TURNS = 40;
  const stepCycle = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R6.5', 'R7'];
  const turns40 = [];
  for (let i = 0; i < FORTY_TURNS; i++) {
    if (i % 2 === 0) {
      const step = stepCycle[Math.floor(i / 2) % stepCycle.length];
      turns40.push({
        role: 'assistant',
        step,
        content: `Turn ${i + 1} question: Share the concrete detail from your chat that shapes this script.`
      });
    } else if (i === 37) {
      turns40.push({
        role: 'user',
        content: 'Turn 38 answer: Excluded detail kept out of future drafts.',
        excludeFromGeneration: true
      });
    } else if (i === 39) {
      turns40.push({
        role: 'user',
        content: 'Please revise the script above. Keep what works and change this: tighten the opening hook.',
        refineNote: 'tighten the opening hook.'
      });
    } else {
      turns40.push({
        role: 'user',
        content: `Turn ${i + 1} answer: A real member answer in their own voice for this script.`
      });
    }
  }
  // Put an assistant step at turn 40 so the latest assistant step banner & actions render too
  turns40[38] = {
    role: 'user',
    content: 'Please revise the script above. Keep what works and change this: tighten the opening hook.',
    refineNote: 'tighten the opening hook.'
  };
  turns40[39] = {
    role: 'assistant',
    step: 'R7',
    content: 'Turn 40 question: Choose the open loop that keeps your viewer watching.'
  };

  const proj40 = {
    id: 'p-40-terms',
    title: 'Forty Turn Terminology Check',
    content_type: 'rant',
    conversation: turns40,
    output: null,
    intake: {
      context: '',
      current_step: 'R7',
      versions: [],
      interruptedStep: { step: 'R7', lastAnswer: 'Use option 1', turnKey: 'turn:40', at }
    },
    created_at: at,
    updated_at: at
  };
  const app40 = boot([proj40]);
  await app40.run();
  const conv40 = app40.document.getElementById('story-conversation');
  const collapsedHtml40 = conv40.innerHTML;
  for (const fn of conv40.listeners.click || []) fn({ target: { closest: (sel) => (sel === '[data-show-earlier]' ? {} : null) } });
  const expandedHtml40 = conv40.innerHTML;
  const statusLine40 = app40.document.getElementById('story-generation-status').textContent;
  const combinedCorpus = [page, collapsedHtml40, expandedHtml40, statusLine40].join('\n');

  // Canonical concept names present
  check(/story profile/i.test(page) && /Settings &amp; story profile/i.test(page), '40-turn terminology: standing memory is consistently named story profile');
  check(/Show earlier answers \(28 messages\)/.test(collapsedHtml40), '40-turn terminology: collapsed control uses canonical "Show earlier answers"');
  check((expandedHtml40.match(/<span>Copy<\/span>/g) || []).length === 20, '40-turn terminology: all 20 assistant turns use canonical "Copy" label');
  check((expandedHtml40.match(/<span>Use as Script<\/span>/g) || []).length === 20, '40-turn terminology: all 20 assistant turns use canonical "Use as Script" label');
  check((expandedHtml40.match(/<span>Don’t use this<\/span>/g) || []).length === 18, '40-turn terminology: all 18 active user answers use canonical "Don’t use this" label');
  check((expandedHtml40.match(/<span>Use this again<\/span>/g) || []).length === 1 && expandedHtml40.includes('Not used in future drafts'), '40-turn terminology: excluded user answer uses canonical "Use this again" and "Not used in future drafts"');
  check(expandedHtml40.includes('Revision note') && !/Re-prompt|Polish pass/i.test(expandedHtml40), '40-turn terminology: refine turn uses canonical "Revision note"');
  check(/Step paused on Choose your open loop/i.test(statusLine40) && /Press Resume this step/i.test(statusLine40), '40-turn terminology: paused step names human step title and "Resume this step"');

  // Forbidden drifted synonyms and leaked internal step codes
  const driftedTerms = [
    { label: 'memory bank / persona profile / brand vault', re: /\b(?:memory bank|persona profile|brand vault|voice database)\b/i },
    { label: 'session thread / prompt chain / wizard', re: /\b(?:session thread|prompt chain|script wizard)\b/i },
    { label: 'teleprompter deck / monologue file', re: /\b(?:teleprompter deck|monologue file|output document)\b/i },
    { label: 'revision snapshots / branches', re: /\b(?:revision snapshots|script branches)\b/i },
    { label: 'internal step code in status line', re: /\bStep\s+(?:R[1-7](?:\.5)?|B[1-6](?:\.5)?|M[1-6](?:\.5)?)\b/ }
  ];
  for (const rule of driftedTerms) {
    check(!rule.re.test(combinedCorpus), `40-turn terminology: zero drifted term (${rule.label})`);
  }
}

// 6. Developer 65 (WBR-462, 2026-11-11): the generated replies themselves.
// Section 5 proves the page's own labels hold still over 40 turns; that is UI
// text, which the 11-11 order called out as not the row. This section runs 20
// fixture model replies (the raw strings a provider returns, em dashes and
// contract prefixes included) through the shipped delivery gate,
// classifyOutput() in api/_lib/storysculpt-observability.js, interleaved with 20
// member answers into one 40-turn interview, and checks the text a member
// actually reads: one voice (talks to "you", never about "the user", never
// turns into an AI or a company, no corporate register, no em dash after
// sanitising) and one set of terms (each concept keeps the name the page uses,
// never a synonym). A drifted reply planted at turn 34 must be caught, so the
// check is proved to bite rather than to pass by being blind.
{
  const { classifyOutput } = await import('../api/_lib/storysculpt-observability.js');
  const answers = [
    'I coach first-time managers. Most of them got promoted for being good at the job, not for leading people.',
    'The moment I knew: my first one-on-one, I talked for 40 minutes and my report said nothing.',
    'I want them to feel less alone. Everybody pretends they have it figured out.',
    'The enemy is the leadership books that say be a servant leader and never say how.',
    'I would say it like I am talking to a friend over coffee. Swearing is fine, a little.',
    'Use option 2.',
    'Keep my line about the 40 minutes, that is the real part.',
    'Option 1 for the loop.',
    'It should be about 60 seconds.',
    'Ask them to comment FIRST and I will send the one-on-one question list.',
    'Make the middle shorter, it drags.',
    'Yes, that version.',
    'Can you keep the coffee line?',
    'I like the second hook better now.',
    'Go with it.',
    'Add that I still get it wrong sometimes.',
    'Good. Keep going.',
    'That ending works.',
    'Shorter call to action please.',
    'Done, that is the script.'
  ];
  const raw = [
    'NEXT QUESTION: Who are you talking to in this video, and what did they just get handed that nobody trained them for?',
    'NEXT QUESTION: That one-on-one is your story. What did your report’s silence feel like from your side of the table?',
    'NEXT QUESTION: You want them to feel less alone. What does pretending to have it figured out cost them by Friday?',
    'NEXT QUESTION: Name the system you are pushing against. What does it promise, and where does it leave you hanging?',
    'NEXT QUESTION: Say the one sentence you would say to a friend over coffee about this — in your own words, rough is fine.',
    'NEXT QUESTION: Here are three hooks from your words. Pick the one you would actually say:\n1. I talked for 40 minutes and my report said nothing.\n2. Nobody tells you the promotion comes with a silence.\n3. The leadership books skipped the part where you freeze.',
    'NEXT QUESTION: Your hook keeps the 40 minutes. What happened the week after that one-on-one?',
    'NEXT QUESTION: Choose your open loop, the line that keeps your viewer watching:\n1. I found the question that broke the silence.\n2. What I did next is not in any book.\n3. It took me a year to see what I was doing wrong.',
    'NEXT QUESTION: About 60 seconds is around 180 words. Which part of your story has to survive if we cut?',
    'NEXT QUESTION: Your call to action is comment FIRST for the question list. Do you want it said once or twice?',
    'NEXT QUESTION: I trimmed the middle of your draft script. Does the turn from the silence to the question still land?',
    'NEXT QUESTION: Locked. Your script now runs hook, the silence, the question, the call to action. Anything you would never say out loud?',
    'NEXT QUESTION: The coffee line stays in your script, word for word. Where should it sit, before or after the question?',
    'NEXT QUESTION: Switching to your second hook: "Nobody tells you the promotion comes with a silence." Keep your open loop as it is?',
    'NEXT QUESTION: Your script keeps hook 2 and open loop 1. Want to hear the full draft read straight through?',
    'NEXT QUESTION: Adding "I still get it wrong sometimes" near the end of your script. Does it sound like you?',
    'NEXT QUESTION: Your story profile says you coach first-time managers. Should the script say that out loud, or let the story show it?',
    'NEXT QUESTION: Your ending lands on the question you asked. Is that the last thing you want your viewer to hear?',
    'NEXT QUESTION: Shorter call to action: "Comment FIRST and I will send you the list." Good?',
    'FINAL SCRIPT: Nobody tells you the promotion comes with a silence.\n\nMy first one-on-one as a manager, I talked for 40 minutes. My report said nothing. I thought I was helping — I was filling the room so I would not have to hear how lost I was.\n\nThe leadership books say be a servant leader. They never say how. So here is the one thing I learned: stop talking and ask one real question, then wait.\n\nI still get it wrong sometimes. But the silence stopped being theirs and started being a question.\n\nComment FIRST and I will send you the list.'
  ];
  check(answers.length === 20 && raw.length === 20, 'generated replies: fixture is a 40-turn interview (20 answers, 20 replies)');

  const source = answers.join('\n');
  const deliver = (text) => classifyOutput(text, { source });

  // The shipped page's own names for each concept. A reply must use the same
  // name or none; a synonym is the drift a member notices by turn 30.
  const TERMS = [
    { concept: 'script', canonical: /\bscript\b/i, drift: /\b(?:post copy|caption|content piece|copy deck|monologue|screenplay)\b/i },
    { concept: 'hook', canonical: /\bhooks?\b/i, drift: /\b(?:opener|opening line|attention[- ]grabber|intro line|headline)s?\b/i },
    { concept: 'open loop', canonical: /\bopen loop\b/i, drift: /\b(?:cliffhanger|curiosity gap|teaser line)s?\b/i },
    { concept: 'story profile', canonical: /\bstory profile\b/i, drift: /\b(?:brand profile|creator profile|voice profile|persona|avatar profile|brand voice)\b/i },
    { concept: 'call to action', canonical: /\bcall to action\b/i, drift: /\b(?:CTA|closing ask|conversion line)\b/ }
  ];
  const VOICE = [
    { rule: 'talks about the member in the third person', re: /\b(?:the user|the member|the creator|the client|this user)\b/i },
    { rule: 'speaks as an AI or a model', re: /\b(?:as an ai|i(?:'|’)?m an ai|language model|as a model|my training)\b/i },
    { rule: 'speaks as a company', re: /\b(?:we at storysculpt|our team|storysculpt recommends|the storysculpt team)\b/i },
    { rule: 'corporate register', re: /\b(?:leverage|synergy|elevate your brand|unlock your potential|game[- ]changer|actionable insights?|value proposition)\b/i },
    { rule: 'contract prefix leaked', re: /\b(?:NEXT QUESTION|FINAL SCRIPT):/ },
    { rule: 'em dash after delivery', re: /—/ }
  ];

  function auditThread(replies) {
    const delivered = [];
    const problems = [];
    replies.forEach((text, i) => {
      const turn = i * 2 + 2;
      const verdict = deliver(text);
      if (!verdict.ok) { problems.push(`turn ${turn}: delivery gate refused (${verdict.reason})`); return; }
      const body = verdict.content;
      delivered.push(body);
      if (!/\byour?\b/i.test(body) && !verdict.final) problems.push(`turn ${turn}: does not speak to the member as "you"`);
      for (const v of VOICE) if (v.re.test(body)) problems.push(`turn ${turn}: ${v.rule}`);
      for (const t of TERMS) if (t.drift.test(body)) problems.push(`turn ${turn}: "${t.concept}" drifted to "${body.match(t.drift)[0]}"`);
    });
    return { delivered, problems };
  }

  const clean = auditThread(raw);
  check(clean.delivered.length === 20, `generated replies: all 20 pass the shipped delivery gate (got ${clean.delivered.length})`);
  check(clean.problems.length === 0, 'generated replies: one voice and one set of terms across 40 turns' + (clean.problems.length ? ': ' + clean.problems.join('; ') : ''));
  check(raw.filter((r) => r.includes('—')).length === 2 && clean.delivered.every((r) => !r.includes('—')), 'generated replies: the two em dashes the fixture model wrote are sanitised before the member reads them');
  for (const t of TERMS) {
    check(t.canonical.test(page) || t.canonical.test(appSrc), `generated replies: "${t.concept}" is the page's own word`);
    check(clean.delivered.some((r) => t.canonical.test(r)), `generated replies: "${t.concept}" is used by name in the thread`);
  }
  const finalScript = clean.delivered.at(-1);
  check(/40 minutes/.test(finalScript) && /servant leader/.test(finalScript) && /still get it wrong sometimes/.test(finalScript), 'generated replies: the finished script at turn 40 keeps the member\'s own lines from turns 3, 7 and 31');

  // Negative control: the same thread with turn 34 drifted.
  const drifted = raw.slice();
  drifted[16] = 'NEXT QUESTION: The user’s brand profile says they coach managers. As an AI, I suggest we leverage that in the opener. Keep it?';
  const caught = auditThread(drifted).problems.filter((p) => p.startsWith('turn 34:'));
  for (const expected of ['third person', 'as an AI', 'corporate register', '"story profile" drifted', '"hook" drifted']) {
    check(caught.some((p) => p.includes(expected)), `generated replies: a drifted reply at turn 34 is caught (${expected})`);
  }
  check(auditThread(drifted).problems.every((p) => p.startsWith('turn 34:')), 'generated replies: only the drifted turn is flagged');
}

if (failures.length) {
  console.error('check-storysculpt-long-thread FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`PASS: check-storysculpt-long-thread: ${TURNS} turns render the last 12 in ${median.toFixed(2)} ms, keep the reading position on expand, speak only a new reply, pass the 40-turn terminology check, and 20 generated replies across a 40-turn interview keep one voice and one set of terms.`);
