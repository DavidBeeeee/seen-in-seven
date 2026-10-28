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
const shown = conv.innerHTML.match(/Turn \d+ marker/g) || [];
console.log(`200 turns collapsed -> ${shown.length} rendered (${shown[0]} to ${shown[shown.length - 1]}), median render ${median.toFixed(2)} ms, ${conv.innerHTML.length} bytes`);
check(median < RENDER_BUDGET_MS, `collapsed render must stay under ${RENDER_BUDGET_MS} ms (median ${median.toFixed(2)})`);
check(shown.length === 12 && shown[0] === 'Turn 189 marker' && shown[11] === 'Turn 200 marker', 'the last 12 messages render and nothing earlier');
check(conv.innerHTML.includes('Show earlier answers (188 messages)'), 'the control names how many are hidden');
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

if (failures.length) {
  console.error('check-storysculpt-long-thread FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`PASS: check-storysculpt-long-thread: ${TURNS} turns render the last 12 in ${median.toFixed(2)} ms, keep the reading position on expand, and speak only a new reply.`);
