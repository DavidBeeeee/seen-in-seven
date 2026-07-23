import {
  buildSystemPrompt,
  composeSections,
  parseSections,
  publishedPrompt,
  reviewAndRepairScript,
  reviewAndRepairSection,
  stripSectionLabels
} from './_lib/prompt-engine.js';
import {
  authenticatedUser,
  consumeQuota,
  ensureGuest,
  json
} from './_lib/security.js';

export const config = { maxDuration: 90 };

const MODES = new Set(['mission', 'script', 'section', 'full-regeneration']);
const SECTIONS = new Set(['HOOK', 'OPEN LOOP', 'MEAT', 'CONCLUSION', 'CTA']);
const MISSION_SYSTEM_PROMPT = `You are writing a first-person mission statement for someone who just committed to completing a 7-video content challenge. This statement will live on their dashboard and should feel like their own words, not an outside analysis.

Write 3 grounded sentences, 65 to 90 words total.

Requirements:
1. Use first person: I, my, me.
2. Mention the real thing they are done carrying or moving beyond.
3. Mention what they are moving toward.
4. Include why being seen matters to them or to the people they want to reach.
5. End with a simple commitment to finish the 7 videos.

Tone: warm, direct, grounded, human. No corporate language. No buzzwords. No exclamation points. No diagnosis. No second-person analysis. No em dashes. No phrases like "embark on," "journey," or "unlock your potential." Return only the mission statement.`;

function boundedString(value, name, maximum, required = false) {
  if (value == null || value === '') {
    if (required) throw new Error(name + ' is required.');
    return '';
  }
  if (typeof value !== 'string') throw new Error(name + ' must be text.');
  const clean = value.trim();
  if (required && !clean) throw new Error(name + ' is required.');
  if (clean.length > maximum) throw new Error(name + ' is too long.');
  return clean;
}

function validateRequest(body) {
  const input = body && typeof body === 'object' ? body : {};
  const mode = String(input.mode || '');
  if (!MODES.has(mode)) throw new Error('Unknown generation mode.');
  if ('systemMsg' in input || 'systemPrompt' in input) throw new Error('Custom system prompts are not accepted.');

  const userContext = boundedString(input.userContext, 'Story context', 90000, true);
  if (mode === 'mission') return { mode, userContext };

  const video = Number(input.videoNumber);
  const level = Number(input.level);
  if (!Number.isInteger(video) || video < 1 || video > 7) throw new Error('Video number must be between 1 and 7.');
  if (level !== 1 && level !== 2) throw new Error('Level must be 1 or 2.');

  const result = { mode, userContext, video, level };
  if (mode === 'section') {
    result.section = String(input.sectionKey || '').toUpperCase().replace(/_/g, ' ');
    if (!SECTIONS.has(result.section)) throw new Error('Unknown script section.');
    result.existingScript = boundedString(input.existingScript, 'Current script', 16000, true);
    result.feedback = boundedString(input.feedback, 'Regeneration feedback', 3000, true);
  } else if (mode === 'full-regeneration') {
    result.existingScript = boundedString(input.existingScript, 'Current script', 16000, true);
    result.feedback = boundedString(input.feedback, 'Regeneration feedback', 3000, true);
  }
  return result;
}

export async function callModel(system, user, temperature = 0.8, maxTokens = 1200) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('Script generation is not configured.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        max_tokens: maxTokens,
        temperature
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error && data.error.message ? data.error.message : 'The script service did not respond normally.');
    }
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content || !String(content).trim()) throw new Error('The AI returned an empty response.');
    return String(content).trim();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request took too long. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function regenerationMessage(input) {
  if (input.mode === 'full-regeneration') {
    return `${input.userContext}

CURRENT FULL SCRIPT (for context only; write a fresh complete script):
${input.existingScript}

FEEDBACK FOR THIS REGENERATION: ${input.feedback}

Regenerate the entire Video ${input.video}, Level ${input.level} script from the supplied user context and feedback. Treat the five sections as distinct writing operations: design the CONCLUSION and CTA first, reverse-engineer a seamless MEAT from that destination, write the OPEN LOOP afterward, and write the independent pattern-interrupt HOOK last. Apply the Seamless Rule only inside [MEAT]. Return exactly [HOOK], [OPEN LOOP], [MEAT], [CONCLUSION], and [CTA] with no commentary.`;
  }
  return input.userContext;
}

