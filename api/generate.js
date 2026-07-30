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

async function measureStage(timings, name, work) {
  const started = Date.now();
  try {
    return await work();
  } finally {
    timings.push({ stage:name, durationMs:Date.now() - started });
  }
}

function logGenerationTiming(input, timings, started, status) {
  console.info('[SeenInSeven timing]', JSON.stringify({
    mode:input.mode,
    level:input.level,
    video:input.video,
    status,
    totalMs:Date.now() - started,
    stages:timings
  }));
}

const MODES = new Set(['mission', 'script', 'section', 'full-regeneration']);
const SECTIONS = new Set(['HOOK', 'OPEN LOOP', 'MEAT', 'CONCLUSION', 'CTA']);
const MEAT_COMPOSITION_CONTRACT = 'Transform STORY PROGRESSION into sentence-to-sentence movement inside MEAT rather than paraphrasing its planning beats as adjacent declarations. A shared topic or correct chronology does not create Hook-and-Eye flow: each sentence must arise from the sentence immediately before it through cause, consequence, time, escalation, contradiction, or changed action. Vary sentence length naturally, and never bolt on connectors merely to imitate continuity. This contract applies only to MEAT and must not pull the HOOK or OPEN LOOP into the same prose rhythm.';
export const EPISODE_ARCHITECT_HEADINGS = [
  'EPISODE NUCLEUS',
  'HUMAN CONTRADICTION',
  'STORY PROGRESSION',
  'RESERVED CONCLUSION',
  'STAGE FIREWALL',
  'VOICE SIGNALS'
];
export const VIDEO_SEVEN_RETURN_HEADINGS = [
  'CONNECTED JOURNEY PROGRESSION',
  'RESERVED RETURN',
  'HONEST REMAINDER AND HORIZON',
  'VOICE SIGNALS'
];
export const VIDEO_SEVEN_RETURN_ANCHORS = [
  'EARLIER SELF',
  'FIRST SHIFT',
  'FALL',
  'RETURN'
];

export const EPISODE_ARCHITECT_SYSTEM = `You are the private episode architect for SeenInSeven.

This is not script writing. Select and organize one governing human story before another model writes the five visible sections. The current Journey Direction and current-video answers are authoritative. Earlier scripts preserve continuity only and must never replace the assigned chapter with an older, more dramatic, or more familiar story.

Return exactly these six headings and plain text beneath each:
EPISODE NUCLEUS:
HUMAN CONTRADICTION:
STORY PROGRESSION:
RESERVED CONCLUSION:
STAGE FIREWALL:
VOICE SIGNALS:

GENERAL REQUIREMENTS:
- EPISODE NUCLEUS is one private planning sentence that states the single story this episode tells. It is not a hook, thesis, summary, or spoken opening.
- HUMAN CONTRADICTION identifies the value, desire, identity, or hope pulling the speaker forward and the protective belief, habit, fear, loyalty, or practical pressure pulling them back. Do not manufacture equal sides or false balance.
- STORY PROGRESSION is one connected causal or transformational paragraph. Select only the events, decisions, evidence, pressures, consequences, and changes needed for this chapter. Do not return a checklist, montage, collection of examples, or several adjacent arguments.
- RESERVED CONCLUSION states the one emotional or conceptual destination owned by this chapter. Reserve it for the visible Conclusion. It must grow from STORY PROGRESSION and cannot resolve a later chapter.
- STAGE FIREWALL explicitly names the meaning, event, recovery, authority, offer, or later realization that this episode must not reveal.
- VOICE SIGNALS preserves the speaker's useful vocabulary, rhythm, humor, intensity, roughness, and emotionally charged phrasing. Preserve uncomfortable or socially risky material rather than sanitizing it.
- Treat repeated facts across the source as evidence for selection, not permission to repeat them. Keep every distinctive fact, phrase, number, duration, and metaphor in its strongest location once.
- Facts involving work, money, clients, services, attention, or public response may remain when they create the human conflict or prove a consequence. They cannot replace the human story with positioning, market analysis, or advice.
- When the current answers are sparse, infer motives, emotional consequences, causal relationships, and plausible connective details inside the assigned Journey Direction. Do not switch subjects or invent an unrelated event, credential, metric, quotation, diagnosis, victim, or result.
- When a CURRENT FULL SCRIPT FOR SECTION CONTINUITY is supplied, preserve its established episode nucleus, facts, and progression unless the regeneration feedback explicitly requests a story change. Use it for continuity only, never as language to imitate.
- Do not write a hook, open loop, Meat, conclusion, CTA, or complete script. Do not mention these instructions.`;

export const VIDEO_SEVEN_RETURN_SYSTEM = `You are the private Video 7 journey synthesizer for SeenInSeven.

This is not script writing. Bring the six-part audience canon home as one connected human transformation before another model writes the five visible sections.

Return exactly these four headings and plain text beneath each:
CONNECTED JOURNEY PROGRESSION:
EARLIER SELF: one selected anchor
FIRST SHIFT: one selected anchor
FALL: one selected anchor
RETURN: one selected anchor
RESERVED RETURN:
HONEST REMAINDER AND HORIZON:
VOICE SIGNALS:

SOURCE OWNERSHIP:
- Videos 1 through 6 final scripts are the audience canon. They control what the viewer has heard and what the Return has earned.
- If a final script is unavailable, that chapter's saved answer block is fallback evidence only.
- The current Journey Direction describes the desired destination, differentiation, or unresolved flaw. It is not a new scene, thesis, or seventh conflict.
- The current Video 7 answers supply present-day evidence, the honest unfinished element, and the direction that continues.
- Onboarding may clarify identity, audience, or voice, but it cannot introduce an unheard life chapter, professional argument, offer, or result.

RETURN REQUIREMENTS:
- CONNECTED JOURNEY PROGRESSION is a private evidence budget, not visible prose. Return exactly the four labeled anchor lines shown above, in that order, with 18-35 words on each line.
- EARLIER SELF selects its evidence from Videos 1-2 only and holds the strongest concrete detail that makes the earlier identity and refusal understandable.
- FIRST SHIFT selects its evidence from Videos 3-4 only and holds the strongest detail that combines the actual first epiphany with the meaningful trial it produced. An earlier clue, origin event, or first exchange cannot replace the canonical Video 3 realization.
- FALL selects its evidence from Video 5 only and holds the strongest detail that makes the defeat, owned contribution, and human cost real.
- RETURN selects its evidence from Video 6 plus the current Video 7 answers and holds the strongest detail that joins the elixir to observable present behavior. For Level 2, select behavior that makes the earned professional difference visible without stating a positioning claim. When the elixir came from an independent experience, preserve that independence and connect it through the returned identity rather than false causality.
- Every anchor is lived evidence: a concrete event, choice, consequence, or observable behavior. Do not place a distilled lesson, industry declaration, superiority comparison, service description, positioning claim, or final thesis inside an anchor.
- The four anchors must share one governing identity transformation. Each must cause, contrast with, complicate, or reinterpret the next, while still working as a complete journey for a cold viewer.
- Omit every additional event, number, person, phrase, comparison, or metaphor that performs a job already owned by an anchor. Do not place omitted canon facts inside RESERVED RETURN, HONEST REMAINDER AND HORIZON, or VOICE SIGNALS.
- Make the progression independently understandable to a cold viewer while giving a returning viewer specific recognition. Do not announce video numbers, summarize each installment, create a montage, or write a list of lessons.
- When the first and second epiphanies came from independent experiences, preserve that independence. Show how both now live inside the same returned person without claiming one caused the other.
- RESERVED RETURN uses 20-45 words to state only the one governing meaning created by the four anchors. It is the brief homecoming statement that will answer the Open Loop. Do not recap an anchor, add another thesis, explain the earned difference again, diagnose the viewer, or introduce a market argument, service description, superiority claim, or unrelated lesson.
- The governing meaning returns as recognition shared between equals rather than a separate viewer lesson. Never turn it into a promise that the speaker will teach, show, guide, coach, rescue, transform, or produce a result for the viewer.
- HONEST REMAINDER AND HORIZON uses 20-45 words to name the unresolved flaw, fear, habit, limitation, or need that keeps the speaker human, followed by the real direction that makes an ongoing relationship meaningful. The writer will place the honest remainder at the end of MEAT and reserve the relational horizon for CTA; neither belongs in CONCLUSION. Recognition, trust, or continued connection with the speaker must be the primary reason to remain. An unfinished public test may add supporting tension, but watching that test cannot be the viewer's only reason to stay. It cannot become a new central conflict, offer, rescue request, or future episode promise.
- Telling the story across seven videos may help the speaker notice, connect, or articulate the journey. Do not claim that filming seven videos created years of transformation.
- VOICE SIGNALS preserves the speaker's actual vocabulary, rhythm, humor, force, roughness, and emotionally charged phrasing without copying full sentences from earlier scripts.
- Do not write a Hook, Open Loop, Meat, Conclusion, CTA, complete script, episode recap, market manifesto, positioning argument, or sales pitch.`;

