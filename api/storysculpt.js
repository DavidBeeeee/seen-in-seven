import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authenticatedUser, consumeQuota, json } from './_lib/security.js';

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
    return String(content).trim();
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const user = await authenticatedUser(req);
  if (!user || !(await hasEeeAccess(req))) return json(res, 403, { error: 'An active EEE membership is required.' });

  try {
    const input = validateBody(req.body);
    const allowed = await consumeQuota({ subject: 'user:' + user.id, endpoint: 'storysculpt', limit: 60, req, userId: user.id });
    if (!allowed) return json(res, 429, { error: 'StorySculpt needs a short pause before the next request.' });
    const content = await callStorySculpt(input);
    const final = content.startsWith('FINAL SCRIPT:');
    return json(res, 200, { final, content: content.replace(/^(FINAL SCRIPT:|NEXT QUESTION:)\s*/i, '').trim() });
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'StorySculpt took too long on this pass. Your project is saved, so please try this step again.'
      : error && error.message ? error.message : 'StorySculpt could not complete this step.';
    return json(res, 500, { error: message });
  }
}
