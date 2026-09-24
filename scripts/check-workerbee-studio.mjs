import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase_migrations/2026-08-10-add-private-workerbee-studio.sql');
const privateApiMigration = read('supabase_migrations/2026-08-10-add-workerbee-private-api.sql');
const operatingMigration = read('supabase_migrations/2026-08-10-add-workerbee-operating-modules.sql');
const diagnosticMigration = read('supabase_migrations/2026-08-11-allow-workerbee-diagnostic-updates.sql');
const itemNotesMigration = read('supabase_migrations/2026-09-14-generalize-workerbee-item-notes.sql');
const clientWorkspaceMigration = read('supabase_migrations/2026-09-24-workerbee-client-workspace.sql');
const clientPlanContinuityMigration = read('supabase_migrations/2026-09-24-workerbee-client-plan-continuity.sql');
const api = read('api/workerbee.js');
const client = read('js/workerbee.js');
const dashboard = read('dashboard.html');
const todo = read('todo.html');
const analytics = read('analytics.html');
const vercel = JSON.parse(read('vercel.json'));
const momentumHubImages = [
  '1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg',
  '6.jpg', '7.jpg', '8.jpg', '9.jpg', '10.jpg',
  'boardroom-perspectives.jpg', 'certainty-app.jpg',
  'certainty-session.jpg', 'creator-economy.jpg', 'david-portrait.jpg',
  'decision-branches.jpg', 'expertise-paths.jpg', 'first-week.jpg',
  'hero-momentum.jpg', 'hub-home.jpg', 'it-works.jpg',
  'jenny-evening.jpg', 'momentum-month.jpg', 'navigator-output.jpg',
  'session-calendar.jpg', 'storysculpt-flow.jpg', 'value-stack.jpg',
  'waiting-cost.jpg', 'who-its-for.jpg',
];

for (const table of ['workerbee_sections', 'workerbee_tasks', 'workerbee_updates', 'workerbee_journal', 'workerbee_read_state', 'workerbee_change_history']) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS.`);
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`), `${table} must deny direct browser grants.`);
  assert.match(migration, new RegExp(`on public\\.${table} for all to anon, authenticated using \\(false\\) with check \\(false\\)`), `${table} needs a deny policy.`);
}

for (const table of ['workerbee_clients', 'workerbee_events', 'workerbee_products']) {
  assert.match(operatingMigration, new RegExp(`alter table public\.${table} enable row level security`), `${table} must enable RLS.`);
  assert.match(operatingMigration, new RegExp(`revoke all on table public\.${table} from anon, authenticated`), `${table} must deny direct browser grants.`);
}

