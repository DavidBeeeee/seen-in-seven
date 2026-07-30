import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const supabase = readFileSync(new URL('../js/supabase.js', import.meta.url), 'utf8');
const helperStart = app.indexOf('function journeyProgressVideoCount');
const helperEnd = app.indexOf('\nfunction updateProgress', helperStart);
assert(helperStart !== -1 && helperEnd !== -1, 'Could not locate the journey progress counter.');

const helperSource = app.slice(helperStart, helperEnd).replace(
  'function journeyProgressVideoCount',
  'function'
);
const countProgress = runInNewContext('(' + helperSource + ')');

assert(countProgress({}, {}) === 0, 'An untouched journey should have zero completed chapters.');
assert(
  countProgress({}, { script_v0:'draft', script_v1:'draft' }) === 2,
  'Generated scripts no longer advance the journey meter.'
);
assert(
  countProgress({ 0:'filmed', 2:'skipped' }, { script_v0:'draft', script_v1:'draft' }) === 3,
  'The journey meter double-counts scripts or ignores filmed and skipped chapters.'
);
assert(
  app.includes('const activeLevel = Number(state.level) === 2 ? 2 : 1;'),
  'The progress meter is no longer resilient to a restored string level.'
);
assert(
  app.includes("activeLevel === 1 && wrap.classList.contains('progress-l1-complete')") &&
    app.includes("activeLevel === 2 && wrap.classList.contains('progress-l2-complete')"),
  'A completed level can still freeze the other level progress meter.'
);
assert(
  app.includes('state.level       = Number(data.level)') &&
    supabase.includes('state.level   = Number(user.level)') &&
    supabase.includes('state.level   = Number(d.level)'),
  'A restored level can still enter application state as a string.'
);

console.log('Journey progress meter checks passed for scripts, filming states, level switching, and restored accounts.');
