// WBR-373 / WO-20261013-latemorning: StorySculpt lapse check.
//
// A member whose last StorySculpt turn was 21 or more days ago gets one quiet
// return line at the top of the rail naming their most recent chat, the same
// threshold Certainty and Boardroom use; a gap under 21 days shows nothing.
// Pure function plus a check: 22 days shows it, 6 days does not.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const statesSrc = readFileSync('js/storysculpt-member-states.js', 'utf8');
const appSrc = readFileSync('js/storysculpt.js', 'utf8');
const html = readFileSync('api/_hub/storysculpt.html', 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-13T10:00:00Z');

// 1. Pure function tests
{
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(statesSrc, ctx);
  const S = ctx.StorySculptStates;

  const projectAt = (daysAgo, title = 'Test Chat') => [{
    id: 'p-1',
    title,
    updated_at: new Date(NOW - daysAgo * DAY).toISOString()
  }];

  // 22 days shows the return notice naming the last chat
  const notice22 = S.returnNotice(projectAt(22, 'Summer Launch Script'), NOW);
  check(notice22 !== null, '22 days: return notice must exist');
  check(notice22 && notice22.state === 'lapsed', '22 days: notice state must be lapsed');
  check(notice22 && notice22.text.includes('Summer Launch Script'), '22 days: notice text must name the chat');
  check(notice22 && !notice22.text.includes('—'), '22 days: notice text must not contain em dashes');

  // 6 days under threshold shows nothing
  const notice6 = S.returnNotice(projectAt(6, 'Recent Script'), NOW);
  check(notice6 === null, '6 days: return notice must be null');

  // Boundaries
  check(S.engagement(projectAt(6), NOW).state === 'current', '6 days is current');
  check(S.engagement(projectAt(20.9), NOW).state !== 'lapsed', 'under 21 days is not lapsed');
  check(S.engagement(projectAt(21), NOW).state === 'lapsed', '21 days is lapsed');
  check(S.engagement(projectAt(22), NOW).state === 'lapsed', '22 days is lapsed');
}

// 2. DOM render tests through boot harness
function stubElement(id) {
  const listeners = {};
  const children = [];
  const attributes = new Map();
  return {
    id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, readOnly: false,
    className: '', style: {}, scrollTop: 0, scrollHeight: 1000, dataset: {},
    parentNode: null, children,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild(child) { child.parentNode = this; children.push(child); return child; },
    focus() {}, requestSubmit() {}, listeners
  };
}

function boot(projects) {
  const elements = new Map();
  const document = {
    activeElement: null,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, stubElement(id));
      return elements.get(id);
    },
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
  vm.runInContext(statesSrc, context);
  vm.runInContext(appSrc, context);
  return { context, document, run: () => init({ sb, profile: { id: 'member-1' }, session: { access_token: 't' } }) };
}

function makeProject(id, title, daysAgo) {
  const at = new Date(NOW - daysAgo * DAY).toISOString();
  return {
    id, title, content_type: 'rant', conversation: [{ role: 'assistant', content: 'Prompt' }],
    output: null, intake: { context: '', versions: [] }, created_at: at, updated_at: at
  };
}

// 22-day member: shows the line in the rail
{
  const app = boot([makeProject('p-22', 'Rant on Coaching Scams', 22)]);
  await app.run();
  const slot = app.document.getElementById('story-return-notice');
  check(!slot.hidden, '22 days: return notice slot must not be hidden');
  check(/data-return-state="lapsed"/.test(slot.innerHTML), '22 days: rendered state must be lapsed');
  check(slot.innerHTML.includes('Rant on Coaching Scams'), '22 days: rendered line must name the chat');
  check(!slot.innerHTML.includes('—'), '22 days: rendered HTML must contain no em dashes');
}

// 6-day member: does not show the line
{
  const app = boot([makeProject('p-6', 'Recent Six Day Chat', 6)]);
  await app.run();
  const slot = app.document.getElementById('story-return-notice');
  check(slot.hidden && slot.innerHTML === '', '6 days: return notice slot must be hidden and empty');
}

// 3. Structural check: return notice is in the rail
{
  const railIndex = html.indexOf('id="story-projects"');
  const slotIndex = html.indexOf('id="story-return-notice"');
  const mainIndex = html.indexOf('id="story-editor"');
  check(railIndex > 0 && slotIndex > railIndex && slotIndex < mainIndex, 'story-return-notice must sit at the top of the rail, inside story-projects');
}

if (failures.length) {
  console.error('check-storysculpt-lapse FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('PASS: check-storysculpt-lapse: 22 days shows the line, 6 days does not.');
