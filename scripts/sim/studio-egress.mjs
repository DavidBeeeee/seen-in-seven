// The whole shared Supabase project in one model (WBR-458, Developer 100), so the
// 60/80/95 percent warnings can be checked against what really reads it. Sizes are
// measured where the note says measured, from production on 2026-11-04. How often
// each thing happens is an assumption, written down here so it can be argued with.
// It proves the ledger's margin covers what stays uncounted, at today's size and at
// a thousand members, once the tooling report on wbr-458-evening-20261104 is applied;
// until then the WorkerBee lines below are not really counted. It is a model: nothing here has been compared against
// Supabase's own usage page, and that is the next thing to check.
//
//   node scripts/sim/studio-egress.mjs

import { EGRESS_UNMETERED_MARGIN, MONTHLY_EGRESS_BUDGET_BYTES } from '../../api/_lib/egress-budget.js';

const KB = 1024;
const MB = 1024 * 1024;
const DAYS = 30;

// A row's size in production, with the same 5x gzip the tooling reads measured.
const WIRE = 1 / 5;

// Mean rows and bytes from the production read. Grows with members where noted.
const SCRIPT_ROW = 156278 / 47;
const PROJECT_ROW = 152834 / 42;
const ONBOARDING_ROW = 49089 / 14;
const LOG_ROW = 517837 / 3032;
const LOG_ROWS_PER_USER = 3032 / 19;
const SCRIPT_ROWS_PER_USER = 47 / 19;

function readers(members, { activeShare, adminLoads, closeoutsPerDay, dashboardOpensPerDay }) {
  const active = members * activeShare;
  const adminTables = (members * SCRIPT_ROWS_PER_USER * SCRIPT_ROW + members * LOG_ROWS_PER_USER * LOG_ROW) * WIRE;
  return [
    // Counted by js/egress-report.js
    { name: 'SeenInSeven scripts and progress (js/supabase.js)', counted: 'client', bytes: 8 * active * 7 * SCRIPT_ROW * WIRE },
    { name: 'Sign-in restore: users, onboarding (js/supabase.js)', counted: 'client', bytes: 8 * active * (ONBOARDING_ROW + KB) * WIRE },
    { name: 'Hub guard reads on every page (js/eee-common.js)', counted: 'client', bytes: 40 * active * 2 * KB * WIRE },
    { name: 'StorySculpt projects and context (js/storysculpt.js)', counted: 'client', bytes: 8 * active * (3 * PROJECT_ROW + 2 * KB) * WIRE },
    { name: 'Vault shelf and items (js/vault.js)', counted: 'client', bytes: 4 * active * 8 * KB * WIRE },
    { name: 'Navigator and EEE state', counted: 'client', bytes: 4 * active * 5 * KB * WIRE },
    { name: 'Book files by signed URL, largest 505,492 bytes', counted: 'client (noted)', bytes: 2 * active * 505492 },
    { name: 'Admin pages, every row for every user', counted: 'client (every load)', bytes: adminLoads * adminTables },
    // Counted on the server
    { name: 'Certainty through /api/certainty', counted: 'server', bytes: 93 * MB * members / 1000 },
    { name: 'StorySculpt through /api/storysculpt', counted: 'server', bytes: 598 * MB * members / 1000 },
    { name: 'Dashboard through /api/workerbee (measured full read)', counted: 'server', bytes: dashboardOpensPerDay * DAYS * 4665639 * WIRE },
    { name: 'WorkerBee scripts, one closeout about 5 MB on the wire (measured)', counted: 'tooling report', bytes: closeoutsPerDay * DAYS * 5 * MB },
    { name: 'The warning check reading its own ledger, every 6 hours', counted: 'server', bytes: 120 * (members * 3 + 500) * 220 * WIRE },
    // Not counted: this is what the margin has to cover
    { name: 'Sign-in before a member token, check_email_exists, preauth', counted: null, bytes: 4 * members * 3 * KB * WIRE },
    { name: 'Guard reads in api/hub-page and api/navigator', counted: null, bytes: 40 * active * 400 },
    { name: 'Boardroom app, its own repository (about 49 call sites)', counted: null, bytes: 30 * active * 0.3 * 40 * KB * WIRE },
    { name: 'Boardroom documents, largest 73,345 bytes', counted: null, bytes: 4 * active * 0.3 * 73345 },
    { name: 'Hourly StorySculpt incident check', counted: null, bytes: 720 * (members / 10 + 10) * 220 * WIRE }
  ];
}

const SCENARIOS = [
  { label: 'Today (19 users, 5 active)', members: 19, activeShare: 5 / 19, adminLoads: 60, closeoutsPerDay: 7, dashboardOpensPerDay: 10 },
  { label: 'A thousand members', members: 1000, activeShare: 0.6, adminLoads: 60, closeoutsPerDay: 7, dashboardOpensPerDay: 10 }
];

const percent = (bytes) => (bytes / MONTHLY_EGRESS_BUDGET_BYTES * 100).toFixed(1) + '%';
const mb = (bytes) => (bytes / MB).toFixed(1).padStart(9) + ' MB';
let failed = false;

for (const scenario of SCENARIOS) {
  const rows = readers(scenario.members, scenario);
  const counted = rows.filter((row) => row.counted).reduce((sum, row) => sum + row.bytes, 0);
  const uncounted = rows.filter((row) => !row.counted).reduce((sum, row) => sum + row.bytes, 0);
  const needed = uncounted / counted;
  console.log(`\n${scenario.label}`);
  for (const row of [...rows].sort((a, b) => b.bytes - a.bytes)) {
    console.log(`${mb(row.bytes)}  ${(row.counted || 'NOT COUNTED').padEnd(20)} ${row.name}`);
  }
  console.log(`${mb(counted)}  counted, ${percent(counted)} of 5 GiB`);
  console.log(`${mb(uncounted)}  not counted, ${(needed * 100).toFixed(1)}% of counted; the ledger's margin is ${(EGRESS_UNMETERED_MARGIN * 100).toFixed(0)}%`);
  console.log(`${mb(counted + uncounted)}  whole project, ${percent(counted + uncounted)} of 5 GiB`);
  if (needed > EGRESS_UNMETERED_MARGIN) {
    failed = true;
    console.error(`FAIL: the margin does not cover what stays uncounted in "${scenario.label}".`);
  }
}

console.log('\nThe warnings fire on counted bytes times 1.25, so at this much actually counted:');
for (const threshold of [60, 80, 95]) {
  console.log(`  ${threshold}% warning at ${(threshold / (1 + EGRESS_UNMETERED_MARGIN)).toFixed(0)}% counted, ${((threshold / 100 / (1 + EGRESS_UNMETERED_MARGIN)) * 5).toFixed(2)} GiB`);
}
if (failed) process.exit(1);
console.log('\nPASS studio-egress: the margin covers what stays uncounted in every scenario.');