assert.match(api, /authenticatedAdmin\(req\)/, 'The API must verify David through the existing admin boundary.');
assert.match(api, /WORKERBEE_STUDIO_SECRET/, 'The provider-neutral bridge must use a server-only secret.');
assert.match(api, /WORKERBEE_CHATGPT_SECRET/, 'The private ChatGPT Action must use a dedicated secret rather than sharing the internal Studio secret.');
assert.match(api, /serverSecret: internalSecret/, 'The dedicated ChatGPT Action secret must never be forwarded to the database authorizer.');
assert.match(api, /workerbee_bootstrap/, 'Reads must use the narrow WorkerBee database function.');
assert.match(api, /workerbee_mutate/, 'Writes must use the narrow WorkerBee database function.');
assert.match(api, /workerbee_note_mutate/, 'Notes on either ToDo item type must use the narrow note function.');
assert.match(api, /workerbee_client_mutate/, 'Private client workspace writes must use their narrow mutation function.');
assert.doesNotMatch(api, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, 'The WorkerBee API must not require a database master key.');
assert.doesNotMatch(client, /SERVICE_ROLE|SUPABASE_SECRET|WORKERBEE_STUDIO_SECRET/, 'No server credential may enter browser code.');
assert.match(client, /onAuthStateChange[\s\S]*setTimeout\(\(\) => activate/, 'Auth hydration must leave the Supabase callback before database work.');
assert.doesNotMatch(client, /\.innerHTML\s*=/, 'WorkerBee client rendering must not inject untrusted HTML.');
assert.match(todo, /data-workerbee-surface="todo"/, '/todo must use the focused todo surface.');
assert.match(analytics, /data-workerbee-surface="analytics"/, '/analytics must remain a first-class WorkerBee surface.');
assert.match(analytics, /id="analytics-chart"/, '/analytics must retain its delivery chart.');
assert.match(analytics, /id="analytics-demerits"/, '/analytics must retain the demerit ledger.');
for (const page of [dashboard, todo, analytics]) assert.match(page, /href="\/analytics"/, 'Every WorkerBee surface must link to Analytics.');
assert.doesNotMatch(todo, /Needs David|Journal|deadlines|progress/i, '/todo must not become a dashboard.');
assert.match(dashboard, /Needs David/, '/dashboard must make David-facing decisions visible.');
assert.match(dashboard, /id="journal"/, 'Journal must live inside /dashboard.');
assert.match(dashboard, /Clients and meetings/, 'The compact client module must live on /dashboard.');
assert.match(dashboard, /Events and launches/, 'The compact launch module must live on /dashboard.');
assert.match(dashboard, /App freshness/, 'The compact product module must live on /dashboard.');
assert.match(client, /reorder_outcomes/, 'Daily outcomes must be directly reorderable.');
assert.match(client, /setOutcomeStatus/, 'Daily outcomes must support direct status changes.');
assert.match(client, /itemThread\(item, \{ update_id: item\.id \}\)/, 'Published Board cards must expose the same instruction thread as editable tasks.');
assert.match(client, /itemThread\(task, \{ task_id: task\.id \}\)/, 'Editable tasks must retain their instruction thread.');
assert.match(dashboard, /id="diagnostics-panel"/, 'WorkerBee diagnostics must stay separate from business work.');
assert.ok(dashboard.indexOf('id="diagnostics-panel"') < dashboard.indexOf('aria-label="WorkerBee operating health and grade"'), 'Health and grade must sit below the primary business dashboard.');
assert.match(dashboard, /id="daily-report"/, 'The dashboard must expose a durable same-day morning and afternoon report.');
assert.match(client, /source === 'daily-report'/, 'The dashboard must render the canonical daily report independently of last-visit filtering.');
assert.match(dashboard, /Four-cycle operating reports/, 'The Dashboard must expose both retained four-cycle WorkerBee reports.');
assert.match(dashboard, /Today \+ Yesterday/, 'The retained report window must be unmistakably labeled.');
assert.match(client, /period\.updatedAt/, 'Each Daily Report cycle must render its own timestamp.');
assert.match(client, /function dailyReportUpdates[\s\S]*slice\(0, 2\)/, 'The Dashboard must render both Today and Yesterday rather than only the newest report.');
assert.match(client, /reportDayLabel[\s\S]*Yesterday/, 'The prior report must be labeled Yesterday rather than looking current.');
assert.match(client, /renderReportPeriod\('Moltbook'/, 'The Moltbook fieldwork slot must render independently.');
assert.match(client, /renderReportPeriod\('Late night'/, 'The Late Night build slot must render independently.');
assert.match(client, /Array\.isArray\(period\.publicActions\)/, 'Daily report periods must render their structured public actions.');
assert.match(client, /link\.href = item\.url/, 'Public actions must link to their canonical recorded URL.');
assert.match(client, /noopener noreferrer/, 'Public action links must open without sharing opener access.');
assert.match(client, /function formatDateTime/, 'Dashboard records must share one explicit date and time formatter.');
assert.match(client, /Latest session/, 'Client cards must show when the latest session happened.');
assert.match(client, /Record updated/, 'Dashboard modules must expose when their source record last changed.');
assert.match(diagnosticMigration, /'diagnostic'/, 'The repository must preserve the live diagnostic update kind.');
assert.match(privateApiMigration, /workerbee_authorized/, 'The private API must check the admin session or bridge secret.');
assert.match(privateApiMigration, /extensions\.digest\(coalesce\(p_server_secret/, 'The bridge secret must be compared by digest.');
assert.match(privateApiMigration, /revoke all on function public\.workerbee_bootstrap\(text\) from public/, 'The read function must not retain PUBLIC execution.');
assert.match(privateApiMigration, /revoke all on function public\.workerbee_mutate\(text, jsonb, text\) from public/, 'The write function must not retain PUBLIC execution.');
assert.match(itemNotesMigration, /num_nonnulls\(task_id, update_id\) = 1/, 'Every note must belong to exactly one ToDo item.');
assert.match(itemNotesMigration, /alter table public\.workerbee_task_notes enable row level security/, 'Generalized notes must retain RLS.');
assert.match(itemNotesMigration, /revoke all on table public\.workerbee_task_notes from anon, authenticated/, 'Generalized notes must retain denied direct access.');
assert.match(itemNotesMigration, /revoke all on function public\.workerbee_note_mutate\(text, jsonb, text\) from public, anon, authenticated/, 'The note function must not retain PUBLIC execution.');
assert.match(itemNotesMigration, /where n\.update_id = u\.id/, 'Bootstrap must return Board-item notes with their item.');
assert.match(clientWorkspaceMigration, /alter table public\.workerbee_client_notes enable row level security/, 'Private client notes must retain RLS.');
assert.match(clientWorkspaceMigration, /revoke all on table public\.workerbee_client_notes from anon, authenticated/, 'Client notes must deny direct browser access.');
assert.match(clientWorkspaceMigration, /workerbee_client_mutate/, 'Client workspace mutations need a dedicated, authorized function.');
assert.match(clientWorkspaceMigration, /revoke all on function public\.workerbee_client_mutate\(text, jsonb, text\) from public, anon, authenticated/, 'Client mutations must not retain PUBLIC execution.');
assert.match(clientWorkspaceMigration, /'clients', coalesce/, 'Bootstrap must return the private client workspace in its one authorized read.');
assert.match(clientPlanContinuityMigration, /plan_version integer not null default 1/, 'Client plans need a durable version for safe concurrent saves.');
assert.match(clientPlanContinuityMigration, /workerbee_client_changes enable row level security/, 'Private client changes must retain RLS.');
assert.match(clientPlanContinuityMigration, /revoke all on table public\.workerbee_client_changes from anon, authenticated/, 'Client changes must deny direct browser access.');
assert.match(clientPlanContinuityMigration, /'create_client_change'/, 'Client updates need a dated change action.');
assert.match(clientPlanContinuityMigration, /plan_version = v_expected_version/, 'A stale client-plan save must be refused rather than overwriting current work.');
assert.match(api, /create_client_change/, 'The private API must route dated client changes through the narrow client mutation path.');
assert.match(api, /expected_plan_version/, 'The private API must require an expected version before saving a client plan.');
assert.match(todo, /data-todo-owner="clients"/, 'The Todo page must expose the third private Clients tab.');
assert.match(client, /function renderClientWorkspace/, 'The client tab must render private Living Plans and notes.');
assert.match(client, /link_task_client/, 'New manual Todos must be linkable to a specific client.');
assert.match(client, /Active commitments/, 'Client cards must render structured commitments instead of a second editable checklist.');
assert.match(client, /Recent changes/, 'Client cards must show a dated history of plan-changing evidence.');

const rewriteMap = Object.fromEntries(vercel.rewrites.map(item => [item.source, item.destination]));
assert.equal(rewriteMap['/dashboard'], '/dashboard.html');
assert.equal(rewriteMap['/todo'], '/todo.html');
assert.equal(rewriteMap['/analytics'], '/analytics.html');
assert.match(client, /surface === 'analytics'\) renderAnalytics/, 'The shared client must hydrate the Analytics surface.');
assert.match(client, /function metricSnapshots/, 'Analytics must read the published metrics snapshots.');

// These are public media dependencies for the Momentum Hub sales-page source.
// They existed only on a divergent branch and every production URL returned
// 404 on 2026-09-14. A page-reference check cannot catch a missing binary, so
// require the complete uploaded library and verify that every file is a JPEG.
for (const image of momentumHubImages) {
  const bytes = fs.readFileSync(new URL(`../assets/eee/${image}`, import.meta.url));
  assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${image} must remain a valid JPEG asset.`);
}

console.log('WorkerBee Studio boundaries, routes, private data rules, and focused Todo contract passed.');
