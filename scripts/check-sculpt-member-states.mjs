// WBR-373: StorySculpt says what happens over time, and says it truthfully.
// Runs the shipped js/storysculpt.js against a stub DOM and a fake Supabase
// client seeded with members, so the lapse line, the quiet week, the finished
// line and the long-thread collapse are tested through the real render path.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const statesSrc = readFileSync('js/storysculpt-member-states.js', 'utf8');
const appSrc = readFileSync('js/storysculpt.js', 'utf8');
const page = readFileSync('api/_hub/storysculpt.html', 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-08T22:00:00Z');

function stubElement(id) {
  const listeners = {};
  return {
    id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, readOnly: false,
    className: '', style: {}, scrollTop: 0, scrollHeight: 1000, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    querySelector() { return null }, querySelectorAll() { return []; },
    focus() {}, requestSubmit() {}, appendChild() {}, parentNode: null,
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

function project(id, title, daysAgo, conversation, output = null) {
  const at = new Date(NOW - daysAgo * DAY).toISOString();
  return { id, title, content_type: 'rant', conversation: conversation || [{ role: 'assistant', content: 'Type the raw rant.' }], output, intake: { context: '', versions: [] }, created_at: at, updated_at: at };
}

function longThread(turns) {
  const out = [];
  for (let i = 0; i < turns; i++) out.push({ role: i % 2 ? 'user' : 'assistant', content: 'Turn ' + (i + 1) + ' marker' });
  return out;
}

// 1. A member whose last chat is 22 days old is welcomed back by that chat's name.
{
  const app = boot([project('p-old', 'Gym <Mirror> Rant', 22), project('p-older', 'Older chat', 40)]);
  await app.run();
  const slot = app.document.getElementById('story-return-notice');
  console.log('22-day member  -> hidden=' + slot.hidden + ' ' + slot.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  check(!slot.hidden, '22 days: the return notice must be visible');
  check(/data-return-state="lapsed"/.test(slot.innerHTML), '22 days: the notice must be the lapse state');
  check(slot.innerHTML.includes('Gym &lt;Mirror&gt; Rant'), '22 days: the notice must name the last chat (escaped)');
  check(!slot.innerHTML.includes('Older chat'), '22 days: the notice must name the most recent chat, not an older one');
  check(app.document.getElementById('story-title').value === 'Gym <Mirror> Rant', '22 days: the named chat must be the one reopened');
}

// 2. One 5 days old sees nothing.
{
  const app = boot([project('p-recent', 'Five Day Chat', 5)]);
  await app.run();
  const slot = app.document.getElementById('story-return-notice');
  console.log('5-day member   -> hidden=' + slot.hidden + ' html="' + slot.innerHTML + '"');
  check(slot.hidden && slot.innerHTML === '', '5 days: no return line may render');
}

// 3. A quiet week is not called a lapse.
{
  const app = boot([project('p-quiet', 'Quiet Week Chat', 10)]);
  await app.run();
  const slot = app.document.getElementById('story-return-notice');
  console.log('10-day member  -> hidden=' + slot.hidden + ' ' + slot.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  check(/data-return-state="quiet"/.test(slot.innerHTML), '10 days: the quiet state must render');
  check(!/lapse|welcome back/i.test(slot.innerHTML.replace(/data-return-state="[^"]*"|class="[^"]*"/g, '')), '10 days: the quiet line must not be worded as a lapse');
}

// 4. Boundaries match Certainty's documented rule.
{
  const ctx = {}; vm.createContext(ctx); vm.runInContext(statesSrc, ctx);
  const S = ctx.StorySculptStates;
  const at = d => [{ id: 'x', title: 'X', updated_at: new Date(NOW - d * DAY).toISOString() }];
  check(S.engagement(at(7.9), NOW).state === 'current', 'under 8 days is current');
  check(S.engagement(at(8), NOW).state === 'quiet', '8 days is quiet');
  check(S.engagement(at(20.9), NOW).state === 'quiet', '20 days is still quiet');
  check(S.engagement(at(21), NOW).state === 'lapsed', '21 days is lapsed');
  check(S.engagement([], NOW).state === 'new' && S.returnNotice([], NOW) === null, 'a new member gets no return line');
}

// 5. A 40-turn chat opens on the latest exchange with earlier turns behind "Show earlier".
{
  const app = boot([project('p-long', 'Long Chat', 1, longThread(40))]);
  await app.run();
  const thread = app.document.getElementById('story-conversation').innerHTML;
  const shown = (thread.match(/Turn \d+ marker/g) || []);
  console.log('40-turn chat   -> rendered ' + shown.join(', ') + ' | control: ' + ((thread.match(/Show earlier \([^)]*\)/) || ['none'])[0]));
  check(/data-show-earlier="true"/.test(thread), '40 turns: the Show earlier control must render');
  check(thread.includes('Show earlier (34 messages)'), '40 turns: the control must count the hidden turns');
  check(thread.includes('Turn 40 marker') && !thread.includes('Turn 1 marker') && !thread.includes('Turn 34 marker'), '40 turns: only the latest turns may render');
  check(thread.indexOf('data-show-earlier') < thread.indexOf('Turn 35 marker'), '40 turns: the control must sit above the latest exchange');
  check(/data-msg-index="38"/.test(thread), '40 turns: message actions must keep absolute indices');
  // Expand through the real click handler.
  const conv = app.document.getElementById('story-conversation');
  for (const fn of conv.listeners.click || []) fn({ target: { closest: sel => sel === '[data-show-earlier]' ? {} : null } });
  const expanded = conv.innerHTML;
  check(expanded.includes('Turn 1 marker') && !/data-show-earlier/.test(expanded), 'Show earlier must reveal every turn');
  console.log('after click    -> ' + (expanded.match(/Turn \d+ marker/g) || []).length + ' turns rendered');
}

// 6. A short chat is not collapsed.
{
  const app = boot([project('p-short', 'Short Chat', 1, longThread(8))]);
  await app.run();
  check(!/data-show-earlier/.test(app.document.getElementById('story-conversation').innerHTML), 'an 8-turn chat must not collapse');
}

// 7. The served page carries the inactivity and finished lines exactly as the code states them.
{
  const ctx = {}; vm.createContext(ctx); vm.runInContext(statesSrc, ctx);
  const S = ctx.StorySculptStates;
  check(page.includes(S.INACTIVITY_LINE), 'served page must carry the inactivity line');
  check(page.includes('This script is finished. Refine it with a note or start a new chat.') && S.FINISHED_LINE === 'This script is finished. Refine it with a note or start a new chat.', 'served page must carry the finished-script line');
  check(/id="story-finished-line"[\s\S]*id="story-refine-note"/.test(page), 'the finished line must sit with the refine box, where a finished script locks the composer');
  check(page.indexOf('storysculpt-member-states.js') > 0 && page.indexOf('storysculpt-member-states.js') < page.indexOf('/js/storysculpt.js'), 'the states script must load before storysculpt.js');
  check(/STATES\.FINISHED_LINE/.test(appSrc), 'sending into a finished script must say the finished line');
  check(/is in your chats whenever you want it/.test(appSrc), 'leaving a chat must say it is saved');
}

// 8. A finished script exports as a text file named for its chat (UX 37).
{
  const ctx = {}; vm.createContext(ctx); vm.runInContext(statesSrc, ctx);
  const S = ctx.StorySculptStates;
  check(S.exportFileName('Posting Daily Myth!') === 'posting-daily-myth.txt', 'export file is named for the chat');
  check(S.exportFileName('  ') === 'storysculpt-script.txt', 'an untitled chat still exports with a name');
  check(/id="download-story-output"/.test(page) && /addEventListener\('click', downloadScript\)/.test(appSrc), 'the script panel carries a working Download button');
}

// 9. Copy and auth hygiene.
{
  const memberCopy = statesSrc + page;
  check(!/—/.test(memberCopy), 'no em dashes in member copy');
  check(!/\b(missed|failed|behind|should have|wasted|inactive)\b/i.test(statesSrc.replace(/\/\/.*$/gm, '')), 'return copy is a way back, not a guilt banner');
  const auth = appSrc.match(/onAuthStateChange\s*\(([\s\S]*?)\)\s*;/);
  check(!auth || !/await/.test(auth[1]), 'no await inside onAuthStateChange');
}

if (failures.length) {
  console.error('check-sculpt-member-states FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('PASS: check-sculpt-member-states: 22-day lapse names the chat, 5-day renders nothing, 10-day is quiet, 40-turn chat collapses behind Show earlier.');
