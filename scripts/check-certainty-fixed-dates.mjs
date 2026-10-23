// Certainty Sessions Fixed-Date Calendar Week & State Verification Gate (WBR-458)
//
// Verifies:
// 1. Stranger 62: missed-week line shows only when a full calendar week passed with no held session
//    - Absent 8 days after a held session (e.g. last Monday to this Tuesday)
//    - Present after a full empty calendar week (e.g. Sunday before last to this Tuesday)
// 2. Stranger 71: 'membership has ended' appears only when state or access check says it ended
//    - Network or sign-in failure, and a person who never had access, each get their own honest screen
// 3. UX 81: phone number on file is displayed back to the member in the settings card
// 4. Accessibility:
//    - Selected day and time marked by more than color (UX 76)
//    - Visible focus states on interactive elements (UX 74)
//    - Responsive layouts surviving 200% zoom (UX 78, 95)
// 5. Zero em dashes in certainty.html

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'api', '_hub', 'certainty.html'), 'utf8');

console.log('--- Checking Certainty Sessions Fixed Dates & State Boundaries (WBR-458) ---');

// 1. Fixed-date calendar week verification (Stranger 62)
console.log('1. Testing calendar-week calculation with fixed dates...');
const etPartsSrc = html.match(/function etParts\(d\) \{[\s\S]*?\n      \}/);
const missedWeekFnSrc = html.match(/function hasMissedWholeCalendarWeek\(lastHeld, nowOverride\) \{[\s\S]*?\n      \}/);
assert.ok(etPartsSrc && missedWeekFnSrc, 'extracted etParts and hasMissedWholeCalendarWeek');

const hasMissed = new Function(
  `${etPartsSrc[0]}; ${missedWeekFnSrc[0]}; return hasMissedWholeCalendarWeek;`
)();

// Fixed date context:
// Reference time: Tuesday Oct 20, 2026, 14:00:00 EDT (2026-10-20T18:00:00Z)
// Current calendar week (Mon-Sun): Monday Oct 19 to Sunday Oct 25, 2026.
// Previous calendar week: Monday Oct 12 to Sunday Oct 18, 2026.
const nowTuesday = new Date('2026-10-20T18:00:00Z');

// Scenario 1A: Session held on Monday Oct 12, 2026 (8 days ago)
// Oct 12 was in the immediately preceding calendar week.
// A whole calendar week did NOT pass without a session -> must be FALSE (line absent)
const lastHeld8DaysAgo = { ends_at: '2026-10-12T18:00:00Z' };
const res8Days = hasMissed(lastHeld8DaysAgo, nowTuesday);
assert.equal(res8Days, false, 'missed-week line is absent 8 days after a held session');

// Scenario 1B: Session held on Sunday Oct 11, 2026 (9 days ago)
// Oct 11 was in the week of Oct 5-11. The entire week of Oct 12-18 had NO session.
// A whole calendar week DID pass -> must be TRUE (line present)
const lastHeld9DaysAgo = { ends_at: '2026-10-11T18:00:00Z' };
const res9Days = hasMissed(lastHeld9DaysAgo, nowTuesday);
assert.equal(res9Days, true, 'missed-week line is present after a full empty calendar week');

// Scenario 1C: Session held 15 days ago (Monday Oct 5, 2026)
// A whole calendar week passed -> must be TRUE
const lastHeld15DaysAgo = { ends_at: '2026-10-05T18:00:00Z' };
assert.equal(hasMissed(lastHeld15DaysAgo, nowTuesday), true, 'missed-week line is present after 15 days');

// Scenario 1D: No last held session
assert.equal(hasMissed(null, nowTuesday), false, 'returns false when no last held session exists');

console.log('PASS: fixed date calendar week logic verified.');

// 2. Gate screens and ended membership honesty (Stranger 71)
console.log('2. Verifying honest gate screens for network, auth, no-access, and ended...');
const showGateSrc = html.match(/function showGateScreen\(type\) \{[\s\S]*?\n      \}/);
assert.ok(showGateSrc, 'showGateScreen function exists');

