// WBR-373 / WBR-409: Next Step Navigator inactivity, lapse, and data retention proof.
//
// Runs the shipped js/navigator.js against a stub DOM and a fake Supabase
// client seeded with members, so the 22-day welcome-back notice, 10-day quiet line,
// 5-day suppression, data retention notice, and 'Let it go' (abandoned) action
// are tested through the real render path.
// Member copy carries no em dashes and no guilt words.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const appSrc = readFileSync('js/navigator.js', 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-09T10:00:00Z');

function stubElement(id, tag = 'div') {
  const listeners = {};
  const attributes = new Map();
  const children = [];
  const classListSet = new Set();

  const el = {
    id,
    tagName: tag.toUpperCase(),
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    readOnly: false,
    className: '',
    style: {},
    dataset: {},
    parentNode: null,
    children,
    listeners,
    classList: {
      add(...cls) { cls.forEach(c => classListSet.add(c)); el.className = Array.from(classListSet).join(' '); },
      remove(...cls) { cls.forEach(c => classListSet.delete(c)); el.className = Array.from(classListSet).join(' '); },
      toggle(cls, force) {
        const has = classListSet.has(cls);
        const shouldHave = force !== undefined ? Boolean(force) : !has;
        if (shouldHave) classListSet.add(cls); else classListSet.delete(cls);
        el.className = Array.from(classListSet).join(' ');
        return shouldHave;
      },
      contains(cls) { return classListSet.has(cls); }
    },
    setAttribute(name, val) { attributes.set(name, String(val)); },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    removeAttribute(name) { attributes.delete(name); },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    appendChild(child) {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    insertBefore(newChild, refChild) {
      newChild.parentNode = el;
      const idx = children.indexOf(refChild);
      if (idx >= 0) children.splice(idx, 0, newChild);
      else children.push(newChild);
      return newChild;
    },
    querySelector(selector) {
      if (selector === '.nav-result-actions') {
        let actions = children.find(c => c.className && c.className.includes('nav-result-actions'));
        if (!actions) {
          actions = stubElement('nav-result-actions-wrap');
          actions.className = 'nav-result-actions';
          el.appendChild(actions);
        }
        return actions;
      }
      if (selector === '.nav-result-head') {
        let head = children.find(c => c.className && c.className.includes('nav-result-head'));
        if (!head) {
          head = stubElement('nav-result-head');
          head.className = 'nav-result-head';
          el.appendChild(head);
        }
        return head;
      }
      return null;
    },
    querySelectorAll() { return []; },
    focus() {},
    reset() { el.value = ''; }
  };
  return el;
}

function boot(initialMoves = []) {
  const elements = new Map();
  const parentContainer = stubElement('next-move-container');

  function getOrStub(id) {
    if (!elements.has(id)) {
      const s = stubElement(id);
      parentContainer.appendChild(s);
      elements.set(id, s);
    }
    return elements.get(id);
  }

  // Pre-seed known elements from navigator.html
  const knownIds = [
    'nav-momentum', 'navigator-form', 'navigator-objective', 'navigator-reality',
    'navigator-blocker', 'navigator-time', 'navigator-deadline', 'navigator-submit',
    'navigator-message', 'navigator-result', 'navigator-action', 'navigator-start',
    'navigator-done', 'navigator-why', 'navigator-source', 'navigator-complete',
    'navigator-copy', 'navigator-new', 'navigator-history'
  ];
  for (const id of knownIds) getOrStub(id);

  // Set up nav-result-head and nav-result-actions container inside navigator-result
  const resBox = getOrStub('navigator-result');
  const headEl = stubElement('nav-result-head');
  headEl.className = 'nav-result-head';
  resBox.appendChild(headEl);

  const actionsWrap = stubElement('result-actions');
  actionsWrap.className = 'nav-result-actions';
  resBox.appendChild(actionsWrap);
  actionsWrap.appendChild(getOrStub('navigator-complete'));
  actionsWrap.appendChild(getOrStub('navigator-copy'));
  actionsWrap.appendChild(getOrStub('navigator-new'));

  let currentMoves = initialMoves.map(m => ({ ...m }));
  let updateCalls = [];

  const sb = {
    from(table) {
      assert.equal(table, 'navigator_moves', 'Must target navigator_moves');
      const q = {
        select() { return q; },
        eq() { return q; },
        order() { return q; },
        limit() {
          return Promise.resolve({ data: currentMoves.map(m => ({ ...m })), error: null });
        },
        update(patch) {
          updateCalls.push(patch);
          return {
            eq(field, val) {
              return {
                eq(f2, v2) {
                  for (const m of currentMoves) {
                    if (m.id === val || m[field] === val) Object.assign(m, patch);
                  }
                  return Promise.resolve({ error: null });
                }
              };
            }
          };
        }
      };
      return q;
    }
  };

  const document = {
    activeElement: null,
    getElementById(id) { return getOrStub(id); },
    createElement(tag) {
      const created = stubElement('dyn-' + Math.random().toString(16).slice(2), tag);
      parentContainer.appendChild(created);
      return created;
    }
  };

  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [NOW]));
    }
    static now() { return NOW; }
  }

  const context = {
    document,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date: FixedDate,
    navigator: { clipboard: { writeText() {} } },
    EEEStudio: { refreshIcons() {} },
    fetch: () => Promise.reject(new Error('no network in test'))
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(appSrc, context, { filename: 'navigator.js' });

  return {
    context,
    document,
    getUpdateCalls: () => updateCalls,
    getCurrentMoves: () => currentMoves,
    run: () => context.window.NavigatorMoves.mount({
      sb,
      profile: { id: 'test-member-uuid' },
      session: { access_token: 'fake-token' }
    })
  };
}

