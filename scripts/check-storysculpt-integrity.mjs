// WBR-458 continuation (Momentum 300 StorySculpt Developer 10, 37, 39):
// corrupted stored state is repaired explicitly and recorded, "paused" is a
// named state only a new answer resumes, and transport noise is stripped from
// a member's answer before it is read for meaning.
import { readFileSync } from 'node:fs';
import {
  stripTransportNoise, normalizeStoredProject, projectPhase, pausedInputDecision, PAUSE_AFTER_HOURS, PAUSED_MESSAGE
} from '../api/_lib/storysculpt-integrity.js';
import { buildEventDetail } from '../api/_lib/storysculpt-observability.js';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

// Developer 39.
const strip = (text) => stripTransportNoise(text);
let r = strip('My real answer is here.\n\nSent from my iPhone');
check(r.text === 'My real answer is here.' && r.removed.includes('device-footer'), 'a phone footer is stripped');
r = strip('I teach flute.\n\nOn Tue, Oct 21, 2026 at 3:00 PM David <d@example.invalid> wrote:\n> old stuff\n> more');
check(r.text === 'I teach flute.' && r.removed.includes('quoted-history'), 'quoted reply history is stripped');
r = strip('Here is the idea.\n> earlier line\n> another');
check(r.text === 'Here is the idea.' && r.removed.includes('quoted-history'), 'a trailing quoted block is stripped');
r = strip('Answer\n-- \nJane Doe\nCEO, Example Co');
check(r.text === 'Answer' && r.removed.includes('signature'), 'a signature after the standard delimiter is stripped');
r = strip('Ze​ro width﻿');
check(r.text === 'Zero width' && r.removed.includes('invisible-characters'), 'invisible characters are stripped');
r = strip('> quoting my own idea on purpose');
check(r.text === '> quoting my own idea on purpose' && !r.removed.length, 'a quote that is the whole answer is kept');
r = strip('I was -- honestly -- tired.\nOn my way home I wrote: nothing.');
check(r.text === 'I was -- honestly -- tired.\nOn my way home I wrote: nothing.' && !r.removed.length, 'ordinary prose with dashes and "wrote:" is untouched');
check(strip('Sent from my iPhone').text === 'Sent from my iPhone', 'an answer that is only noise is not emptied');

// Developer 10.
let n = normalizeStoredProject({ id: 'p', intake: 'oops', conversation: '[{"role":"user","content":"hi"}]', output: 42 });
check(n.project.intake && typeof n.project.intake === 'object' && n.project.conversation.length === 1 && n.project.output === null, 'malformed intake, text conversation and non-text output are repaired');
check(['intake-not-object', 'conversation-was-text', 'output-not-text'].every(x => n.repairs.includes(x)), 'each repair is named');
n = normalizeStoredProject({ id: 'p', intake: { current_step: 7 }, conversation: [{ role: 'user', content: 'a' }, null, { role: 'assistant' }, { role: 'robot', content: 'b' }] });
check(n.project.conversation.length === 2 && n.project.conversation[1].role === 'user', 'broken turns are dropped and unknown roles read as the member');
check(n.repairs.includes('conversation-turns-dropped') && n.repairs.includes('conversation-role-unknown') && n.repairs.includes('current-step-not-text') && !('current_step' in n.project.intake), 'turn and step repairs are named');
n = normalizeStoredProject({ id: 'p', intake: {}, conversation: [{ role: 'user', content: 'fine' }], output: null });
check(n.repairs.length === 0, 'a healthy project needs no repair');
check(normalizeStoredProject(null).project === null, 'a missing project stays missing');

// Developer 37.
const now = Date.parse('2026-10-24T03:00:00Z');
const asked = { output: null, conversation: [{ role: 'user', content: 'idea' }, { role: 'assistant', content: 'question?' }] };
check(projectPhase({ ...asked, updated_at: new Date(now - (PAUSE_AFTER_HOURS + 1) * 3600000).toISOString() }, now).phase === 'paused', 'an unanswered question past a day is paused');
check(projectPhase({ ...asked, updated_at: new Date(now - 2 * 3600000).toISOString() }, now).phase === 'active', 'a recent question is active');
check(projectPhase({ ...asked, conversation: [...asked.conversation, { role: 'user', content: 'answer' }], updated_at: '2026-01-01T00:00:00Z' }, now).phase === 'active', 'a chat whose last turn is the member is not paused');
check(projectPhase({ output: 'script', updated_at: '2026-01-01T00:00:00Z' }, now).phase === 'finished', 'a finished script is finished');
const paused = { phase: 'paused', idleHours: 30 };
check(pausedInputDecision(paused, { intent: 'interview', mode: 'rant', messages: [...asked.conversation, { role: 'user', content: 'answer' }] }).resumed === true, 'a new answer resumes a paused chat');
check(pausedInputDecision(paused, { intent: 'interview', mode: 'rant', messages: asked.conversation }).allow === false, 'an interview request with no new answer does not restart a paused chat');
check(pausedInputDecision(paused, { intent: 'regenerate', mode: 'rant', messages: asked.conversation }).allow === true, 'an explicit regenerate is the member acting, and is allowed');
check(pausedInputDecision(paused, { intent: 'interview', mode: 'ugc', messages: [] }).allow === true, 'UGC, which carries no chat turns, is not judged by the pause rule');
check(!/—/.test(PAUSED_MESSAGE), 'the paused message has no em dash');

// Events carry labels only.
const detail = buildEventDetail({ outcome: 'generation', stateRepairs: ['intake-not-object'], phase: 'paused', resumedFromPause: true, noiseStripped: ['signature'] });
check(detail.stateRepairs[0] === 'intake-not-object' && detail.phase === 'paused' && detail.resumedFromPause === true && detail.noiseStripped[0] === 'signature', 'integrity facts reach the event as labels');

// Wiring.
const api = readFileSync('api/storysculpt.js', 'utf8');
check(/normalizeStoredProject\(stored\)/.test(api) && /facts\.stateRepairs = repairs/.test(api), 'the endpoint repairs and records stored state');
check(/pausedInputDecision\(phase, input\)/.test(api) && /fail\(409, PAUSED_MESSAGE\)/.test(api), 'the endpoint enforces the paused rule');
check(/stripTransportNoise\(content\)/.test(api) && /if \(role === 'user'\)/.test(api), "only the member's turns are stripped");
check(api.indexOf('const replay = replayFor(project, input)') < api.indexOf('pausedInputDecision(phase, input)'), 'a saved reply is replayed before the pause rule is applied');

if (failures.length) {
  console.error('check-storysculpt-integrity FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('PASS check-storysculpt-integrity: corrupted state repaired and recorded, paused named and guarded, transport noise stripped from member answers only.');
