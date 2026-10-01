// Evaluation harness for the Next Step Navigator generation core. WBR-368.
//
// The 300 scored NSN's generation FAIL across evaluation and fallback: there was
// no fixed set of hard inputs the tool was proven to survive, and no safe
// fallback when a result was unusable. This is that set. It runs the real core
// from api/_lib/navigator-core.js, the same code api/navigator.js ships, against
// vague, broad, conflicting, adversarial, oversized and malformed cases, and it
// asserts the one property the member depends on: every case ends in a usable
// four-field result or the safe fallback, never a raw error.
//
// Run: node scripts/navigator-eval.mjs   (exit 0 = all green)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeInput,
  coerceResult,
  isValidResult,
  SAFE_FALLBACK,
  RESULT_FIELDS
} from '../api/_lib/navigator-core.js';

const SAFE_INPUT_MESSAGE = 'Complete each Navigator prompt before choosing the next move.';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Keep the case file readable: a string value like "x__OVERSIZE_1300__" expands
// to that char repeated 1300 times, so a 1300-char field is one short token on
// disk rather than a wall of x.
function expand(value) {
  if (typeof value !== 'string') return value;
  const match = value.match(/^(.)__OVERSIZE_(\d+)__$/);
  return match ? match[1].repeat(Number(match[2])) : value;
}

function expandBody(body) {
  if (!body || typeof body !== 'object') return body;
  const out = {};
  for (const [key, value] of Object.entries(body)) out[key] = expand(value);
  return out;
}

export function loadCases() {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'navigator-eval-cases.json'), 'utf8'));
  return {
    inputs: raw.inputs.map(c => ({ ...c, body: expandBody(c.body) })),
    modelOutputs: raw.modelOutputs
  };
}

// Pure outcomes the harness and the parity guard both read, so they can never
// disagree about what the core did.
export function inputOutcome(body) {
  try {
    const normalized = normalizeInput(body);
    return { outcome: 'normalized', normalized };
  } catch (error) {
    return { outcome: 'rejected', message: error && error.message };
  }
}

export function outputOutcome(raw) {
  const { result, source } = coerceResult(raw);
  return { source, valid: isValidResult(result), result };
}

function main() {
  const { inputs, modelOutputs } = loadCases();
  const failures = [];
  const lines = [];

  for (const testCase of inputs) {
    const got = inputOutcome(testCase.body);
    let ok = got.outcome === testCase.expect;
    // A rejection must carry the member-safe message, not a raw stack.
    if (ok && got.outcome === 'rejected' && got.message !== SAFE_INPUT_MESSAGE) {
      ok = false;
      got.detail = 'rejection message is not the member-safe message';
    }
    // A normalized input must come back with all four required prompts present.
    if (ok && got.outcome === 'normalized') {
      for (const key of ['objective', 'current_reality', 'blocker', 'available_time']) {
        if (!got.normalized[key]) { ok = false; got.detail = `normalized input missing ${key}`; }
      }
    }
    if (!ok) failures.push(`input/${testCase.name}: expected ${testCase.expect}, got ${got.outcome}${got.detail ? ' (' + got.detail + ')' : ''}`);
    lines.push(`  input  [${ok ? 'ok' : 'XX'}] ${testCase.category.padEnd(12)} ${testCase.name} -> ${got.outcome}`);
  }

  for (const testCase of modelOutputs) {
    let got;
    try {
      got = outputOutcome(testCase.raw);
    } catch (error) {
      failures.push(`output/${testCase.name}: coerceResult THREW (${error && error.message}) - this is the raw error the core must never produce`);
      lines.push(`  output [XX] ${testCase.category.padEnd(12)} ${testCase.name} -> THREW`);
      continue;
    }
    let ok = got.valid && got.source === testCase.expect;
    if (!got.valid) ok = false;
    if (!ok) failures.push(`output/${testCase.name}: expected valid four-field ${testCase.expect}, got source=${got.source} valid=${got.valid}`);
    lines.push(`  output [${ok ? 'ok' : 'XX'}] ${testCase.category.padEnd(12)} ${testCase.name} -> ${got.source}${got.valid ? '' : ' INVALID'}`);
  }

  // The headline invariant, stated plainly: no model output anywhere produced a
  // raw error, and every one yielded a valid four-field result.
  const everyOutputValid = modelOutputs.every(c => {
    try { return isValidResult(coerceResult(c.raw).result); } catch (error) { return false; }
  });

  process.stdout.write('Next Step Navigator evaluation harness (WBR-368)\n');
  process.stdout.write(lines.join('\n') + '\n');
  process.stdout.write(`\n  Result fields: ${RESULT_FIELDS.join(', ')}\n`);
  process.stdout.write(`  Every model output yields a valid four-field result or the safe fallback: ${everyOutputValid ? 'YES' : 'NO'}\n`);
  process.stdout.write(`  Safe fallback next_action: "${SAFE_FALLBACK.next_action}"\n`);

  if (failures.length || !everyOutputValid) {
    process.stdout.write(`\nFAIL: ${failures.length} case(s) failed.\n`);
    for (const f of failures) process.stdout.write('  - ' + f + '\n');
    process.exit(1);
  }
  process.stdout.write(`\nPASS: ${inputs.length} input case(s) + ${modelOutputs.length} model-output case(s), every one valid-or-safe.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
