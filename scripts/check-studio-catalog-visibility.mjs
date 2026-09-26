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

const sidebar = index.split('<aside class="studio-sidebar"')[1].split('</aside>')[0];
const hub = sidebar.split('<span>Momentum Hub</span>')[1].split('</details>')[0];
for (const route of ['/eee', '/storysculpt', '/navigator', '/boardroom']) assert.ok(hub.includes(`href="${route}"`));
for (const route of ['/vault', '/certainty']) assert.ok(!hub.includes(`href="${route}"`), `${route} belongs outside the Hub group.`);
for (const id of ['workerbee-nav-item', 'admin-nav-item']) assert.match(sidebar, new RegExp(`id="${id}"[^>]+hidden`));
const accountMenu = index.split('id="account-menu"')[1];
for (const route of ['/seeninseven', '/eee', '/dashboard', '/admin']) assert.ok(!accountMenu.includes(`href="${route}"`), 'App navigation must not be duplicated in the account menu.');
assert.ok(!studio.includes("el('workerbee-menu-item')"), 'Removed menu elements must not cause a render error.');
assert.match(read('css/studio.css'), /\.studio-home \.studio-sidebar \{[^}]*display: flex/);
console.log('Studio catalog and nested navigation checks passed, including private links, mobile access and no duplicate account navigation.');
