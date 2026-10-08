import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { authenticatedUser, consumeQuota, json } from './_lib/security.js';
import {
  MODEL_VERSION,
  promptVersion,
  classifyOutput,
  classifyFailure,
  buildEventDetail,
  failureLayer
} from './_lib/storysculpt-observability.js';
import {
  extractBannedTerms,
  parseInstructions,
  parseTurns,
  resolveStep,
  turnKind,
  evidenceWords,
  checkDeterministic,
  stepFallbackMessage,
  detectCrisis,
  crisisResponse
} from './_lib/storysculpt-steps.js';

export const config = { maxDuration: 90 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const MODES = new Set(['bold', 'mini', 'rant']);
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The StorySculpt knowledge lives under api/_hub, not assets, so it is bundled
// into the function but never served as a public static file. It used to sit in
// assets/storysculpt, where /assets/storysculpt/instructions.txt and every
// knowledge file was downloadable by anyone. WBR-385.
function source(name) {
  return readFileSync(join(process.cwd(), 'api', '_hub', 'storysculpt-src', name), 'utf8');
}

const CORE_INSTRUCTIONS = source('instructions.txt');
const BLUEPRINTS = readFileSync(join(process.cwd(), 'api', '_lib', 'blueprints.txt'), 'utf8');
const BANNED_TERMS = extractBannedTerms(BLUEPRINTS);
const PARSED_INSTRUCTIONS = parseInstructions(CORE_INSTRUCTIONS, BANNED_TERMS);
// The file's own turns, cut at its STOP and WAIT lines. WBR-436 repair.
const TURNS = parseTurns(CORE_INSTRUCTIONS);

const KNOWLEDGE_MAP = {
  'Tiktok Hooks.txt': source('knowledge/Tiktok Hooks.txt'),
  'Hooks and CTA Scripts for 2026.txt': source('knowledge/Hooks and CTA Scripts for 2026.txt'),
  "Example Scripts for the 5 E's.txt": source("knowledge/Example Scripts for the 5 E's.txt"),
  '60 Second Perfect Framework for Video Shorts.txt': source('knowledge/60 Second Perfect Framework for Video Shorts.txt'),
  '_mini example script.txt': source('knowledge/_mini example script.txt'),
  'Hook, Engage, and Influence - Your Essential Video Short Guide.txt': source('knowledge/Hook, Engage, and Influence - Your Essential Video Short Guide.txt'),
  'Writing Examples For David Bee.txt': source('knowledge/Writing Examples For David Bee.txt'),
  'David Bee Bio for Video ScriptGPT.txt': source('knowledge/David Bee Bio for Video ScriptGPT.txt')
};

// The reference set each format always had before the step engine. A turn that
// drafts, writes hooks, escalates or revises gets its format's full set; a turn
// that only asks a question gets just the documents its own text names.
const MODE_REFERENCE_SETS = {
  bold: ['Tiktok Hooks.txt', 'Hooks and CTA Scripts for 2026.txt', "Example Scripts for the 5 E's.txt"],
  mini: ['60 Second Perfect Framework for Video Shorts.txt', '_mini example script.txt', 'Hooks and CTA Scripts for 2026.txt'],
  rant: ['Tiktok Hooks.txt', "Example Scripts for the 5 E's.txt", 'Hooks and CTA Scripts for 2026.txt']
};

const NAMED_DOCUMENTS = [
  ['Hooks and CTA Scripts for 2026', 'Hooks and CTA Scripts for 2026.txt'],
  ['_mini example script', '_mini example script.txt'],
  ['mini-webinar framework', '60 Second Perfect Framework for Video Shorts.txt'],
  ['60 Second Perfect Framework', '60 Second Perfect Framework for Video Shorts.txt'],
  ["5 E's", "Example Scripts for the 5 E's.txt"],
  ['Tiktok Hooks', 'Tiktok Hooks.txt'],
  ['Hook, Engage, and Influence', 'Hook, Engage, and Influence - Your Essential Video Short Guide.txt'],
  ['Writing Examples For David Bee', 'Writing Examples For David Bee.txt']
];

const REFERENCE_NOTE = 'REFERENCE NOTE: the examples below teach structure, rhythm, and intensity. Many of them speak to the viewer as "you" and accuse them. When you borrow a structure, re-aim it under THE ALLY RULE: hit the system or the speaker\'s past self, never the viewer.';

export function referenceDocsForTurn(mode, turn) {
  const text = String(turn && turn.text || '');
  const names = [];
  for (const [phrase, file] of NAMED_DOCUMENTS) if (text.includes(phrase) && !names.includes(file)) names.push(file);
  const kind = turnKind(turn && turn.label, text);
  if (!kind.question) {
    for (const file of (MODE_REFERENCE_SETS[mode] || MODE_REFERENCE_SETS.rant)) if (!names.includes(file)) names.push(file);
  }
  const docs = names.map(name => KNOWLEDGE_MAP[name]).filter(Boolean).join('\n\n');
  return docs ? REFERENCE_NOTE + '\n\n' + docs : '';
}

// David's Ally Rule, read from his file so his edits flow straight through.
const ALLY_RULE = (CORE_INSTRUCTIONS.match(/^THE ALLY RULE[^\n]*/m) || [''])[0].trim();

// The build change behind THE ALLY RULE (2026-10-08). The draft steps say to use
// "as much of the member's original input as possible", and a rant written as
// an accusation ("If you need an AI clone, you're not an entrepreneur") was
// carried into the script nearly word for word. So before any draft, the raw
// input is re-aimed once: same opinions, facts, heat and wording where the rule
// allows, with each attack on the viewer turned into a confession or a charge
// against the system. The draft step then treats that as the member's input.
export function reaimSystemPrompt() {
  return [
    'You prepare a member\'s raw words for a StorySculpt script draft.',
    ALLY_RULE,
    'Rewrite the member\'s raw input so it obeys THE ALLY RULE. Keep every opinion, argument, example, and fact, the full emotional heat, and as much of their exact wording as the rule allows. Turn each line that attacks the viewer into either a confession in the speaker\'s own voice (a feeling, temptation, belief, or habit the speaker had) or a charge against the system or enemy that taught it. Aim charges at the enemy the member chose, when they named one. Do not add events, numbers, dates, results, credentials, or quotations. Do not soften the opinion. Never use an em dash.',
    'Return only the rewritten input, as plain text, with no heading or commentary.'
  ].join('\n\n');
}

async function reaimMemberInput(input) {
  const raw = (input.messages.find(m => m.role === 'user') || {}).content || '';
  if (!ALLY_RULE || !raw.trim()) return '';
  const answers = input.messages.filter(m => m.role === 'user').slice(1).map(m => '- ' + m.content).join('\n');
  const result = await callModel([
    { role: 'system', content: reaimSystemPrompt() },
    { role: 'user', content: 'MEMBER\'S RAW INPUT:\n' + raw + (answers ? '\n\nTHE MEMBER\'S LATER ANSWERS (context, including the enemy they chose):\n' + answers : '') }
  ], { temperature: 0.5, maxTokens: 1200 });
  return String(result.content || '').replace(/^(?:NEXT QUESTION|FINAL SCRIPT):\s*/i, '').trim();
}

export function turnFor(mode, label) {
  const modeTurns = (TURNS[label === 'F1' ? 'fix' : mode] || TURNS.rant).turns;
  return modeTurns.find(t => t.label === label) || modeTurns[0];
}

// Bump this when the systemPrompt() template below changes in a way that alters
// generation. The blueprint sources are hashed automatically; this tag covers
// the wrapper the sources are assembled into, so the recorded prompt version
// moves whenever the real prompt does. Developer I.89.
const PROMPT_TEMPLATE_TAG = 'v3';
const PROMPT_VERSION = promptVersion(
  CORE_INSTRUCTIONS,
  PARSED_INSTRUCTIONS.globalText,
  PROMPT_TEMPLATE_TAG
);

// Best-effort event write, using the member's own token. It goes through the
// record_log_event RPC, NOT a direct POST to /rest/v1/logs. The logs INSERT
// policy checks the INTERNAL public.users.id (user_id IN (select id from users
// where auth_id = auth.uid())), but a serverless function only holds the auth
// uid from /auth/v1/user, and the auth uid is never a valid internal id here:
// every one of these writes was silently rejected by RLS and StorySculpt's
// WBR-384 observability logged 0 rows from the day it shipped. The RPC resolves
// the caller's internal id from auth.uid() itself, so the event is attributed
// to the right member and actually lands. It never throws and never blocks
// generation on its own failure; member content is never passed, buildEventDetail
// whitelists the fields. WBR-384; RLS fix filed alongside the Certainty
// observability build, 2026-09-27.
async function recordEvent(token, userId, eventType, detail) {
  if (!token) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/record_log_event', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ p_event_type: eventType, p_detail: detail }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    // Observability must never break the app. Fail silent, exactly like the
    // client logEvent it mirrors.
  }
}

