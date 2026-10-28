// WBR-373 / WO-20261017-evening: StorySculpt progress and one next step.
//
// 1. The "Your scripts" strip counts finished and filmed scripts only. An empty
//    or abandoned chat adds nothing, and a filmed flag on an unfinished chat
//    does not count.
// 2. The 30-day comparison, at fixed dates.
// 3. One nextStep, rendered identically by the rail, the finished-script footer
//    and Help, for an unfinished interview, a finished script and a filmed one.
// 4. A dismissed return notice stays dismissed for that chat until a new
//    21-day gap, and the dismissal does not move updated_at.
// 5. No older version stays selected or labelled latest after a newer save.
// 6. No em dashes in any rendered copy.
// Pinned like check-storysculpt-lapse: pure functions plus the booted app.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const failures = [];
let passed = 0;
const check = (ok, message) => { if (ok) passed += 1; else failures.push(message); };

const statesSrc = readFileSync('js/storysculpt-member-states.js', 'utf8');
const appSrc = readFileSync('js/storysculpt.js', 'utf8');
const html = readFileSync('api/_hub/storysculpt.html', 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-17T22:00:00Z');
const EM = '—';
const ago = days => new Date(NOW - days * DAY).toISOString();

const pure = {};
vm.createContext(pure);
vm.runInContext(statesSrc, pure);
const S = pure.StorySculptStates;

function project(id, opts = {}) {
  const at = ago(opts.touched ?? 1);
  const finishedAt = opts.finished == null ? null : ago(opts.finished);
  return {
    id,
    title: opts.title || 'Chat ' + id,
    content_type: 'rant',
    conversation: [{ role: 'assistant', content: 'Prompt' }],
    output: finishedAt ? 'A finished script for ' + id + '.' : (opts.output ?? null),
    intake: Object.assign({
      context: '',
      versions: finishedAt ? [{ version: 1, note: 'Initial draft', content: 'A finished script for ' + id + '.', createdAt: finishedAt }] : []
    }, opts.intake || {}),
    created_at: at,
    updated_at: at
  };
}

// 1. Counts finished and filmed only
{
  const base = [
    project('a', { finished: 5 }),
    project('b', { finished: 12, intake: { filmed: true } }),
    project('c', { touched: 2 }),                                  // interview in progress
    project('d', { touched: 3, intake: { filmed: true } }),       // filmed flag, never finished
    project('e', { touched: 4, output: '   ' })                    // whitespace output is not a script
  ];
  const p = S.progress(base, NOW);
  check(p.finished === 2, 'strip: 2 finished scripts expected, got ' + p.finished);
  check(p.filmed === 1, 'strip: 1 filmed script expected, got ' + p.filmed);
  const withEmpty = S.progress(base.concat([project('f', { touched: 0 })]), NOW);
  check(withEmpty.finished === 2 && withEmpty.filmed === 1, 'strip: an empty chat must add nothing');
  const markup = S.progressMarkup(p);
  check(/data-finished="2"/.test(markup) && /data-filmed="1"/.test(markup), 'strip markup must carry the counts');
  check(markup.includes('Your scripts'), 'strip must be titled Your scripts');
  check(!/point|streak/i.test(markup), 'strip must carry no points or streaks');
}

// 2. 30-day comparison at fixed dates
{
  const list = [project('a', { finished: 5 }), project('b', { finished: 29 }), project('c', { finished: 30 }), project('d', { finished: 75 })];
  const p = S.progress(list, NOW);
  check(p.last30 === 2 && p.prior30 === 1, '30-day: expected 2 then 1, got ' + p.last30 + ' then ' + p.prior30);
  check(S.progressLine(p) === '2 scripts finished in the last 30 days, up from 1 the 30 days before.', 'up line: ' + S.progressLine(p));
  const down = S.progress([project('a', { finished: 3 }), project('b', { finished: 40 }), project('c', { finished: 45 })], NOW);
  check(S.progressLine(down) === '1 script finished in the last 30 days, down from 2 the 30 days before.', 'down line: ' + S.progressLine(down));
  const same = S.progress([project('a', { finished: 3 }), project('b', { finished: 40 })], NOW);
  check(S.progressLine(same) === '1 script finished in the last 30 days, the same as the 30 days before.', 'same line: ' + S.progressLine(same));
  const old = S.progress([project('a', { finished: 90 })], NOW);
  check(S.progressLine(old) === 'None finished in the last 60 days. Every script you finished is still here.', 'old line: ' + S.progressLine(old));
  check(S.progressLine(S.progress([project('c', { touched: 1 })], NOW)) === 'Finish a script and it counts here.', 'no finished scripts line');
}

// Booted app harness, as in check-storysculpt-lapse
function stubElement(id) {
  const listeners = {};
  const attributes = new Map();
  return {
    id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, readOnly: false,
    className: '', style: {}, scrollTop: 0, scrollHeight: 1000, dataset: {}, parentNode: null, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    focus() {}, requestSubmit() {}, listeners
  };
}

function boot(projects) {
  const elements = new Map();
  const updates = [];
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
        // Thenable like supabase-js, and chainable to .select().single() for the
        // writes that read back status and version (WBR-435 state cluster).
        update(payload) {
          updates.push(payload);
          const done = Promise.resolve({ data: null, error: null });
          const read = { single: () => Promise.resolve({ data: { status: 'filmed', version: 2 }, error: null }) };
          return { eq: () => Object.assign(done, { select: () => read }) };
        }
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
  vm.runInContext(statesSrc, context);
  vm.runInContext(appSrc, context);
  return { context, document, updates, el: id => document.getElementById(id), run: () => init({ sb, profile: { id: 'member-1' }, session: { access_token: 't' } }) };
}

const readStep = markup => {
  const state = (markup.match(/data-next-state="([^"]+)"/) || [])[1];
  const text = (markup.match(/class="story-next-step-text">([^<]*)</) || [])[1];
  const action = (markup.match(/data-next-action="([^"]+)"/) || [])[1];
  return { state, text, action };
};

// A server-added escalation step must have working client choices, including
// when an existing saved conversation is reopened. Version the script URL so
// a reload does not reuse the pre-escalation client.
check(html.includes('/js/storysculpt.js?v=wbr462-storysculpt-a11y-v1'), 'page must load the current client version (accessibility walk, WBR-462)');
for (const step of ['B5.5', 'M5.5', 'R6.5']) {
  const app = boot([]);
  app.context.choiceProject = { id: 'choices', output: null, intake: { current_step: step }, conversation: [{ role: 'assistant', step, content: 'Stronger hooks\n1. First.\n2. Second.\n3. Third.' }] };
  vm.runInContext('activeStory = choiceProject; renderConversation();', app.context);
  const rendered = app.el('story-conversation').innerHTML;
  for (const n of [1, 2, 3]) check(rendered.includes('data-quick-reply="'+n+'">Use '+n+'</button>'), step+': escalation must render selectable option '+n);
  check(rendered.includes('data-quick-reply="Keep the original hook"'), step+': retain original-hook choice');
  vm.runInContext('sendStoryAnswer = () => { window.sentChoice = storyEl("story-answer").value; }; sendQuickReply("2");', app.context);
  check(app.context.sentChoice === '2', step+': button submits the numbered choice');
}

// 3. One next step, identical on all three surfaces, in all three states
{
  const cases = [
    ['interview', project('i', { touched: 1 }), 'continue', 'Answer the next question to finish this script.'],
    ['film', project('f', { finished: 2, touched: 1 }), 'film', 'Film this script, then mark it Filmed.'],
    ['filmed', project('m', { finished: 2, touched: 1, intake: { filmed: true } }), 'new', 'This one is filmed. Start your next script.']
  ];
  for (const [state, proj, action, text] of cases) {
    const app = boot([proj]);
    await app.run();
    const surfaces = ['story-next-step-rail', 'story-next-step-footer', 'story-next-step-help'].map(id => app.el(id).innerHTML);
    const steps = surfaces.map(readStep);
    check(steps.every(s => s.state === state), state + ': every surface must render state ' + state + ', got ' + steps.map(s => s.state).join(', '));
    check(steps.every(s => s.text === text), state + ': every surface must say "' + text + '"');
    check(steps.every(s => s.action === action), state + ': every surface must offer action ' + action);
    check(new Set(surfaces.map(m => m.replace(/data-surface="[^"]*"/, ''))).size === 1, state + ': the three surfaces must render the same step');
    check(surfaces.every(m => !m.includes(EM)), state + ': no em dashes in the rendered step');
    const strip = app.el('story-progress').innerHTML;
    check(/Your scripts/.test(strip) && !strip.includes(EM), state + ': strip must render with no em dashes');
  }

  // Marking the finished script filmed through the next step moves every surface on.
  const app = boot([project('f2', { finished: 2, touched: 1 })]);
  await app.run();
  const rail = app.el('story-next-step-rail');
  rail.listeners.click[0]({ target: { closest: sel => (sel === '[data-next-action]' ? { dataset: { nextAction: 'film' } } : null) } });
  await new Promise(resolve => setTimeout(resolve, 0));
  const after = ['story-next-step-rail', 'story-next-step-footer', 'story-next-step-help'].map(id => readStep(app.el(id).innerHTML).state);
  check(after.every(s => s === 'filmed'), 'after Mark filmed every surface must say filmed, got ' + after.join(', '));
  check(/data-filmed="1"/.test(app.el('story-progress').innerHTML), 'after Mark filmed the strip must count 1 filmed');
  check(app.updates.some(u => u.intake && u.intake.filmed === true && typeof u.intake.filmedAt === 'string'), 'Mark filmed must save filmed with a filmedAt date');

  // The app renders all three slots from one STATES.nextStep call.
  check((appSrc.match(/STATES\.nextStep\(/g) || []).length === 1, 'storysculpt.js must call STATES.nextStep in exactly one place');
}

// 4. Dismissal persists for that chat until a new 21-day gap
{
  const lapsed = project('l', { touched: 22, title: 'Rant on Coaching Scams' });
  check(S.returnNoticeFor([lapsed], NOW) !== null, 'dismissal: an undismissed 22-day chat shows the notice');

  const app = boot([lapsed]);
  await app.run();
  const slot = app.el('story-return-notice');
  check(!slot.hidden && slot.innerHTML.includes('Rant on Coaching Scams'), 'dismissal: notice renders before dismissing');
  slot.listeners.click[0]({ target: { closest: sel => (sel === '[data-return-dismiss]' ? {} : null) } });
  await new Promise(resolve => setTimeout(resolve, 0));
  check(slot.hidden, 'dismissal: notice hides on dismiss');
  const saved = app.updates.find(u => u.intake && u.intake.returnDismissedFor);
  check(saved && saved.intake.returnDismissedFor === lapsed.updated_at, 'dismissal: saved on the chat for its last-touched timestamp');
  check(saved && !('updated_at' in saved), 'dismissal: must not move updated_at');

  // Reopen with the saved row: still dismissed.
  const reopened = Object.assign({}, lapsed, { intake: saved ? saved.intake : lapsed.intake });
  const again = boot([reopened]);
  await again.run();
  check(again.el('story-return-notice').hidden && again.el('story-return-notice').innerHTML === '', 'dismissal: stays dismissed on reopen');

  // The member came back (chat touched 25 days ago, after the dismissal), then a new gap opened.
  const newGap = Object.assign({}, reopened, { updated_at: ago(25) });
  const third = boot([newGap]);
  await third.run();
  check(!third.el('story-return-notice').hidden, 'dismissal: a new 21-day gap shows the notice again');
  // Back within the week: nothing shows.
  check(S.returnNoticeFor([Object.assign({}, reopened, { updated_at: ago(3) })], NOW) === null, 'dismissal: a current member sees nothing');
}

// 5. Versions: no older version selected or labelled latest after a newer save
{
  const versions = [{ version: 1, note: 'Initial draft' }, { version: 2, note: 'Revision' }, { version: 3, kind: 'points', note: 'Bullet points' }];
  const viewedBeforeSave = S.versionView(versions, 0, 2);
  check(viewedBeforeSave.index === -1 && !viewedBeforeSave.older && viewedBeforeSave.banner === '', 'versions: a view chosen before a newer save lapses');
  check(viewedBeforeSave.pills.filter(p => p.active).length === 1 && viewedBeforeSave.pills[2].active, 'versions: the newest pill is the selected one after a save');
  check(viewedBeforeSave.pills.filter(p => /latest/.test(p.label)).length === 1 && /latest/.test(viewedBeforeSave.pills[2].label), 'versions: only the newest pill says latest');
  const stillViewing = S.versionView(versions, 0, 3);
  check(stillViewing.older && stillViewing.banner === 'Viewing Version 1 (Initial draft)', 'versions: viewing an older one with nothing newer saved keeps the banner');
  check(!/latest/.test(stillViewing.pills[0].label), 'versions: an older pill never says latest');
  check(S.versionView(versions, 7, 3).index === -1, 'versions: an out-of-range view falls back to the newest');
  check(/STATES\.versionView\(/.test(appSrc) && /normalizeViewingVersion\(\);/.test(appSrc), 'versions: the app must render pills and the script through versionView');
}

// 6. No em dashes anywhere in rendered copy, and the slots sit where they belong
{
  const lines = [
    S.progressLine(null),
    S.progressLine({ finished: 3, filmed: 1, last30: 0, prior30: 0 }),
    S.progressLine({ finished: 3, filmed: 1, last30: 2, prior30: 1 }),
    S.progressLine({ finished: 3, filmed: 1, last30: 1, prior30: 2 }),
    S.progressLine({ finished: 3, filmed: 1, last30: 1, prior30: 1 })
  ].concat(['start', 'interview', 'film', 'filmed'].map(k => S.nextStep(k).text + S.nextStep(k).label));
  check(lines.every(line => !line.includes(EM)), 'copy: no em dashes in progress lines or next steps');

  const rail = html.indexOf('id="story-projects"');
  const strip = html.indexOf('id="story-progress"');
  const list = html.indexOf('id="story-project-list"');
  check(rail > 0 && strip > rail && strip < list, 'layout: the strip sits at the top of the rail');
  check(/id="story-refine-box"[\s\S]*id="story-next-step-footer"[\s\S]*id="story-refine-note"/.test(html), 'layout: the footer step sits with the finished script');
  check(/id="story-help"[\s\S]*id="story-next-step-help"/.test(html), 'layout: Help carries the next step');
  check(/id="story-next-step-rail"/.test(html), 'layout: the rail carries the next step');
}

if (failures.length) {
  console.error('check-storysculpt-progress FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('PASS: check-storysculpt-progress: ' + passed + ' checks (strip counts finished and filmed only, 30-day comparison, one next step on three surfaces in three states, dismissal persists, versions, no em dashes).');
