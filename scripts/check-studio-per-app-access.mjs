// Per-app Studio access. WBR-442, 2026-10-14.
//
// Each Momentum Hub app opens on its own key or the 'eee' bundle, the Hub
// workspace on any Hub app, and the admin page has a switch for each app. The
// database half (member_has_app, the seven member-data policies, Certainty
// booking) lives in supabase_migrations/2026-10-14-per-app-studio-access.sql
// and was verified against production when applied; this pins the code half
// and the migration's shape so neither drifts back to one shared key.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ACCESS_KEY } from '../api/hub-page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

// 1. Each app server checks its own key, never the shared one.
for (const [file, key] of [['storysculpt.js', 'storysculpt'], ['navigator.js', 'navigator'], ['certainty.js', 'certainty']]) {
  const src = read('api', file);
  assert.ok(src.includes(`target_app_key: '${key}'`), `${file} checks '${key}'`);
  assert.ok(!src.includes("target_app_key: 'eee'"), `${file} no longer checks the shared 'eee' key`);
}

// 2. Page gate: one key per page, the workspace on any Hub app.
assert.deepEqual(ACCESS_KEY, { storysculpt: 'storysculpt', navigator: 'navigator', vault: 'vault', certainty: 'certainty', eee: 'hub' });
const hubPage = read('api', 'hub-page.js');
assert.ok(hubPage.includes('hasToolAccess(bearer(req), ACCESS_KEY[tool])'), 'server gate uses the page key');
assert.ok(hubPage.includes("{ target_app_key: ACCESS }"), 'browser gate uses the page key');

const common = read('js', 'eee-common.js');
assert.ok(common.includes("target_app_key: eeePageAccessKey()"));
assert.ok(common.includes("rpc('my_hub_apps')") && common.includes('await eeeApplyAppAccess();'), 'the Hub hides apps a person does not have');
for (const html of ['eee', 'storysculpt', 'navigator', 'vault', 'certainty']) {
  assert.ok(read('api', '_hub', html + '.html').includes('eee-common.js?v=per-app-access-v1'), html + '.html loads the new shared script');
}

// 3. Studio home opens the Hub card for any one app, Boardroom for the bundle.
const studio = read('js', 'studio.js');
assert.ok(studio.includes('const eeeUnlocked = hubBundle || hubApps.length > 0;'));
assert.ok(studio.includes("hasStudioAccess('boardroom') || hubBundle"));

// 4. Admin: a switch per app, bundle-to-individual removal, and the enroll form.
const admin = read('js', 'admin-studio.js');
for (const key of ['seeninseven', 'storysculpt', 'navigator', 'vault', 'boardroom', 'certainty']) {
  assert.ok(new RegExp(`key: '${key}'`).test(admin), `admin has a switch for ${key}`);
  assert.ok(read('admin.html').includes(`id="enrollment-${key}"`), `enroll form offers ${key}`);
}
assert.ok(admin.includes('async function removeFromHub('), 'one app can be removed from a bundle member');
assert.ok(admin.includes('function reportAccessOutcome('), 'a removal that a purchase overrides is said out loud');

// 5. The migration routes every check through one rule.
const sql = read('supabase_migrations', '2026-10-14-per-app-studio-access.sql');
assert.ok(sql.includes("e.app_key = 'eee' and target_app_key in ('storysculpt', 'navigator', 'vault', 'certainty', 'boardroom')"), 'the bundle opens every Hub app, Boardroom included');
for (const policy of ['storysculpt_member_rows', 'storysculpt_member_context_row', 'navigator_member_row', 'navigator_moves_member_rows', 'navigator_roadmaps_member_rows', 'vault_members_can_read', 'vault_progress_member_rows']) {
  assert.ok(sql.includes('create policy ' + policy), policy + ' is rewritten');
}
assert.ok(sql.includes("'seeninseven', 'boardroom', 'eee', 'storysculpt', 'navigator', 'vault', 'certainty'"), 'admin functions accept the new keys');

console.log('PASS check-studio-per-app-access: each app on its own key or the bundle, Hub shows only granted apps, admin switch per app');
