// WBR-458 continuation (Momentum 300 StorySculpt Developer 87, 88, 90): the
// deploy, rollback and mixed-version rules in docs/storysculpt-release.md,
// checked against the code so the document cannot drift from it.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateBody, replayFor } from '../api/storysculpt.js';
import { normalizeStoredProject } from '../api/_lib/storysculpt-integrity.js';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

const doc = readFileSync('docs/storysculpt-release.md', 'utf8');
check(/Interrupted deploy \(Developer 87\)/.test(doc) && /Rolling back a bad release \(Developer 88\)/.test(doc) && /Old and new side by side \(Developer 90\)/.test(doc), 'the release document covers all three rules');

// 87: a retried turn with the same key is replayed, not regenerated.
const project = { conversation: [{ role: 'user', content: 'idea' }, { role: 'assistant', content: 'saved reply', key: 'k-123' }] };
const replay = replayFor(project, { intent: 'interview', idempotencyKey: 'k-123' });
check(replay && replay.replayed === true && replay.content === 'saved reply', 'a request retried after an interrupted deploy is served the saved reply');
const client = readFileSync('js/storysculpt.js', 'utf8');
check(/expected_version: Number\(activeStory\.version\) \|\| 1/.test(client) && /keepUnsavedStory\(saving\.id, updates\)/.test(client), 'saves name their version and a failed save is kept on the device');

// 88: StorySculpt migrations are additive.
for (const file of readdirSync('supabase_migrations').filter(f => /storysculpt/.test(f))) {
  const sql = readFileSync('supabase_migrations/' + file, 'utf8').replace(/--.*$/gm, '');
  check(!/\bdrop\s+(?:table|column)\b/i.test(sql) && !/\balter\s+column\b[^;]*\btype\b/i.test(sql), file + ' must not drop or retype a column (additive migrations only)');
}
// A newer stored shape is readable by older code paths without failing.
const newer = normalizeStoredProject({ id, intake: { context: 'c', some_future_field: { x: 1 } }, conversation: [{ role: 'assistant', content: 'q', key: 'k', step: 's', future: true }], output: null, status: 'drafting', version: 9 });
check(newer.repairs.length === 0 && newer.project.intake.some_future_field.x === 1, 'unknown stored fields are carried, not repaired away');

// 90: an old client's body is accepted, unknown fields ignored.
const oldBody = { mode: 'rant', projectId: id, intent: 'interview', messages: [{ role: 'user', content: 'my idea' }] };
let parsed = null;
try { parsed = validateBody(oldBody); } catch (error) { failures.push('an old client body must be accepted: ' + error.message); }
check(parsed && parsed.idempotencyKey === null && parsed.target === 'step' && parsed.messages.length === 1, 'missing newer fields take safe defaults');
let parsedFuture = null;
try { parsedFuture = validateBody({ ...oldBody, someFutureFlag: true, clientVersion: 'x' }); } catch (error) { failures.push('unknown fields must be ignored: ' + error.message); }
check(parsedFuture && !('someFutureFlag' in parsedFuture), 'unknown request fields are ignored');
const trigger = readFileSync('supabase_migrations/2026-10-22-storysculpt-state-and-idempotency.sql', 'utf8');
check(/if new\.expected_version is not null and new\.expected_version <> old\.version then/.test(trigger), 'a save without expected_version (an older client) still succeeds');
const api = readFileSync('api/storysculpt.js', 'utf8');
check((api.match(/promptVersion: PROMPT_VERSION, model: MODEL_VERSION/g) || []).length >= 3, 'responses name the prompt version and model that wrote them');

// The client cache key moves with the client: the page's ?v= key was last
// changed no earlier than js/storysculpt.js was, and an uncommitted client
// change comes with an uncommitted key change.
try {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const clientAt = Number(git('log', '-1', '--format=%ct', '--', 'js/storysculpt.js')) || 0;
  const keyAt = Number(git('log', '-1', '-G', 'storysculpt\\.js\\?v=', '--format=%ct', '--', 'api/_hub/storysculpt.html')) || 0;
  check(keyAt >= clientAt, 'js/storysculpt.js changed after its ?v= key in api/_hub/storysculpt.html last moved; bump the key');
  const dirtyClient = git('status', '--porcelain', '--', 'js/storysculpt.js');
  if (dirtyClient) {
    const keyDiff = git('diff', 'HEAD', '--', 'api/_hub/storysculpt.html');
    check(/^\+.*\/js\/storysculpt\.js\?v=/m.test(keyDiff), 'js/storysculpt.js has uncommitted changes; bump its ?v= key with them');
  }
} catch (error) {
  failures.push('could not read git history for the cache-key rule: ' + error.message.split('\n')[0]);
}

if (failures.length) {
  console.error('check-storysculpt-release FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('PASS check-storysculpt-release: interrupted deploy recovers by replay and kept saves, migrations additive, old and new clients interoperate, client cache key moves with the client.');
