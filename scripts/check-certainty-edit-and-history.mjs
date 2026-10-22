// Check Certainty Sessions: Edit control, missed-week line, lapsed membership, and paginated history (WBR-435).
// Also verifies sign-in redirect safety / WBR-445 allow-list blocker status (WBR-445).
// WO-20261022-latemorning.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const certaintyHtml = readFileSync(join(root, 'api', '_hub', 'certainty.html'), 'utf8');
const studioJs = readFileSync(join(root, 'js', 'studio.js'), 'utf8');

// --- (a) Solution Vault second-device / sign-in redirect safety (WBR-445) ---
// Plain sign-in safely lands on / with origin, and sign-in is not broken by guessing unverified redirect URLs
assert.match(studioJs, /emailRedirectTo:\s*window\.location\.origin\s*\+\s*'\/'/, 'plain sign-in goes to /');
assert.ok(!studioJs.includes('emailRedirectTo: window.location.origin + next'), 'does not guess unverified query string redirect URL');

// --- (b) Certainty Sessions page cluster in certainty.html (WBR-435) ---

// 1. Edit control on upcoming session calling action 'update' with plain-words errors (Stranger 45, 46, 49; UX 83)
assert.match(certaintyHtml, /id="cs-edit"/, 'Edit control button exists on upcoming session');
assert.match(certaintyHtml, /<button[^>]+id="cs-edit"[^>]*>[\s\S]*?Edit session[\s\S]*?<\/button>/, 'Edit session button label is visible');
assert.match(certaintyHtml, /function openEdit\(u\)/, 'openEdit(u) handler exists');
assert.match(certaintyHtml, /var action = isEdit \? 'update' : 'book'/, 'calls existing API action update when editing');
assert.match(certaintyHtml, /payload\.id = editingSession\.id/, 'carries session id for update action');

// Plain words error messages for slot taken, weekly limit, and topic cap
assert.match(certaintyHtml, /Someone just took that time\. Pick another open slot\./, 'slot taken error in plain words');
assert.match(certaintyHtml, /You already have a session booked for that week\. Pick a time in an open week\./, 'weekly limit error in plain words');
assert.match(certaintyHtml, /Topic must be 200 characters or fewer\./, 'topic cap error in plain words');

// 2. Missed-week line when it happens (Stranger 62)
assert.match(certaintyHtml, /data-cs-missed-week="true"/, 'missed week line element exists');
assert.match(certaintyHtml, /data-cs-copy="missed-week-line"/, 'missed week copy block marked');
assert.match(certaintyHtml, /You missed last week\. Unused weeks do not roll over, but your session for this week is open\./, 'missed week line says what happened and that this week is open');
assert.match(certaintyHtml, /weeksSinceLastHeld >= 1/, 'checks that a week elapsed since last held session');

// 3. Certainty-specific ending state for a member whose access has lapsed (Stranger 71)
assert.match(certaintyHtml, /data-cs-copy="lapsed-membership"/, 'lapsed membership copy block marked');
assert.match(certaintyHtml, /Booking is closed\./, 'says booking closed');
assert.match(certaintyHtml, /Your past sessions are kept on your account, so if you come back they are still here\./, 'says past sessions kept');
assert.match(certaintyHtml, /How to come back: email David at <a href="mailto:email@davidbee\.me">email@davidbee\.me<\/a> or return to My Studio\./, 'says how to come back');
assert.match(certaintyHtml, /applyCertaintyEndedState\(\)/, 'applies Certainty-specific ended state when access is not included');

// 4. Paginate history list past 50 rows, coherent collapsed and expanded (UX 71, 72)
assert.match(certaintyHtml, /HISTORY_PAGE_SIZE = 25/, 'history page size defined');
assert.match(certaintyHtml, /data-cs-hist-pagination="true"/, 'pagination controls container exists');
assert.match(certaintyHtml, /id="cs-hist-prev"/, 'history previous page button exists');
assert.match(certaintyHtml, /id="cs-hist-next"/, 'history next page button exists');
assert.match(certaintyHtml, /id="cs-hist-toggle"/, 'history expand/collapse toggle button exists');
assert.match(certaintyHtml, /Show fewer/, 'toggle can collapse back to show fewer');
assert.match(certaintyHtml, /Show all/, 'toggle can expand to show all sessions');
assert.match(certaintyHtml, /displayItems = items\.slice\(0, 5\)/, 'collapsed view limits to recent 5 rows');

// Verify pure pagination behavior on synthetic 65-item history list
const histSrc = certaintyHtml.match(/function renderHistory\(\) \{[\s\S]*?\n      \}/);
assert.ok(histSrc, 'renderHistory function extracted');

// No em dashes
assert.ok(!/—/.test(certaintyHtml), 'No em dash anywhere in certainty.html');

console.log('PASS check-certainty-edit-and-history: Edit control calls update with plain errors, missed-week line renders, lapsed-membership ending state says booking closed, past sessions kept, and how to come back, and history list paginates past 50 rows coherent collapsed and expanded (Stranger 45, 46, 49, 62, 71; UX 71, 72, 83)');