export const EPISODE_STAGE_SCHEMAS = {
  1: `STAGE 1, DECLARATION:
Choose one commitment contradiction. The speaker wants to become visible or reach a particular person, while one specific blocker has made silence, delay, or hiding feel protective. Progress from the exact blocker through what it has postponed or protected, then why remaining quiet became unacceptable now. Reserve a conclusion that reclassifies the blocker without claiming transformation. Withhold the origin story, first epiphany, method, offer, and proof that the challenge succeeds.`,
  2: `STAGE 2, ORDINARY WORLD AND REFUSAL:
Choose one ordinary identity bind. Ground the speaker in a recognizable routine, role, pressure, compromise, or expectation; let one unexpected private thread appear; then show one practical choice, delay, dismissal, retreat, or non-choice that kept the familiar life intact. The refusal must occur in behavior and must make sense from who the speaker was then. For Level 1, the private thread is personal. For Level 2, future expertise may be visible to the audience but remains unclaimed by the speaker. Reserve the unresolved assumption that made staying feel sensible. Withhold the first epiphany, mature interpretation, present method, mission, offer, and authority.`,
  3: `STAGE 3, FIRST EPIPHANY:
Choose one belief collision. Establish one old assumption and how it shaped the speaker's action, then follow one continuous occurrence or repeated pattern that the assumption cannot explain. End the progression with both truths still in conflict. Reserve one complete but bounded paradigm shift that resolves the exact contradiction and one human consequence. For Level 1, keep the belief personal. For Level 2, keep the professional lens rooted in the speaker's own implication rather than an industry lecture. Withhold the later ordeal, complete method, mature authority, and second epiphany.`,
  4: `STAGE 4, ROAD OF TRIALS:
Choose one recoverable trial. Begin with one changed action after the first epiphany, enter one representative pressure where returning to the familiar approach feels genuinely tempting, show the choice made before proof, and stop before one meaningful human-scale result. Reserve that result and only the immediate possibility it created. For Level 1, do not substitute a challenge progress report for the larger life story. For Level 2, do not convert the result into a case study, market argument, positioning claim, or proof of the complete philosophy. Withhold the coming ordeal, catastrophic loss, later lesson, and second epiphany.`,
  5: `STAGE 5, FALL OR ORDEAL:
Choose one ordeal nucleus and one causal descent. Establish what had become real enough to lose, identify the speaker's consequential choice, avoidance, blind spot, or overconfidence, trace the ignored warning or escalation, show the collapse, then show the failed attempt to repair it. A gradual collapse or symbolic death qualifies when the speaker believed their identity, calling, relationship, judgment, future, or work might never recover. Reserve the most painful owned lowest-point belief. Withhold recovery, reassurance, gratitude, authority, silver lining, and the second epiphany.`,
  6: `STAGE 6, SECOND EPIPHANY OR ELIXIR:
Choose one evidence-to-elixir journey. Establish one common-sense model, follow one source experience or repeated pattern that refuses to fit it, include one observable practice or decision proving the speaker lives differently, and end with the contradiction unresolved. Reserve one significant counterintuitive truth and one useful new possibility. For Level 1, the truth must be earned through the Video 5 ordeal and aftermath. For Level 2, the source may be Video 5, Video 3, another experience, or a broader pattern; no earlier chapter is required to cause it. Withhold a complete method, commercial philosophy, offer, and final return.`,
  7: `STAGE 7, RETURN:
Bring the six-chapter audience canon home through one governing identity transformation. Select the earlier identity and refusal from Videos 1-2, the actual first realization and trial from Videos 3-4, the fall and cost from Video 5, and the second realization and returned self from Video 6 plus current Video 7 evidence. Keep each movement grounded in one lived event, choice, consequence, or observable behavior rather than a lesson or positioning claim. MEAT owns the complete Return, lets the earned identity or professional difference emerge from changed behavior, and ends with the honest unresolved human element. CONCLUSION is only a brief one-to-three-sentence homecoming statement of the one governing meaning, with no event replay, journey recap, viewer diagnosis, added evidence, or second miniature Return. CTA owns the relational horizon. Let a cold viewer understand the journey and a returning viewer recognize it without hearing an episode-by-episode recap or multiple examples performing the same job. For Level 1, center human identity. For Level 2, preserve professional difference without superiority, positioning, a market manifesto, service promise, or pitch. Withhold a second thesis, new trial, revelation, perfection, offer, manufactured urgency, and any Video 8 promise.`
};

export function episodeArchitectSystem(video) {
  const schema = EPISODE_STAGE_SCHEMAS[Number(video)];
  if (!schema) throw new Error('The episode stage is not configured.');
  return EPISODE_ARCHITECT_SYSTEM + '\n\nACTIVE STAGE SCHEMA:\n' + schema;
}

