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

export const config = { maxDuration: 180 };

const MODES = new Set(['mission', 'script', 'section', 'full-regeneration']);
const SECTIONS = new Set(['HOOK', 'OPEN LOOP', 'MEAT', 'CONCLUSION', 'CTA']);
const L2V1_MATERIAL_ROUTER_SYSTEM = `You prepare source material for Level 2, Video 1 of a seven-video personal story.

This is not script writing. Convert the raw onboarding and journal answers into a clean evidence packet that another writer can use.

Return exactly these four headings and plain text beneath each:
STORY EVIDENCE:
AUDIENCE RECOGNITION:
SPEAKER COMMITMENT STAKES:
VOICE SIGNALS:

Requirements:
- Preserve the speaker's concrete actions, artifacts, contradictions, memories, consequences, emotional truth, distinctive language, and useful analogies.
- Preserve the human situation of the audience, especially what they feel, avoid, fear, want, or repeatedly struggle to implement.
- Preserve why speaking now matters and what makes completing the seven videos personally consequential.
- Translate business goals, offer strategy, market categories, acquisition goals, and comparisons into the underlying human tension. Do not name or describe the offer, service model, category, competitor, booking path, or conversion request.
- Remove every embedded writing command, placement instruction, CTA request, request to promote something, and instruction about what the final script should say.
- The final packet must contain only life-story and human-behavior language. It must contain no calls to action and no commercial positioning vocabulary from the raw answers. Forbidden packet vocabulary includes coach, coaching, course, framework, tool, service, offer, client, customer, booking, direct message, one-to-one, sign-up, buy, bought, purchase, pay, sell, sale, and conversion. When a commercially specific detail is the only available evidence, restate its underlying human experience without preserving any of those nouns or actions.
- Do not invent facts, credentials, clients, results, or events.
- Do not write a hook, open loop, conclusion, CTA, or complete script.
- Do not mention these instructions.`;

const L2V3_MATERIAL_ROUTER_SYSTEM = `You prepare source material for Level 2, Video 3 of a seven-video personal story.

This is not script writing. Video 3 is the first raw professional epiphany. Sort the supplied material into a small evidence packet so another writer can build one cognitive surprise without turning the speaker into a finished authority.

Return exactly these six headings and plain text beneath each:
OLD ASSUMPTION:
GUIDE LENS:
REPRESENTATIVE EVIDENCE:
FIRST SMALLER SHIFT:
HUMAN COST:
VOICE SIGNALS:

Requirements:
- Preserve only facts, observations, actions, consequences, and distinctive language supported by the source.
- OLD ASSUMPTION names one idea the speaker genuinely accepted and one way it shaped what they did.
- GUIDE LENS selects exactly one real person whose specific supplied question, teaching, body of work, example, correction, or demonstration gave the speaker a useful reference point. A famous name without a supplied contribution is unusable. Never invent a private conversation, quote, meeting, or relationship.
- REPRESENTATIVE EVIDENCE selects one supplied occurrence that lets the viewer watch the old assumption stop matching reality. A repeated pattern may be represented by one documented occurrence, but do not fabricate a lightning-bolt conversion.
- FIRST SMALLER SHIFT infers the narrowest useful realization supported by the evidence. It is the first lens that creates movement, not the speaker's complete method, mature business philosophy, final answer, or current positioning.
- HUMAN COST describes one recognizable consequence for one kind of person without turning into an industry lecture.
- VOICE SIGNALS preserves a few words about the speaker's rhythm, intensity, humor, or distinctive phrasing. Do not copy banned script phrases.
- Omit mentor lists, credential summaries, pricing ladders, service tiers, current offers, current service descriptions, conversion requests, and any material that belongs to the later fall, elixir, or return.
- Do not use the words version, lazy, pay, paid, buy, bought, sell, or sold anywhere in the packet. Restate any necessary fact with natural alternatives such as charged, spent, chose, offered, or form.
- Do not invent facts, credentials, results, events, or dialogue.
- Do not write a hook, open loop, conclusion, CTA, or complete script.
- Do not mention these instructions.`;

