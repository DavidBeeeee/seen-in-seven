// StorySculpt UX 91 and Stranger 100: crisis input is handled before
// generation and named in Help.
//
// 1. crisisScanText reads every member-written field of a request: the latest
//    answer, a Refine or regenerate note, the chat title and UGC experience
//    notes. Product listings and research are not scanned.
// 2. In the handler, the crisis gate runs before the quota is spent and before
//    any model call or UGC turn, and its reply is marked safety: true.
// 3. Help names the pause and the 988 line.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crisisScanText } from '../api/storysculpt.js';
import { detectCrisis } from '../api/_lib/storysculpt-steps.js';

const trips = input => detectCrisis(crisisScanText(input)).tripped;
const base = { messages: [{ role: 'assistant', content: 'What happened next?' }, { role: 'user', content: 'We launched the course in March.' }] };

console.log('1. crisisScanText covers every member-written field...');
assert.equal(trips(base), false, 'An ordinary answer must not trip');
assert.equal(trips({ ...base, messages: [...base.messages, { role: 'user', content: "Honestly I don't want to be here anymore" }] }), true, 'Latest answer');
assert.equal(trips({ ...base, regenerateNote: 'make it about how I want to end my life' }), true, 'Refine or regenerate note');
assert.equal(trips({ ...base, projectTitle: 'why I keep hurting myself' }), true, 'Chat title');
assert.equal(trips({ ...base, ugc: { creatorExperience: { story: 'Before this I was cutting myself every week' } } }), true, 'UGC experience note');
assert.equal(trips({ ...base, ugc: { creatorExperience: { moments: ['fine', 'everyone is better off without me'] } } }), true, 'UGC experience list');
assert.equal(trips({ ...base, ugc: { product: { description: 'Do not overdose. Keep out of reach of children.' } } }), false, 'Product label text is not the member speaking');
assert.equal(trips({ ...base, messages: [...base.messages, { role: 'user', content: 'This launch is killing me but the course is killing it' }] }), false, 'Idioms do not trip');

console.log('2. The gate runs before quota, model and UGC...');
const src = readFileSync(new URL('../api/storysculpt.js', import.meta.url), 'utf8');
const handler = src.slice(src.indexOf('export default async function handler'));
const gate = handler.indexOf('detectCrisis(crisisScanText(input))');
assert.ok(gate > 0, 'Handler runs detectCrisis over crisisScanText');
for (const later of ['consumeQuota(', 'handleUgcTurn(', 'handlePointsTurn(', 'callStorySculpt(']) {
  const at = handler.indexOf(later);
  assert.ok(at > gate, `${later} must come after the crisis gate`);
}
assert.ok(/content: crisisResponse\([^)]*\),\s*safety: true/.test(handler), 'Crisis reply is marked safety: true');

console.log('3. Help names it...');
const html = readFileSync(new URL('../api/_hub/storysculpt.html', import.meta.url), 'utf8');
const help = html.slice(html.indexOf('id="story-help"'));
assert.ok(help.includes('What if something hard comes up while I write?'), 'Help has the section');
assert.ok(help.includes('988') && help.includes('findahelpline.com'), 'Help names the lines');
assert.ok(!/—/.test(help.slice(help.indexOf('something hard comes up'), help.indexOf('Where do I get help?'))), 'No em dashes in the section');

console.log('StorySculpt safety checks passed.');