export function episodeContinuityVideos(video) {
  const number = Number(video);
  if (number <= 1) return [];
  if (number === 2) return [1];
  if (number === 3) return [1, 2];
  if (number === 4) return [2, 3];
  if (number === 5) return [2, 3, 4];
  if (number === 6) return [3, 4, 5];
  return [1, 2, 3, 4, 5, 6];
}
const L2V1_MATERIAL_ROUTER_SYSTEM = `You prepare source material for Level 2, Video 1 of a seven-video personal story.

This is not script writing. Convert the raw onboarding and journal answers into a clean evidence packet that another writer can use.

Return exactly these five headings and plain text beneath each:
GOVERNING BLOCKER:
WHY NOW:
AUDIENCE RECOGNITION:
SUPPORTING STORY EVIDENCE:
VOICE SIGNALS:

Requirements:
- The CURRENT VIDEO 1 JOURNEY DIRECTION and VIDEO 1 PREFILLED PROMPTS are the authoritative brief. The Journey Direction controls the intended chapter. The current answers control its facts, causes, emotional conflict, and meaning.
- Onboarding and background are a supporting archive only. Use an archive detail only when it clarifies or deepens the same causal thread established by the current brief. Never replace that thread with an older, more dramatic, more familiar, or more detailed story.
- If the current answers are sparse, infer within their assigned direction. Do not solve missing detail by changing the subject.
- GOVERNING BLOCKER must preserve the specific reason supplied in the answer about what kept the speaker from posting or becoming visible. Do not substitute camera fear, perfectionism, time, money, confidence, credibility, or any other common blocker unless that is the reason the current answer establishes.
- WHY NOW must preserve what the current answer says made remaining quiet unacceptable now. Do not replace it with generic urgency from the archive.
- AUDIENCE RECOGNITION must preserve who the current answer identifies and the lived problem they are trying to understand or move through.
- SUPPORTING STORY EVIDENCE may contain concrete details from the current answers or archive only when they demonstrate the governing blocker, why-now shift, or audience reality already selected above.
- Treat the headings as non-overlapping evidence ownership. Keep the strongest and most specific expression of each fact once. When a later heading depends on an earlier fact, add only the new relationship or consequence instead of restating the fact, phrase, number, duration, or judgment.
- Preserve the speaker's concrete actions, artifacts, contradictions, memories, consequences, emotional truth, distinctive language, and useful analogies.
- Preserve the human situation of the audience, especially what they feel, avoid, fear, want, or repeatedly struggle to implement.
- Preserve why speaking now matters and what makes completing the seven videos personally consequential.
- Distinguish lived story from promotion. Money, pricing, work, clients, services, and commercial decisions may be essential story evidence when they create the speaker's wound, fear, contradiction, choice, consequence, or stakes. Preserve that meaning accurately.
- Remove private offer strategy, acquisition plans, conversion instructions, promises, and requests to promote a business. Do not erase or euphemize a lived event merely because it involves work or money.
- Remove every embedded writing command, placement instruction, CTA request, request to promote something, and instruction about what the final script should say.
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

This is not script writing. Video 4 is a recoverable trial, not the fall. Preserve the current Video 4 Journey Direction and current answers as one chronological human story about acting on the first realization before enough proof exists.

Return exactly these five headings and plain text beneath each:
FIRST LENS:
CAUSAL STORY SPINE:
RESERVED HUMAN RESULT:
IMMEDIATE POSSIBILITY:
VOICE SIGNALS:

Requirements:
- Treat the current Video 4 Journey Direction and current answers as the authoritative assignment. Previous scripts provide continuity only and cannot replace the assigned subject with a more familiar story.
- Keep the complete causal relationship intact. Do not distribute one idea across several headings, turn the story into a market argument, or assemble a montage of examples.
- When four extended answers are present, preserve their distinct ownership: the first supplies the changed action, the second supplies the recoverable trial and old-world temptation, the third supplies the choice made before proof, and the fourth supplies the result and what it made possible. When one Easy journal entry is present, infer those same four jobs from that entry without changing its selected story.
- FIRST LENS reduces the bounded realization carried out of Video 3 to one short clause. Do not copy its polished wording, governing metaphor, discovery story, human-cost argument, or completed reframe.
- CAUSAL STORY SPINE is one chronological paragraph. It begins with the changed action, enters one representative recoverable trial, makes the old approach look genuinely tempting, and ends with the choice the speaker made while the outcome was still unknown. Stop before the result.
- Apply the recoverability test: if the speaker could wake up and try again with roughly the same life, identity, work, and resources, it may belong here. If something central was destroyed, ended, or appeared impossible to restore, reserve it for Video 5.
- RESERVED HUMAN RESULT is the first concrete occurrence after the choice: a response, interaction, opportunity, completed action, behavioral consequence, or other event a viewer can picture. Preserve the result portion of the current answer material when it supplies one.
- A market trend, industry argument, technology shift, competitor outcome, ideal-customer description, mission statement, or later professional philosophy cannot serve as RESERVED HUMAN RESULT.
- When the result material supplies only an abstraction, use the same current story to infer one plausible, proportionate, non-quantified human-scale occurrence. The inference must grow directly from the supplied action and choice. Do not invent a credential, dramatic success, testimonial, precise amount, metric, direct quotation, or unrelated person.
- IMMEDIATE POSSIBILITY states only what RESERVED HUMAN RESULT allowed the speaker to hope, attempt, or continue at that moment. It cannot become a universal lesson, case study, method, mature authority, audience-positioning statement, or declaration about who the speaker was built to help.
- VOICE SIGNALS preserves a few words about the speaker's rhythm, intensity, humor, or distinctive phrasing. Do not copy banned script phrases.
- Use each distinctive phrase, audience description, governing noun, number, and judgment once in the packet. A later heading may add a consequence but cannot restate the same idea with synonyms.
- Omit current offers, service descriptions, conversion requests, mature authority, Video 5 ordeal, recovery, Video 6 elixir, and Video 7 return.
- Do not use the words version, floor, lazy, pay, paid, buy, bought, sell, or sold anywhere in the packet. Restate any necessary supported fact naturally.
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

This is not script writing. Video 6 is the second professional epiphany and elixir: the speaker's more significant counterintuitive way of living or working, grounded in lived evidence and observable behavior. The source may be the Video 5 fall, the Video 3 realization, another experience, or a repeated pattern. No earlier chapter is a required cause, and no relationship may be manufactured.

Return exactly these nine headings and plain text beneath each:
SOURCE EXPERIENCE OR PATTERN:
COMMON-SENSE MODEL:
CONTRADICTING EVIDENCE:
UNRESOLVED COLLISION:
OBSERVABLE PRACTICE:
RESERVED COUNTERINTUITIVE ELIXIR:
VIEWER TRANSFER:
OPTIONAL JOURNEY CONNECTION:
VOICE SIGNALS:

Requirements:
- Treat the headings as non-overlapping evidence ownership. Keep the strongest and most specific expression of each fact once. When a later heading depends on an earlier fact, add only the new relationship or consequence instead of restating the fact, phrase, number, duration, or judgment.
- Preserve only facts, observations, actions, consequences, and distinctive language supported by the source.
- SOURCE EXPERIENCE OR PATTERN identifies the strongest lived source for the elixir. Prefer the current Video 6 answers. Use Video 5, Video 3, or another earlier chapter only when the supplied material naturally connects it.
- COMMON-SENSE MODEL states the conventional assumption, expected behavior, or ordinary explanation that the speaker's lived practice contradicts.
- CONTRADICTING EVIDENCE contains the experience, repeated pattern, consequence, or observation that made the common-sense model impossible for this speaker to trust.
- UNRESOLVED COLLISION states the exact cognitive dissonance between COMMON-SENSE MODEL and CONTRADICTING EVIDENCE without resolving it.
- OBSERVABLE PRACTICE gives one supplied action, boundary, standard, conversation, habit, or decision that proves the speaker actually lives by the counterintuitive truth.
- RESERVED COUNTERINTUITIVE ELIXIR infers one complete significant paradigm shift that resolves UNRESOLVED COLLISION, restructures the viewer's understanding, and is simple enough to carry. Reject a shallow hot take, a repetition of Video 3, an unsupported slogan, or a commercial philosophy disguised as truth.
- VIEWER TRANSFER names one recognizable person and what the earned lens may help them see.
- OPTIONAL JOURNEY CONNECTION contains one brief relationship to Video 3, Video 5, or another earlier chapter only when the supplied story genuinely supports it. Otherwise write "Not supplied." Never force an earlier chapter to cause the elixir.
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
- Preserve the causal chain from one supported source experience or repeated pattern through the common-sense model, contradicting evidence, unresolved cognitive dissonance, observable practice, and one reserved counterintuitive elixir.
- Preserve an optional connection to Video 3, Video 5, or another earlier chapter only when the source explicitly or naturally supports it. "Not supplied" is correct when the second epiphany is independent.
- Remove forced earlier-chapter causality, shallow hot takes, repeated Video 3 conclusions, unsupported slogans, methods, offers, and commercial positioning.
- Never invent a fact, result, event, or behavioral change.

For both packets:
- Deduplicate across headings before returning the packet. Keep each fact, phrase, number, duration, event, and consequence in its strongest location once. A dependent heading adds only the new relationship or interpretation.
- Remove credential summaries, pricing ladders, service tiers, current offers, current service descriptions, conversion requests, and material owned by another chapter.
- Do not use the words version, lazy, pay, paid, buy, bought, sell, or sold. Use natural alternatives when a supported fact requires one.
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
  for (let attempt = 0; attempt < 2; attempt++) {
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
      const choice = data.choices && data.choices[0];
      const content = choice && choice.message && choice.message.content;
      if (!content || !String(content).trim()) {
        console.warn('[SeenInSeven model empty]', JSON.stringify({
          attempt: attempt + 1,
          responseId: data.id || null,
          finishReason: choice && choice.finish_reason || null,
          choiceCount: Array.isArray(data.choices) ? data.choices.length : 0,
          promptTokens: data.usage && data.usage.prompt_tokens || null,
          completionTokens: data.usage && data.usage.completion_tokens || null
        }));
        if (attempt === 0) continue;
        throw new Error('The AI returned an empty response.');
      }
      return String(content).trim();
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The request took too long. Please try again.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('The AI returned an empty response.');
}

const L2V1_DIRECTIVE_SENTENCE_PATTERN = /\b(?:make it|keep the (?:ending|cta)|point (?:the|it)|the (?:ending|cta|next step) should|tell (?:them|the viewer)|ask (?:them|the viewer)|working with me|talk(?:ing)? to me|sign(?:ing)? up|book(?:ing)? a call|direct message)\b/i;
function sanitizeLevelTwoVideoOneMaterial(value) {
  return String(value || '')
    .split('\n')
    .map(line => {
      if (/^[A-Z ]+:\s*$/.test(line.trim())) return line.trim();
      const sentences = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
      return sentences
        .map(sentence => sentence.trim())
        .filter(sentence => sentence && !L2V1_DIRECTIVE_SENTENCE_PATTERN.test(sentence))
        .join(' ');
    })
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const marker = new RegExp('VIDEO ' + Number(video) + ' FINAL SCRIPT(?: \\([^\\n]*\\))?:');
  const match = marker.exec(source);
  if (!match) return '';
  const contentStart = match.index + match[0].length;
  const remainder = source.slice(contentStart);
  const nextMarker = remainder.search(/\n(?:VIDEO \d+ FINAL SCRIPT(?: \([^\n]*\))?:|VIDEO \d+ PROMPTS:|VIDEO \d+ JOURNAL ENTRY \(easy mode\):|CURRENT VIDEO \d+ JOURNEY DIRECTION \(private planning context only\):|CURRENT VIDEO \d+ PROMPTS:|CURRENT VIDEO \d+ JOURNAL ENTRY \(easy mode; use this to infer all story beats\):|CURRENT FULL SCRIPT \(for context only; write a fresh complete script\):)/);
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

export function extractCurrentVideoBrief(userContext, video) {
  const source = String(userContext || '');
  const number = Number(video);
  const directionMarker = 'CURRENT VIDEO ' + number + ' JOURNEY DIRECTION (private planning context only):';
  const directionStart = source.lastIndexOf(directionMarker);
  if (directionStart === -1) return extractCurrentPromptBlock(source, number);
  const remainder = source.slice(directionStart);
  const end = remainder.search(/\nCURRENT FULL SCRIPT \(for context only; write a fresh complete script\):/);
  return remainder.slice(0, end === -1 ? undefined : end).trim();
}

export function extractCurrentJourneyDirection(userContext, video) {
  const source = String(userContext || '');
  const number = Number(video);
  const marker = 'CURRENT VIDEO ' + number + ' JOURNEY DIRECTION (private planning context only):';
  const start = source.lastIndexOf(marker);
  if (start === -1) return '';
  const remainder = source.slice(start + marker.length).trimStart();
  const instructionEnds = [
    remainder.indexOf('\nUse this as the intended subject and place in the seven-part journey.'),
    remainder.indexOf('\nUse this to clarify the desired return destination, differentiation, unfinished flaw, or horizon.')
  ].filter(index => index >= 0);
  const promptEnd = remainder.search(new RegExp(
    '\\nCURRENT VIDEO ' + number + ' (?:PROMPTS:|JOURNAL ENTRY \\(easy mode; use this to infer all story beats\\):)'
  ));
  const ends = [...instructionEnds, promptEnd].filter(index => index >= 0);
  const end = ends.length ? Math.min(...ends) : remainder.length;
  return remainder.slice(0, end).trim();
}

export function preserveViewerPremiseSource(originalContext, preparedContext, video) {
  const prepared = String(preparedContext || '').trim();
  if (Number(video) === 7) return prepared;
  const directionMarker = 'CURRENT VIDEO ' + Number(video) + ' JOURNEY DIRECTION (private planning context only):';
  if (!prepared ||
      prepared.includes('CURRENT VIDEO VIEWER PREMISE SOURCE:') ||
      prepared.includes(directionMarker)) {
    return prepared;
  }
  const direction = extractCurrentJourneyDirection(originalContext, video);
  if (!direction) return prepared;
  return [
    'CURRENT VIDEO VIEWER PREMISE SOURCE:',
    direction,
    'Translate only the starting belief, situation, action, relationship, or conflict needed to orient a cold viewer once near the beginning of MEAT. This is private source material, not finished copy. Do not quote it, assign it to the Hook, recap prior videos, or disclose a realization or result reserved for the Conclusion.',
    '',
    prepared
  ].join('\n');
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

function extractPreviousChapterFallback(userContext, video) {
  const source = String(userContext || '');
  const number = Number(video);
  const markers = [
    'VIDEO ' + number + ' PROMPTS:',
    'VIDEO ' + number + ' JOURNAL ENTRY (easy mode):'
  ];
  const starts = markers.map(marker => source.indexOf(marker)).filter(index => index >= 0);
  if (!starts.length) return '';
  const start = Math.min(...starts);
  const remainder = source.slice(start);
  const end = remainder.search(/\n(?:VIDEO \d+ (?:PROMPTS:|JOURNAL ENTRY \(easy mode\):|FINAL SCRIPT(?: \([^\n]*\))?:)|CURRENT VIDEO \d+ JOURNEY DIRECTION \(private planning context only\):|CURRENT VIDEO \d+ PROMPTS:|CURRENT VIDEO \d+ JOURNAL ENTRY \(easy mode; use this to infer all story beats\):)/);
  return remainder.slice(0, end === -1 ? undefined : end).trim();
}

export function buildEpisodeArchitectSource(userContext, level, video, existingScript = '') {
  const source = String(userContext || '');
  const number = Number(video);
  const continuity = episodeContinuityVideos(number)
    .map(previousVideo => {
      const script = extractFinalScript(source, previousVideo);
      return script ? 'VIDEO ' + previousVideo + ' FINAL SCRIPT:\n' + script : '';
    })
    .filter(Boolean);
  return [
    'LEVEL: ' + Number(level),
    'VIDEO: ' + number,
    '',
    extractOnboardingBlock(source),
    continuity.length ? 'PRIOR STORY CONTEXT:\n' + continuity.join('\n\n') : '',
    'AUTHORITATIVE CURRENT CHAPTER BRIEF:\n' + extractCurrentVideoBrief(source, number),
    String(existingScript || '').trim()
      ? 'CURRENT FULL SCRIPT FOR SECTION CONTINUITY:\n' + String(existingScript).trim()
      : ''
  ].filter(Boolean).join('\n\n');
}

export function buildVideoSevenReturnSource(userContext, level, existingScript = '') {
  const source = String(userContext || '');
  const canon = [];
  for (let number = 1; number <= 6; number++) {
    const script = extractFinalScript(source, number);
    if (script) {
      canon.push('VIDEO ' + number + ' FINAL SCRIPT:\n' + script);
      continue;
    }
    const fallback = extractPreviousChapterFallback(source, number);
    if (fallback) canon.push('VIDEO ' + number + ' FALLBACK ANSWERS:\n' + fallback);
  }
  return [
    'LEVEL: ' + Number(level),
    'VIDEO: 7',
    '',
    extractOnboardingBlock(source),
    canon.length ? 'AUDIENCE CANON:\n' + canon.join('\n\n') : '',
    'CURRENT RETURN DIRECTION:\n' + (extractCurrentJourneyDirection(source, 7) || '(not supplied)'),
    'CURRENT VIDEO 7 ANSWERS:\n' + extractCurrentPromptBlock(source, 7),
    String(existingScript || '').trim()
      ? 'CURRENT FULL SCRIPT FOR SECTION CONTINUITY ONLY:\n' + String(existingScript).trim()
      : ''
  ].filter(Boolean).join('\n\n');
}

function packetHeadingBody(packet, heading, headings) {
  const source = String(packet || '');
  const marker = heading + ':';
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const bodyStart = start + marker.length;
  const laterStarts = headings
    .filter(candidate => candidate !== heading)
    .map(candidate => source.indexOf(candidate + ':', bodyStart))
    .filter(index => index >= 0);
  const end = laterStarts.length ? Math.min(...laterStarts) : source.length;
  return source.slice(bodyStart, end).trim();
}

function packetWordCount(value) {
  return (String(value || '').match(/\b[\w’'-]+\b/g) || []).length;
}

function canonicalizePacketLabels(packet, labels) {
  let source = String(packet || '');
  labels.forEach(label => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    source = source.replace(
      new RegExp('^[ \\t]*(?:#{1,6}[ \\t]*)?(?:\\*\\*|__)?' + escaped + '[ \\t]*:(?:\\*\\*|__)?[ \\t]*', 'gmi'),
      label + ': '
    );
  });
  return source.trim();
}

function videoSevenAnchorBody(progression, anchor) {
  const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const followingLabels = VIDEO_SEVEN_RETURN_ANCHORS
    .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const match = String(progression || '').match(
    new RegExp(
      '(?:^|\\n)\\s*' + escapedAnchor + ':\\s*([\\s\\S]*?)(?=\\n\\s*(?:' + followingLabels + '):|$)',
      'i'
    )
  );
  return match ? match[1].trim() : '';
}

function compactPrivatePacketField(value, maximumWords) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean || packetWordCount(clean) <= maximumWords) return clean;

  const sentences = clean.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g) || [];
  let complete = '';
  for (const sentence of sentences) {
    const candidate = [complete, sentence.trim()].filter(Boolean).join(' ');
    if (packetWordCount(candidate) > maximumWords) break;
    complete = candidate;
  }
  if (complete && packetWordCount(complete) >= Math.floor(maximumWords / 2)) return complete;

  const words = clean.match(/\S+/g) || [];
  return words
    .slice(0, maximumWords)
    .join(' ')
    .replace(/[,;:]+$/, '')
    .replace(/[.!?]*$/, '.');
}

export function normalizeVideoSevenReturnPacket(packet) {
  const labels = [...VIDEO_SEVEN_RETURN_HEADINGS, ...VIDEO_SEVEN_RETURN_ANCHORS];
  const source = canonicalizePacketLabels(cleanPacketOutput(packet), labels);
  if (!source || !hasRouterHeadings(source, VIDEO_SEVEN_RETURN_HEADINGS)) return '';

  const progression = packetHeadingBody(
    source,
    'CONNECTED JOURNEY PROGRESSION',
    VIDEO_SEVEN_RETURN_HEADINGS
  );
  const anchors = VIDEO_SEVEN_RETURN_ANCHORS.map(anchor => ({
    anchor,
    body: compactPrivatePacketField(videoSevenAnchorBody(progression, anchor), 35)
  }));
  if (anchors.some(entry => !entry.body)) return '';

  const reserved = compactPrivatePacketField(packetHeadingBody(
    source,
    'RESERVED RETURN',
    VIDEO_SEVEN_RETURN_HEADINGS
  ), 65);
  const horizon = compactPrivatePacketField(packetHeadingBody(
    source,
    'HONEST REMAINDER AND HORIZON',
    VIDEO_SEVEN_RETURN_HEADINGS
  ), 45);
  if (!reserved || !horizon) return '';

  const voiceSignals = String(packetHeadingBody(
    source,
    'VOICE SIGNALS',
    VIDEO_SEVEN_RETURN_HEADINGS
  ) || '').replace(/\s+/g, ' ').trim();

  return [
    'CONNECTED JOURNEY PROGRESSION:',
    ...anchors.map(entry => entry.anchor + ': ' + entry.body),
    'RESERVED RETURN:',
    reserved,
    'HONEST REMAINDER AND HORIZON:',
    horizon,
    'VOICE SIGNALS:',
    voiceSignals
  ].join('\n');
}

export function videoSevenReturnPacketIssues(packet) {
  const source = String(packet || '').trim();
  const issues = [];
  if (!source) return ['The packet is empty.'];
  if (!hasRouterHeadings(source, VIDEO_SEVEN_RETURN_HEADINGS)) {
    issues.push('One or more required top-level headings are missing.');
    return issues;
  }

  const progression = packetHeadingBody(
    source,
    'CONNECTED JOURNEY PROGRESSION',
    VIDEO_SEVEN_RETURN_HEADINGS
  );
  let totalAnchorWords = 0;
  VIDEO_SEVEN_RETURN_ANCHORS.forEach(anchor => {
    const matches = [...progression.matchAll(new RegExp('^' + anchor + ':\\s*(.+)$', 'gmi'))];
    if (matches.length !== 1) {
      issues.push(anchor + ' must appear exactly once as one labeled line.');
      return;
    }
    const words = packetWordCount(matches[0][1]);
    totalAnchorWords += words;
    if (words > 35) {
      issues.push(anchor + ' must not exceed 35 words; it currently contains ' + words + '.');
    }
  });
  if (totalAnchorWords > 140) {
    issues.push('The four journey anchors exceed the 140-word private evidence budget.');
  }

  const reservedWords = packetWordCount(packetHeadingBody(
    source,
    'RESERVED RETURN',
    VIDEO_SEVEN_RETURN_HEADINGS
  ));
  if (!reservedWords) {
    issues.push('RESERVED RETURN cannot be empty.');
  } else if (reservedWords > 65) {
    issues.push('RESERVED RETURN must not exceed 65 words; it currently contains ' + reservedWords + '.');
  }

  const horizonWords = packetWordCount(packetHeadingBody(
    source,
    'HONEST REMAINDER AND HORIZON',
    VIDEO_SEVEN_RETURN_HEADINGS
  ));
  if (!horizonWords) {
    issues.push('HONEST REMAINDER AND HORIZON cannot be empty.');
  } else if (horizonWords > 45) {
    issues.push('HONEST REMAINDER AND HORIZON must not exceed 45 words; it currently contains ' + horizonWords + '.');
  }
  return issues;
}

export async function prepareVideoSevenReturnMaterial(userContext, level, existingScript = '') {
  const headings = VIDEO_SEVEN_RETURN_HEADINGS;
  const source = buildVideoSevenReturnSource(userContext, level, existingScript);
  let malformed = '';
  let packet = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const request = [
      source,
      attempt
        ? [
            '',
            'FORMAT CORRECTION:',
            'Return this exact private packet shape. Keep every anchor on one line and obey each supplied word budget.',
            [
              'CONNECTED JOURNEY PROGRESSION:',
              ...VIDEO_SEVEN_RETURN_ANCHORS.map(anchor => anchor + ':'),
              'RESERVED RETURN:',
              'HONEST REMAINDER AND HORIZON:',
              'VOICE SIGNALS:'
            ].join('\n'),
            '',
            'MALFORMED PACKET TO CORRECT:',
            malformed
          ].join('\n')
        : ''
    ].filter(Boolean).join('\n');
    const routed = await callModel(
      VIDEO_SEVEN_RETURN_SYSTEM,
      request,
      attempt ? 0.05 : 0.15,
      1200
    );
    const candidate = cleanPacketOutput(routed);
    const normalizedCandidate = normalizeVideoSevenReturnPacket(candidate);
    const packetIssues = normalizedCandidate
      ? videoSevenReturnPacketIssues(normalizedCandidate)
      : videoSevenReturnPacketIssues(canonicalizePacketLabels(
          candidate,
          [...VIDEO_SEVEN_RETURN_HEADINGS, ...VIDEO_SEVEN_RETURN_ANCHORS]
        ));
    if (normalizedCandidate && hasRouterHeadings(normalizedCandidate, headings) && !packetIssues.length) {
      packet = normalizedCandidate;
      break;
    }
    console.warn('[SeenInSeven Video 7 synthesis cleanup]', JSON.stringify({
      attempt:attempt + 1,
      issues:packetIssues
    }));
    malformed = [
      candidate,
      packetIssues.length ? '\nPACKET ISSUES TO CORRECT:\n- ' + packetIssues.join('\n- ') : ''
    ].filter(Boolean).join('\n');
  }

  if (!packet) {
    throw new Error('The final journey could not be synthesized cleanly. Please try again.');
  }

  return [
    'Generate Video 7 script.',
    '',
    'LEVEL: ' + Number(level),
    'VIDEO: 7',
    '',
    'CURATED VIDEO 7 RETURN:',
    packet,
    '',
    'This synthesis is the controlling story plan and complete evidence budget. Use every transformation represented by the four anchor lines, but no canon event omitted from those anchors. Do not restore raw scripts, rebuild the Return around one current scene, or turn the packet headings and anchor labels into separate spoken paragraphs.',
    '',
    'FINAL VIDEO 7 WRITING CONTRACT: Design the brief Conclusion destination first from RESERVED RETURN alone. Build MEAT only from EARLIER SELF, FIRST SHIFT, FALL, and RETURN; never restore omitted canon merely to mention another chapter or example. Treat every anchor as lived evidence rather than a lesson, positioning claim, service description, or comparison. Develop those four anchors into natural, complete spoken thoughts, let the earned identity or professional difference emerge from that lived progression, and place the honest unresolved human element from HONEST REMAINDER AND HORIZON at the end of MEAT. Apply sentence-level Hook-and-Eye throughout MEAT so each sentence arises from the one before it through cause, consequence, time, escalation, contradiction, recognition, or changed action. Stop before stating the reserved governing meaning. CONCLUSION is a brief homecoming statement of one to three sentences: answer the Open Loop with only that governing meaning, without replaying an anchor event, naming the four moments again, diagnosing the viewer, adding evidence, or performing another miniature Return. Reserve the continuing relational direction from HONEST REMAINDER AND HORIZON for CTA. Build OPEN LOOP afterward from the exact missing meaning the Conclusion will reveal, without summarizing the journey or disclosing the answer. Supply a provisional HOOK only for formatting; the global Hook Studio replaces it after the complete story is settled. Let the active Video 7 blueprint control the final relational CTA.'
  ].join('\n');
}

export async function prepareEpisodeArchitectureMaterial(userContext, level, video, existingScript = '') {
  const number = Number(video);
  if (number === 7) {
    return prepareVideoSevenReturnMaterial(userContext, level, existingScript);
  }
  const headings = EPISODE_ARCHITECT_HEADINGS;
  const source = buildEpisodeArchitectSource(userContext, level, number, existingScript);
  let malformed = '';
  let packet = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const request = [
      source,
      attempt
        ? [
            '',
            'FORMAT CORRECTION:',
            'Return every required heading below exactly once and in this order. Do not add, remove, combine, or rename headings.',
            headings.map(heading => heading + ':').join('\n'),
            '',
            'MALFORMED PACKET TO CORRECT:',
            malformed
          ].join('\n')
        : ''
    ].filter(Boolean).join('\n');
    const routed = await callModel(
      episodeArchitectSystem(number),
      request,
      attempt ? 0.05 : 0.15,
      number === 7 ? 1600 : 1400
    );
    const candidate = cleanPacketOutput(routed);
    if (candidate && hasRouterHeadings(candidate, headings)) {
      packet = candidate;
      break;
    }
    malformed = candidate;
  }

  if (!packet) {
    throw new Error('The episode story material could not be prepared cleanly. Please try again.');
  }

  const declarationMatch = String(userContext || '').match(
    /^\d+\.\s+Opening declaration \(read-only\):\s*(.+)$/mi
  );
  const declaration = declarationMatch ? declarationMatch[1].trim() : '';
  return [
    'Generate Video ' + number + ' script.',
    '',
    'LEVEL: ' + Number(level),
    'VIDEO: ' + number,
    number === 1
      ? [
          '',
          'OPENING DECLARATION (read-only; visible between OPEN LOOP and MEAT):',
          declaration || '(use the fixed declaration supplied in the active Video 1 blueprint)'
        ].join('\n')
      : '',
    '',
    'CURATED EPISODE ARCHITECTURE:',
    packet,
    '',
    'The current chapter has already been selected and organized. Use this packet as the controlling story plan. Do not reconstruct omitted subplots, combine it with a more dramatic archive story, or turn its headings into visible prose.',
    '',
    'FINAL WRITING CONTRACT: Reserve RESERVED CONCLUSION before drafting. Build MEAT as one seamless story through STORY PROGRESSION, using HUMAN CONTRADICTION as emotional pressure rather than a second topic. Stop at the boundary named by STAGE FIREWALL. Design OPEN LOOP afterward from the exact unfinished relationship the reserved conclusion will transform, without revealing the answer or explaining the Hook. Supply a provisional HOOK only for formatting; the global Hook Studio replaces it after the complete story is settled. Let the active video blueprint control the final section jobs and CTA.',
    '',
    'MEAT COMPOSITION CONTRACT: ' + MEAT_COMPOSITION_CONTRACT
  ].filter(Boolean).join('\n');
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
    'AUTHORITATIVE CURRENT VIDEO 4 BRIEF:\n' + extractCurrentVideoBrief(userContext, 4)
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
    : ['SOURCE EXPERIENCE OR PATTERN', 'COMMON-SENSE MODEL', 'CONTRADICTING EVIDENCE', 'UNRESOLVED COLLISION', 'OBSERVABLE PRACTICE', 'RESERVED COUNTERINTUITIVE ELIXIR', 'VIEWER TRANSFER', 'OPTIONAL JOURNEY CONNECTION', 'VOICE SIGNALS'];
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
    : 'FINAL VIDEO 6 WRITING CONSTRAINTS: Privately pair one exact UNANSWERED QUESTION with the RESERVED COUNTERINTUITIVE ELIXIR that answers it. The OPEN LOOP is written independently from the completed Meat and reserved Conclusion and creates the exact unanswered meaning produced by SOURCE EXPERIENCE OR PATTERN and CONTRADICTING EVIDENCE without implying its resolution. It does not explain or continue the Hook. The MEAT carries SOURCE EXPERIENCE OR PATTERN through COMMON-SENSE MODEL and CONTRADICTING EVIDENCE into UNRESOLVED COLLISION, ending with that cognitive dissonance unresolved. State RESERVED COUNTERINTUITIVE ELIXIR for the first time in the CONCLUSION, followed by one new possibility or VIEWER TRANSFER. Use OPTIONAL JOURNEY CONNECTION only when it contains a genuine supported relationship; otherwise omit earlier chapters completely. Supply a provisional HOOK label for formatting; the global Hook Studio will replace its text after the story is settled.';
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
  const headings = ['FIRST LENS', 'CAUSAL STORY SPINE', 'RESERVED HUMAN RESULT', 'IMMEDIATE POSSIBILITY', 'VOICE SIGNALS'];
  const source = videoFourRouterSource(userContext);
  let packet = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const routerMessage = [
      source,
      attempt
        ? [
            '',
            'FORMAT CORRECTION:',
            'Return every required heading below exactly once and in this order. Keep CAUSAL STORY SPINE as one chronological paragraph rather than splitting it into new categories.',
            headings.map(heading => heading + ':').join('\n')
          ].join('\n')
        : ''
    ].filter(Boolean).join('\n');
    const routed = await callModel(L2V4_MATERIAL_ROUTER_SYSTEM, routerMessage, attempt ? 0.05 : 0.15, 1200);
    const candidate = cleanPacketOutput(routed);
    if (candidate && hasRouterHeadings(candidate, headings)) {
      packet = candidate;
      break;
    }
  }
  if (!packet) {
    throw new Error('The Video 4 story material could not be prepared cleanly. Please try again.');
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
    'The current Journey Direction and Video 4 answer material have already been preserved as one causal story. Do not disassemble CAUSAL STORY SPINE into separate arguments or repeat its governing nouns and audience language across sections. Privately pair one exact pressing UNANSWERED QUESTION from the completed Meat with RESERVED HUMAN RESULT as its reserved answer. Write the OPEN LOOP independently from that unfinished relationship after the Meat and Conclusion are settled. It does not explain or continue the Hook. It is not a place for general setup, a decision summary, stakes language, or vague anticipation. Supply a provisional HOOK label for formatting; the global Hook Studio will replace its text after the story is settled.',
    '',
    'FINAL VIDEO 4 WRITING CONSTRAINTS: Write entirely from the speaker\'s perspective at that point in time. The OPEN LOOP independently creates the pressing unanswered question from the completed story. The MEAT must tell CAUSAL STORY SPINE as one connected chronological occurrence and stop before RESERVED HUMAN RESULT. Use FIRST LENS only as one brief continuity clause. Concrete contrasts involving names, diagrams, pages, promotions, prices, or presentation may remain when they belong to the lived pressure and choice; do not convert them into present-day positioning or a sales argument. Reveal RESERVED HUMAN RESULT for the first time in the CONCLUSION, then use IMMEDIATE POSSIBILITY only to show what that occurrence made possible then. An ideal-audience description, mission statement, market forecast, or declaration about who the speaker is built to help is context, never a character, event, result, or conclusion. Do not repeat a distinctive phrase, audience description, governing noun, comparison, or decision after its story job is complete. Do not repeat Video 3, validate the complete philosophy, or convert the result into a lesson, method, case study, expertise claim, or professional proof. The CTA must deliberately drop the emotional temperature: identify this as Video 4 of 7 and use exactly one "because" to foreshadow that the next chapter contains the devastating event that nearly destroyed what had begun to feel possible and that the speaker must own their role. Reveal the magnitude and responsibility, but withhold the event, exact loss, causal choices, recovery, and later truth. Never frame Video 5 as the Video 4 approach merely becoming insufficient, and never use generic promises about the next challenge, real test, or what happens next.'
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
        'FINAL VIDEO 5 WRITING CONSTRAINTS: Design the CONCLUSION first and reserve the owned lowest-point belief for it. Build the MEAT as one chronological descent through what mattered, the consequential choice, ignored warning or escalation, collapse, and failed recovery. Stop before explaining what any of it eventually meant. Design the OPEN LOOP after the Conclusion and Meat as one independent pressing unfinished meaning, contradiction, cause, or question that the Conclusion will finally close or transform. It exists only to retain attention, does not explain or continue the Hook, and cannot state the speaker\'s mistake, summarize the stakes, or imply the answer. Supply a provisional HOOK label for formatting; the global Hook Studio will replace its text after the story is settled. Reveal the lowest-point belief for the first time in the CONCLUSION and leave the speaker inside the apparent loss with no recovery, diagnosis, authority, reassurance, or silver lining. Continue that exact emotional state into the CTA. Ask the viewer to follow, identify this as Video 5 of the seven-part journey, and promise that Video 6 reveals the more significant counterintuitive truth the speaker now carries. Do not claim Video 5 caused that truth unless the supplied story supports the relationship. Do not say the confusion lifted, something cracked open, recovery began, the answer appeared, or the speaker found a way back.'
      ].join('\n');
    }
    malformed = packet;
  }

  throw new Error('The Video 5 story material could not be prepared cleanly. Please try again.');
}

export function regenerationMessage(input) {
  if (input.mode === 'full-regeneration') {
    if (Number(input.video) === 7) {
      return `${input.userContext}