// Verify copy distinctions for each gate screen
assert.ok(showGateSrc[0].includes('Your Certainty Sessions membership has ended.'), 'ended screen copy');
assert.ok(showGateSrc[0].includes('We could not reach the server just now.'), 'network failure screen copy');
assert.ok(showGateSrc[0].includes('Sign in to enter Certainty Sessions.'), 'sign-in screen copy');
assert.ok(showGateSrc[0].includes('Certainty Sessions is not included in your Studio access.'), 'no-access screen copy');

// Initial static HTML must not prematurely say membership ended
const gateBoxMatch = html.match(/<section class="eee-gate-box"[^>]*>([\s\S]*?)<\/section>/);
assert.ok(gateBoxMatch, 'gate box found in HTML');
assert.ok(!gateBoxMatch[1].includes('Your Certainty Sessions membership has ended.'), 'initial static HTML does not prematurely declare membership ended');

// Catch block routing
assert.match(html, /window\.EEEStudio\.initialize[\s\S]*?\.catch\(function\s*\(err\)\s*\{[\s\S]*?showGateScreen\('network'\)/, 'failed initialize shows network/failure screen instead of ended');

console.log('PASS: gate screen honesty verified.');

// 3. Settings card phone number on file (UX 81)
console.log('3. Verifying phone number on file in settings card...');
assert.ok(html.includes('id="cs-setting-phone-on-file"'), 'phone on file display element exists');
const phoneFnSrc = html.match(/function updatePhoneOnFileDisplay\(phone\) \{[\s\S]*?\n      \}/);
assert.ok(phoneFnSrc, 'updatePhoneOnFileDisplay helper exists');

// Verify rendering logic
const mockEl = { textContent: '' };
const updatePhone = new Function('elPhone', phoneFnSrc[0] + '; return function(p) { updatePhoneOnFileDisplay(p); };');
const runnerPhone = updatePhone(mockEl);

// When phone is on file:
assert.ok(html.includes("elPhone.textContent = 'Phone number on file: ' + p;"), 'displays phone number on file');
assert.ok(html.includes("elPhone.textContent = 'No phone number on file yet.';"), 'displays empty notice when no phone on file');

console.log('PASS: settings phone on file display verified.');

// 4. Accessibility (UX 74, 76, 78, 95)
console.log('4. Verifying accessibility improvements...');

// UX 76: Day & time selection marked by more than color
assert.ok(html.includes('cs-day-check'), 'selected day has distinct checkmark element');
assert.ok(html.includes('cs-time-check'), 'selected time has distinct checkmark element');
assert.match(html, /\.cs-day\.sel\s*\{[\s\S]*?border:\s*2px\s*solid/, 'selected day has distinct border style');
assert.match(html, /\.cs-time\.sel\s*\{[\s\S]*?border:\s*2px\s*solid/, 'selected time has distinct border style');

// UX 74: Focus states
assert.match(html, /button:focus-visible[\s\S]*?outline:\s*3px\s*solid\s*var\(--studio-gold\)/, 'focus-visible outline defined on interactive elements');

// UX 78, 95: Responsive zoom resilience
assert.match(html, /\.cs-next-when\s*\{[^}]*flex-wrap:\s*wrap;/, 'next session container wraps on large zoom');
assert.match(html, /\.cs-hist-row\s*\{[^}]*flex-wrap:\s*wrap;/, 'history row wraps on large zoom');
assert.ok(!html.includes('.cs-hist-time { display: none; }'), 'history time is not suppressed on narrow viewports');

console.log('PASS: accessibility improvements verified.');

// 5. Zero em dashes
console.log('5. Verifying zero em dashes in certainty.html...');
const emDashCount = (html.match(/\u2014/g) || []).length;
assert.equal(emDashCount, 0, 'zero em dashes in certainty.html');
console.log('PASS: zero em dashes verified.');

console.log('\nALL CERTAINTY FIXED-DATE AND STATE CHECKS PASSED');
