// Studio sidebar and Community Business Cards placement (WBR-477, David 2026-11-14):
// Momentum Hub and Solution Vault groups start closed; order is SeenInSeven,
// Momentum Hub, Solution Vault, Certainty Sessions; CoMM Business Cards sits
// under the divider with WorkerBee and Administration; My Apps carries a
// Community Business Cards card; admin can edit a card through an admin RPC.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('index.html');
const sidebar = html.slice(html.indexOf('id="studio-sidebar"'), html.indexOf('</aside>', html.indexOf('id="studio-sidebar"')));
assert.ok(!/<details[^>]*\sopen[\s>]/.test(sidebar), 'sidebar groups must start closed');
const at = (s) => { const i = sidebar.indexOf(s); assert.ok(i >= 0, `sidebar missing ${s}`); return i; };
const order = ['<span>SeenInSeven</span>', '<span>Momentum Hub</span>', 'id="vault-nav-link"', '<span>Certainty Sessions</span>', 'id="management-divider"', '<span>CoMM Business Cards</span>', '<span>WorkerBee</span>', '<span>Administration</span>'].map(at);
for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], 'sidebar order is wrong');
assert.match(html, /id="cards-card"[\s\S]*?<h3>Community Business Cards<\/h3>/);
assert.match(html, /\/assets\/business-cards\/cards-preview\.svg/);
assert.ok(fs.existsSync(new URL('../assets/business-cards/cards-preview.svg', import.meta.url)));
const js = read('js/studio.js');
assert.match(js, /el\('management-divider'\)\.hidden = !signedIn/);
assert.match(js, /el\('cards-nav-item'\)\.hidden = !signedIn/);
const admin = read('js/admin-studio.js');
assert.match(admin, /admin_update_network_directory_entry/);
const sql = read('supabase_migrations/2026-11-14_network_directory_admin_edit.sql');
assert.match(sql, /vault_caller_is_admin\(\)/);
assert.match(sql, /revoke all on function public\.admin_update_network_directory_entry[^;]*from public, anon/);
console.log('PASS check-studio-sidebar-cards: closed groups, SIS/MH/SV/CS order, CoMM Business Cards under the divider, My Apps card, admin edit RPC.');