FEEDBACK FOR THIS REGENERATION: ${input.feedback}

This is a FRESH FULL REGENERATION. The previous script has been intentionally withheld. Rebuild Video 7, Level ${input.level} from the curated Video 7 Return and active blueprint. Do not restore raw source material, imitate an earlier draft, reduce the journey to one present-day scene, or convert the Return into an episode recap.

Preserve CONNECTED JOURNEY PROGRESSION, RESERVED RETURN, HONEST REMAINDER AND HORIZON, and VOICE SIGNALS while creating completely new visible language. Treat EARLIER SELF, FIRST SHIFT, FALL, and RETURN as the complete evidence budget. Develop those lived-evidence anchors into complete spoken thoughts without restoring omitted canon or compressing the prose, let the earned difference emerge inside [MEAT], and place the honest unresolved element at the end of [MEAT]. Let [CONCLUSION] answer the Open Loop in one to three sentences with only the governing meaning from RESERVED RETURN. It cannot replay an anchor event, recap the four movements, diagnose the viewer, add evidence, or perform another miniature Return. Reserve the continuing relational direction for [CTA]. Apply sentence-level Hook-and-Eye only inside [MEAT]. ${MEAT_COMPOSITION_CONTRACT} Build [OPEN LOOP] independently after [MEAT] and [CONCLUSION] are settled. Supply a provisional [HOOK] for the required format; the global Hook Studio will replace it after the story is finished. Return exactly [HOOK], [OPEN LOOP], [MEAT], [CONCLUSION], and [CTA] with no commentary.`;
    }
    return `${input.userContext}

