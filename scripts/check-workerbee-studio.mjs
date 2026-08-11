import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase_migrations/2026-08-10-add-private-workerbee-studio.sql');
const privateApiMigration = read('supabase_migrations/2026-08-10-add-workerbee-private-api.sql');
const api = read('api/workerbee.js');
const client = read('js/workerbee.js');
const dashboard = read('dashboard.html');
const todo = read('todo.html');
const vercel = JSON.parse(read('vercel.json'));

for (const table of ['workerbee_sections', 'workerbee_tasks', 'workerbee_updates', 'workerbee_journal', 'workerbee_read_state', 'workerbee_change_history']) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS.`);
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`), `${table} must deny direct browser grants.`);
  assert.match(migration, new RegExp(`on public\\.${table} for all to anon, authenticated using \\(false\\) with check \\(false\\)`), `${table} needs a deny policy.`);
}

assert.match(api, /authenticatedAdmin\(req\)/, 'The API must verify David through the existing admin boundary.');
assert.match(api, /WORKERBEE_STUDIO_SECRET/, 'The provider-neutral bridge must use a server-only secret.');
assert.match(api, /workerbee_bootstrap/, 'Reads must use the narrow WorkerBee database function.');
assert.match(api, /workerbee_mutate/, 'Writes must use the narrow WorkerBee database function.');
assert.doesNotMatch(api, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, 'The WorkerBee API must not require a database master key.');
assert.doesNotMatch(client, /SERVICE_ROLE|SUPABASE_SECRET|WORKERBEE_STUDIO_SECRET/, 'No server credential may enter browser code.');
assert.match(client, /onAuthStateChange[\s\S]*setTimeout\(\(\) => activate/, 'Auth hydration must leave the Supabase callback before database work.');
assert.doesNotMatch(client, /\.innerHTML\s*=/, 'WorkerBee client rendering must not inject untrusted HTML.');
assert.match(todo, /data-workerbee-surface="todo"/, '/todo must use the focused todo surface.');
assert.doesNotMatch(todo, /Needs David|Journal|deadlines|progress/i, '/todo must not become a dashboard.');
assert.match(dashboard, /Needs David/, '/dashboard must make David-facing decisions visible.');
assert.match(dashboard, /id="journal"/, 'Journal must live inside /dashboard.');
assert.match(privateApiMigration, /workerbee_authorized/, 'The private API must check the admin session or bridge secret.');
assert.match(privateApiMigration, /extensions\.digest\(coalesce\(p_server_secret/, 'The bridge secret must be compared by digest.');
assert.match(privateApiMigration, /revoke all on function public\.workerbee_bootstrap\(text\) from public/, 'The read function must not retain PUBLIC execution.');
assert.match(privateApiMigration, /revoke all on function public\.workerbee_mutate\(text, jsonb, text\) from public/, 'The write function must not retain PUBLIC execution.');

const rewriteMap = Object.fromEntries(vercel.rewrites.map(item => [item.source, item.destination]));
assert.equal(rewriteMap['/dashboard'], '/dashboard.html');
assert.equal(rewriteMap['/todo'], '/todo.html');

console.log('WorkerBee Studio boundaries, routes, private data rules, and focused Todo contract passed.');
