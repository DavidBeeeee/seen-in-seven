import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'storysculpt.html'), 'utf8');
const script = readFileSync(join(root, 'js', 'storysculpt.js'), 'utf8');

const checks = [
  ['responsible owner', /Built and supported by David Bee/],
  ['support route', /mailto:email@davidbee\.me/],
  ['membership price', /\$250 monthly membership/],
  ['cancellation language', /cancel the monthly membership/i],
  ['AI provider disclosure', /sent to DeepSeek/],
  ['saved-work disclosure', /saved to your Studio account/],
  ['generic AI distinction', /Not another blank AI chat/],
  ['guided interview distinction', /interview you one decision at a time/],
  ['5E mechanism', /Entertainment, Enragement, Epiphany, Empathy, or Education/],
  ['finished-script next step', /Your next step is not another prompt/],
  ['recording direction', /record it in your normal setup/]
];

const failures = checks.filter(([, pattern]) => !pattern.test(html)).map(([label]) => label);
if (!/copy-story-output-bottom/.test(script) || !/start-another-story/.test(script)) {
  failures.push('finished-script actions');
}

if (failures.length) {
  console.error(`StorySculpt trust check failed: ${failures.join(', ')}`);
  process.exit(1);
}

console.log(`StorySculpt trust check passed (${checks.length + 1} assertions).`);
