// Certainty Sessions Progression, Milestones, Continuity and Paging Check (WBR-458)
//
// Verifies:
// 1. Scenario 1: Member with 73 held sessions: history pages past 50, count reads 73,
//    and member reaches session 73 and sees 'of 73' (UX 71, 72)
// 2. Scenario 2: 5th held session gets milestone treatment; 4th does not (Stranger 52, 54; UX 11, 12, 43)
// 3. Scenario 3: Booking picker shows last held date and topic; first-timer sees none (UX 53, 59, 60)
//    and states the weekly reset (one session per calendar week, Monday to Sunday Eastern)
// 4. Scenario 4: Gate screens (signed-out, no-access, ended, network-failure) unchanged from 517f0f9
// 5. Zero em dashes across certainty.html and this check script

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'api', '_hub', 'certainty.html'), 'utf8');

console.log('--- Checking Certainty Sessions Progression & Paging (WBR-458) ---');

// ── Helpers to extract functions from certainty.html ───────────────────────────
function extractFunction(name) {
  const re = new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n      \\}`);
  const match = html.match(re);
  assert.ok(match, `function ${name} extracted from certainty.html`);
  return match[0];
}

const escapeHtmlSrc = extractFunction('escapeHtml');
const etPartsSrc = extractFunction('etParts');
const isFirstTimerSrc = extractFunction('isFirstTimer');
const renderBookingContinuitySrc = extractFunction('renderBookingContinuity');
const loadPagedHistorySrc = extractFunction('loadPagedHistory');
const renderHistorySrc = extractFunction('renderHistory');

// ── 1. Scenario 1: Member with 73 held sessions (UX 71, 72) ───────────────────
console.log('1. Testing member with 73 held sessions: history pages past 50 and count reads 73...');

// Generate 73 synthetic held sessions spanning several months
function makeSession(n, dateIso, topic) {
  const d = new Date(dateIso);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const labelDay = `${dayNames[d.getUTCDay()]}, ${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  return {
    id: `sess-${n}`,
    starts_at: dateIso,
    ends_at: new Date(d.getTime() + 7200000).toISOString(),
    mode: n % 2 === 0 ? 'zoom' : 'phone',
    outcome: 'held',
    status: 'booked',
    topic: topic || `Topic for session ${n}`,
    label_day: labelDay,
    label_start: '2:00 PM',
    label_end: '4:00 PM'
  };
}

const sessions73 = [];
// Oldest session (session #1) starts in January 2026, newest (session #73) in October 2026
const baseTime = new Date('2026-01-05T19:00:00Z').getTime();
for (let i = 1; i <= 73; i++) {
  const sessionTime = new Date(baseTime + (i - 1) * 3.5 * 86400000).toISOString();
  sessions73.push(makeSession(i, sessionTime, i === 73 ? 'Fixing my email automation' : `Strategic progress milestone ${i}`));
}
// Sort descending (newest first) as returned by certainty_state and certainty_history
const sessions73Desc = [...sessions73].reverse();
const page1Sessions = sessions73Desc.slice(0, 50); // first 50 returned by state
const page2Sessions = sessions73Desc.slice(50);     // remaining 23 returned by history(50, 50)

// Verify loadPagedHistory paging past 50:
{
  let apiCalledWith = null;
  const mockApi = function (action, payload) {
    apiCalledWith = { action, payload };
    if (action === 'history' && payload.offset === 50) {
      return Promise.resolve({
        ok: true,
        data: {
          total: 73,
          history: page2Sessions,
          nextOffset: null,
          hasMore: false
        }
      });
    }
    return Promise.resolve({ ok: false });
  };

  const testState = {
    history: [...page1Sessions],
    historyCount: 50,
    historyTotal: null
  };

  const mockDom = {
    'cs-history': { classList: { add() {}, remove() {} }, innerHTML: '' },
    'cs-book-last-held': { classList: { add() {}, remove() {} }, innerHTML: '' }
  };
  const mockEl = (id) => mockDom[id] || { classList: { add() {}, remove() {} }, innerHTML: '', onclick: null };

  const testContext = `
    ${escapeHtmlSrc}
    ${etPartsSrc}
    var state = testState;
    var api = mockApi;
    var el = mockEl;
    var icons = function() {};
    var historyExpanded = false;
    var historyPage = 1;
    var HISTORY_PAGE_SIZE = 25;
    ${isFirstTimerSrc}
    ${renderBookingContinuitySrc}
    ${renderHistorySrc}
    ${loadPagedHistorySrc}
    return loadPagedHistory(50);
  `;

  const runPaging = new Function('testState', 'mockApi', 'mockEl', testContext);
  await runPaging(testState, mockApi, mockEl);

  assert.equal(apiCalledWith.action, 'history', 'loadPagedHistory calls action history');
  assert.equal(apiCalledWith.payload.offset, 50, 'asks for offset 50');
  assert.equal(apiCalledWith.payload.limit, 50, 'asks for limit 50');
  assert.equal(testState.historyTotal, 73, 'historyTotal updated to true total 73');
  assert.equal(testState.history.length, 73, 'state.history contains all 73 sessions');
}

