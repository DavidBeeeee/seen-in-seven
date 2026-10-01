// Rebuild-parity guard for the Next Step Navigator generation core. WBR-368.
//
// This is the guard the analytics-branch loss proved we lacked: a rebuilt feature
// can quietly stop doing something its predecessor did, and nothing notices. It
// captures the core's behavior over the fixed evaluation set as a golden
// signature (committed to navigator-parity.golden.json) and fails if a later
// rebuild changes any verdict: an input that used to normalize now rejected, an
// output that used to pass now falling back, or the safe fallback text drifting.
//
// Run:  node scripts/navigator-parity.mjs            compare to golden (exit 1 on drift)
//       node scripts/navigator-parity.mjs --update   rewrite golden (deliberate change)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAFE_FALLBACK, RESULT_FIELDS } from '../api/_lib/navigator-core.js';
import { loadCases, inputOutcome, outputOutcome } from './navigator-eval.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const goldenPath = path.join(root, 'scripts', 'navigator-parity.golden.json');

// The behavior signature: stable, order-independent, and sensitive to exactly the
// things a rebuild could silently break.
function signature() {
  const { inputs, modelOutputs } = loadCases();
  const sig = {
    resultFields: RESULT_FIELDS,
    safeFallback: SAFE_FALLBACK,
    inputs: {},
    outputs: {}
  };
  for (const c of inputs) sig.inputs[c.name] = inputOutcome(c.body).outcome;
  for (const c of modelOutputs) {
    const got = outputOutcome(c.raw);
    sig.outputs[c.name] = { source: got.source, valid: got.valid };
  }
  return sig;
}

function diff(golden, current, out, prefix) {
  const keys = new Set([...Object.keys(golden || {}), ...Object.keys(current || {})]);
  for (const key of keys) {
    const a = JSON.stringify(golden ? golden[key] : undefined);
    const b = JSON.stringify(current ? current[key] : undefined);
    if (a !== b) out.push(`${prefix}${key}: golden ${a} -> now ${b}`);
  }
}

function main() {
  const current = signature();

  if (process.argv.includes('--update')) {
    fs.writeFileSync(goldenPath, JSON.stringify(current, null, 2) + '\n');
    process.stdout.write('Wrote navigator-parity.golden.json from current core behavior.\n');
    return;
  }

  if (!fs.existsSync(goldenPath)) {
    process.stdout.write('FAIL: no golden file. Run `node scripts/navigator-parity.mjs --update` once to record it.\n');
    process.exit(1);
  }

  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const drifts = [];
  if (JSON.stringify(golden.resultFields) !== JSON.stringify(current.resultFields)) {
    drifts.push(`resultFields: golden ${JSON.stringify(golden.resultFields)} -> now ${JSON.stringify(current.resultFields)}`);
  }
  if (JSON.stringify(golden.safeFallback) !== JSON.stringify(current.safeFallback)) {
    drifts.push('safeFallback text changed (golden vs now differ)');
  }
  diff(golden.inputs, current.inputs, drifts, 'input/');
  diff(golden.outputs, current.outputs, drifts, 'output/');

  if (drifts.length) {
    process.stdout.write(`FAIL: Navigator core behavior drifted from golden in ${drifts.length} place(s).\n`);
    for (const d of drifts) process.stdout.write('  - ' + d + '\n');
    process.stdout.write('If this change is intentional, re-record with `node scripts/navigator-parity.mjs --update`.\n');
    process.exit(1);
  }

  const inputCount = Object.keys(current.inputs).length;
  const outputCount = Object.keys(current.outputs).length;
  process.stdout.write(`PASS: Navigator core matches golden across ${inputCount} input and ${outputCount} output case(s), fallback and fields unchanged.\n`);
}

main();
