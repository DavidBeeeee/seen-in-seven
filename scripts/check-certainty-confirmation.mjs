// Certainty Sessions honest booking confirmation check (Stranger 30, 83; UX 35;
// Developer 45).
//
// The member card may only read as confirmed when the booking actually landed
// on David's calendar (calendar_status 'created'). Every other state, pending,
// skipped or failed, must say plainly that the time is held and David will
// confirm. This runs the page's own calNote function in both states.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'api', '_hub', 'certainty.html'), 'utf8');

// calNote now takes the session so it can show the server's sync state
// (UX 6, Stranger 38); the confirmation contract below is unchanged.
const src = html.match(/function calNote\(u\) \{[\s\S]*?\n      \}/);
assert.ok(src, 'certainty.html defines calNote(u)');
const calNoteFor = new Function(`${src[0]}; return calNote;`)();
const calNote = (status) => calNoteFor({ calendar_status: status });

assert.ok(/calNote\(u\)/.test(html), 'The next-session card renders calNote(u)');
assert.match(calNoteFor({ calendar_status: 'pending', calendar_sync_state: 'synced' }), /data-cal="held"/, 'only calendar_status created may read as confirmed');

const strip = (h) => h.replace(/<[^>]+>/g, '');

const confirmed = calNote('created');
assert.match(confirmed, /data-cal="confirmed"/);
assert.match(strip(confirmed), /Confirmed/);
assert.match(strip(confirmed), /on David's calendar/);
console.log(`created  -> ${strip(confirmed)}`);

for (const status of ['pending', 'skipped', 'failed', undefined, null, 'synced-but-unknown']) {
  const note = calNote(status);
  const text = strip(note);
  assert.match(note, /data-cal="held"/, `${status} renders the held state`);
  assert.match(text, /held/i, `${status} says the time is held`);
  assert.match(text, /David .*will confirm|he will confirm/i, `${status} says David will confirm`);
  assert.ok(!/David is confirmed|^Confirmed|see you at your session time/i.test(text), `${status} must not promise confirmation`);
  assert.ok(!/—/.test(text), 'No em dash in member copy');
  console.log(`${String(status).padEnd(8)} -> ${text}`);
}

assert.ok(!/David is confirmed/i.test(html), 'No "David is confirmed" copy anywhere on the page');

console.log('PASS check-certainty-confirmation: confirmed only when the calendar has it; held-and-David-will-confirm otherwise');
