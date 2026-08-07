import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const studio = read('js/studio.js');
const admin = read('admin.html');
const adminJs = read('js/admin-studio.js');
const migration = read('supabase_migrations/2026-08-07-add-studio-catalog-visibility.sql');

assert.match(index, /id="eee-card" hidden/, 'EEE must begin hidden to prevent a non-member flash.');
assert.ok(index.indexOf('/js/777-launch-cycle.js') < index.indexOf('/js/studio.js'), 'Launch timing must load before Studio visibility.');
assert.match(studio, /if \(unlocked\) return true;/, 'Members must always see EEE.');
assert.match(studio, /studioCatalogMode === 'visible'/, 'Always-show override is missing.');
assert.match(studio, /studioCatalogMode === 'hidden'/, 'Members-only override is missing.');
assert.match(studio, /return isEeeCartOpen\(\);/, 'Automatic cart-window visibility is missing.');
assert.match(admin, /value="automatic"/);
assert.match(admin, /value="visible"/);
assert.match(admin, /value="hidden"/);
assert.match(adminJs, /admin_set_studio_catalog_visibility/);
assert.match(migration, /enable row level security/);
assert.match(migration, /grant select on table public\.studio_catalog_settings to anon, authenticated/);
assert.match(migration, /revoke all on function public\.admin_set_studio_catalog_visibility\(text\) from public, anon/);

console.log('Studio catalog visibility checks passed for member access, launch timing, and admin overrides.');
