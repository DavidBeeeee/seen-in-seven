import { readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
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
  supabase.includes("if (p.is_locked && state.videos['script_v' + p.video_index])"),
  'Database restore no longer requires both an active lock and a current script.'
);
assert(
  supabase.includes("delete state.videos['locked_v' + p.video_index]"),
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

console.log('Active script lock-state checks passed.');