function cleanText(value, maximum) {
  const clean = String(value || '').trim();
  if (clean.length > maximum) throw new Error('StorySculpt received more text than it can use in one step.');
  return clean;
}

function validateBody(body) {
  const mode = String(body && body.mode || '').toLowerCase();
  if (!MODES.has(mode)) throw new Error('Choose a StorySculpt format first.');
  const projectId = String(body && body.projectId || '');
  if (!PROJECT_ID.test(projectId)) throw new Error('Open a saved StorySculpt chat before continuing.');
  const intent = String(body && body.intent || '');
  if (intent !== 'interview' && intent !== 'refine') throw new Error('Choose whether to continue the interview or revise a script.');
  const messages = Array.isArray(body && body.messages) ? body.messages.slice(-24) : [];
  return {
    mode,
    projectId,
    intent,
    projectTitle: cleanText(body && body.projectTitle, 160),
    context: cleanText(body && body.context, 12000),
    messages: messages.map(message => ({
      role: message && message.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(message && message.content, 8000)
    })).filter(message => message.content)
  };
}

async function loadOwnedProject(token, projectId) {
  // Member-scoped RLS is the authority here. Never trust client-supplied output
  // or use a service-role lookup for a member-owned script.
  // A failure here is the database layer, not an application bug, and it is
  // tagged so the event says so. Developer H.74 to H.78: an operator must be
  // able to tell Supabase being down from DeepSeek being down from our code.
  const url = SUPABASE_URL + '/rest/v1/storysculpt_projects?id=eq.' + projectId + '&select=id,output,content_type,intake&limit=1';
  let rows;
  try {
    const response = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('status ' + response.status);
    rows = await response.json();
  } catch (cause) {
    const error = new Error('StorySculpt could not check your saved chat. Please try again.');
    error.stage = 'database';
    error.cause = cause;
    throw error;
  }
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateProjectIntake(token, projectId, intake) {
  if (!token || !projectId) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      await fetch(SUPABASE_URL + '/rest/v1/storysculpt_projects?id=eq.' + projectId, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ intake }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (_) {
    // Non-blocking intake update
  }
}

async function hasEeeAccess(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/has_studio_app_access', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ target_app_key: 'eee' })
  });
  return response.ok && await response.json().catch(() => false) === true;
}

