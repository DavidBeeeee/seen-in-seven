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

const src = html.match(/function calNote\(status\) \{[\s\S]*?\n      \}/);
assert.ok(src, 'certainty.html defines calNote(status)');
const calNote = new Function(`${src[0]}; return calNote;`)();

assert.ok(/calNote\(u\.calendar_status\)/.test(html), 'The next-session card renders calNote(u.calendar_status)');

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