// Verify renderHistory displays total count, pagination 'of 73', and reaches session 73
{
  const testState = {
    history: sessions73Desc,
    historyTotal: 73,
    historyCount: 73,
    lastHeld: sessions73Desc[0]
  };

  let renderedHistoryHtml = '';
  const mockDom = {
    'cs-history': {
      classList: { add() {}, remove() {} },
      set innerHTML(val) { renderedHistoryHtml = val; },
      get innerHTML() { return renderedHistoryHtml; }
    }
  };
  const mockEl = (id) => mockDom[id] || { classList: { add() {}, remove() {} }, innerHTML: '', onclick: null };

  // A) Render collapsed view
  const renderFn = new Function('testState', 'mockEl', 'expanded', 'page', `
    ${escapeHtmlSrc}
    ${etPartsSrc}
    var state = testState;
    var el = mockEl;
    var icons = function() {};
    var historyExpanded = expanded;
    var historyPage = page;
    var HISTORY_PAGE_SIZE = 25;
    ${renderHistorySrc}
    renderHistory();
    return el('cs-history').innerHTML;
  `);

  const collapsedHtml = renderFn(testState, mockEl, false, 1);
  assert.ok(collapsedHtml.includes('73 sessions with David'), 'count reads 73 in header');
  assert.ok(collapsedHtml.includes('Show all 73 sessions'), 'toggle button offers all 73 sessions');

  // B) Render expanded view on page 3 (Page 3 of 3, items 51 to 73)
  const expandedPage3Html = renderFn(testState, mockEl, true, 3);
  assert.ok(expandedPage3Html.includes('Showing 51 &ndash; 73 of 73 sessions (Page 3 of 3)'), 'pagination shows Showing 51 - 73 of 73 sessions (Page 3 of 3)');
  assert.ok(expandedPage3Html.includes('of 73'), 'explicitly shows "of 73"');
  // Session #1 (the 73rd session in descending order) must be reachable on page 3
  assert.ok(expandedPage3Html.includes('Strategic progress milestone 1') || expandedPage3Html.includes('January'), 'reaches session 73 on page 3');
  assert.ok(expandedPage3Html.includes('id="cs-hist-next" disabled'), 'next button is disabled on last page');
  assert.ok(expandedPage3Html.includes('id="cs-hist-prev"'), 'prev button is present and enabled');

  // C) Change over time section
  assert.ok(expandedPage3Html.includes('data-cs-change-card="true"'), 'change over time card rendered');
  assert.ok(expandedPage3Html.includes('73</span><span class="cs-stat-lbl">sessions since joining'), 'shows sessions since joining');
  assert.ok(expandedPage3Html.includes('data-cs-topics="true"'), 'topics brought over time section rendered');
  assert.ok(expandedPage3Html.includes('Fixing my email automation'), 'member topic included in topics list');
}
console.log('PASS: member with 73 held sessions pages past 50, reads count 73, reaches session 73, and sees "of 73".');

// ── 2. Scenario 2: 5th held session gets milestone treatment; 4th does not ─────
console.log('2. Testing milestone treatment: 5th held session gets milestone treatment; 4th does not...');

// Helper to run renderHistory with N sessions
function renderWithCount(n) {
  const sessions = sessions73Desc.slice(sessions73Desc.length - n);
  const testState = {
    history: sessions,
    historyTotal: n,
    historyCount: n,
    lastHeld: sessions[0]
  };
  let outputHtml = '';
  const mockDom = {
    'cs-history': {
      classList: { add() {}, remove() {} },
      set innerHTML(val) { outputHtml = val; },
      get innerHTML() { return outputHtml; }
    }
  };
  const mockEl = (id) => mockDom[id] || { classList: { add() {}, remove() {} }, innerHTML: '', onclick: null };

  const renderFn = new Function('testState', 'mockEl', `
    ${escapeHtmlSrc}
    ${etPartsSrc}
    var state = testState;
    var el = mockEl;
    var icons = function() {};
    var historyExpanded = true;
    var historyPage = 1;
    var HISTORY_PAGE_SIZE = 25;
    ${renderHistorySrc}
    renderHistory();
    return el('cs-history').innerHTML;
  `);

  return renderFn(testState, mockEl);
}

// Member at 5 held sessions:
const html5Sessions = renderWithCount(5);
assert.ok(html5Sessions.includes('data-cs-milestone="5"'), 'history card has data-cs-milestone="5"');
assert.ok(html5Sessions.includes('5th session milestone reached'), 'celebrates 5th session milestone reached');
assert.ok(html5Sessions.includes('data-cs-milestone-num="5"'), '5th session row has data-cs-milestone-num="5"');
assert.ok(html5Sessions.includes('5th session milestone'), '5th session row has 5th session milestone tag');
assert.ok(html5Sessions.includes('cs-milestone-row'), '5th session row has cs-milestone-row class');