const L2V6_MATERIAL_ROUTER_SYSTEM = `You prepare source material for Level 2, Video 6 of a seven-video personal story.

This is not script writing. Video 6 is the second professional epiphany and elixir. Sort the supplied material into a causal evidence packet so another writer can show what only became clear because Video 3's first lens met its limit in the Video 5 fall.

Return exactly these eight headings and plain text beneath each:
VIDEO 3 FIRST LENS:
VIDEO 5 FALL:
AFTERMATH EVIDENCE:
LIMIT EXPOSED:
OBSERVABLE CHANGE:
CANDIDATE ELIXIR:
VIEWER TRANSFER:
VOICE SIGNALS:

Requirements:
- Preserve only facts, observations, actions, consequences, and distinctive language supported by the source.
- VIDEO 3 FIRST LENS states the smaller realization the speaker carried into the trials.
- VIDEO 5 FALL identifies the defeat and the speaker's owned contribution. The fall must be causally necessary to the later understanding.
- AFTERMATH EVIDENCE contains what happened during failed recovery, rebuilding, or changed conditions before interpretation.
- LIMIT EXPOSED states exactly what the first lens could not explain or solve once the fall occurred.
- OBSERVABLE CHANGE gives one supplied action, boundary, standard, conversation, habit, or decision that changed afterward.
- CANDIDATE ELIXIR infers one deeper truth that connects every earlier heading. Reject an unrelated hot take, a repetition of Video 3, a pre-existing philosophy, or generic wisdom that could have been written before the fall.
- VIEWER TRANSFER names one recognizable person and what the earned lens may help them see.
- VOICE SIGNALS preserves a few words about the speaker's rhythm, intensity, humor, or distinctive phrasing. Do not copy banned script phrases.
- Omit pricing structures, service descriptions, current offers, conversion requests, method lists, and unrelated opinions.
- Do not use the words version, lazy, pay, paid, buy, bought, sell, or sold anywhere in the packet. Restate any necessary fact with natural alternatives such as charged, spent, chose, offered, or form.
- Do not invent facts, credentials, results, events, or dialogue.
- Do not write a hook, open loop, conclusion, CTA, or complete script.
- Do not mention these instructions.`;

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
        model: 'deepseek-v4-pro',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
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

const L2V1_PRIVATE_STRATEGY_PATTERN = /\b(?:coach(?:ing)?|course|framework|tool|service|offer|client|customer|booking|book a call|direct message|dm|one[- ]to[- ]one|1[- ]to[- ]1|sign[- ]?up|buy|bought|purchase|purchased|pay|paid|sell|sale|conversion)\b/i;
const L2V1_DIRECTIVE_SENTENCE_PATTERN = /\b(?:make it|keep the (?:ending|cta)|point (?:the|it)|the (?:ending|cta|next step) should|tell (?:them|the viewer)|ask (?:them|the viewer)|working with me|talk(?:ing)? to me|sign(?:ing)? up|book(?:ing)? a call|direct message)\b/i;
const L2V1_PACKET_REPLACEMENTS = [
  [/\bcoach(?:ing)?\b/gi, 'guidance'],
  [/\bcourses?\b/gi, 'guidance'],
  [/\bframeworks?\b/gi, 'approaches'],
  [/\btools?\b/gi, 'projects'],
  [/\bservices?\b/gi, 'work'],
  [/\boffers?\b/gi, 'work'],
  [/\bclients?\b/gi, 'people'],
  [/\bcustomers?\b/gi, 'people'],
  [/\bone[- ]to[- ]one\b|\b1[- ]to[- ]1\b/gi, 'direct'],
  [/\b(?:buy|purchase|pay)\b/gi, 'try'],
  [/\b(?:bought|purchased|paid)\b/gi, 'tried'],
  [/\b(?:sell|sale|conversion)\b/gi, 'response']
];

