import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { authenticatedUser, consumeQuota, json } from './_lib/security.js';
import {
  MODEL_VERSION,
  promptVersion,
  classifyOutput,
  classifyFailure,
  buildEventDetail
} from './_lib/storysculpt-observability.js';

export const config = { maxDuration: 90 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const MODES = new Set(['bold', 'mini', 'rant']);

function source(name) {
  return readFileSync(join(process.cwd(), 'assets', 'storysculpt', name), 'utf8');
}

const CORE_INSTRUCTIONS = source('instructions.txt');
const MODE_SOURCES = {
  bold: [
    source('knowledge/Tiktok Hooks.txt'),
    source('knowledge/Hooks and CTA Scripts for 2026.txt'),
    source("knowledge/Example Scripts for the 5 E's.txt")
  ].join('\n\n'),
  mini: [
    source('knowledge/60 Second Perfect Framework for Video Shorts.txt'),
    source('knowledge/_mini example script.txt'),
    source('knowledge/Hooks and CTA Scripts for 2026.txt')
  ].join('\n\n'),
  rant: [
    source('knowledge/Tiktok Hooks.txt'),
    source("knowledge/Example Scripts for the 5 E's.txt"),
    source('knowledge/Hooks and CTA Scripts for 2026.txt')
  ].join('\n\n')
};

// Bump this when the systemPrompt() template below changes in a way that alters
// generation. The blueprint sources are hashed automatically; this tag covers
// the wrapper the sources are assembled into, so the recorded prompt version
// moves whenever the real prompt does. Developer I.89.
const PROMPT_TEMPLATE_TAG = 'v1';
const PROMPT_VERSION = promptVersion(
  CORE_INSTRUCTIONS,
  MODE_SOURCES.bold,
  MODE_SOURCES.mini,
  MODE_SOURCES.rant,
  PROMPT_TEMPLATE_TAG
);

// Best-effort event write to the logs table, using the member's own token so it
// passes the same row-level policy the client logEvent uses. It never throws
// and never blocks generation on its own failure: telemetry that breaks the
// feature it watches is worse than no telemetry. Member content is never
// passed; buildEventDetail whitelists the fields. WBR-384.
async function recordEvent(token, userId, eventType, detail) {
  if (!token || !userId) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      await fetch(SUPABASE_URL + '/rest/v1/logs', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ user_id: userId, event_type: eventType, detail }),
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
  const messages = Array.isArray(body && body.messages) ? body.messages.slice(-24) : [];
  return {
    mode,
    projectTitle: cleanText(body && body.projectTitle, 160),
    context: cleanText(body && body.context, 12000),
    messages: messages.map(message => ({
      role: message && message.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(message && message.content, 8000)
    })).filter(message => message.content)
  };
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

function systemPrompt(mode) {
  return `You are StorySculpt, an interactive talking-head script interview inside Colorado Mastermind Studio.

The active format is /${mode}. Follow only that format's process in the supplied instructions. Guide the member through one decision at a time. Preserve raw, rough, uncomfortable, funny, aggressive, or speculative details instead of sanding them down. Never invent testimonials, credentials, results, diagnoses, or exact quotations. You may infer motives, connective tissue, and plausible interpretations that strengthen the member's own material.

INTERACTION CONTRACT:
- Ask only the next question or present the next small set of choices. Do not dump the whole workflow on the member.
- Read the complete conversation before deciding which step comes next. Never repeat a question already answered.
- When offering directions or hooks, give exactly three concise options and end by asking the member to choose one, mix them, or request three more.
- Do not write the final script before the format's required choices and story evidence are present.
- When ready, return the finished title and continuous script prefixed with exactly FINAL SCRIPT:. Do not add an explanation after it.
- For every intermediate response, prefix the response with exactly NEXT QUESTION:.
- Write for the member's voice and facts. Source documents teach structure, not David Bee's biography or personal voice.
- Never use an em dash. Not in questions, not in options, not in the finished script. Use a comma, a full stop, or a rewritten sentence instead. This applies to every format, not only /rant.

ESTABLISHED STORYSCULPT INSTRUCTIONS:
${CORE_INSTRUCTIONS}

FORMAT REFERENCE MATERIAL:
${MODE_SOURCES[mode]}`;
}

async function callStorySculpt(input) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('StorySculpt generation is not configured.');
  const context = [
    input.projectTitle ? 'PROJECT TITLE: ' + input.projectTitle : '',
    input.context ? 'MEMBER CONTEXT:\n' + input.context : ''
  ].filter(Boolean).join('\n\n');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-v4-pro',
        messages: [
          { role: 'system', content: systemPrompt(input.mode) },
          ...(context ? [{ role: 'user', content: context }] : []),
          ...input.messages
        ],
        max_tokens: 1900,
        thinking: { type: 'disabled' },
        temperature: 0.86
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

  if (!(await hasEeeAccess(req))) {
    await emit('denied', { failureClass: classifyFailure('entitlement') });
    return json(res, 403, { error: 'An active EEE membership is required.' });
  }

  let input;
  try {
    input = validateBody(req.body);
  } catch (error) {
    await emit('error', { failureClass: classifyFailure('input') });
    return json(res, 400, { error: error && error.message ? error.message : 'StorySculpt could not read that request.' });
  }

  try {
    const allowed = await consumeQuota({ subject: 'user:' + user.id, endpoint: 'storysculpt', limit: 60, req, userId: user.id });
    if (!allowed) {
      await emit('denied', { failureClass: classifyFailure('quota') });
      return json(res, 429, { error: 'StorySculpt needs a short pause before the next request.' });
    }

    let result;
    try {
      result = await callStorySculpt(input);
    } catch (error) {
      await emit('error', { failureClass: classifyFailure('generation', error) });
      const message = error && error.name === 'AbortError'
        ? 'StorySculpt took too long on this pass. Your project is saved, so please try this step again.'
        : error && error.message ? error.message : 'StorySculpt could not complete this step.';
      return json(res, error && error.name === 'AbortError' ? 504 : 502, { error: message });
    }

    // Server-side output validation. Developer F.60: a technically successful
    // generation that breaks the script contract is caught here, not shipped.
    const verdict = classifyOutput(result.content);
    if (!verdict.ok) {
      await emit('output_rejected', { failureClass: classifyFailure('output'), violations: [verdict.reason] });
      return json(res, 502, { error: 'StorySculpt produced a response that did not meet the script contract. Your project is saved, so please try this step again.' });
    }

    await emit('generation', {
      failureClass: undefined,
      final: verdict.final,
      sanitized: verdict.sanitized,
      violations: verdict.violations,
      messageCount: input.messages.length,
      contextChars: input.context.length,
      usage: result.usage
    });
    return json(res, 200, { final: verdict.final, content: verdict.content, promptVersion: PROMPT_VERSION, model: MODEL_VERSION, trace });
  } catch (error) {
    await emit('error', { failureClass: classifyFailure('internal', error) });
    return json(res, 500, { error: error && error.message ? error.message : 'StorySculpt could not complete this step.' });
  }
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
