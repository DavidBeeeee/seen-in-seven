// Next Step Navigator generation core. WBR-368.
//
// This is the pure, side-effect-free heart of /api/navigator: it normalizes the
// member's input, parses and validates the model's output, and - the part the
// 300 scored FAIL for having none of - guarantees a safe fallback so the tool
// never hands a member a raw error. api/navigator.js imports these; the
// evaluation harness (scripts/navigator-eval.mjs) and the rebuild-parity guard
// (scripts/navigator-parity.mjs) run the SAME functions against a fixed set of
// vague, broad, conflicting and adversarial inputs and model outputs, so what
// ships is what was tested.
//
// Nothing here touches the model, the network, Supabase, or the prompt. The
// system prompt still lives in api/navigator.js; this module only decides what
// counts as a usable result and what to do when the result is not usable.

export const RESULT_FIELDS = ['next_action', 'first_15_minutes', 'done_when', 'why_this_now'];

export const INPUT_LIMITS = {
  objective: 1200,
  current_reality: 1800,
  blocker: 1200,
  available_time: 120,
  deadline: 120
};

// A genuinely useful move the member can complete right now with no tool, used
// whenever the model is unreachable or returns something unusable. It is honest
// about being the fallback rather than pretending to be a tailored answer, and
// it still gives the four fields the UI renders, so the experience degrades
// instead of breaking. Developer F.51-60.
export const SAFE_FALLBACK = Object.freeze({
  next_action: 'Write the one outcome you need next and the single thing blocking it, in two plain sentences.',
  first_15_minutes: 'Open a blank note. Sentence one: the outcome you want. Sentence two: the one obstacle in the way. Do not edit, just get both down.',
  done_when: 'You have two sentences saved: one naming the outcome, one naming the obstacle.',
  why_this_now: 'The Navigator could not reach its model for a tailored route this time. Naming the outcome and the obstacle in your own words is the move that makes the real next step obvious, and it needs nothing but you and two minutes.'
});

function asString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

// Normalize and validate member input. Throws a member-safe Error when a required
// prompt is empty or over its limit, exactly as the endpoint has always done, so
// the caller can answer 400 with a message rather than crash. Never returns a
// partial object.
export function normalizeInput(body) {
  const source = body && typeof body === 'object' ? body : {};
  const out = {};
  for (const key of ['objective', 'current_reality', 'blocker', 'available_time']) {
    const value = asString(source[key]).trim();
    if (!value || value.length > INPUT_LIMITS[key]) {
      throw new Error('Complete each Navigator prompt before choosing the next move.');
    }
    out[key] = value;
  }
  const deadline = asString(source.deadline).trim();
  out.deadline = deadline.length > INPUT_LIMITS.deadline ? deadline.slice(0, INPUT_LIMITS.deadline) : deadline;
  return out;
}

// True only when obj carries all four fields as non-empty trimmed strings.
export function isValidResult(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return RESULT_FIELDS.every(field => typeof obj[field] === 'string' && obj[field].trim().length > 0);
}

// Pull the first balanced {...} object out of a string that may be bare JSON,
// fenced JSON (```json ... ```), or JSON with prose around it. Returns the
// substring or null. Never throws.
function extractJsonObject(text) {
  const str = String(text || '');
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth += 1; }
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) return str.slice(start, i + 1);
    }
  }
  return null;
}

// Parse a model response into a validated four-field result. Returns
// { ok: true, result } or { ok: false }. NEVER throws, whatever it is handed:
// empty, prose, truncated JSON, an array, a number, or a valid object with extra
// keys. The returned result is trimmed to exactly the four fields.
export function parseNavigatorResult(rawContent) {
  if (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)) {
    return isValidResult(rawContent) ? { ok: true, result: pickFields(rawContent) } : { ok: false };
  }
  const text = String(rawContent == null ? '' : rawContent).trim();
  if (!text) return { ok: false };
  const candidates = [];
  const extracted = extractJsonObject(text);
  if (extracted) candidates.push(extracted);
  candidates.push(text);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isValidResult(parsed)) return { ok: true, result: pickFields(parsed) };
    } catch (error) {
      // Try the next candidate; a parse failure is not an error here.
    }
  }
  return { ok: false };
}

function pickFields(obj) {
  const out = {};
  for (const field of RESULT_FIELDS) out[field] = String(obj[field]).trim();
  return out;
}

// The guarantee the endpoint and harness both rely on: given anything a model or
// a mock can produce, return a usable four-field result and say where it came
// from. Valid output is passed through as 'generated'; everything else yields the
// SAFE_FALLBACK as 'fallback'. Never throws.
export function repeatsRecentMove(result, recentMoves = []) {
  const key = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return recentMoves.some(move => key(move.next_action) === key(result.next_action));
}

export function coerceResult(rawContent, recentMoves = []) {
  const parsed = parseNavigatorResult(rawContent);
  if (parsed.ok && !repeatsRecentMove(parsed.result, recentMoves)) return { result: parsed.result, source: 'generated' };
  if (repeatsRecentMove(SAFE_FALLBACK, recentMoves)) {
    const alternative = {
      next_action: 'Compare your last move with what happened and write the one thing you would change before trying again.',
      first_15_minutes: 'Read your saved move. Write what happened, what you learned, and one specific change to your next attempt.',
      done_when: 'You have saved one concrete change based on the result of your last move.',
      why_this_now: 'The Navigator could not produce a fresh tailored route. This review uses your last attempt instead of asking you to repeat it.'
    };
    if (repeatsRecentMove(alternative, recentMoves)) throw new Error('No fresh move is available just now. Review your saved moves before trying again.');
    return { result: alternative, source: 'fallback' };
  }
  return { result: { ...SAFE_FALLBACK,
    ...(parsed.ok ? { why_this_now: 'The Navigator did not produce a fresh tailored route this time. Naming the outcome and obstacle in your own words helps you choose a different next step.' } : {})
  }, source: 'fallback' };
}

// Safety boundary: re-export StorySculpt's crisis detector to share cleanly across Hub tools.
export { detectCrisis } from './storysculpt-steps.js';

export function navigatorCrisisResponse(name) {
  const who = name && name.trim() ? `${name.trim()}, ` : '';
  return [
    `${who}I am going to pause the Navigator here, because what you just wrote matters more than any next step we could choose today.`,
    '',
    "If you are thinking about ending your life or hurting yourself, please talk to a real person right now. You do not have to have the right words.",
    '',
    '- **US and Canada:** call or text **988** (Suicide and Crisis Lifeline)',
    '- **UK and Ireland:** call **116 123** (Samaritans)',
    '- **Australia:** call **13 11 14** (Lifeline)',
    '- **Anywhere else:** findahelpline.com lists free, confidential lines in your country',
    '- **If you are in immediate danger:** call your local emergency number',
    '',
    "Next Step Navigator is an automated planning tool. It can help find business actions, but it cannot be there for you the way a real person can. Please reach out to someone you trust, too.",
    '',
    "When you are ready, the Navigator will still be here, and so will every move you have saved."
  ].join('\n');
}