export function systemPrompt(mode, stepLabel, stepText, referenceDocs) {
  const effectiveLabel = stepLabel || (mode === 'bold' ? 'B1' : mode === 'mini' ? 'M1' : 'R1');
  const effectiveStepText = stepText || (turnFor(mode, effectiveLabel) || {}).text || PARSED_INSTRUCTIONS.steps[effectiveLabel] || '';
  const preface = (TURNS[effectiveLabel === 'F1' ? 'fix' : mode] || {}).preface || '';
  const currentStepBlock = effectiveStepText
    ? `${preface ? preface + '\n\n' : ''}CURRENT STEP (follow exactly):\n${effectiveStepText}`
    : '';

  return `You are StorySculpt, an interactive talking-head script interview inside Colorado Mastermind Studio.

INTERACTION CONTRACT:
- For every intermediate response, prefix the response with exactly NEXT QUESTION:.
- When ready, return the finished title and continuous script prefixed with exactly FINAL SCRIPT:. Do not add an explanation after it.
- Never use an em dash. Not in questions, not in options, not in the finished script.
- Never invent testimonials, credentials, results, diagnoses, or exact quotations.

ESTABLISHED STORYSCULPT INSTRUCTIONS:
${PARSED_INSTRUCTIONS.globalText}

${referenceDocs ? 'REFERENCE MATERIAL:\n' + referenceDocs + '\n\n' : ''}${currentStepBlock}`.trim();
}

