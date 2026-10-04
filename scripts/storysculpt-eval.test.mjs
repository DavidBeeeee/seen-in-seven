// StorySculpt evaluation set. Developer F.51 to F.60 on the Momentum 300 scored
// FAIL for one reason: no defined evaluation set existed and nothing validated
// the generation server-side. This is that set.
//
// The interview itself runs on DeepSeek and cannot be replayed offline, so this
// set does not grade the model's prose. It grades the deterministic contract
// that every model response must pass before it reaches a member, and the
// failure taxonomy an operator reads, across the input and output categories
// the score names. Each block is labelled with the row it answers.
//
// Run by `node --test`. Kept out of `npm test` on purpose: the check chain
// guards product invariants, this grades the observability contract, and the
// completion gate reruns `node --test` against it directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_VERSION,
  EVENT_SCHEMA_VERSION,
  promptVersion,
  classifyOutput,
  classifyFailure,
  buildEventDetail,
  sourceViolations,
  failureLayer,
  incidentSignal
} from '../api/_lib/storysculpt-observability.js';

// A well-formed intermediate turn and a well-formed final turn: the two shapes
// the interview is allowed to return.
const GOOD_NEXT = 'NEXT QUESTION: What is the one moment that made you rethink this?';
const GOOD_FINAL = 'FINAL SCRIPT: Here is the story, start to finish, in your own voice.';

test('F.51 vague input: a bare, shapeless answer still yields a contract-valid next question', () => {
  // The model can return a short probe for a vague answer; the contract is that
  // it is still prefixed and non-empty. That is what the server enforces.
  const verdict = classifyOutput('NEXT QUESTION: Can you give me one concrete example?');
  assert.equal(verdict.ok, true);
  assert.equal(verdict.final, false);
  assert.ok(verdict.content.length > 0);
});

test('F.52 overly broad input: an over-long response is rejected rather than shipped', () => {
  const huge = 'NEXT QUESTION: ' + 'x'.repeat(41000);
  const verdict = classifyOutput(huge);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'oversize');
});

test('F.53 hard-to-categorise input: a response with neither contract prefix is rejected', () => {
  // When the model cannot tell whether it is asking or finishing, it drops the
  // prefix. That ambiguity is caught, not passed through as an unlabelled blob.
  const verdict = classifyOutput('Here is some text with no prefix at all.');
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'missing-contract-prefix');
});

test('F.54 conflicting or ambiguous output: a prefix but an empty body is rejected', () => {
  const verdict = classifyOutput('FINAL SCRIPT:    ');
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'empty-body');
});

test('F.55 distinguishes the concepts the interview depends on: next-question vs final-script', () => {
  assert.equal(classifyOutput(GOOD_NEXT).final, false);
  assert.equal(classifyOutput(GOOD_FINAL).final, true);
});

test('F.56 meaningful vs meaningless: an empty generation is meaningless and rejected', () => {
  assert.equal(classifyOutput('').ok, false);
  assert.equal(classifyOutput('   \n  ').ok, false);
});

test('F.57 unusual output: a lowercase and mixed-case prefix is still recognised', () => {
  assert.equal(classifyOutput('next question: keep going.').final, false);
  assert.equal(classifyOutput('Final Script: done.').final, true);
});

test('F.58 adversarial output: a rule-breaking em dash is sanitised and the break is recorded', () => {
  // The system prompt forbids em dashes in every format. When the model emits
  // one anyway, the server removes it and records the violation, so it is fixed
  // for the member and visible to the operator rather than silently shipped.
  const verdict = classifyOutput('NEXT QUESTION: Tell me more — the specific part.');
  assert.equal(verdict.ok, true);
  assert.equal(verdict.sanitized, true);
  assert.deepEqual(verdict.violations, ['em-dash-sanitized']);
  assert.ok(!verdict.content.includes('—'));
});

test('F.60 safe fallback on unacceptable-but-technical success: rejection is a clean, typed outcome', () => {
  for (const bad of ['', 'no prefix here', 'FINAL SCRIPT:', 'NEXT QUESTION:   ']) {
    const verdict = classifyOutput(bad);
    assert.equal(verdict.ok, false);
    assert.equal(typeof verdict.reason, 'string');
    assert.ok(verdict.reason.length > 0);
  }
});

