import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const supabase = readFileSync(new URL('../js/supabase.js', import.meta.url), 'utf8');
const blueprint = readFileSync(new URL('../api/_lib/blueprints.txt', import.meta.url), 'utf8');
const generate = readFileSync(new URL('../api/generate.js', import.meta.url), 'utf8');

const helperStart = app.indexOf('function normalizeJourneyLevel');
const helperEnd = app.indexOf('\nconst ONBOARDING_ORDER', helperStart);
assert(helperStart !== -1 && helperEnd !== -1, 'Could not locate the per-level journey state helpers.');

function helperContext(state) {
  const context = { state };
  runInNewContext(app.slice(helperStart, helperEnd), context);
  return context;
}

const state = {
  level: 1,
  videos: {
    script_v0: 'L1 script',
    _undo_v0: { stack: ['L1 first', 'L1 script'], pointer: 1 },
    locked_v0: true
  },
  videoStatus: { 0: 'filmed' },
  videoPosted: { 0: { posted: true, url: 'https://example.com/l1' } },
  videoPostedByLevel: { 1:{}, 2:{} },
  videoAnswersByLevel: { 1:{ v0p0:'L1 answer' }, 2:{ v0p0:'L2 answer' } },
  l1Videos: null,
  l1VideoStatus: null,
  l2Videos: null,
  l2VideoStatus: null
};
const helpers = helperContext(state);

helpers.archiveActiveJourneyLevel(1);
state.level = 2;
helpers.activateJourneyLevel(2);
assert(!state.videos.script_v0, 'L1 script leaked into Level 2.');
assert(!state.videoPosted[0], 'L1 posted state leaked into Level 2.');
assert(state.videos.v0p0 === 'L2 answer', 'Level 2 answers were not restored.');

state.videos.script_v0 = 'L2 script';
state.videos._undo_v0 = { stack: ['L2 first', 'L2 script'], pointer: 1 };
state.videoStatus[0] = 'skipped';
state.videoPosted[0] = { posted:true, url:'https://example.com/l2' };
helpers.archiveActiveJourneyLevel(2);

state.level = 1;
helpers.activateJourneyLevel(1);
assert(state.videos.script_v0 === 'L1 script', 'Level 1 script did not survive a round trip.');
assert(state.videos._undo_v0.stack[1] === 'L1 script', 'Level 1 undo history did not survive a round trip.');
assert(state.videoStatus[0] === 'filmed', 'Level 1 filming state did not survive a round trip.');
assert(state.videoPosted[0].url.endsWith('/l1'), 'Level 1 posted URL did not survive a round trip.');

state.level = 2;
helpers.activateJourneyLevel(2);
assert(state.videos.script_v0 === 'L2 script', 'Level 2 script did not survive a round trip.');
assert(state.videos._undo_v0.stack[1] === 'L2 script', 'Level 2 undo history did not survive a round trip.');
assert(state.videoStatus[0] === 'skipped', 'Level 2 filming state did not survive a round trip.');
assert(state.videoPosted[0].url.endsWith('/l2'), 'Level 2 posted URL did not survive a round trip.');
assert(!helpers.journeyFilmingComplete({}), 'An empty Level 1 archive can trigger the dual-completion state.');
assert(
  helpers.journeyFilmingComplete(Object.fromEntries(Array.from({length:7}, (_, index) => [index, 'filmed']))),
  'A fully filmed journey is not recognized as complete.'
);

const legacyState = {
  level: 2,
  videos: { script_v0:'Legacy L2 script' },
  videoStatus: { 0:'filmed' },
  videoPosted: { 0:{ posted:true, url:'https://example.com/legacy-l2' } },
  videoAnswersByLevel: {},
  videoPostedByLevel: {1:{},2:{}},
  l1Videos: { script_v0:'Archived L1 script' },
  l1VideoStatus: {0:'filmed'},
  l2Videos: null,
  l2VideoStatus: null
};
const legacyHelpers = helperContext(legacyState);
legacyHelpers.migrateJourneyLevelState();
legacyHelpers.activateJourneyLevel(2);
assert(legacyState.videos.script_v0 === 'Legacy L2 script', 'Legacy active L2 state was not migrated.');
assert(legacyState.videoPosted[0].url.endsWith('/legacy-l2'), 'Legacy L2 posted state was not migrated.');
assert(legacyState.l1Videos.script_v0 === 'Archived L1 script', 'Legacy L1 archive was overwritten during migration.');

assert(
  supabase.includes("return String(Number(level) === 2 ? 2 : 1) + ':' + String(videoIndex);"),
  'Database reconciliation is not keyed by both level and video.'
);
assert(
  supabase.includes('async function restoreJourneyLevelFromDatabase(level)'),
  'Level switching cannot restore the selected journey from the database.'
);
assert(
  generate.includes('error.recoverableGeneration === true'),
  'Recoverable Hook and Open Loop failures do not reach the outer retry.'
);

assert(!blueprint.includes('They have not yet met the guide who helps the first epiphany land.'), 'L2V2 still requires a guide.');
assert(!blueprint.includes('Save the first professional reframe and the influence of the guide for Video 3.'), 'L2V2 still reserves a mandatory guide.');
assert(!blueprint.includes('CTA creates anticipation for a real guide'), 'L2V2 CTA still promises a mandatory guide.');

const fallbackStart = app.indexOf('function compileMvoBeats()');
const fallbackEnd = app.indexOf('\nfunction copyAllScripts', fallbackStart);
const fallback = app.slice(fallbackStart, fallbackEnd);
assert(!fallback.includes("label:'EXPERTISE'"), 'L2V1 fallback still uses the old expertise architecture.');
assert(!fallback.includes("label:'THE MARKET GAP'"), 'L2V1 fallback still uses the old market-gap architecture.');
assert(!fallback.includes("label:'THE SOLUTION DECLARATION'"), 'L2V1 fallback still uses the old solution architecture.');
assert(!fallback.includes('glad you landed on this'), 'L2V1 fallback still contains banned editorial phrasing.');

assert(!app.includes('What The Hardest Part Taught Me'), 'Visible L2V6 guidance still forces Video 5 causality.');
assert(!app.includes('Screenshot-worthy.'), 'Visible L2V3 guidance still teaches guru-style output.');
assert(!app.includes('what the hardest part proved was incomplete'), 'Visible L2V6 beats still force the fall as their source.');

console.log('Cross-level state, retry routing, fallback, and visible journey guidance checks passed.');