// The binding instruction for this turn, sent as the LAST message, after the
// conversation. When it sat only in the system prompt, DeepSeek followed the
// conversation's momentum instead: on 2026-10-08 the server sent R3 ("How long
// do you want the final video to be?") and R4 (the 5 E's) and the model asked
// its own questions both times.
export function stepDirective(mode, stepLabel, stepText, memberMessages = [], reaimed = '') {
  const kind = turnKind(stepLabel, stepText);
  const lines = [
    'STORYSCULPT STEP INSTRUCTION. This comes from the app, not from the member. The member\'s latest reply is the message before this one.',
    `Do this step now, exactly as written below, and do nothing that belongs to any other step. Use the member's answers above as the material.`,
    '',
    stepText
  ];
  if (kind.draft && reaimed) {
    lines.push('', 'THE MEMBER\'S ORIGINAL INPUT, RE-AIMED UNDER THE ALLY RULE. Wherever this step says to use the member\'s original input, use this version, not the raw message above:', reaimed);
  }
  if (kind.evidenceRule || kind.escalation) {
    const words = [...evidenceWords(memberMessages).values()];
    if (words.length) {
      lines.push('', 'EVIDENCE WORDS (the member\'s raw text). No option may contain any of these words or a form of them: ' + words.join(', ') + '.');
    }
  }
  if (kind.threeOptions && !kind.final) {
    lines.push('', 'Number the three options 1., 2. and 3., each on its own line.');
    if (/open loop sentences/i.test(stepText)) {
      lines.push('Each option is only the new open loop sentence. Do not repeat the chosen hook inside it; the member already has the hook.');
    }
  }
  lines.push('', 'Use none of the BANNED WORDS listed in the instructions above, in any form, even where the member used them.');
  lines.push('', kind.final
    ? 'Begin your reply with exactly FINAL SCRIPT:'
    : 'Begin your reply with exactly NEXT QUESTION:');
  return lines.join('\n');
}

// Everything the member supplied in this request: the context, the title, and
// the whole thread, including earlier accepted assistant turns (a hook the
// member chose from three options is theirs once chosen). The output validator
// checks a finished script's quotations and credentials against this, and it
// never leaves the function: buildEventDetail cannot carry it.
function memberSource(input) {
  return [input.projectTitle, input.context, ...input.messages.map((message) => message.content)].join('\n');
}

// The thread exactly as the contract says it was spoken. WBR-428.
//
// The browser stores each assistant turn with its NEXT QUESTION: / FINAL
// SCRIPT: prefix already stripped, because the member should never see it, and
// sends that thread back on the next turn. So from turn two DeepSeek read its
// own earlier replies without the prefix and imitated them: on 2026-09-29/30,
// 5 of 12 real member generations were refused as missing-contract-prefix, and
// the 2026-10-03 signed-in walk saw 9 of 13. Restoring the prefix on the way
// out is not a prompt or flow change; it is the same turns, labelled the way
// the system prompt already says they were. In a refine, the last assistant
// turn is the finished script the member is revising.
export function contractHistory(messages, intent) {
  const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant');
  return messages.map((message, index) => {
    if (message.role !== 'assistant' || /^(NEXT QUESTION|FINAL SCRIPT):/i.test(message.content)) return message;
    const prefix = intent === 'refine' && index === lastAssistant ? 'FINAL SCRIPT: ' : 'NEXT QUESTION: ';
    return { role: 'assistant', content: prefix + message.content };
  });
}

async function callModel(messages, { temperature = 0.86, maxTokens = 1900 } = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('StorySculpt generation is not configured.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-v4-pro',
        messages,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
        temperature
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : 'StorySculpt did not respond normally.');
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content || !String(content).trim()) throw new Error('StorySculpt returned an empty response.');
    return { content: String(content).trim(), usage: data.usage || null };
  } finally {
    clearTimeout(timeout);
  }
}

async function callStorySculpt(input, stepLabel, stepText, referenceDocs, retryDirective = null) {
  const kind = turnKind(stepLabel, stepText);
  const context = [
    input.projectTitle ? 'PROJECT TITLE: ' + input.projectTitle : '',
    input.context ? 'MEMBER CONTEXT:\n' + input.context : ''
  ].filter(Boolean).join('\n\n');
  return callModel([
    { role: 'system', content: systemPrompt(input.mode, stepLabel, stepText, referenceDocs) },
    ...(context ? [{ role: 'user', content: context }] : []),
    ...contractHistory(input.messages, input.intent),
    { role: 'user', content: stepDirective(input.mode, stepLabel, stepText, input.messages, input.reaimed) + (retryDirective ? '\n\nRETRY: ' + retryDirective : '') }
  ], {
    // A turn that only asks David's fixed question needs fidelity, not flair.
    temperature: kind.question ? 0.4 : 0.86
  });
}

