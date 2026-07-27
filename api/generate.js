import {
  buildSystemPrompt,
  composeSections,
  finalizeScriptOpenLoop,
  finalizeScriptHook,
  generateFinalOpenLoop,
  generateFinalHook,
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
- Treat the headings as non-overlapping evidence ownership. Keep the strongest and most specific expression of each fact once. When a later heading depends on an earlier fact, add only the new relationship or consequence instead of restating the fact, phrase, number, duration, or judgment.
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
CONTRADICTING EVIDENCE:
COGNITIVE DISSONANCE:
RESERVED PARADIGM SHIFT:
HUMAN COST:
VOICE SIGNALS:

Requirements:
- Treat the headings as non-overlapping evidence ownership. Keep the strongest and most specific expression of each fact once. When a later heading depends on an earlier fact, add only the new relationship or consequence instead of restating the fact, phrase, number, duration, or judgment.
- Preserve only facts, observations, actions, consequences, and distinctive language supported by the source.
- OLD ASSUMPTION names one idea the speaker genuinely accepted and one way it shaped what they did.
- CONTRADICTING EVIDENCE selects one supplied occurrence or coherent pattern that the old assumption cannot explain. Preserve a naturally mentioned person, teaching, conversation, or influence only when it belongs to that evidence. Never require, manufacture, or cast someone as a mentor.
- COGNITIVE DISSONANCE states the exact unresolved collision between OLD ASSUMPTION and CONTRADICTING EVIDENCE without interpreting or resolving it.
- RESERVED PARADIGM SHIFT is an internal inference, not user-facing copy. Derive one complete but bounded realization that resolves COGNITIVE DISSONANCE through a hidden relationship, cause, category error, reversal, or complexity bridge. Complete means it gives the viewer a powerful usable lens. Bounded means it does not explain the later fall, become a complete method, state the speaker's mature business philosophy, or resolve the whole journey.
- HUMAN COST describes one recognizable person, the real-life consequence of carrying the old idea, and what they may need to recognize sooner, without turning into an industry lecture or an offer.
- VOICE SIGNALS preserves a few words about the speaker's rhythm, intensity, humor, or distinctive phrasing. Do not copy banned script phrases.
- Omit credential summaries, pricing ladders, service tiers, current offers, current service descriptions, conversion requests, and any material that belongs to the later fall, elixir, or return.
- Do not use the words version, lazy, pay, paid, buy, bought, sell, or sold anywhere in the packet. Restate any necessary fact with natural alternatives such as charged, spent, chose, offered, or form.
- Do not invent facts, credentials, results, events, or dialogue.
- Do not write a hook, open loop, conclusion, CTA, or complete script.
- Do not mention these instructions.`;

const L2V4_MATERIAL_ROUTER_SYSTEM = `You prepare source material for Level 2, Video 4 of a seven-video personal story.

This is not script writing. Video 4 is a recoverable trial, not the fall. It shows the speaker acting on the first professional realization before enough proof exists, facing a human temptation to retreat, and receiving the first meaningful sign that continuing may be worthwhile. Sort the supplied material into one focused story sequence.

Return exactly these nine headings and plain text beneath each:
FIRST LENS:
CHANGED ACTION:
RECOVERABLE TRIAL:
OLD-WORLD TEMPTATION:
CHOICE BEFORE PROOF:
FIRST MEANINGFUL RESULT:
WHAT IT MADE POSSIBLE:
WHAT REMAINED OPEN:
VOICE SIGNALS:

Requirements:
- Treat the headings as non-overlapping evidence ownership. Keep the strongest and most specific expression of each fact once. When a later heading depends on an earlier fact, add only the new relationship or consequence instead of restating the fact, phrase, number, duration, or judgment.
- Preserve only facts, actions, pressures, consequences, and distinctive language supported by the supplied Video 2 and Video 3 scripts and current Video 4 answers.
- FIRST LENS reduces the bounded realization carried out of Video 3 to one short clause. Do not copy its polished wording, governing metaphor, discovery story, human-cost argument, or completed reframe.
- CHANGED ACTION identifies what the speaker actually chose, said, made, stopped, started, or handled differently because of that lens.
- RECOVERABLE TRIAL selects one representative supported sequence where acting differently remained uncertain, awkward, inconvenient, discouraging, or socially unrewarded. Repeated pressure may appear inside this sequence, but do not assemble a montage of unrelated tests.
- Apply the recoverability test: if the speaker could wake up and try again with roughly the same life, identity, work, and resources, it may belong here. If something central was destroyed, ended, or appeared impossible to restore, reserve it for Video 5.
- OLD-WORLD TEMPTATION preserves what appeared to reward the earlier approach and what made retreating, imitating it, hiding, stopping, or returning to the familiar choice feel appealing. Keep this human and specific rather than converting it into a market lesson. Concrete commercial contrasts may remain when they belong to the lived scene and choice; remove them only when they become present-day positioning or a sales argument.
- CHOICE BEFORE PROOF states what the speaker did while the result was still unknown. Do not add hindsight or explain why the choice was correct.
- FIRST MEANINGFUL RESULT preserves one observable supported consequence that gave the choice meaning. It may be modest. Do not invent praise, clients, money, metrics, outcomes, or certainty.
- WHAT IT MADE POSSIBLE states only what that result reasonably allowed the speaker to hope, attempt, or believe was possible then. Do not turn it into universal advice, a case study, a method, or mature authority.
- WHAT REMAINED OPEN may preserve one ordinary uncertainty, dependency, effort, or unfinished condition supported by the source. It is optional context, not a required warning or seed of disaster. Never predict or explain the fall.
- VOICE SIGNALS preserves a few words about the speaker's rhythm, intensity, humor, or distinctive phrasing. Do not copy banned script phrases.
- Omit current offers, service descriptions, conversion requests, mature authority, Video 5 ordeal, recovery, Video 6 elixir, and Video 7 return.
- Do not use the words version, floor, lazy, pay, paid, buy, bought, sell, or sold anywhere in the packet. Restate any necessary supported fact naturally.
- Do not invent facts, credentials, results, events, or dialogue.
- Do not write a hook, open loop, conclusion, CTA, or complete script.
- Do not mention these instructions.`;

const L2V5_MATERIAL_ROUTER_SYSTEM = `You prepare source material for Level 2, Video 5 of a seven-video personal story.

This is not script writing. Video 5 is the fall: one causal descent that ends in an objective loss or a symbolic professional death the speaker genuinely believed might be permanent. Choose one ordeal nucleus instead of combining every difficult event. Sort the supplied material so another writer can tell the defeat without leaking the recovery or the second epiphany.

Return exactly these nine headings and plain text beneath each:
ORDEAL NUCLEUS:
WHAT BECAME REAL ENOUGH TO LOSE:
COLLAPSE EVIDENCE:
OWNED CHOICE:
IGNORED WARNING AND ESCALATION:
FAILED RECOVERY:
SYMBOLIC DEATH:
LOWEST-POINT THOUGHT:
VOICE SIGNALS:

Requirements:
- Treat the headings as non-overlapping evidence ownership. Keep the strongest and most specific expression of each fact once. When a later heading depends on an earlier fact, add only the new relationship or consequence instead of restating the fact, phrase, number, duration, or judgment.
- Give priority to the current Video 5 journal entry or answers. Use Videos 2 through 4 only to preserve continuity and identify what had become meaningful enough to lose. Video 4 does not need to cause the fall.
- ORDEAL NUCLEUS selects one event or gradual collapse and states the causal spine. Do not assemble a montage of unrelated failures.
- A gradual collapse qualifies. A calling, identity, confidence, judgment, path, relationship to the work, or belief in the value of what the speaker knows may suffer symbolic death even when no company literally closes.
- WHAT BECAME REAL ENOUGH TO LOSE identifies the hope, work, identity, responsibility, relationship, or future that mattered before the fall. Keep this brief.
- COLLAPSE EVIDENCE preserves the most concrete, arresting truthful details that show the defeat was real. Do not turn them into a summary, lesson, market analysis, or hook.
- OWNED CHOICE identifies the speaker's consequential action, refusal, avoidance, overconfidence, or blind spot precisely. The speaker is responsible without becoming the villain.
- IGNORED WARNING AND ESCALATION traces how the owned choice continued or intensified after the speaker had reason to question it.
- FAILED RECOVERY shows the attempted repair and what remained broken when it failed.
- SYMBOLIC DEATH states what the speaker believed had ended or become impossible to restore inside their identity, work, or future.
- LOWEST-POINT THOUGHT preserves the most painful supported first-person question or belief available at the end of the descent. Infer a direct emotional formulation when the source gives the meaning but not polished wording.
- Facts about money, clients, offers, services, products, attention, or public response may remain when they are necessary evidence. They cannot become the thesis, a business lesson, positioning, or a recommendation.
- Preserve explicit hardship and morally complicated, socially risky, or uncomfortable facts supplied by the speaker. Do not sanitize, dispute, moralize, soften, or replace them with a safer professional metaphor.
- When answers are thin, infer motives, emotional consequences, causal connections, and plausible connective detail from the larger supplied story. Do not invent a wholly unrelated disaster, victim, dependent, crime, diagnosis, credential, or result.
- Remove every recovery, lesson, silver lining, mature diagnosis, present-day method, service philosophy, authority claim, and Video 6 epiphany before returning the packet. The writer must not see the answer to the next chapter.
- Do not use the words version, floor, lazy, pay, paid, buy, bought, sell, or sold anywhere in the packet. Restate a necessary fact naturally.
- Do not write a hook, open loop, conclusion, CTA, or complete script.
- Do not mention these instructions.`;

const L2V6_MATERIAL_ROUTER_SYSTEM = `You prepare source material for Level 2, Video 6 of a seven-video personal story.

This is not script writing. Video 6 is the second professional epiphany and elixir. Sort the supplied material into a causal evidence packet so another writer can show what only became clear because of the Video 5 fall and its aftermath. Video 3 may be related, but that relationship is optional and must never be manufactured.

Return exactly these nine headings and plain text beneath each:
VIDEO 5 FALL:
PRE-FALL UNDERSTANDING:
AFTERMATH EVIDENCE:
UNRESOLVED COLLISION:
OBSERVABLE CHANGE:
RESERVED PARADIGM SHIFT:
VIEWER TRANSFER:
OPTIONAL VIDEO 3 CONNECTION:
VOICE SIGNALS:

Requirements:
- Treat the headings as non-overlapping evidence ownership. Keep the strongest and most specific expression of each fact once. When a later heading depends on an earlier fact, add only the new relationship or consequence instead of restating the fact, phrase, number, duration, or judgment.
- Preserve only facts, observations, actions, consequences, and distinctive language supported by the source.
- VIDEO 5 FALL identifies the defeat and the speaker's owned contribution. The fall must be causally necessary to the later understanding.
- PRE-FALL UNDERSTANDING states the belief, assumption, strategy, or explanation involved in the ordeal. Derive it from Video 5 and the current answers rather than assuming it came from Video 3.
- AFTERMATH EVIDENCE contains what happened during failed recovery, rebuilding, or changed conditions before interpretation.
- UNRESOLVED COLLISION states the exact cognitive dissonance between PRE-FALL UNDERSTANDING and the fall or aftermath evidence without resolving it.
- OBSERVABLE CHANGE gives one supplied action, boundary, standard, conversation, habit, or decision that changed afterward.
- RESERVED PARADIGM SHIFT infers one complete hard-won paradigm shift that resolves UNRESOLVED COLLISION, restructures the viewer's understanding, and is simple enough to carry. Reject an unrelated hot take, a repetition of Video 3, a pre-existing philosophy, or generic wisdom that could have been written before the fall.
- VIEWER TRANSFER names one recognizable person and what the earned lens may help them see.
- OPTIONAL VIDEO 3 CONNECTION contains one brief relationship only when the supplied story genuinely shows that the second epiphany deepens, corrects, or completes the first. Otherwise write "Not supplied." Never force this relationship and never use it as the causal source of Video 6.
- VOICE SIGNALS preserves a few words about the speaker's rhythm, intensity, humor, or distinctive phrasing. Do not copy banned script phrases.
- Omit pricing structures, service descriptions, current offers, conversion requests, method lists, and unrelated opinions.
- Do not use the words version, lazy, pay, paid, buy, bought, sell, or sold anywhere in the packet. Restate any necessary fact with natural alternatives such as charged, spent, chose, offered, or form.
- Do not invent facts, credentials, results, events, or dialogue.
- Do not write a hook, open loop, conclusion, CTA, or complete script.
- Do not mention these instructions.`;

const L2_EPIPHANY_PACKET_CLEANUP_SYSTEM = `You are the evidence-packet editor between a story interviewer and a script writer.

Return only the corrected packet with exactly the same headings and heading order supplied by the user. Do not add commentary.

For a Video 3 packet:
- Preserve one old assumption, one contradicting evidence thread, the unresolved cognitive dissonance between them, one complete but bounded reserved paradigm shift, and one human cost.
- Preserve a naturally supplied person or influence only when they belong to the evidence. Never require or manufacture a mentor, and never turn names into a credential list.
- The reserved paradigm shift must reveal a hidden relationship, cause, category error, reversal, or complexity bridge and give the viewer a useful new lens. It cannot prescribe what an industry, price, method, or person should do, explain the later fall, or become a complete method.
- Never invent a direct conversation, quote, meeting, credential, result, or event.

For a Video 6 packet:
- Preserve the causal chain from the Video 5 fall through the pre-fall understanding, aftermath evidence, unresolved cognitive dissonance, observable change, and one hard-won reserved paradigm shift.
- Preserve an optional Video 3 connection only when the source explicitly or naturally supports it. "Not supplied" is correct when the epiphanies are independent.
- Remove forced Video 3 corrections, unrelated opinions, repeated Video 3 conclusions, pre-existing philosophy, methods, offers, and commercial positioning.
- Never invent a fact, result, event, or behavioral change.

For both packets:
- Deduplicate across headings before returning the packet. Keep each fact, phrase, number, duration, event, and consequence in its strongest location once. A dependent heading adds only the new relationship or interpretation.
- Remove credential summaries, pricing ladders, service tiers, current offers, current service descriptions, conversion requests, and material owned by another chapter.
- Do not use the words version, lazy, pay, paid, buy, bought, sell, or sold. Use natural alternatives when a supported fact requires one.
- Keep the packet concise. This is source material, not a script.`;

const L2V4_PACKET_CLEANUP_SYSTEM = `You are the evidence-packet editor between a story interviewer and the writer of Level 2, Video 4.

Return only the corrected packet with exactly the same headings and heading order supplied by the user. Do not add commentary.

Requirements:
- Deduplicate across headings before returning the packet. Keep each fact, phrase, number, duration, event, and consequence in its strongest location once. A dependent heading adds only the new relationship or interpretation.
- Preserve one bounded first lens, one observable changed action, one recoverable trial, the old-world temptation inside it, the speaker's choice before proof, one meaningful result, and what that result made possible. WHAT REMAINED OPEN is optional and must never be manufactured.
- Compare every packet detail against the authoritative source material supplied beside it. Remove invented scenes, actions, reactions, dialogue, outcomes, and numerical precision. A direct paraphrase is allowed; a plausible detail absent from the source is not.
- RECOVERABLE TRIAL must be a representative sequence the speaker could have tried again after. Remove completed collapse, apparently permanent loss, failed recovery, or worst-day material owned by Video 5.
- OLD-WORLD TEMPTATION must expose a specific human pull toward retreat, imitation, hiding, stopping, or the familiar choice. Remove market analysis, competitor commentary, and explanations of why the speaker's approach was professionally superior.
- Preserve concrete commercial contrasts when they belong to the lived scene and human choice. Remove them only when they become present-day positioning or a sales argument.
- CHOICE BEFORE PROOF must remain a choice made under uncertainty. Remove the result and every explanation of why the choice was correct.
- FIRST MEANINGFUL RESULT must be observable and supported. Keep it separate from the trial and choice so the writer can reserve it as the answer to the Open Loop.
- WHAT IT MADE POSSIBLE may contain hope or provisional confidence, but no universal lesson, method, proof claim, or advice.
- WHAT REMAINED OPEN may describe an ordinary dependency, effort, uncertainty, or unfinished condition. It cannot diagnose, foreshadow, cause, or predict Video 5.
- Keep the speaker inside what they could know then. Remove hindsight diagnoses, later lessons, recovery, second epiphany, mature method, service descriptions, offers, and commercial positioning.
- Never invent a fact, result, event, audience reaction, metric, or dialogue.
- Do not use the words version, floor, lazy, pay, paid, buy, bought, sell, or sold.
- Keep the packet concise. This is source material, not a script.`;

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

export async function prepareLevelTwoVideoOneMaterial(userContext) {
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
  const nextMarker = remainder.search(/\n(?:VIDEO \d+ PROMPTS:|VIDEO \d+ JOURNAL ENTRY \(easy mode\):|CURRENT VIDEO \d+ PROMPTS:|CURRENT VIDEO \d+ JOURNAL ENTRY \(easy mode; use this to infer all story beats\):|CURRENT FULL SCRIPT \(for context only; write a fresh complete script\):)/);
  return remainder.slice(0, nextMarker === -1 ? undefined : nextMarker).trim();
}

function extractCurrentPromptBlock(userContext, video) {
  const source = String(userContext || '');
  const number = Number(video);
  const markers = [
    'CURRENT VIDEO ' + number + ' PROMPTS:',
    'CURRENT VIDEO ' + number + ' JOURNAL ENTRY (easy mode; use this to infer all story beats):'
  ];
  const start = Math.max(...markers.map(marker => source.lastIndexOf(marker)));
  if (start === -1) return source;
  const remainder = source.slice(start);
  const end = remainder.search(/\nCURRENT FULL SCRIPT \(for context only; write a fresh complete script\):/);
  return remainder.slice(0, end === -1 ? undefined : end).trim();
}

function extractOnboardingBlock(userContext) {
  const source = String(userContext || '');
  const marker = 'ONBOARDING DATA:';
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const remainder = source.slice(start);
  const end = remainder.search(/\n(?:VIDEO \d+ PROMPTS:|VIDEO \d+ JOURNAL ENTRY \(easy mode\):|VIDEO \d+ FINAL SCRIPT)/);
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

function videoFourRouterSource(userContext) {
  const continuity = [2, 3]
    .map(number => {
      const script = extractFinalScript(userContext, number);
      return script ? 'VIDEO ' + number + ' FINAL SCRIPT:\n' + script : '';
    })
    .filter(Boolean);
  return [
    continuity.length ? 'PRIOR STORY CONTEXT:\n' + continuity.join('\n\n') : '',
    extractCurrentPromptBlock(userContext, 4)
  ].filter(Boolean).join('\n\n');
}

function videoFiveRouterSource(userContext) {
  const continuity = [2, 3, 4]
    .map(number => {
      const script = extractFinalScript(userContext, number);
      return script ? 'VIDEO ' + number + ' FINAL SCRIPT:\n' + script : '';
    })
    .filter(Boolean);
  return [
    extractOnboardingBlock(userContext),
    continuity.length ? 'PRIOR STORY CONTEXT:\n' + continuity.join('\n\n') : '',
    extractCurrentPromptBlock(userContext, 5)
  ].filter(Boolean).join('\n\n');
}

function hasRouterHeadings(packet, headings) {
  return headings.every(heading => packet.includes(heading + ':'));
}

function cleanPacketOutput(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

export async function prepareLevelTwoEpiphanyMaterial(userContext, video) {
  const number = Number(video);
  if (number !== 3 && number !== 6) return String(userContext || '').trim();
  const isFirst = number === 3;
  const system = isFirst ? L2V3_MATERIAL_ROUTER_SYSTEM : L2V6_MATERIAL_ROUTER_SYSTEM;
  const headings = isFirst
    ? ['OLD ASSUMPTION', 'CONTRADICTING EVIDENCE', 'COGNITIVE DISSONANCE', 'RESERVED PARADIGM SHIFT', 'HUMAN COST', 'VOICE SIGNALS']
    : ['VIDEO 5 FALL', 'PRE-FALL UNDERSTANDING', 'AFTERMATH EVIDENCE', 'UNRESOLVED COLLISION', 'OBSERVABLE CHANGE', 'RESERVED PARADIGM SHIFT', 'VIEWER TRANSFER', 'OPTIONAL VIDEO 3 CONNECTION', 'VOICE SIGNALS'];
  const routed = await callModel(system, epiphanyRouterSource(userContext, number), 0.15, 1200);
  const routedPacket = String(routed || '').trim();
  if (!routedPacket || !hasRouterHeadings(routedPacket, headings)) {
    throw new Error('The epiphany story material could not be prepared cleanly. Please try again.');
  }
  let packet = '';
  let malformed = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const cleanupMessage = [
      'VIDEO: ' + number,
      '',
      'REQUIRED HEADINGS IN THIS EXACT ORDER:',
      headings.map(heading => heading + ':').join('\n'),
      '',
      attempt
        ? 'The previous cleanup omitted or renamed a required heading. Include every required heading exactly, even when its value must say "Not supplied." Do not add or rename headings.'
        : '',
      malformed ? '\nMALFORMED CLEANUP TO CORRECT:\n' + malformed : '',
      '',
      'PACKET TO CLEAN:',
      routedPacket
    ].filter(Boolean).join('\n');
    const cleaned = await callModel(L2_EPIPHANY_PACKET_CLEANUP_SYSTEM, cleanupMessage, 0.05, 1200);
    const candidate = cleanPacketOutput(cleaned);
    if (candidate && hasRouterHeadings(candidate, headings)) {
      packet = candidate;
      break;
    }
    malformed = candidate;
  }
  if (!packet) {
    throw new Error('The epiphany story material could not be cleaned safely. Please try again.');
  }
  const draftingConstraints = isFirst
    ? 'FINAL VIDEO 3 WRITING CONSTRAINTS: Privately pair one exact UNANSWERED QUESTION with the RESERVED PARADIGM SHIFT that answers it. The OPEN LOOP is written independently from the completed Meat and reserved Conclusion and creates that exact conceptually unfinished question without implying the answer. It does not explain or continue the Hook. The MEAT carries OLD ASSUMPTION through CONTRADICTING EVIDENCE and ends with COGNITIVE DISSONANCE unresolved. State RESERVED PARADIGM SHIFT for the first time in the CONCLUSION, followed by one HUMAN COST. Supply a provisional HOOK label for formatting; the global Hook Studio will replace its text after the story is settled.'
    : 'FINAL VIDEO 6 WRITING CONSTRAINTS: Privately pair one exact UNANSWERED QUESTION with the RESERVED PARADIGM SHIFT that answers it. The OPEN LOOP is written independently from the completed Meat and reserved Conclusion and creates the exact unanswered meaning produced by VIDEO 5 FALL and its aftermath without implying its resolution. It does not explain or continue the Hook. The MEAT carries VIDEO 5 FALL and AFTERMATH EVIDENCE through PRE-FALL UNDERSTANDING and UNRESOLVED COLLISION, ending with that cognitive dissonance unresolved. State RESERVED PARADIGM SHIFT for the first time in the CONCLUSION, followed by one new possibility or VIEWER TRANSFER. Use OPTIONAL VIDEO 3 CONNECTION only when it contains a genuine supported relationship; otherwise omit Video 3 completely. Supply a provisional HOOK label for formatting; the global Hook Studio will replace its text after the story is settled.';
  return [
    'Generate Video ' + number + ' script.',
    '',
    'LEVEL: 2',
    'VIDEO: ' + number,
    '',
    'CURATED EPIPHANY MATERIAL:',
    packet,
    '',
    'The raw answers have already been sorted for this chapter. Use only this packet and the prior-script facts inside it as story material. Do not reconstruct omitted methods, pricing, offers, mentor lists, or later-stage conclusions.',
    '',
    draftingConstraints
  ].join('\n');
}

export async function prepareLevelTwoVideoFourMaterial(userContext) {
  const headings = ['FIRST LENS', 'CHANGED ACTION', 'RECOVERABLE TRIAL', 'OLD-WORLD TEMPTATION', 'CHOICE BEFORE PROOF', 'FIRST MEANINGFUL RESULT', 'WHAT IT MADE POSSIBLE', 'WHAT REMAINED OPEN', 'VOICE SIGNALS'];
  const source = videoFourRouterSource(userContext);
  const routed = await callModel(L2V4_MATERIAL_ROUTER_SYSTEM, source, 0.15, 1200);
  const routedPacket = cleanPacketOutput(routed);
  if (!routedPacket || !hasRouterHeadings(routedPacket, headings)) {
    throw new Error('The Video 4 story material could not be prepared cleanly. Please try again.');
  }
  let packet = '';
  let malformed = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const cleanupMessage = [
      'REQUIRED HEADINGS IN THIS EXACT ORDER:',
      headings.map(heading => heading + ':').join('\n'),
      '',
      attempt
        ? 'The previous cleanup omitted or renamed a required heading. Include every required heading exactly, even when its value must say "Not supplied." Do not add or rename headings.'
        : '',
      malformed ? '\nMALFORMED CLEANUP TO CORRECT:\n' + malformed : '',
      '',
      'AUTHORITATIVE SOURCE MATERIAL:',
      source,
      '',
      'PACKET TO CLEAN:',
      routedPacket
    ].filter(Boolean).join('\n');
    const cleaned = await callModel(L2V4_PACKET_CLEANUP_SYSTEM, cleanupMessage, 0.05, 1200);
    const candidate = cleanPacketOutput(cleaned);
    if (candidate && hasRouterHeadings(candidate, headings)) {
      packet = candidate;
      break;
    }
    malformed = candidate;
  }
  if (!packet) {
    throw new Error('The Video 4 story material could not be cleaned safely. Please try again.');
  }
  return [
    'Generate Video 4 script.',
    '',
    'LEVEL: 2',
    'VIDEO: 4',
    '',
    'CURATED RECOVERABLE-TRIAL MATERIAL:',
    packet,
    '',
    'The raw answers have already been sorted for this chapter. Use only this packet as story material. Privately pair one exact pressing UNANSWERED QUESTION from the completed Meat with FIRST MEANINGFUL RESULT as its reserved answer. Write the OPEN LOOP independently from that unfinished relationship after the Meat and Conclusion are settled. It does not explain or continue the Hook. It is not a place for general setup, a decision summary, stakes language, or vague anticipation. Supply a provisional HOOK label for formatting; the global Hook Studio will replace its text after the story is settled.',
    '',
    'FINAL VIDEO 4 WRITING CONSTRAINTS: Write entirely from the speaker\'s perspective at that point in time. The OPEN LOOP independently creates the pressing unanswered question from the completed story. The MEAT must advance through behavior rather than restaging that question. Reduce FIRST LENS to one brief continuity clause, then carry CHANGED ACTION through RECOVERABLE TRIAL, OLD-WORLD TEMPTATION, and CHOICE BEFORE PROOF before stopping ahead of the result. Concrete contrasts involving names, diagrams, pages, promotions, prices, or presentation may remain when they are part of the lived scene and temptation; do not convert them into present-day positioning or a sales argument. Reveal FIRST MEANINGFUL RESULT for the first time in the CONCLUSION. Let it prove only that this one choice mattered, then state what it made possible then. Do not repeat Video 3, validate the complete philosophy, or convert the result into a lesson, method, case study, expertise claim, or professional proof. The CTA must deliberately drop the emotional temperature: identify this as Video 4 of 7 and use exactly one "because" to foreshadow that the next chapter contains the devastating event that nearly destroyed what had begun to feel possible and that the speaker must own their role. Reveal the magnitude and responsibility, but withhold the event, exact loss, causal choices, recovery, and later truth. Never frame Video 5 as the Video 4 approach merely becoming insufficient, and never use generic promises about the next challenge, real test, or what happens next.'
  ].join('\n');
}

export async function prepareLevelTwoVideoFiveMaterial(userContext) {
  const headings = [
    'ORDEAL NUCLEUS',
    'WHAT BECAME REAL ENOUGH TO LOSE',
    'COLLAPSE EVIDENCE',
    'OWNED CHOICE',
    'IGNORED WARNING AND ESCALATION',
    'FAILED RECOVERY',
    'SYMBOLIC DEATH',
    'LOWEST-POINT THOUGHT',
    'VOICE SIGNALS'
  ];
  const source = videoFiveRouterSource(userContext);
  let malformed = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const correction = attempt
      ? [
          'Your previous packet omitted or renamed a required heading.',
          'Return every heading below exactly once and in this order, even when a heading must say "Not supplied."',
          headings.map(heading => heading + ':').join('\n'),
          '',
          'MALFORMED PACKET TO CORRECT:',
          malformed,
          '',
          'AUTHORITATIVE SOURCE MATERIAL:',
          source
        ].join('\n')
      : source;
    const routed = await callModel(L2V5_MATERIAL_ROUTER_SYSTEM, correction, attempt ? 0.05 : 0.15, 1300);
    const packet = cleanPacketOutput(routed);
    if (packet && hasRouterHeadings(packet, headings)) {
      return [
        'Generate Video 5 script.',
        '',
        'LEVEL: 2',
        'VIDEO: 5',
        '',
        'CURATED ORDEAL MATERIAL:',
        packet,
        '',
        'The raw answers have already been sorted for this chapter. Use only this packet as story material. Choose one emotional destination from SYMBOLIC DEATH and LOWEST-POINT THOUGHT before drafting. Build one causal descent rather than a list of hardships. Facts about money, clients, offers, services, attention, or public response are evidence only; they cannot become the thesis or lesson.',
        '',
        'FINAL VIDEO 5 WRITING CONSTRAINTS: Design the CONCLUSION first and reserve the owned lowest-point belief for it. Build the MEAT as one chronological descent through what mattered, the consequential choice, ignored warning or escalation, collapse, and failed recovery. Stop before explaining what any of it eventually meant. Design the OPEN LOOP after the Conclusion and Meat as one independent pressing unfinished meaning, contradiction, cause, or question that the Conclusion will finally close or transform. It exists only to retain attention, does not explain or continue the Hook, and cannot state the speaker\'s mistake, summarize the stakes, or imply the answer. Supply a provisional HOOK label for formatting; the global Hook Studio will replace its text after the story is settled. Reveal the lowest-point belief for the first time in the CONCLUSION and leave the speaker inside the apparent loss with no recovery, diagnosis, authority, reassurance, or silver lining. Continue that exact emotional state into the CTA. Ask the viewer to follow, identify this as Video 5 of the seven-part journey, and explain that Video 6 confronts what the ordeal exposed. Do not say the confusion lifted, something cracked open, recovery began, the answer appeared, or the speaker found a way back.'
      ].join('\n');
    }
    malformed = packet;
  }

  throw new Error('The Video 5 story material could not be prepared cleanly. Please try again.');
}

export function regenerationMessage(input) {
  if (input.mode === 'full-regeneration') {
    return `${input.userContext}

FEEDBACK FOR THIS REGENERATION: ${input.feedback}

This is a FRESH FULL REGENERATION. The previous script has been intentionally withheld. Rebuild Video ${input.video}, Level ${input.level} from the original answers, cumulative story context, active blueprint, and feedback. Do not attempt to preserve, reconstruct, or imitate wording from an earlier draft.

Use the same focused composition process as first-time generation. Apply sentence-level Hook-and-Eye only inside [MEAT]. Build [OPEN LOOP] independently after [MEAT] and [CONCLUSION] are settled. Supply a provisional [HOOK] for the required format; the global Hook Studio will replace it after the story is finished. Return exactly [HOOK], [OPEN LOOP], [MEAT], [CONCLUSION], and [CTA] with no commentary.`;
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
  if (input.level === 2 && input.video === 1 && input.mode !== 'section') {
    preparedContext = await prepareLevelTwoVideoOneMaterial(preparedContext);
  } else if (input.level === 2 && (input.video === 3 || input.video === 6)) {
    preparedContext = await prepareLevelTwoEpiphanyMaterial(preparedContext, input.video);
  } else if (input.level === 2 && input.video === 4) {
    preparedContext = await prepareLevelTwoVideoFourMaterial(preparedContext);
  } else if (input.level === 2 && input.video === 5) {
    preparedContext = await prepareLevelTwoVideoFiveMaterial(preparedContext);
  }
  const userMessage = regenerationMessage({ ...input, userContext: preparedContext });
  let lastError;

  // Standard generation may receive targeted cleanup. Full regeneration keeps
  // its one-piece composition contract and receives a complete rewrite instead.
  // Two fresh attempts keep either path inside the runtime limit.
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
        callModel,
        wholeScriptRewrite: input.mode === 'full-regeneration',
        provisionalHook: true,
        provisionalOpenLoop: true
      });
      const retentionContent = await finalizeScriptOpenLoop({
        script: content,
        systemPrompt,
        userMessage: userMessage + retryNote,
        level: input.level,
        video: input.video,
        callModel
      });
      const finalContent = await finalizeScriptHook({
        script: retentionContent,
        systemPrompt,
        userMessage: userMessage + retryNote,
        level: input.level,
        video: input.video,
        callModel
      });
      return { content: finalContent, promptVersion: prompt.version, generationAttempts: attempt + 1 };
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
  let preparedContext = input.userContext;
  if (input.level === 2 && input.video === 1) {
    preparedContext = await prepareLevelTwoVideoOneMaterial(input.userContext);
  } else if (input.level === 2 && (input.video === 3 || input.video === 6)) {
    preparedContext = await prepareLevelTwoEpiphanyMaterial(input.userContext, input.video);
  } else if (input.level === 2 && input.video === 4) {
    preparedContext = await prepareLevelTwoVideoFourMaterial(input.userContext);
  } else if (input.level === 2 && input.video === 5) {
    preparedContext = await prepareLevelTwoVideoFiveMaterial(input.userContext);
  }
  const userMessage = sectionMessage({ ...input, userContext: preparedContext });
  if (input.section === 'HOOK') {
    const content = await generateFinalHook({
      script: input.existingScript,
      systemPrompt,
      userMessage,
      level: input.level,
      video: input.video,
      callModel
    });
    return { content, promptVersion: prompt.version };
  }
  if (input.section === 'OPEN LOOP') {
    const content = await generateFinalOpenLoop({
      script: input.existingScript,
      systemPrompt,
      userMessage,
      level: input.level,
      video: input.video,
      callModel
    });
    return { content, promptVersion: prompt.version };
  }
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
    console.error('[SeenInSeven generate]', JSON.stringify({
      mode: req && req.body && req.body.mode || 'unknown',
      level: req && req.body && req.body.level,
      videoNumber: req && req.body && req.body.videoNumber,
      message
    }));
    const badRequest = /required|must be|too long|Unknown|not accepted|does not have/.test(message);
    return json(res, badRequest ? 400 : 500, {
      error: message,
      code: badRequest ? 'INVALID_GENERATION_REQUEST' : 'GENERATION_REJECTED'
    });
  }
}
