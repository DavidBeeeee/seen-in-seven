// StorySculpt input and stored-state integrity. WBR-458 continuation
// (Momentum 300 StorySculpt Developer 10, 37, 39). Pure, so the check can
// exercise every rule without a network.
//
//   Developer 10  A stored chat that comes back malformed (a conversation that
//                 is not a list, a turn with no text, an intake that is not an
//                 object) is repaired explicitly and the repair is recorded,
//                 never silently trusted or silently dropped.
//   Developer 37  "Paused" is a named state: an interview waiting on the
//                 member's answer to StorySculpt's question for a day or more.
//                 Only a new answer resumes it; a request carrying no answer
//                 does not restart the interview behind the member's back.
//   Developer 39  Transport noise is stripped from a member's answer before it
//                 is read for meaning: invisible characters, an email
//                 signature, "Sent from my phone" footers and quoted reply
//                 history. Text the member wrote is never touched.

// ── Developer 39 ────────────────────────────────────────────────────────────
const INVISIBLE = /[​-‍⁠﻿­]/g;
const SENT_FROM = /^\s*sent from my (?:iphone|ipad|android|samsung[\w ]*|galaxy[\w ]*|pixel[\w ]*|mobile device|phone)\s*$/i;
const GET_APP = /^\s*get outlook for (?:ios|android)\s*$/i;
const REPLY_HEADER = /^\s*on .{4,200}\bwrote:\s*$/i;
const FORWARD_HEADER = /^\s*-{2,}\s*(?:original message|forwarded message)\s*-{2,}\s*$/i;

export function stripTransportNoise(text) {
  const original = String(text == null ? '' : text);
  const removed = [];
  const visible = original.replace(INVISIBLE, '');
  if (visible !== original) removed.push('invisible-characters');
  let lines = visible.replace(/\r\n?/g, '\n').split('\n');

  // Quoted history: from a reply or forward header to the end, or a trailing
  // run of "> " lines. Only when something the member wrote comes before it.
  const header = lines.findIndex((line, i) => i > 0 && (REPLY_HEADER.test(line) || FORWARD_HEADER.test(line)));
  if (header > 0 && lines.slice(0, header).some((l) => l.trim())) {
    lines = lines.slice(0, header);
    removed.push('quoted-history');
  } else {
    let end = lines.length;
    while (end > 0 && (/^\s*>/.test(lines[end - 1]) || !lines[end - 1].trim())) end -= 1;
    if (end < lines.length && lines.slice(end).some((l) => /^\s*>/.test(l)) && lines.slice(0, end).some((l) => l.trim())) {
      lines = lines.slice(0, end);
      removed.push('quoted-history');
    }
  }

  // The standard signature delimiter, "-- " alone on a line, and everything after.
  const sig = lines.findIndex((line, i) => i > 0 && line === '-- ');
  if (sig > 0) {
    lines = lines.slice(0, sig);
    removed.push('signature');
  }

  const kept = lines.filter((line) => !(SENT_FROM.test(line) || GET_APP.test(line)));
  if (kept.length !== lines.length) removed.push('device-footer');

  const clean = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: clean || visible.trim(), removed };
}

// ── Developer 10 ────────────────────────────────────────────────────────────
const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);

export function normalizeStoredProject(project) {
  if (!project) return { project, repairs: [] };
  const repairs = [];
  const fixed = { ...project };

  if (!isPlainObject(fixed.intake)) {
    if (fixed.intake != null) repairs.push('intake-not-object');
    fixed.intake = {};
  }

  let conversation = fixed.conversation;
  if (typeof conversation === 'string') {
    try { conversation = JSON.parse(conversation); repairs.push('conversation-was-text'); } catch (_) { conversation = null; }
  }
  if (!Array.isArray(conversation)) {
    if (fixed.conversation != null) repairs.push('conversation-not-list');
    conversation = [];
  }
  const turns = conversation.filter((turn) => isPlainObject(turn) && typeof turn.content === 'string' && turn.content.trim());
  if (turns.length !== conversation.length) repairs.push('conversation-turns-dropped');
  fixed.conversation = turns.map((turn) => (turn.role === 'user' || turn.role === 'assistant') ? turn : { ...turn, role: 'user' });
  if (turns.some((turn) => turn.role !== 'user' && turn.role !== 'assistant')) repairs.push('conversation-role-unknown');

  if (fixed.output != null && typeof fixed.output !== 'string') {
    repairs.push('output-not-text');
    fixed.output = null;
  }
  if (typeof fixed.output === 'string' && !fixed.output.trim()) fixed.output = null;

  const step = fixed.intake.current_step;
  if (step != null && typeof step !== 'string') {
    repairs.push('current-step-not-text');
    fixed.intake = { ...fixed.intake };
    delete fixed.intake.current_step;
  }

  return { project: fixed, repairs };
}

// ── Developer 37 ────────────────────────────────────────────────────────────
export const PAUSE_AFTER_HOURS = 24;

// active    the interview is moving
// paused    StorySculpt asked a question and the member has not answered for
//           PAUSE_AFTER_HOURS or more
// finished  there is a finished script
export function projectPhase(project, now = Date.now()) {
  if (!project) return { phase: 'active', idleHours: 0 };
  if (project.output) return { phase: 'finished', idleHours: 0 };
  const turns = Array.isArray(project.conversation) ? project.conversation : [];
  const last = turns[turns.length - 1];
  const at = Date.parse(project.updated_at || '');
  const idleHours = Number.isFinite(at) ? Math.max(0, (now - at) / 3600000) : 0;
  if (last && last.role === 'assistant' && idleHours >= PAUSE_AFTER_HOURS) {
    return { phase: 'paused', idleHours: Math.round(idleHours) };
  }
  return { phase: 'active', idleHours: Math.round(idleHours) };
}

// What a request may do to a paused interview. A new member answer resumes it;
// an interview request with nothing new to answer is refused rather than
// restarting the step. Every other intent is an explicit member action.
export function pausedInputDecision(phase, input) {
  if (!phase || phase.phase !== 'paused' || !input || input.intent !== 'interview' || input.mode === 'ugc') {
    return { allow: true, resumed: false };
  }
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const last = messages[messages.length - 1];
  if (last && last.role === 'user' && last.content) return { allow: true, resumed: true };
  return { allow: false, resumed: false };
}

export const PAUSED_MESSAGE = 'This chat is paused at StorySculpt\'s last question. Answer it to pick up where you left off.';