FEEDBACK FOR THIS REGENERATION: ${input.feedback}

This is a FRESH FULL REGENERATION. The previous script has been intentionally withheld. Rebuild Video ${input.video}, Level ${input.level} from the curated episode architecture, active blueprint, and feedback. Do not restore source material omitted by the episode architect, and do not attempt to preserve, reconstruct, or imitate wording from an earlier draft.

Use the same focused composition process as first-time generation. Preserve EPISODE NUCLEUS, HUMAN CONTRADICTION, STORY PROGRESSION, RESERVED CONCLUSION, and STAGE FIREWALL while creating completely new visible language. Apply sentence-level Hook-and-Eye only inside [MEAT]. ${MEAT_COMPOSITION_CONTRACT} Rebuild the standalone viewer premise near the beginning of [MEAT] from the current Journey Direction or Viewer Premise Source; do not assume the viewer watched an earlier video. Build [OPEN LOOP] independently after [MEAT] and [CONCLUSION] are settled, while making its unanswered question intelligible before the Meat is heard. Supply a provisional [HOOK] for the required format; the global Hook Studio will replace it after the story is finished. Return exactly [HOOK], [OPEN LOOP], [MEAT], [CONCLUSION], and [CTA] with no commentary.`;
  }
  return input.userContext;
}

function sectionMessage(input) {
  const isVideoSeven = Number(input.video) === 7;
  const sectionInstruction = isVideoSeven && input.section === 'MEAT'
    ? '\n\nVIDEO 7 MEAT REGENERATION REQUIREMENT: Treat EARLIER SELF, FIRST SHIFT, FALL, and RETURN as the complete evidence budget. Develop those four anchors into complete spoken thoughts with the Meat-only Hook-and-Eye contract. Preserve every transformation while removing redundant evidence, and do not compress connective logic, restore omitted canon, reduce the Return to one present-day scene, announce episode numbers, summarize each installment, or reveal RESERVED RETURN early.'
    : isVideoSeven && input.section === 'CONCLUSION'
      ? '\n\nVIDEO 7 CONCLUSION REGENERATION REQUIREMENT: Use RESERVED RETURN alone. In one to three sentences, answer the Open Loop with only its governing homecoming meaning. Do not replay an anchor event, name the four moments again, recap MEAT, diagnose the viewer, restate the earned difference, include the honest remainder or relational horizon, add evidence, or perform another miniature Return.'
      : isVideoSeven && input.section === 'CTA'
        ? '\n\nVIDEO 7 CTA REGENERATION REQUIREMENT: Continue from the completed Return into an ongoing relationship. Acknowledge Video 7 of 7, ask for the follow because this person and perspective are worth staying connected to, and invite late viewers back to Video 1 without implying an eighth installment.'
    : input.section === 'MEAT'
    ? '\n\nMEAT REGENERATION REQUIREMENT: Preserve EPISODE NUCLEUS, HUMAN CONTRADICTION, STORY PROGRESSION, and STAGE FIREWALL from the curated episode architecture. ' + MEAT_COMPOSITION_CONTRACT + ' Rebuild the standalone viewer premise near the beginning from the current video Journey Direction or Viewer Premise Source. A cold viewer must understand the specific belief, situation, action, relationship, or conflict before the Meat relies on it. Do not restore omitted subplots, quote the Overview, recap prior videos, reveal the reserved Conclusion, or assign this context job to the Hook or Open Loop.'
    : input.section === 'CONCLUSION'
      ? '\n\nCONCLUSION REGENERATION REQUIREMENT: Preserve RESERVED CONCLUSION and STAGE FIREWALL from the curated episode architecture. Create a fresh supported turn without resolving a later chapter or restoring omitted source material.'
      : input.section === 'CTA'
        ? '\n\nCTA REGENERATION REQUIREMENT: Continue the exact emotional state created by RESERVED CONCLUSION while respecting STAGE FIREWALL. Do not introduce an omitted subplot, later revelation, offer, or unrelated reason to follow.'
    : '';
  return `${input.userContext}

