import { authenticatedUser, consumeQuota, json } from './_lib/security.js';

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';

const MODEL_VERSION = 'deepseek-v4-pro';

function bearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

async function hasEeeAccess(req) {
  const token = bearerToken(req);
  if (!token) return false;
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/has_studio_app_access', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_app_key: 'eee' })
  });
  return response.ok && await response.json().catch(() => false) === true;
}

// Best-effort usage event, the same shape StorySculpt and Certainty already
// record: it goes through the record_log_event RPC with the member's own token,
// so the logs INSERT policy resolves the caller's internal users.id from
// auth.uid() and the row lands attributed to the right member. It NEVER carries
// member content (no objective, reality, or blocker text), only the outcome,
// model, and timing, and it never throws or blocks the Navigator on its own
// failure. WBR-384.
async function recordEvent(token, eventType, detail) {
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
        body: JSON.stringify({ p_event_type: eventType, p_detail: detail || {} }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    // Observability must never break the app.
  }
}

function field(body, key, maximum) {
  const value = String(body && body[key] || '').trim();
  if (!value || value.length > maximum) throw new Error('Complete each Navigator prompt before choosing the next move.');
  return value;
}

async function chooseNextAction(input) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('The Navigator is not configured.');
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: `You are the Next Step Navigator. Reduce a complicated business or creative situation to one concrete next action the member can complete in the time available.

Return valid JSON with exactly these string fields: next_action, first_15_minutes, done_when, why_this_now.

Rules:
- Choose one action, not a plan, list, strategy, category, or vague recommendation.
- Start next_action with a physical verb and name the actual artifact, person, decision, or screen involved.
- Fit the action inside the member's available time. If the full result cannot fit, define the smallest useful proof or decision that can.
- Address the stated blocker without diagnosing the member or adding a new project.
- Use plain language. Do not promote a tool, course, coach, or service.
- Do not include markdown or commentary outside the JSON.` },
        { role: 'user', content: JSON.stringify(input) }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 450,
      thinking: { type: 'disabled' },
      temperature: 0.55
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error && data.error.message || 'The Navigator did not respond normally.');
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  const parsed = JSON.parse(String(content || '{}'));
  if (!parsed.next_action || !parsed.first_15_minutes || !parsed.done_when || !parsed.why_this_now) throw new Error('The Navigator could not reduce this to one clear move.');
  return { result: parsed, usage: data.usage || null };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const token = bearerToken(req);
  const started = Date.now();
  // One terminal usage event per request. Whitelisted fields only, never the
  // member's objective, reality, or blocker. WBR-384.
  const emit = (outcome, extra = {}) => recordEvent(token, 'navigator_' + outcome, {
    schema: 1,
    outcome,
    model: MODEL_VERSION,
    latencyMs: Date.now() - started,
    ...extra
  });

  const user = await authenticatedUser(req);
  if (!user || !(await hasEeeAccess(req))) {
    await emit('denied');
    return json(res, 403, { error: 'An active EEE membership is required.' });
  }
  try {
    const input = {
      objective: field(req.body, 'objective', 1200),
      current_reality: field(req.body, 'current_reality', 1800),
      blocker: field(req.body, 'blocker', 1200),
      available_time: field(req.body, 'available_time', 120),
      deadline: String(req.body && req.body.deadline || '').trim()
    };
    const allowed = await consumeQuota({ subject: 'user:' + user.id, endpoint: 'navigator', limit: 30, req, userId: user.id });
    if (!allowed) {
      await emit('denied', { failureClass: 'quota' });
      return json(res, 429, { error: 'The Navigator needs a short pause before another route.' });
    }
    const { result, usage } = await chooseNextAction(input);
    await emit('generation', { hasDeadline: Boolean(input.deadline), usage });
    return json(res, 200, result);
  } catch (error) {
    await emit('error', { failureClass: 'generation' });
    return json(res, 500, { error: error && error.message || 'The Navigator could not choose the next move.' });
  }
}
