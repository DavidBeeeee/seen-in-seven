import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The live Next Step Navigator page moved from the repo root into api/_hub when
// the Hub tools were gated server-side (WBR-385, commit d31cd9e). This check kept
// reading the deleted root navigator.html and had been throwing ENOENT ever since,
// taking the whole `npm test` chain down with it. It now reads the page the
// server actually serves and covers both halves of the tool: the roadmap builder
// and the durable Next Move record added in WBR-409.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'api', '_hub', 'navigator.html'), 'utf8');
const moveJs = fs.readFileSync(path.join(root, 'js', 'navigator.js'), 'utf8');

// The roadmap builder: the deterministic Bee-Formula audit that is the member's
// plan.
const roadmap = [
  'id="eee-access-gate"',
  'id="eee-app" hidden',
  'EEEStudio.initialize',
  'id="screen-questions"',
  'id="screen-results"',
  'id="screen-roadmap"',
  'id="screen-deep-dive"',
  'id="screen-assets"',
  'const QUESTIONS = [',
  'function renderRoadmapContent',
  'function renderCustomerJourney',
  'function renderEarningsCalc',
];

// The Next Move record: the server-persisted, returning move layer (WBR-409). It
// must be present on the page, wired to its script, and that script must expose
// the mount hook rather than self-initializing (one auth bootstrap).
const nextMove = [
  'id="screen-nextmove"',
  'id="navigator-objective"',
  'id="navigator-result"',
  'id="navigator-history"',
  'Choose my next move',
  'NavigatorMoves',
  '/js/navigator.js',
  // The idempotent move write is a module the page must actually load, or the
  // double-submit guard is dead code. WBR-005.
  '/js/navigator-moves-store.mjs',
];

for (const marker of [...roadmap, ...nextMove]) {
  if (!html.includes(marker)) throw new Error(`Navigator page is missing ${marker}`);
}

if (!moveJs.includes('window.NavigatorMoves')) {
  throw new Error('js/navigator.js must expose window.NavigatorMoves for the page to mount it.');
}
if (!moveJs.includes("from('navigator_moves')")) {
  throw new Error('js/navigator.js must read and write the durable navigator_moves record.');
}
if (!moveJs.includes('NavigatorMovesStore')) {
  throw new Error('js/navigator.js must save moves through NavigatorMovesStore so the write is the idempotent, tested path.');
}

// The store module itself must mint a key and upsert on the idempotency index,
// not plain-insert, or the migration's unique index guards nothing on this path.
const storeJs = fs.readFileSync(path.join(root, 'js', 'navigator-moves-store.mjs'), 'utf8');
for (const marker of ['newIdempotencyKey', "onConflict: 'user_id,idempotency_key'", 'ignoreDuplicates: true']) {
  if (!storeJs.includes(marker)) throw new Error(`js/navigator-moves-store.mjs is missing ${marker}`);
}

console.log('Next Step Navigator import checks passed for the roadmap builder, the durable Next Move record, and the idempotent write.');