// Lower is better: 0 passes. For hook steps, the number of options that reuse
// the member's words, so the least-bad attempt wins.
function failureScore(content, check) {
  if (check.ok) return 0;
  if (String(check.issue || '').startsWith('hook-contains-evidence-stem')) return 1 + (check.badOptions || 1);
  if (String(check.issue || '').startsWith('three-options')) return 10;
  return 5;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const token = bearerToken(req);
  const user = await authenticatedUser(req);
  if (!user) return json(res, 401, { error: 'Please sign in again to continue.' });

  const trace = randomUUID();
  const started = Date.now();
  const mode = String(req.body && req.body.mode || '').toLowerCase();
  // One terminal event per request, carrying the request's own outcome. A short
  // helper so every exit path records the same shape and never forgets the
  // versions. WBR-384 (H.71 to H.80), Developer I.89.
  const emit = (outcome, extra = {}) => recordEvent(token, user.id, 'storysculpt_' + outcome, buildEventDetail({
    trace,
    outcome,
    mode,
    promptVersion: PROMPT_VERSION,
    model: MODEL_VERSION,
    latencyMs: Date.now() - started,
    ...extra
  }));

  // Every error body carries the trace, so a member's browser can report a
  // delivery or save failure against the same id the server logged.
  const fail = (status, error) => json(res, status, { error, trace });

  if (!(await hasEeeAccess(req))) {
    await emit('denied', { failureClass: classifyFailure('entitlement') });
    return fail(403, 'An active EEE membership is required.');
  }

  let input;
  try {
    input = validateBody(req.body);
  } catch (error) {
    await emit('error', { failureClass: classifyFailure('input') });
    return fail(400, error && error.message ? error.message : 'StorySculpt could not read that request.');
  }

  try {
    const project = await loadOwnedProject(token, input.projectId);
    if (!project) {
      await emit('denied', { failureClass: classifyFailure('input') });
      return fail(404, 'That saved StorySculpt chat was not found in your account.');
    }
    if (project.content_type !== input.mode) {
      await emit('denied', { failureClass: classifyFailure('input') });
      return fail(400, 'This chat has a different format. Please reopen it.');
    }
    if (project.output && input.intent === 'interview') {
      await emit('denied', { failureClass: classifyFailure('input') });
      return fail(409, 'This script is already finished. Use Refine with a note to change it.');
    }
    if (!project.output && input.intent === 'refine') {
      await emit('denied', { failureClass: classifyFailure('input') });
      return fail(409, 'Finish a script before asking for a revision.');
    }

    // Safety pre-check: crisis or self-harm language skips generation
    const userMessages = input.messages.filter(m => m.role === 'user');
    const latestUserMessage = userMessages.length ? userMessages[userMessages.length - 1].content : '';
    const crisis = detectCrisis(latestUserMessage);
    if (crisis.tripped) {
      await recordEvent(token, user.id, 'storysculpt_safety', buildEventDetail({
        trace,
        outcome: 'safety',
        mode,
        promptVersion: PROMPT_VERSION,
        model: MODEL_VERSION,
        category: crisis.category,
        patternId: crisis.patternId
      }));
      return json(res, 200, {
        final: false,
        content: crisisResponse(user.name || ''),
        promptVersion: PROMPT_VERSION,
        model: MODEL_VERSION,
        trace
      });
    }

    const allowed = await consumeQuota({ subject: 'user:' + user.id, endpoint: 'storysculpt', limit: 60, req, userId: user.id });
    if (!allowed) {
      await emit('denied', { failureClass: classifyFailure('quota') });
      return fail(429, 'StorySculpt needs a short pause before the next request.');
    }

    const currentStepInDb = project.intake && project.intake.current_step;
    const activeStep = resolveStep({
      mode: input.mode,
      intent: input.intent,
      messages: input.messages,
      currentStep: currentStepInDb,
      turns: (TURNS[input.mode] || TURNS.rant).turns
    });
    const activeTurn = turnFor(input.mode, activeStep);
    const stepText = activeTurn.text;
    const refDocs = referenceDocsForTurn(input.mode, activeTurn);
    const stepLog = { step: activeStep, stepSource: currentStepInDb ? 'stored' : 'counted', attempts: 1 };

    if (turnKind(activeStep, stepText).draft) {
      try {
        input.reaimed = await reaimMemberInput(input);
        stepLog.reaimed = Boolean(input.reaimed);
      } catch (_) {
        // Drafting still runs on the raw input; THE ALLY RULE is in the prompt
        // and the backstop check still applies.
        stepLog.reaimed = false;
      }
    }

    let result;
    try {
      result = await callStorySculpt(input, activeStep, stepText, refDocs);
    } catch (error) {
      await emit('error', { failureClass: classifyFailure('generation', error) });
      const message = error && error.name === 'AbortError'
        ? 'StorySculpt took too long on this pass. Your project is saved, so please try this step again.'
        : error && error.message ? error.message : 'StorySculpt could not complete this step.';
      return fail(error && error.name === 'AbortError' ? 504 : 502, message);
    }

    // Server-side output validation. Developer F.60: a technically successful
    // generation that breaks the script contract is caught here, not shipped.
    // Checked against the member's own material, so an invented testimonial or
    // credential in a finished script is refused and recorded, never returned.
    // WBR-005, 2026-10-03 evening order.
    let verdict = classifyOutput(result.content, { source: memberSource(input) });
    if (!verdict.ok) {
      await emit('output_rejected', {
        failureClass: classifyFailure('output'),
        violations: verdict.violations && verdict.violations.length ? verdict.violations : [verdict.reason],
        usage: result.usage
      });
      return json(res, 502, {
        error: 'StorySculpt drafted something that broke its own rules, so it was not shown to you. Nothing was lost. Please try this step again.',
        rejected: verdict.reason,
        trace
      });
    }

    const checkArgs = (content) => ({
      content,
      stepLabel: activeStep,
      turnText: stepText,
      memberMessages: input.messages,
      bannedTerms: BANNED_TERMS
    });
    let detCheck = checkDeterministic(checkArgs(result.content));

    // Up to two retries, each told exactly what failed (for hooks, the member's
    // own words it used). Keep the attempt with the fewest failures, so a choice
    // step never arrives empty.
    let best = { result, verdict, detCheck, score: failureScore(result.content, detCheck) };
    for (let retry = 0; retry < 2 && !detCheck.ok; retry++) {
      stepLog.attempts++;
      try {
        let retryDirective = `The previous reply failed the check "${String(detCheck.issue || '').split(':')[0]}". ${detCheck.issue}. Write this step again and fix that.`;
        if (detCheck.words && detCheck.words.length) {
          retryDirective += ` It reused the member's words: ${detCheck.words.join(', ')}. Replace them with fresh Metaphorical Bridge imagery.`;
        }
        const retryResult = await callStorySculpt(input, activeStep, stepText, refDocs, retryDirective);
        const retryVerdict = classifyOutput(retryResult.content, { source: memberSource(input) });
        if (!retryVerdict.ok) continue;
        const retryDetCheck = checkDeterministic(checkArgs(retryResult.content));
        const score = failureScore(retryResult.content, retryDetCheck);
        if (score < best.score) best = { result: retryResult, verdict: retryVerdict, detCheck: retryDetCheck, score };
        result = retryResult;
        verdict = retryVerdict;
        detCheck = retryDetCheck;
      } catch (_) {
        break;
      }
    }
    if (!detCheck.ok) {
      ({ result, verdict, detCheck } = best);
      stepLog.checkFailed = String(detCheck.issue || '').split(':')[0];
    }

    if (!detCheck.ok) {
      if (activeStep === 'F1' || /^FINAL SCRIPT:/i.test(result.content)) {
        // A finished script that still trips a style check is shipped as is
        // (and logged) rather than lost; the member can refine it.
        if (!verdict.ok) {
          verdict = { ok: true, final: true, content: result.content.replace(/^FINAL SCRIPT:\s*/i, '').trim() };
        }
      } else if (!verdict.ok || !String(verdict.content || '').trim()) {
        const fallback = stepFallbackMessage(activeStep, stepText, result.content);
        stepLog.fallback = true;
        verdict = classifyOutput(fallback, { source: memberSource(input) });
      }
    }

    const updatedIntake = { ...(project.intake || {}), current_step: activeStep };
    await updateProjectIntake(token, input.projectId, updatedIntake);

    await emit('generation', {
      ...stepLog,
      failureClass: undefined,
      final: verdict.final,
      sanitized: verdict.sanitized,
      violations: verdict.violations,
      messageCount: input.messages.length,
      contextChars: input.context.length,
      usage: result.usage
    });
    return json(res, 200, { final: verdict.final, content: verdict.content, step: activeStep, promptVersion: PROMPT_VERSION, model: MODEL_VERSION, trace });
  } catch (error) {
    const failureClass = classifyFailure(error && error.stage === 'database' ? 'database' : 'internal', error);
    await emit('error', { failureClass });
    return fail(failureLayer(failureClass) === 'database' ? 503 : 500, error && error.message ? error.message : 'StorySculpt could not complete this step.');
  }
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
