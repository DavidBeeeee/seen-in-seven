import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const challenge = read('funnel-pages/777-challenge-page1-block1-optin-above-form.html');
const standalone = read('funnel-pages/sis-page1-block1-main-body.html');
const thankYou = read('funnel-pages/sis-page6-block1-thankyou.html');

for (const [name, source] of [['challenge', challenge], ['standalone', standalone]]) {
  assert.doesNotMatch(source, /href="#(?:section|form-input)-[a-f0-9]+"/, name + ' CTAs still depend on a generated Systeme element ID.');
  assert.match(source, /input\[type="email"\], input\[name="email"\]/, name + ' CTAs do not discover the current email form at click time.');
  assert.match(source, /input\.focus\(\)/, name + ' CTA does not leave the visitor at a clear next action.');
}

assert.doesNotMatch(standalone, /Comment-to-Client Formula/, 'The deferred Comment-to-Client offer is still on the standalone page.');
assert.doesNotMatch(thankYou, /login link has been sent/i, 'The thank-you page still promises an automatic login email that checkout does not send.');
assert.match(thankYou, /choose Sign In, and enter the same email you used for your order/, 'The thank-you page does not explain the verified access flow.');

console.log('Funnel-source checks passed for durable form CTAs, current offer scope, and truthful buyer access instructions.');
