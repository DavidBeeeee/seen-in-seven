// Certainty Sessions says what happens before it happens (WBR-435 lane,
// WO-20261021-evening). Each assertion names the Stranger/UX row it targets.
//
// Static copy is checked in the page; the calendar-sync note and the
// first-session arc are run through the page's own functions so the lines a
// member sees are the lines proven here.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'api', '_hub', 'certainty.html'), 'utf8');

function block(name) {
  const m = html.match(new RegExp('data-cs-copy="' + name + '"[\\s\\S]*?</(div|p|button)>'));
  assert.ok(m, 'copy block ' + name + ' is on the page');
  return m[0];
}

// Stranger 62: a single missed week.
assert.match(block('missed-week'), /does not roll over/);
assert.match(block('missed-week'), /Monday to Sunday, Eastern/);
// Stranger 9, 10, 24, 64: stopping, the 21-day pace, the welcome back.
assert.match(block('stop-booking'), /three weeks/);
assert.match(block('stop-booking'), /welcome back/);
assert.match(block('stop-booking'), /no penalty/);
// Stranger 71, 98; UX 88: membership ending.
assert.match(block('membership-ends'), /Booking closes/);
assert.match(block('membership-ends'), /past sessions stay on your account/);
// Stranger 26: the freed slot can be taken.
assert.match(block('reschedule'), /someone else can book it/);
assert.match(html, /This releases your current time first, and someone else can book it/);
// Stranger 18, 19: not a generic scheduler.
assert.match(block('not-a-scheduler'), /Not a calendar link/);
// Stranger 91: a held session is the outcome.
assert.match(block('held-outcome'), /success when it is held/);
// Stranger 99: who reads a topic, how to delete, what sessions are not for.
assert.match(block('topic-reader'), /only David/);
assert.match(block('not-for'), /not therapy or crisis support/);
assert.match(block('not-for'), /988/);
assert.match(block('delete-data'), /Delete my past sessions and phone number/);
assert.match(html, /el\('cs-delete-data'\)\.onclick = deleteData;/);
assert.match(html, /api\('delete_data'\)/);

// UX 6, Stranger 38: the server's sync state is rendered, failure included.
const calSrc = html.match(/function calNote\(u\) \{[\s\S]*?\n      \}/);
assert.ok(calSrc, 'calNote(u) exists');
const calNote = new Function('u', calSrc[0] + '; return calNote(u);');
assert.match(calNote({ calendar_status: 'created', calendar_sync_state: 'synced' }), /data-cal="confirmed"/);
const failed = calNote({ calendar_status: 'failed', calendar_sync_state: 'failed' });
assert.match(failed, /data-sync="failed"/);
assert.match(failed, /has not taken it yet/);
assert.match(calNote({ calendar_status: 'pending', calendar_sync_state: 'pending' }), /data-cal="held"/);
assert.match(calNote({ calendar_status: 'failed' }), /data-sync="failed"/, 'falls back to calendar_status without the field');
assert.match(html, /calNote\(u\) \+ \(isFirstTimer\(\) \? firstArc\(\) : ''\)/);

// UX 21, 26: the first session is an arc, on both first-timer cards.
const arcSrc = html.match(/function firstArc\(\) \{[\s\S]*?\n      \}/);
assert.ok(arcSrc, 'firstArc() exists');
const arc = new Function(arcSrc[0] + '; return firstArc();')();
for (const step of ['Before.', 'During.', 'After.']) assert.ok(arc.includes(step), 'arc has ' + step);
assert.match(html, /firstArc\(\) \+\n\s*'<div class="cs-actions"><button class="primary-button" type="button" id="cs-open-book"><i data-lucide="calendar-plus"><\/i><span>Book my first session/);

assert.ok(!/—/.test(html), 'No em dash anywhere on the Certainty page');

console.log('PASS check-certainty-upfront: missed week, lapse, reschedule, membership end, scheduler contrast, held outcome, privacy, delete, sync state and first-session arc all render (Stranger 9, 10, 18, 19, 24, 26, 38, 62, 64, 71, 91, 98, 99; UX 6, 21, 26, 88)');