function move(id, next_action, daysAgo, status = 'active') {
  const at = new Date(NOW - daysAgo * DAY).toISOString();
  return {
    id,
    user_id: 'test-member-uuid',
    objective: 'Test objective',
    current_reality: 'Test reality',
    blocker: 'Test blocker',
    available_time: '1 hour',
    deadline: '',
    next_action,
    first_15_minutes: 'Test first 15 mins',
    done_when: 'Test done when',
    why_this_now: 'Test why this now',
    source: 'generated',
    status,
    created_at: at,
    updated_at: at
  };
}

console.log('1. Testing 22-day member (lapsed)...');
{
  const app = boot([move('m-old', 'Draft the partner outreach email', 22), move('m-older', 'Earlier move', 45)]);
  await app.run();

  const notice = app.document.getElementById('navigator-return-notice');
  assert.ok(notice, 'Return notice element must exist');
  console.log('22-day notice  -> hidden=' + notice.hidden + ' html=' + notice.innerHTML);

  check(!notice.hidden, '22 days: return notice must be visible');
  check(notice.getAttribute('data-return-state') === 'lapsed', '22 days: data-return-state must be "lapsed"');
  check(notice.innerHTML.includes('Welcome back.'), '22 days: must include "Welcome back."');
  check(notice.innerHTML.includes('Draft the partner outreach email'), '22 days: must name the last move');
  check(!notice.innerHTML.includes('Earlier move'), '22 days: must name the most recent move only');
  check(/pick it up or let it go/i.test(notice.innerHTML), '22 days: must offer to pick it up or let it go');
  check(!notice.innerHTML.includes('\u2014'), '22 days: member copy must contain no em dashes');
  check(!/\b(missed|failed|behind|should have|wasted|lapse)\b/i.test(notice.innerHTML.replace(/data-return-state="[^"]*"/g, '')),
    '22 days: member copy must not contain guilt words or "lapse"');
}

console.log('2. Testing 10-day member (quiet stretch)...');
{
  const app = boot([move('m-quiet', 'Review the proposal draft', 10)]);
  await app.run();

  const notice = app.document.getElementById('navigator-return-notice');
  console.log('10-day notice  -> hidden=' + notice.hidden + ' html=' + notice.innerHTML);

  check(!notice.hidden, '10 days: return notice must be visible');
  check(notice.getAttribute('data-return-state') === 'quiet', '10 days: data-return-state must be "quiet"');
  check(notice.innerHTML.includes('Good to see you again.'), '10 days: must show gentle quiet line');
  check(!/welcome back/i.test(notice.innerHTML), '10 days: must not say "welcome back"');
  check(!/\blapse\b/i.test(notice.innerHTML.replace(/data-return-state="[^"]*"/g, '')), '10 days: must never be called a lapse');
  check(!notice.innerHTML.includes('\u2014'), '10 days: member copy must contain no em dashes');
  check(!/\b(missed|failed|behind|should have|wasted)\b/i.test(notice.innerHTML), '10 days: must contain no guilt words');
}

console.log('3. Testing 5-day member (current / recent)...');
{
  const app = boot([move('m-recent', 'Fix header layout', 5)]);
  await app.run();

  const notice = app.document.getElementById('navigator-return-notice');
  console.log('5-day notice   -> hidden=' + notice.hidden + ' html="' + notice.innerHTML + '"');

  check(notice.hidden || notice.innerHTML === '', '5 days: must render neither return line');
}

console.log('4. Testing retention line near momentum strip...');
{
  const app = boot([move('m-1', 'Active task', 2)]);
  await app.run();

  const strip = app.document.getElementById('nav-momentum');
  console.log('momentum strip -> hidden=' + strip.hidden + ' html=' + strip.innerHTML);

  check(!strip.hidden, 'Momentum strip must be visible when moves exist');
  check(strip.innerHTML.includes('nothing is deleted'), 'Must say nothing is deleted');
  check(strip.innerHTML.includes('Every move stays'), 'Must say every move stays');
  check(!strip.innerHTML.includes('\u2014'), 'Retention copy must contain no em dashes');
}

console.log('5. Testing "Let it go" / abandoned action...');
{
  const app = boot([
    move('m-current', 'Open move to be abandoned', 12, 'active'),
    move('m-done', 'Previous completed move', 30, 'completed')
  ]);
  await app.run();

  const abandonBtn = app.document.getElementById('navigator-abandon');
  assert.ok(abandonBtn, '#navigator-abandon button must exist');
  check(!abandonBtn.hidden, 'Abandon button must be visible for an active move');
  assert.equal(abandonBtn.dataset.moveId, 'm-current', 'Abandon button carries current move id');

  // Trigger click on abandon button
  const clickListeners = abandonBtn.listeners.click || [];
  assert.ok(clickListeners.length > 0, 'Abandon button has click listener');
  await clickListeners[0]({ currentTarget: abandonBtn });

  const updates = app.getUpdateCalls();
  assert.ok(updates.length > 0, 'Supabase update must be called');
  assert.equal(updates[0].status, 'abandoned', 'Status must be set to abandoned');

  const historyBox = app.document.getElementById('navigator-history');
  const resBox = app.document.getElementById('navigator-result');
  const headBox = resBox.querySelector('.nav-result-head');
  console.log('head after abandon    -> ' + (headBox ? headBox.innerHTML : ''));
  console.log('history after abandon -> ' + historyBox.innerHTML);

  // Check that the "let go" badge renders
  const renderedAll = historyBox.innerHTML + ' ' + (headBox ? headBox.innerHTML : resBox.innerHTML);
  check(renderedAll.includes('let go'), 'Renders the "let go" badge when move is abandoned');

  // Verify that earlier abandoned moves in history render the "let go" badge
  const appHistory = boot([
    move('m-now', 'Current open move', 1, 'active'),
    move('m-prior', 'Prior abandoned move', 15, 'abandoned')
  ]);
  await appHistory.run();
  const hist = appHistory.document.getElementById('navigator-history');
  console.log('history with abandoned move -> ' + hist.innerHTML);
  check(hist.innerHTML.includes('let go'), 'History list renders the "let go" badge for earlier abandoned moves');
}

console.log('6. Verifying engagement boundary pure functions...');
{
  const app = boot([]);
  const S = app.context.window.NavigatorMoves;
  assert.ok(S.computeEngagement, 'computeEngagement must be exposed');

  const at = d => [move('x', 'Move X', d)];
  check(S.computeEngagement(at(7.9), NOW).state === 'current', 'under 8 days is current');
  check(S.computeEngagement(at(8.0), NOW).state === 'quiet', '8 days is quiet');
  check(S.computeEngagement(at(20.9), NOW).state === 'quiet', '20.9 days is still quiet');
  check(S.computeEngagement(at(21.0), NOW).state === 'lapsed', '21 days is lapsed');
  check(S.computeEngagement([], NOW).state === 'new', 'no moves is new');

  check(S.computeReturnNotice(at(5), NOW) === null, '5 days gives null notice');
  check(S.computeReturnNotice(at(10), NOW).state === 'quiet', '10 days gives quiet notice');
  check(S.computeReturnNotice(at(22), NOW).state === 'lapsed', '22 days gives lapsed notice');
}

if (failures.length) {
  console.error('check-navigator-lapse FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('PASS: check-navigator-lapse: 22-day welcome back names last move, 10-day quiet, 5-day suppressed, data retention line present, and open move abandons to "let go" badge.');
