// Certainty Sessions first-session card check (UX 24).
//
// A member with no session on record sees a first-session card, not the
// regular weekly card. Runs the page's own isFirstTimer against member states.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'api', '_hub', 'certainty.html'), 'utf8');

const src = html.match(/function isFirstTimer\(\) \{[\s\S]*?\n      \}/);
assert.ok(src, 'certainty.html defines isFirstTimer()');
const make = new Function('state', `${src[0]}; return isFirstTimer();`);

assert.equal(make(null), false, 'no state yet is not a first-timer');
assert.equal(make({ upcoming: null, history: [], historyCount: 0, lastHeld: null }), true, 'brand-new member');
assert.equal(make({ upcoming: { id: 'x' }, history: [] }), true, 'first booking made, not yet held');
assert.equal(make({ history: [{ outcome: 'held' }], historyCount: 1 }), false, 'one held session');
assert.equal(make({ history: [], historyCount: 3 }), false, 'count without loaded rows');
assert.equal(make({ history: [], lastHeld: { label_day: 'Mon' } }), false, 'lapsed member is not a first-timer');

assert.match(html, /data-first-session="true"/, 'first-session card is rendered');
assert.match(html, /Book my first session/, 'first-session call to action');
assert.match(html, /isFirstTimer\(\) \? 'Your first session' : 'Your next session'/, 'upcoming card names the first session');
const card = html.match(/Start with one thing you are stuck on\.[\s\S]*?Book my first session/)[0];
assert.ok(!/—/.test(card), 'No em dash in member copy');

console.log('PASS check-certainty-first-session: new members get a first-session card; held, counted and lapsed members do not');
