import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const privateRoot = resolve(root, 'launch/private-tiny-challenge');
const requiredFiles = [
  'README.md',
  'FACILITATOR_PLAYBOOK.md',
  'DAY_ONE_GUIDE.md',
  'templates/INTAKE.md',
  'templates/COMMITMENT.md',
  'templates/SESSION_NOTES.md',
  'templates/GRADUATION.md',
  'templates/RUN_SCORECARD.md',
  'validation-ledger.json'
];

for (const file of requiredFiles) await stat(resolve(privateRoot, file));

const ledger = JSON.parse(await readFile(resolve(privateRoot, 'validation-ledger.json'), 'utf8'));
if (ledger.schemaVersion !== 1 || ledger.status !== 'private_validation') throw new Error('Validation ledger status or schema is invalid.');
if (ledger.gate?.completedRunsRequired !== 10 || ledger.gate?.partnershipEnrollmentsRequired !== 5) throw new Error('Proof gates must remain 10 completed runs and 5 partnership enrollments.');

const completed = ledger.runs.filter((run) => run.status === 'complete');
const enrolled = completed.filter((run) => run.partnershipDecision === 'enrolled');
const requiredRunFields = ['id', 'participant', 'consent', 'sessions', 'scripts', 'blockers', 'recoverySessionUsed', 'partnershipDecision', 'eeeDecision', 'referrals', 'testimonial', 'changeForNextRun'];
for (const run of completed) {
  const missing = requiredRunFields.filter((field) => !(field in run));
  if (missing.length) throw new Error(`Completed run ${run.id || '(unknown)'} is missing: ${missing.join(', ')}`);
}

async function publicFunnelSources(directory = resolve(root, 'funnel-pages')) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'backups') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await publicFunnelSources(path));
    else if (/\.html$/i.test(entry.name)) files.push(path.slice(root.length + 1));
  }
  return files;
}

const publicSources = [
  ...await publicFunnelSources(),
  'launch/email-copy.md',
  'launch/create-decks.mjs'
];
for (const file of publicSources) {
  const content = await readFile(resolve(root, file), 'utf8');
  if (/\$\s*250|250\s*\/\s*month|250\s+per\s+month/i.test(content)) throw new Error(`Private partnership price leaked into public source: ${file}`);
}

const cycle = await readFile(resolve(root, 'js/777-launch-cycle.js'), 'utf8');
if (!/enabled:\s*false/.test(cycle)) throw new Error('Group launch cycle is not fail-closed.');

console.log(JSON.stringify({
  status: 'ok',
  completedRuns: completed.length,
  partnershipEnrollments: enrolled.length,
  groupReady: completed.length >= 10 && enrolled.length >= 5
}, null, 2));