test('H.74 to H.78 failure taxonomy: every failure stage maps to its own class', () => {
  assert.equal(classifyFailure('entitlement'), 'denied-entitlement');
  assert.equal(classifyFailure('quota'), 'denied-quota');
  assert.equal(classifyFailure('input'), 'bad-request');
  assert.equal(classifyFailure('output'), 'output-rejected');
  assert.equal(classifyFailure('generation', { name: 'AbortError' }), 'deepseek-timeout');
  assert.equal(classifyFailure('generation', new Error('502')), 'deepseek-error');
  assert.equal(classifyFailure('anything-else'), 'internal-error');
  // The classes are distinct: a DeepSeek outage is never confused with a bug.
  const classes = ['entitlement', 'quota', 'input', 'output'].map((s) => classifyFailure(s));
  assert.equal(new Set(classes).size, classes.length);
});

test('I.89 prompt version is deterministic, changes with the prompt, and is tagged', () => {
  const a = promptVersion('core', 'bold', 'mini', 'rant', 'v1');
  const b = promptVersion('core', 'bold', 'mini', 'rant', 'v1');
  const c = promptVersion('core CHANGED', 'bold', 'mini', 'rant', 'v1');
  const d = promptVersion('core', 'bold', 'mini', 'rant', 'v2');
  assert.equal(a, b, 'same inputs, same version');
  assert.notEqual(a, c, 'a changed source moves the version');
  assert.notEqual(a, d, 'a changed template tag moves the version');
  assert.match(a, /^ss1-[0-9a-f]{12}$/);
});

test('I.89 the model version is recorded, not inferred', () => {
  assert.equal(MODEL_VERSION, 'deepseek-v4-pro');
});

test('WBR-384 an event never carries member content, only whitelisted metadata', () => {
  const detail = buildEventDetail({
    trace: 't-1',
    outcome: 'generation',
    mode: 'bold',
    promptVersion: 'ss1-abc123abc123',
    model: MODEL_VERSION,
    latencyMs: 812.6,
    messageCount: 4,
    contextChars: 1200,
    final: true,
    sanitized: false,
    usage: { prompt_tokens: 900, completion_tokens: 400, total_tokens: 1300 },
    // These must be dropped: they are member content or unknown fields.
    context: 'the member secret context',
    messages: [{ role: 'user', content: 'private answer' }],
    script: 'the finished script'
  });
  assert.equal(detail.schema, EVENT_SCHEMA_VERSION);
  assert.equal(detail.latencyMs, 813, 'latency is rounded');
  assert.equal(detail.usage.total, 1300);
  const serialized = JSON.stringify(detail);
  assert.ok(!serialized.includes('member secret'), 'no context leaks');
  assert.ok(!serialized.includes('private answer'), 'no message leaks');
  assert.ok(!serialized.includes('finished script'), 'no script leaks');
  assert.equal(detail.context, undefined);
  assert.equal(detail.messages, undefined);
  assert.equal(detail.script, undefined);
});

test('WBR-384 a denied event records its class and versions with no content fields', () => {
  const detail = buildEventDetail({
    trace: 't-2',
    outcome: 'denied',
    mode: 'rant',
    promptVersion: 'ss1-abc123abc123',
    model: MODEL_VERSION,
    failureClass: 'denied-entitlement',
    latencyMs: 40
  });
  assert.equal(detail.failureClass, 'denied-entitlement');
  assert.equal(detail.outcome, 'denied');
  assert.equal(detail.messageCount, undefined);
  assert.equal(detail.usage, undefined);
});

// WBR-005, 2026-10-03 evening order: the source-checked half of the validator,
// the failure layers, and the incident signal.

const SOURCE = 'I coach new managers. A client once told me the meetings finally felt calm. I have done this for three years.';

test('WBR-005 an invented third-party testimonial in a finished script is rejected', () => {
  const verdict = classifyOutput('FINAL SCRIPT: My client Sarah said "working with you changed my life completely" and I believed her.', { source: SOURCE });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'invented-testimonial');
});

test('WBR-005 an invented credential in a finished script is rejected', () => {
  for (const claim of ['As a certified coach, I help.', 'I hold a PhD in this.', 'As seen in Forbes, I coach.', 'I am the #1 coach for managers.']) {
    const verdict = classifyOutput('FINAL SCRIPT: ' + claim, { source: SOURCE });
    assert.equal(verdict.ok, false, claim);
    assert.equal(verdict.reason, 'invented-credential', claim);
  }
});

