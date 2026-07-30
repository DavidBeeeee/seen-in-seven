import { readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../seeninseven.html', import.meta.url), 'utf8');
const supabase = readFileSync(new URL('../js/supabase.js', import.meta.url), 'utf8');
const points = readFileSync(new URL('../js/points.js', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../supabase_migrations/2026-07-27-active-script-lock-state.sql', import.meta.url),
  'utf8'
);

assert(
  /add column if not exists is_locked boolean not null default false/i.test(migration),
  'The active lock-state column is missing.'
);
assert(
  /s\.is_current = true/i.test(migration),
  'The lock-state backfill no longer requires a current script.'
);
assert(
  supabase.includes('saveVideoLockStateToDb(videoNumber - 1, level, false)'),
  'Starting a script over no longer clears its persisted active lock.'
);
assert(
  supabase.includes("_saveQueue.push({ type: 'clear_script', videoNumber, level })"),
  'A restart performed before authentication can no longer be reconciled later.'
);
assert(
  supabase.includes("if (p.is_locked && videos['script_v' + p.video_index])"),
  'Database restore no longer requires both an active lock and a current script.'
);
assert(
  supabase.includes("delete videos['locked_v' + p.video_index]"),
  'Database restore no longer removes stale local locks.'
);
assert(
  app.includes('queueLockStateSave(idx, state.level || 1, false)'),
  'Unlocking a script no longer persists the unlocked state.'
);
assert(
  (app.match(/const isLocked = (?:!!hasScript|hasScript) &&/g) || []).length >= 3,
  'A dashboard or tracker can still display Locked without a script.'
);
assert(
  points.includes("vids['ever_locked_v' + i]"),
  'Historical lock points are no longer preserved separately from active lock state.'
);
assert(
  app.includes('function isScriptLocked(idx)') &&
    app.includes("state.videos['script_v' + scriptIdx]") &&
    app.includes("state.videos['locked_v' + scriptIdx]"),
  'The editing boundary no longer requires both an active script and its active lock.'
);
assert(
  app.includes('function requireUnlockedScript(idx)') &&
    app.includes('function _updateScriptEditControls(idx)'),
  'The shared locked-script editing guard is missing.'
);
assert(
  /async function regenerateSection\(videoIdx, sectionKey, btnEl\) \{\s*if \(!requireUnlockedScript\(videoIdx\)\) return;/.test(app),
  'Section regeneration can bypass the active script lock.'
);
assert(
  /async function regenerateFullScript\(videoIdx, btnEl\) \{\s*if \(!requireUnlockedScript\(videoIdx\)\) return;/.test(app),
  'Full-script regeneration can bypass the active script lock.'
);
assert(
  /function undoScript\(\) \{[\s\S]{0,120}if \(!requireUnlockedScript\(idx\)\) return;/.test(app) &&
    /function redoScriptStep\(\) \{[\s\S]{0,120}if \(!requireUnlockedScript\(idx\)\) return;/.test(app),
  'Undo or redo can still edit a locked script.'
);
assert(
  /async function handleRestoreVersion\(scriptId, idx\) \{\s*if \(!requireUnlockedScript\(idx\)\) return;/.test(app),
  'Version restore can bypass the active script lock.'
);
assert(
  /function confirmDeleteAndStartOver\(\) \{\s*if \(!requireUnlockedScript\(currentVideoIndex\)\) return;/.test(app),
  'Delete and re-answer can bypass the active script lock.'
);
assert(
  html.includes('id="sv-locked-notice"') &&
    html.includes('onclick="unlockScript()">Unlock to Edit</button>'),
  'The locked script view no longer offers an explicit Unlock to Edit action.'
);

console.log('Active script lock-state checks passed.');
