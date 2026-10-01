import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Realigned alongside the Navigator import check (same root cause). This read the
// deleted root storysculpt.html and had been throwing ENOENT since the Hub pages
// moved into api/_hub (WBR-385), so the whole `npm test` chain was red. It now
// reads the page the server serves. The copy assertions were also realigned to
// the trust contract StorySculpt actually ships after the WBR-415 chat rebuild:
// the bundle/pricing and cancellation lines were removed on purpose (standalone
// apps, no pricing claim), and the one-question-at-a-time / recording lines were
// reworded for the chat interface. What a trust gate must still guarantee, and
// does, is a named responsible owner, a support route, honest AI and saved-work
// disclosures, the "not a blank AI chat" distinction, the 5E mechanism, and the
// finished-script actions.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'api', '_hub', 'storysculpt.html'), 'utf8');
const script = readFileSync(join(root, 'js', 'storysculpt.js'), 'utf8');

const checks = [
  ['responsible owner', /Built and supported by David Bee/],
  ['support route', /mailto:email@davidbee\.me/],
  ['AI provider disclosure', /sent to DeepSeek/],
  ['saved-work disclosure', /saved to your Studio account/],
  ['generic AI distinction', /Not another blank AI chat/],
  ['5E mechanism', /Entertainment, Enragement, Epiphany, Empathy, or Education/]
];

const failures = checks.filter(([, pattern]) => !pattern.test(html)).map(([label]) => label);
if (!/copy-story-output-bottom/.test(script) || !/start-another-story/.test(script)) {
  failures.push('finished-script actions');
}

if (failures.length) {
  console.error(`StorySculpt trust check failed: ${failures.join(', ')}`);
  process.exit(1);
}

console.log(`StorySculpt trust check passed (${checks.length + 1} assertions) against the served page.`);
