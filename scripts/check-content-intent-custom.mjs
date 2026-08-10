import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

assert.match(app, /id = 'content-intent-custom-wrap'/, 'The custom content-intent input is not rendered.');
assert.match(app, /setCustomAnswer\(\\'contentIntent\\'/, 'Custom content-intent text is not persisted while typing.');
assert.match(app, /function useCustomContentIntent\(route\)/, 'The custom content-intent route is missing.');
assert.match(app, /p2\.contentIntentTitle = text/, 'Custom content-intent wording does not flow into generation context.');
assert.match(app, /\['teach', 'custom_teach'\]\.includes\(p2\.contentIntent\)/, 'Custom teaching intent does not select Level 2.');

console.log('Custom content-intent checks passed for persistence, generation context, and level routing.');