CURRENT FULL SCRIPT (for context):
${input.existingScript}

FEEDBACK FOR THIS REGENERATION: ${input.feedback}

Regenerate ONLY the [${input.section}] section, applying the feedback above while following the same Video ${input.video}, Level ${input.level} blueprint and all supplied user context.${sectionInstruction} Return only the new section text with no label, no other sections, and no commentary.`;
}

async function generateScriptCore(input, prompt, timings) {
  const systemPrompt = buildSystemPrompt(prompt.prompt, input.level, input.video);
  let preparedContext = await measureStage(timings, 'story-preparation', () =>
    prepareEpisodeArchitectureMaterial(input.userContext, input.level, input.video)
  );
  preparedContext = preserveViewerPremiseSource(input.userContext, preparedContext, input.video);
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
      const stageSuffix = '-' + (attempt + 1);
      const draft = await measureStage(timings, 'draft' + stageSuffix, () =>
        callModel(systemPrompt, userMessage + retryNote, attempt ? 0.45 : 0.8)
      );
      const content = await measureStage(timings, 'story-review' + stageSuffix, () => reviewAndRepairScript({
        script: draft,
        systemPrompt,
        userMessage: userMessage + retryNote,
        level: input.level,
        video: input.video,
        callModel,
        wholeScriptRewrite: input.mode === 'full-regeneration',
        provisionalHook: true,
        provisionalOpenLoop: true
      }));
      const retentionContent = await measureStage(timings, 'open-loop' + stageSuffix, () => finalizeScriptOpenLoop({
        script: content,
        systemPrompt,
        userMessage: userMessage + retryNote,
        level: input.level,
        video: input.video,
        callModel
      }));
      const finalContent = await measureStage(timings, 'hook' + stageSuffix, () => finalizeScriptHook({
        script: retentionContent,
        systemPrompt,
        userMessage: userMessage + retryNote,
        level: input.level,
        video: input.video,
        callModel
      }));
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

async function generateScript(input, prompt) {
  const started = Date.now();
  const timings = [];
  let status = 'failed';
  try {
    const result = await generateScriptCore(input, prompt, timings);
    status = 'completed';
    return result;
  } finally {
    logGenerationTiming(input, timings, started, status);
  }
}

async function generateSectionCore(input, prompt, timings) {
  const systemPrompt = buildSystemPrompt(prompt.prompt, input.level, input.video);
  const directUserMessage = sectionMessage(input);
  if (input.section === 'HOOK') {
    const content = await measureStage(timings, 'hook-regeneration', () => generateFinalHook({
      script:input.existingScript,
      systemPrompt,
      userMessage:directUserMessage,
      level:input.level,
      video:input.video,
      callModel
    }));
    return { content, promptVersion:prompt.version };
  }
  if (input.section === 'OPEN LOOP') {
    const content = await measureStage(timings, 'open-loop-regeneration', () => generateFinalOpenLoop({
      script:input.existingScript,
      systemPrompt,
      userMessage:directUserMessage,
      level:input.level,
      video:input.video,
      callModel
    }));
    return { content, promptVersion:prompt.version };
  }

  let preparedContext = await measureStage(timings, 'story-preparation', () =>
    prepareEpisodeArchitectureMaterial(input.userContext, input.level, input.video, input.existingScript)
  );
  preparedContext = preserveViewerPremiseSource(input.userContext, preparedContext, input.video);
  const userMessage = sectionMessage({ ...input, userContext: preparedContext });
  const draft = await measureStage(timings, 'section-draft', () =>
    callModel(systemPrompt, userMessage, 0.8)
  );
  const parsed = parseSections(draft);
  const replacement = parsed && parsed[input.section]
    ? parsed[input.section]
    : stripSectionLabels(draft);
  if (!replacement) throw new Error('The AI returned an empty section.');
  const current = parseSections(input.existingScript);
  if (!current) throw new Error('The current script does not have all five labeled sections.');
  const complete = composeSections({ ...current, [input.section]: replacement });
  const content = await measureStage(timings, 'section-review', () => reviewAndRepairSection({
    script: complete,
    section: input.section,
    systemPrompt,
    userMessage,
    level: input.level,
    video: input.video,
    callModel
  }));
  return { content, promptVersion: prompt.version };
}

async function generateSection(input, prompt) {
  const started = Date.now();
  const timings = [];
  let status = 'failed';
  try {
    const result = await generateSectionCore(input, prompt, timings);
    status = 'completed';
    return result;
  } finally {
    logGenerationTiming(input, timings, started, status);
  }
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