function sectionMessage(input) {
  return `${input.userContext}

CURRENT FULL SCRIPT (for context):
${input.existingScript}

FEEDBACK FOR THIS REGENERATION: ${input.feedback}

Regenerate ONLY the [${input.section}] section, applying the feedback above while following the same Video ${input.video}, Level ${input.level} blueprint and all supplied user context. Return only the new section text with no label, no other sections, and no commentary.`;
}

async function generateScript(input, prompt) {
  const systemPrompt = buildSystemPrompt(prompt.prompt, input.level, input.video);
  const userMessage = regenerationMessage(input);
  let lastError;

  // The editor can occasionally identify a real issue but decline to make a
  // narrow patch, especially when a user gave brief answers. Start over with
  // a clean draft twice before putting any recovery work in front of the user.
  for (let attempt = 0; attempt < 3; attempt++) {
    const retryNote = attempt
      ? '\n\nA previous draft did not pass the final story check. Write a genuinely fresh complete script. Follow the five-section format exactly, make the CTA's current-video orientation precise, and avoid every banned phrase. Do not explain the rewrite.'
      : '';
    try {
      const draft = await callModel(systemPrompt, userMessage + retryNote, 0.8);
      const content = await reviewAndRepairScript({
        script: draft,
        systemPrompt,
        userMessage: userMessage + retryNote,
        level: input.level,
        video: input.video,
        callModel
      });
      return { content, promptVersion: prompt.version, generationAttempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      const message = String(error && error.message || '');
      const canRetry = /story review found an issue|script response still needs correction/i.test(message);
      if (!canRetry || attempt === 2) throw error;
    }
  }

  throw lastError || new Error('The script needs another pass.');
}

async function generateSection(input, prompt) {
  const systemPrompt = buildSystemPrompt(prompt.prompt, input.level, input.video);
  const userMessage = sectionMessage(input);
  const draft = await callModel(systemPrompt, userMessage, 0.8);
  const parsed = parseSections(draft);
  const replacement = parsed && parsed[input.section]
    ? parsed[input.section]
    : stripSectionLabels(draft);
  if (!replacement) throw new Error('The AI returned an empty section.');
  const current = parseSections(input.existingScript);
  if (!current) throw new Error('The current script does not have all five labeled sections.');
  const complete = composeSections({ ...current, [input.section]: replacement });
  const content = await reviewAndRepairSection({
    script: complete,
    section: input.section,
    systemPrompt,
    userMessage,
    level: input.level,
    video: input.video,
    callModel
  });
  return { content, promptVersion: prompt.version };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const input = validateRequest(req.body);
    const user = await authenticatedUser(req);
    const guest = user ? null : ensureGuest(req, res);

    if (!user && input.mode !== 'mission' && input.video > 1 && !guest.verifiedAt) {
      return json(res, 403, {
        error: 'Complete the quick human check to keep creating scripts.',
        code: 'HUMAN_CHECK_REQUIRED'
      });
    }

    const subject = user ? 'user:' + user.id : 'guest:' + guest.id;
    const configuredLimit = Number(process.env.LLM_HOURLY_LIMIT);
    const normalLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 20;
    const limit = user || guest.verifiedAt ? normalLimit : Math.min(normalLimit, 5);
    const allowed = await consumeQuota({
      subject,
      endpoint: 'generate',
      limit,
      req,
      userId: user ? user.id : null
    });
    if (!allowed) {
      return json(res, 429, {
        error: 'You have generated a lot in a short time. Give it a little while, then try again.'
      });
    }

    if (input.mode === 'mission') {
      const content = await callModel(MISSION_SYSTEM_PROMPT, input.userContext, 0.6, 400);
      return json(res, 200, { content, promptVersion: 'mission-v1' });
    }

    const prompt = publishedPrompt();
    const result = input.mode === 'section'
      ? await generateSection(input, prompt)
      : await generateScript(input, prompt);
    return json(res, 200, result);
  } catch (error) {
    const message = error && error.message ? error.message : 'Script generation failed.';
    const badRequest = /required|must be|too long|Unknown|not accepted|does not have/.test(message);
    return json(res, badRequest ? 400 : 500, { error: message });
  }
}