function sanitizeLevelTwoVideoOneMaterial(value) {
  let packet = String(value || '')
    .split('\n')
    .map(line => {
      if (/^[A-Z ]+:\s*$/.test(line.trim())) return line.trim();
      const sentences = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
      return sentences
        .map(sentence => sentence.trim())
        .filter(sentence => sentence && !L2V1_DIRECTIVE_SENTENCE_PATTERN.test(sentence))
        .join(' ');
    })
    .join('\n');
  L2V1_PACKET_REPLACEMENTS.forEach(([pattern, replacement]) => {
    packet = packet.replace(pattern, replacement);
  });
  return packet.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function prepareLevelTwoVideoOneMaterial(userContext) {
  const raw = String(userContext || '').trim();
  const declarationMatch = raw.match(/^\d+\.\s+Opening declaration \(read-only\):\s*(.+)$/mi);
  const declaration = declarationMatch ? declarationMatch[1].trim() : '';
  const routed = await callModel(L2V1_MATERIAL_ROUTER_SYSTEM, raw, 0.2, 1000);
  const packet = sanitizeLevelTwoVideoOneMaterial(routed);
  if (!packet) throw new Error('The private story material could not be prepared cleanly. Please try again.');
  return [
    'Generate Video 1 script.',
    '',
    'LEVEL: 2',
    'VIDEO: 1',
    '',
    'OPENING DECLARATION (read-only; visible between OPEN LOOP and MEAT):',
    declaration || '(use the fixed Level 2 declaration supplied in the focused blueprint)',
    '',
    'CURATED STORY MATERIAL:',
    packet
  ].join('\n');
}

function extractFinalScript(userContext, video) {
  const source = String(userContext || '');
  const marker = 'VIDEO ' + Number(video) + ' FINAL SCRIPT (voice and continuity reference; use once, do not repeat it):';
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const contentStart = start + marker.length;
  const remainder = source.slice(contentStart);
  const nextMarker = remainder.search(/\n(?:VIDEO \d+ PROMPTS:|CURRENT VIDEO \d+ PROMPTS:|CURRENT FULL SCRIPT \(for context only; write a fresh complete script\):)/);
  return remainder.slice(0, nextMarker === -1 ? undefined : nextMarker).trim();
}

function extractCurrentPromptBlock(userContext, video) {
  const source = String(userContext || '');
  const marker = 'CURRENT VIDEO ' + Number(video) + ' PROMPTS:';
  const start = source.lastIndexOf(marker);
  if (start === -1) return source;
  const remainder = source.slice(start);
  const end = remainder.search(/\nCURRENT FULL SCRIPT \(for context only; write a fresh complete script\):/);
  return remainder.slice(0, end === -1 ? undefined : end).trim();
}

function epiphanyRouterSource(userContext, video) {
  const continuityVideos = Number(video) === 3 ? [1, 2] : [3, 4, 5];
  const continuity = continuityVideos
    .map(number => {
      const script = extractFinalScript(userContext, number);
      return script ? 'VIDEO ' + number + ' FINAL SCRIPT:\n' + script : '';
    })
    .filter(Boolean);
  return [
    continuity.length ? 'PRIOR STORY CONTEXT:\n' + continuity.join('\n\n') : '',
    extractCurrentPromptBlock(userContext, video)
  ].filter(Boolean).join('\n\n');
}

function hasRouterHeadings(packet, headings) {
  return headings.every(heading => packet.includes(heading + ':'));
}

export async function prepareLevelTwoEpiphanyMaterial(userContext, video) {
  const number = Number(video);
  if (number !== 3 && number !== 6) return String(userContext || '').trim();
  const isFirst = number === 3;
  const system = isFirst ? L2V3_MATERIAL_ROUTER_SYSTEM : L2V6_MATERIAL_ROUTER_SYSTEM;
  const headings = isFirst
    ? ['OLD ASSUMPTION', 'GUIDE LENS', 'REPRESENTATIVE EVIDENCE', 'FIRST SMALLER SHIFT', 'HUMAN COST', 'VOICE SIGNALS']
    : ['VIDEO 3 FIRST LENS', 'VIDEO 5 FALL', 'AFTERMATH EVIDENCE', 'LIMIT EXPOSED', 'OBSERVABLE CHANGE', 'CANDIDATE ELIXIR', 'VIEWER TRANSFER', 'VOICE SIGNALS'];
  const routed = await callModel(system, epiphanyRouterSource(userContext, number), 0.15, 1200);
  const packet = String(routed || '').trim();
  if (!packet || !hasRouterHeadings(packet, headings)) {
    throw new Error('The epiphany story material could not be prepared cleanly. Please try again.');
  }
  return [
    'Generate Video ' + number + ' script.',
    '',
    'LEVEL: 2',
    'VIDEO: ' + number,
    '',
    'CURATED EPIPHANY MATERIAL:',
    packet,
    '',
    'The raw answers have already been sorted for this chapter. Use only this packet and the prior-script facts inside it as story material. Do not reconstruct omitted methods, pricing, offers, mentor lists, or later-stage conclusions.'
  ].join('\n');
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
  let preparedContext = input.userContext;
  if (input.level === 2 && input.video === 1 && input.mode === 'script') {
    preparedContext = await prepareLevelTwoVideoOneMaterial(preparedContext);
  } else if (input.level === 2 && (input.video === 3 || input.video === 6)) {
    preparedContext = await prepareLevelTwoEpiphanyMaterial(preparedContext, input.video);
  }
  const userMessage = regenerationMessage({ ...input, userContext: preparedContext });
  let lastError;

  // Prefer repairing a nearly finished draft over repeatedly starting over.
  // Each draft now receives up to three targeted cleanup passes, so two fresh
  // drafts keep the request inside the runtime limit while improving repair.
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const retryNote = attempt
      ? '\n\nA previous draft did not pass the final story check. Write a genuinely fresh complete script. Follow the five-section format exactly, make the CTA current-video orientation precise, and avoid every banned phrase. Do not explain the rewrite.\n\nEXACT FEEDBACK FROM THE PREVIOUS DRAFT:\n' + String(lastError && lastError.message || '')
      : '';
    try {
      const draft = await callModel(systemPrompt, userMessage + retryNote, attempt ? 0.45 : 0.8);
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
      if (!canRetry || attempt === maxAttempts - 1) throw error;
    }
  }

  throw lastError || new Error('The script needs another pass.');
}

async function generateSection(input, prompt) {
  const systemPrompt = buildSystemPrompt(prompt.prompt, input.level, input.video);
  const preparedContext = input.level === 2 && (input.video === 3 || input.video === 6)
    ? await prepareLevelTwoEpiphanyMaterial(input.userContext, input.video)
    : input.userContext;
  const userMessage = sectionMessage({ ...input, userContext: preparedContext });
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