test('WBR-005 the member\'s own quote and credential pass untouched', () => {
  const source = SOURCE + ' I am board-certified. My client wrote "the meetings finally felt calm for once".';
  const verdict = classifyOutput('FINAL SCRIPT: I am board-certified. My client wrote, "the meetings finally felt calm for once."', { source });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.violations, []);
});

test('WBR-005 an unsourced figure is recorded but delivered', () => {
  const verdict = classifyOutput('FINAL SCRIPT: I have helped 400 clients find calm.', { source: SOURCE });
  assert.equal(verdict.ok, true);
  assert.ok(verdict.violations.includes('unsourced-figure'));
});

test('WBR-005 a quoted line with no speaker is recorded, not rejected', () => {
  const verdict = classifyOutput('FINAL SCRIPT: I told myself "this is the very last time" and it was not.', { source: SOURCE });
  assert.equal(verdict.ok, true);
  assert.ok(verdict.violations.includes('unsourced-quotation'));
});

test('WBR-005 questions are never source-checked: hook options quote freely', () => {
  const verdict = classifyOutput('NEXT QUESTION: Pick one. "My client said I changed her whole life" or something calmer?', { source: SOURCE });
  assert.equal(verdict.ok, true);
});

test('WBR-005 without a source the source checks are skipped, never guessed', () => {
  assert.equal(classifyOutput('FINAL SCRIPT: As a certified coach, I help.').ok, true);
  assert.deepEqual(sourceViolations('As a certified coach', ''), []);
});

test('WBR-005 every failure class maps to the layer an operator asks about first', () => {
  assert.equal(failureLayer('deepseek-timeout'), 'generation');
  assert.equal(failureLayer('deepseek-error'), 'generation');
  assert.equal(failureLayer('output-rejected'), 'generation');
  assert.equal(failureLayer('database-error'), 'database');
  assert.equal(failureLayer('save-error'), 'database');
  assert.equal(failureLayer('delivery-error'), 'delivery');
  assert.equal(failureLayer('denied-entitlement'), 'access');
  assert.equal(failureLayer('bad-request'), 'input');
  assert.equal(failureLayer('anything-new'), 'internal');
  assert.equal(classifyFailure('database'), 'database-error');
  assert.equal(classifyFailure('delivery'), 'delivery-error');
  assert.equal(buildEventDetail({ failureClass: 'database-error' }).layer, 'database');
});

test('WBR-005 the incident signal ignores refusals and fires on member-facing failures', () => {
  const now = Date.parse('2026-10-04T06:00:00Z');
  const at = (m) => new Date(now - m * 60000).toISOString();
  const quiet = [
    { event_type: 'storysculpt_generation', created_at: at(5), detail: { outcome: 'generation' } },
    { event_type: 'storysculpt_denied', created_at: at(4), detail: { outcome: 'denied', failureClass: 'denied-quota' } },
    { event_type: 'storysculpt_denied', created_at: at(3), detail: { outcome: 'denied', failureClass: 'bad-request' } },
    { event_type: 'storysculpt_denied', created_at: at(2), detail: { outcome: 'denied', failureClass: 'denied-entitlement' } }
  ];
  assert.equal(incidentSignal(quiet, { now }).level, 'ok');

  const outage = [
    ...quiet,
    { event_type: 'storysculpt_error', created_at: at(9), detail: { outcome: 'error', failureClass: 'deepseek-timeout' } },
    { event_type: 'storysculpt_error', created_at: at(8), detail: { outcome: 'error', failureClass: 'deepseek-error' } },
    { event_type: 'storysculpt_save_failed', created_at: at(7), detail: { outcome: 'error', failureClass: 'save-error', layer: 'database' } }
  ];
  const signal = incidentSignal(outage, { now });
  assert.equal(signal.level, 'incident');
  assert.equal(signal.byLayer.generation, 2);
  assert.equal(signal.byLayer.database, 1);
  assert.match(signal.reason, /generation/);

  const old = outage.map((e) => ({ ...e, created_at: at(120) }));
  assert.equal(incidentSignal(old, { now }).level, 'ok', 'events outside the window do not count');
});