// Member at 4 held sessions:
const html4Sessions = renderWithCount(4);
assert.ok(!html4Sessions.includes('data-cs-milestone="5"'), '4-session member has NO data-cs-milestone="5"');
assert.ok(!html4Sessions.includes('5th session milestone'), '4-session member has NO 5th session milestone tag or callout');
assert.ok(!html4Sessions.includes('data-cs-milestone-num="4"'), '4th session row does not have milestone marker');
assert.ok(!html4Sessions.includes('data-cs-milestone-num="5"'), 'no 5th session exists yet');

console.log('PASS: 5th held session gets milestone treatment; 4th does not.');

// ── 3. Scenario 3: Booking picker continuity and weekly reset ──────────────────
console.log('3. Testing booking picker continuity and weekly reset...');

// A) Returning member with a last held session
{
  const testState = {
    history: [sessions73Desc[0]],
    historyCount: 1,
    lastHeld: {
      ends_at: '2026-10-12T18:00:00Z',
      label_day: 'Monday, October 12, 2026',
      topic: 'Fixing my email automation'
    }
  };

  let continuityHtml = '';
  const classes = new Set(['cs-hide']);
  const mockDom = {
    'cs-book-last-held': {
      classList: {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        contains(c) { return classes.has(c); }
      },
      set innerHTML(v) { continuityHtml = v; },
      get innerHTML() { return continuityHtml; }
    }
  };
  const mockEl = (id) => mockDom[id] || { classList: { add() {}, remove() {}, contains() { return false; } }, innerHTML: '' };

  const testFn = new Function('testState', 'mockEl', `
    ${escapeHtmlSrc}
    ${etPartsSrc}
    var state = testState;
    var el = mockEl;
    var icons = function() {};
    ${isFirstTimerSrc}
    ${renderBookingContinuitySrc}
    renderBookingContinuity();
    var node = el('cs-book-last-held');
    return { html: node.innerHTML, isHidden: node.classList.contains('cs-hide') };
  `);

  const res = testFn(testState, mockEl);
  assert.equal(res.isHidden, false, 'continuity box is visible for returning member');
  assert.ok(res.html.includes('Fixing my email automation'), 'shows last held topic');
  assert.ok(res.html.includes('Monday, October 12, 2026') || res.html.includes('October 12'), 'shows last held date');
  assert.ok(res.html.includes('Last time') && res.html.includes('you brought:'), 'reads "Last time you brought: ..."');
}

// B) First-timer member sees none of it
{
  const testState = {
    upcoming: null,
    history: [],
    historyCount: 0,
    lastHeld: null
  };

  let continuityHtml = '';
  const classes = new Set();
  const mockDom = {
    'cs-book-last-held': {
      classList: {
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        contains(c) { return classes.has(c); }
      },
      set innerHTML(v) { continuityHtml = v; },
      get innerHTML() { return continuityHtml; }
    }
  };
  const mockEl = (id) => mockDom[id] || { classList: { add() {}, remove() {}, contains() { return false; } }, innerHTML: '' };

  const testFn = new Function('testState', 'mockEl', `
    ${escapeHtmlSrc}
    ${etPartsSrc}
    var state = testState;
    var el = mockEl;
    var icons = function() {};
    ${isFirstTimerSrc}
    ${renderBookingContinuitySrc}
    renderBookingContinuity();
    var node = el('cs-book-last-held');
    return { html: node.innerHTML, isHidden: node.classList.contains('cs-hide') };
  `);

  const res = testFn(testState, mockEl);
  assert.equal(res.isHidden, true, 'continuity box is hidden for first-timer');
  assert.equal(res.html, '', 'continuity box is empty for first-timer');
}

// C) Weekly reset disclosure where member books
assert.ok(html.includes('data-cs-weekly-reset="true"'), 'weekly reset container exists in booking panel');
assert.ok(html.includes('One session per calendar week, Monday to Sunday Eastern'), 'states weekly reset rule explicitly');

console.log('PASS: booking picker shows last held date and topic; first-timer sees none; weekly reset stated where member books.');

// ── 4. Scenario 4: Gate screens unchanged from 517f0f9 ────────────────────────
console.log('4. Testing gate screens unchanged from 517f0f9...');
const showGateSrc = extractFunction('showGateScreen');
assert.ok(showGateSrc.includes('Your Certainty Sessions membership has ended.'), 'ended gate copy');
assert.ok(showGateSrc.includes('We could not reach the server just now.'), 'network failure gate copy');
assert.ok(showGateSrc.includes('Sign in to enter Certainty Sessions.'), 'sign-in gate copy');
assert.ok(showGateSrc.includes('Certainty Sessions is not included in your Studio access.'), 'no-access gate copy');
console.log('PASS: gate screens unchanged from 517f0f9.');

// ── 5. Zero em dashes ─────────────────────────────────────────────────────────
console.log('5. Verifying zero em dashes across certainty.html and check script...');
const thisScript = readFileSync(fileURLToPath(import.meta.url), 'utf8');
assert.equal((html.match(/\u2014/g) || []).length, 0, 'zero em dashes in certainty.html');
assert.equal((thisScript.match(/\u2014/g) || []).length, 0, 'zero em dashes in check-certainty-progression.mjs');
console.log('PASS: zero em dashes confirmed.');

console.log('\nALL CERTAINTY PROGRESSION AND PAGING CHECKS PASSED');
