// StorySculpt bullet points and voice input (David, 2026-10-17).
//
// 1. The points conversion: the prompt keeps order and adds nothing, the
//    cleaner turns any list shape into "- " bullets without em dashes or
//    markdown, and a reply that is not a real list is refused.
// 2. The API accepts the points intent, converts the saved script for every
//    format (it runs before the UGC branch), refuses an unfinished chat, and
//    returns no step so the interview position is untouched.
// 3. The page has the Bullet points action, saves points as a new version and
//    loads the voice script, which skips the finished-script editor.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkPoints, cleanPoints, pointsMessages, POINTS_SYSTEM } from '../api/_lib/storysculpt-points.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(root, p), 'utf8');
let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

const script = 'Everyone tells you to post every day. I did that for a year and grew 40 followers. Here is what changed when I stopped: I wrote one story a week from a real client call, and it was the one people shared. Try it this week. Comment STORY and I will send you my template.';

check('prompt keeps order, adds nothing, plain bullets, no em dashes', () => {
  assert.match(POINTS_SYSTEM, /same order/);
  assert.match(POINTS_SYSTEM, /cue the creator glances at/);
  assert.match(POINTS_SYSTEM, /hook and the last is the call to action/);
  assert.match(POINTS_SYSTEM, /Add nothing/);
  assert.match(POINTS_SYSTEM, /"- "/);
  assert.match(POINTS_SYSTEM, /em dashes/);
  const msgs = pointsMessages(script);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].content, 'SCRIPT:\n' + script);
});

check('cleaner normalises every list shape', () => {
  const raw = 'Here are your talking points:\n## Hook\n1. **Everyone** says post daily — I did, for a year\n2) Grew 40 followers\n* One story a week from a real call\n• People shared that one\n- Try it this week\n- Comment STORY for the template';
  const out = cleanPoints(raw);
  assert.equal(out, [
    '- Everyone says post daily, I did, for a year',
    '- Grew 40 followers',
    '- One story a week from a real call',
    '- People shared that one',
    '- Try it this week',
    '- Comment STORY for the template',
  ].join('\n'));
  assert.ok(!/[—–*#]/.test(out));
});

check('a real list passes, prose and gutted replies are refused', () => {
  const good = cleanPoints('- Everyone says post every day\n- I did for a year and grew 40 followers\n- One story a week from a real client call\n- That one got shared\n- Comment STORY for my template');
  assert.equal(checkPoints(good, script).ok, true);
  assert.equal(checkPoints(cleanPoints('Sure! Post less and tell stories.'), script).reason, 'too_few_points');
  assert.equal(checkPoints('- a\n- b\n- c', script).reason, 'content_dropped');
});

const api = read('api/storysculpt.js');
check('API accepts points, converts the saved script, before the UGC branch', () => {
  assert.match(api, /intent !== 'points'/);
  assert.match(api, /!project\.output && input\.intent === 'points'/);
  const points = api.indexOf("if (input.intent === 'points')");
  const ugc = api.indexOf("if (input.mode === 'ugc') {\n      return await handleUgcTurn");
  assert.ok(points > 0 && ugc > points, 'points runs for every format, UGC included');
  const handler = api.slice(api.indexOf('async function handlePointsTurn'), api.indexOf('function bearerToken'));
  assert.match(handler, /project\.output/);
  assert.match(handler, /checkPoints/);
  assert.match(handler, /Your script is unchanged/);
  assert.ok(!/step:\s*'points'\s*,\s*promptVersion/.test(handler), 'no step returned, so the interview position is untouched');
  assert.ok(api.indexOf('consumeQuota') < points, 'quota applies');
});

const page = read('api/_hub/storysculpt.html');
const client = read('js/storysculpt.js');
check('page has Bullet points and keeps UGC\'s up-front talking points choice', () => {
  assert.match(page, /id="points-story-output"[^>]*>.*Bullet points/);
  assert.match(page, /data-style="points">Ordered talking points/);
  assert.match(client, /addEventListener\('click', convertToPoints\)/);
  const fn = client.slice(client.indexOf('async function convertToPoints'), client.indexOf('// Inline edits to the finished script'));
  assert.match(fn, /runGeneration\('points'\)/);
  assert.match(fn, /kind: 'points'/);
  assert.match(fn, /versions\.push/);
  assert.match(fn, /still in Versions/);
  assert.match(client, /v\.kind === 'points' \? ' points'/);
});

const voice = read('js/voice-input.js');
check('voice input loads on StorySculpt and skips the script editor', () => {
  assert.match(page, /<script src="\/js\/voice-input\.js\?v=[^"]+"><\/script>/);
  assert.match(voice, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(voice, /if \(!SpeechRecognition\) return;/);
  assert.match(voice, /'story-output-copy'/);
  assert.match(voice, /dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  assert.match(voice, /setTimeout\(\(\) => stopListening\(\), 3000\)/);
  assert.match(read('css/storysculpt.css'), /\.story-composer > \.voice-input-wrap/);
});

console.log(`PASS storysculpt points and voice: ${passed} checks`);
