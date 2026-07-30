import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  buildSystemPrompt,
  buildUserMessage,
  extractTaggedSection,
  hasLevelTwoVideoFourHindsight,
  publishedPrompt,
  stageContract,
  validateBlueprintSource
} from '../api/_lib/prompt-engine.js';
import {
  buildEpisodeArchitectSource,
  buildVideoSevenReturnSource,
  EPISODE_ARCHITECT_HEADINGS,
  EPISODE_ARCHITECT_SYSTEM,
  EPISODE_STAGE_SCHEMAS,
  episodeArchitectSystem,
  episodeContinuityVideos,
  extractCurrentJourneyDirection,
  extractCurrentVideoBrief,
  preserveViewerPremiseSource,
  VIDEO_SEVEN_RETURN_ANCHORS,
  VIDEO_SEVEN_RETURN_HEADINGS,
  VIDEO_SEVEN_RETURN_SYSTEM,
  normalizeVideoSevenReturnPacket,
  videoSevenReturnPacketIssues
} from '../api/generate.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start !== -1 && end !== -1, 'Could not extract source between ' + startMarker + ' and ' + endMarker + '.');
  return source.slice(start + startMarker.length, end).trim();
}

function evaluateExpression(source) {
  return runInNewContext('(' + source + ')', { compileMvoBeats: () => [] });
}

function normalizeQuestion(question) {
  return {
    label: String(question && question.label || ''),
    hint: String(question && question.hint || ''),
    key: String(question && question.key || ''),
    placeholder: String(question && (question.ph || question.placeholder) || '')
  };
}

function normalizeVideo(video) {
  return {
    title: String(video && video.title || ''),
    note: String(video && video.note || ''),
    prompts: (video && video.prompts || []).map(normalizeQuestion),
    legacyPrompts: (video && video.legacyPrompts || []).map(normalizeQuestion)
  };
}

const published = publishedPrompt();
const blueprintErrors = validateBlueprintSource(published.source);
assert(!blueprintErrors.length, 'Blueprint validation failed: ' + blueprintErrors.join(' '));

for (const level of [1, 2]) {
  for (let video = 1; video <= 7; video++) {
    const tag = 'l' + level + '_v' + video + '_rules';
    const localRules = extractTaggedSection(published.prompt, tag);
    const focused = buildSystemPrompt(published.prompt, level, video);
    assert(localRules, 'Missing active rules for Level ' + level + ', Video ' + video + '.');
    assert(focused.endsWith(localRules), 'Focused prompt lost Level ' + level + ', Video ' + video + '.');
    assert((localRules.match(/^HOOK guidance:/gm) || []).length === 1, tag + ' does not have exactly one Hook guidance line.');
    assert((localRules.match(/^OPEN LOOP guidance:/gm) || []).length === 1, tag + ' does not have exactly one Open Loop guidance line.');
    assert((localRules.match(/^CONCLUSION guidance:/gm) || []).length === 1, tag + ' does not have exactly one Conclusion guidance line.');
    assert((localRules.match(/^CTA guidance:/gm) || []).length === 1, tag + ' does not have exactly one CTA guidance line.');
    assert(
      focused.includes('<standalone_video_context_rule>') &&
        focused.includes('Treat it as the VIEWER PREMISE SOURCE:') &&
        focused.includes('[HOOK] receives no premise-writing responsibility.'),
      tag + ' does not receive the global standalone-video context contract.'
    );
    assert(
      focused.includes('<episode_architecture_rule>') &&
        focused.includes('EPISODE NUCLEUS') &&
        focused.includes('STAGE FIREWALL'),
      tag + ' does not receive the shared episode-architecture contract.'
    );
    assert(stageContract(level, video), 'Missing stage contract for Level ' + level + ', Video ' + video + '.');
  }
}

const levelOneVideoSix = extractTaggedSection(published.prompt, 'l1_v6_rules');
const levelTwoVideoSix = extractTaggedSection(published.prompt, 'l2_v6_rules');
const levelOneVideoSeven = extractTaggedSection(published.prompt, 'l1_v7_rules');
const levelTwoVideoSeven = extractTaggedSection(published.prompt, 'l2_v7_rules');
assert(/Video 5|VIDEO 5/.test(levelOneVideoSix), 'Level 1 Video 6 lost its required Video 5 cause.');
assert(/optional continuity|relationship is optional|does not have to/.test(levelOneVideoSix), 'Level 1 Video 6 still lacks an explicit optional Video 3 relationship.');
assert(
  /No earlier chapter is causally required|no earlier chapter is a required cause/i.test(levelTwoVideoSix),
  'Level 2 Video 6 does not explicitly permit an independent elixir source.'
);
assert(
  /Video 3, Video 5, another experience, or a broader pattern/i.test(levelTwoVideoSix),
  'Level 2 Video 6 does not describe all supported elixir sources.'
);
assert(
  !/Video 5 is causally necessary|truth caused by Video 5|must begin with the speaker's own defeat/i.test(levelTwoVideoSix),
  'Level 2 Video 6 still forces Video 5 to cause the elixir.'
);
for (const [level, rules] of [[1, levelOneVideoSeven], [2, levelTwoVideoSeven]]) {
  [
    'home through one governing identity transformation.',
    'Let a cold viewer understand',
    'without hearing an episode-by-episode recap',
    'FIRST SHIFT from Videos 3-4',
    'governing meaning created by the Meat',
    'brief homecoming statement, not another Return',
    'Carry the relational horizon here',
    'unfinished public test may add supporting tension'
  ].forEach(requirement => {
    assert(rules.includes(requirement), `Level ${level} Video 7 lost its complete Return requirement: ${requirement}`);
  });
}
assert(
  levelTwoVideoSeven.includes("Make the speaker's professional difference emerge from the selected lived behavior"),
  'Level 2 Video 7 lost the earned professional difference.'
);
const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../seeninseven.html', import.meta.url), 'utf8');
const testerHtml = readFileSync(new URL('../admin-prompt-tester.html', import.meta.url), 'utf8');
const adminQuestionsSource = readFileSync(new URL('../js/admin-prompt-questions.js', import.meta.url), 'utf8');
const generationSource = readFileSync(new URL('../api/generate.js', import.meta.url), 'utf8');
const promptTestSource = readFileSync(new URL('../api/prompt-test.js', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('../api/_lib/prompt-engine.js', import.meta.url), 'utf8');
const browserEngineSource = readFileSync(new URL('../js/script-prompt-engine.js', import.meta.url), 'utf8');
assert(
  engineSource.includes('actual first realization and trial from Videos 3-4') &&
    browserEngineSource.includes('actual first realization and trial from Videos 3-4') &&
    engineSource.includes('MEAT owns the complete Return') &&
    engineSource.includes('CONCLUSION is only a brief homecoming statement'),
  'Production or browser prompt routing lost the source-bound Video 7 return.'
);
assert(
  engineSource.includes('An unfinished public test may add supporting tension, but it cannot be the only reason to follow.') &&
    !engineSource.includes('Reject a CTA that asks the viewer to monitor whether the speaker proves or tests an ideal, model, experiment, or business result.'),
  'Video 7 CTA review did not preserve relational primacy with optional public tension.'
);

const implementationSource = [
  published.source,
  appSource,
  adminQuestionsSource,
  generationSource,
  promptTestSource,
  engineSource
].join('\n');

[
  /must deepen or correct Video 3/i,
  /first realization could not explain/i,
  /causal chain from the Video 3/i,
  /VIDEO 3 FIRST LENS/,
  /LIMIT EXPOSED/
].forEach(pattern => {
  assert(!pattern.test(implementationSource), 'A forced Video 3 dependency remains: ' + pattern.source);
});

const generationCoreSource = generationSource.slice(
  generationSource.indexOf('async function generateScriptCore'),
  generationSource.indexOf('async function generateScript(', generationSource.indexOf('async function generateScriptCore'))
);
const sectionCoreSource = generationSource.slice(
  generationSource.indexOf('async function generateSectionCore'),
  generationSource.indexOf('async function generateSection(', generationSource.indexOf('async function generateSectionCore'))
);
assert(
  generationCoreSource.includes('prepareEpisodeArchitectureMaterial(input.userContext, input.level, input.video)') &&
    !/prepareLevelTwo(?:VideoOne|Epiphany|VideoFour|VideoFive)Material/.test(generationCoreSource),
  'Production full generation does not use the shared episode architect exclusively.'
);
assert(
  generationSource.includes('MEAT COMPOSITION CONTRACT:') &&
    generationSource.includes('never bolt on connectors merely to imitate continuity') &&
    generationSource.includes('This contract applies only to MEAT and must not pull the HOOK or OPEN LOOP into the same prose rhythm'),
  'Production generation lost the Meat-only Hook-and-Eye composition contract.'
);
assert(
  engineSource.includes('Reject a chain of movable declarations that merely share a topic') &&
    engineSource.includes('Do not apply this prose-flow test to HOOK or OPEN LOOP'),
  'Story review lost the Meat-only Hook-and-Eye boundary.'
);
assert(
  EPISODE_STAGE_SCHEMAS[7].includes('Bring the six-chapter audience canon home through one governing identity transformation') &&
    EPISODE_STAGE_SCHEMAS[7].includes('actual first realization and trial from Videos 3-4') &&
    EPISODE_STAGE_SCHEMAS[7].includes('MEAT owns the complete Return') &&
    EPISODE_STAGE_SCHEMAS[7].includes('CONCLUSION is only a brief one-to-three-sentence homecoming statement') &&
    EPISODE_STAGE_SCHEMAS[7].includes('CTA owns the relational horizon') &&
    generationSource.includes('CURATED VIDEO 7 RETURN:') &&
    generationSource.includes('Build MEAT only from EARLIER SELF, FIRST SHIFT, FALL, and RETURN') &&
    engineSource.includes('require one connected Return organized around a single governing identity transformation') &&
    engineSource.includes('Return reduced to one present-day scene'),
  'Video 7 can still collapse into a local scene or disconnected recap.'
);
assert(
  sectionCoreSource.includes('prepareEpisodeArchitectureMaterial(input.userContext, input.level, input.video, input.existingScript)') &&
    sectionCoreSource.indexOf("if (input.section === 'HOOK')") <
      sectionCoreSource.indexOf('prepareEpisodeArchitectureMaterial') &&
    sectionCoreSource.indexOf("if (input.section === 'OPEN LOOP')") <
      sectionCoreSource.indexOf('prepareEpisodeArchitectureMaterial'),
  'Section regeneration lost shared planning or incorrectly routed Hook/Open Loop through it.'
);
assert(
  promptTestSource.includes('prepareEpisodeArchitectureMaterial(userMessage, level, video)') &&
    !/prepareLevelTwo(?:VideoOne|Epiphany|VideoFour|VideoFive)Material/.test(promptTestSource),
  'Admin Prompt Tester does not mirror the shared production episode architect.'
);
assert(
  EPISODE_ARCHITECT_HEADINGS.join('|') ===
    'EPISODE NUCLEUS|HUMAN CONTRADICTION|STORY PROGRESSION|RESERVED CONCLUSION|STAGE FIREWALL|VOICE SIGNALS',
  'The shared episode packet headings changed or multiplied.'
);
assert(
  VIDEO_SEVEN_RETURN_HEADINGS.join('|') ===
    'CONNECTED JOURNEY PROGRESSION|RESERVED RETURN|HONEST REMAINDER AND HORIZON|VOICE SIGNALS',
  'The dedicated Video 7 return packet changed or became a checklist.'
);
assert(
  VIDEO_SEVEN_RETURN_ANCHORS.join('|') === 'EARLIER SELF|FIRST SHIFT|FALL|RETURN',
  'The dedicated Video 7 evidence budget lost or multiplied a journey anchor.'
);
[
  'Videos 1 through 6 final scripts are the audience canon.',
  'one governing identity transformation',
  'private evidence budget',
  '18-35 words on each line',
  'EARLIER SELF selects its evidence from Videos 1-2 only',
  'FIRST SHIFT selects its evidence from Videos 3-4 only',
  'Every anchor is lived evidence',
  'Do not place omitted canon facts inside RESERVED RETURN',
  'RESERVED RETURN uses 20-45 words',
  'one governing meaning created by the four anchors',
  'governing meaning returns as recognition shared between equals',
  'HONEST REMAINDER AND HORIZON uses 20-45 words',
  'honest remainder at the end of MEAT',
  'relational horizon for CTA',
  'unfinished public test may add supporting tension',
  'Make the progression independently understandable to a cold viewer',
  'When the first and second epiphanies came from independent experiences, preserve that independence.',
  'earned professional difference visible without stating a positioning claim'
].forEach(requirement => {
  assert(VIDEO_SEVEN_RETURN_SYSTEM.includes(requirement), 'Video 7 synthesizer is missing: ' + requirement);
});
const validVideoSevenPacket = `CONNECTED JOURNEY PROGRESSION:
EARLIER SELF: The speaker learned that being useful invited more demands without greater value, so accepting money for easy-looking work felt morally suspicious and unsafe.
FIRST SHIFT: An expensive program delivered recycled information without support, forcing the speaker to question whether price represented depth and test a deliberately different approach.
FALL: Years of generous work without a direct invitation left the audience shrinking, until usefulness itself began to feel like evidence that the speaker could not survive.
RETURN: Recognizing hesitation as the repeated opponent now makes the speaker act before certainty, while preserving a human limit around the effort another person must choose.
RESERVED RETURN:
The completed journey reveals that implementation matters more than information and that earned proximity makes the speaker capable of guiding a person still trapped in hesitation. The gift is a clearer distinction between carrying confusion beside someone and pretending to carry the final choice for them.
HONEST REMAINDER AND HORIZON:
The speaker still hesitates before being visible, yet continuing publicly offers the viewer an honest relationship with a guide who remains inside the work.
VOICE SIGNALS:
Direct, conversational, blunt, and self-aware.`;
assert(
  videoSevenReturnPacketIssues(validVideoSevenPacket).length === 0,
  'A valid four-anchor Video 7 evidence packet was rejected.'
);
assert(
  videoSevenReturnPacketIssues(
    validVideoSevenPacket.replace(
      'The speaker learned that being useful invited more demands without greater value, so accepting money for easy-looking work felt morally suspicious and unsafe.',
      'The speaker learned that being useful invited more demands without greater value, so accepting money for easy-looking work felt morally suspicious and unsafe while every earlier job, manager, coworker, customer, schedule, paycheck, promise, argument, disappointment, abandoned project, and private fear also competed for equal space inside the final story.'
    )
  ).some(issue => /EARLIER SELF must not exceed 35 words/.test(issue)),
  'An overloaded journey anchor passed the private evidence-budget validator.'
);
assert(
  videoSevenReturnPacketIssues(validVideoSevenPacket.replace(/^FALL:.*$/m, '')).some(issue =>
    /FALL must appear exactly once/.test(issue)
  ),
  'A Video 7 packet missing the Fall anchor passed validation.'
);
const looselyFormattedVideoSevenPacket = validVideoSevenPacket
  .replace('CONNECTED JOURNEY PROGRESSION:', '**CONNECTED JOURNEY PROGRESSION:**')
  .replace(
    'EARLIER SELF: The speaker learned that being useful invited more demands without greater value, so accepting money for easy-looking work felt morally suspicious and unsafe.',
    `**EARLIER SELF:**
The speaker learned that being useful invited more demands without greater value, so accepting money for easy-looking work felt morally suspicious and unsafe while every earlier job, manager, customer, disappointment, private fear, and abandoned plan competed for equal space in the final story.`
  );
const normalizedVideoSevenPacket = normalizeVideoSevenReturnPacket(looselyFormattedVideoSevenPacket);
assert(
  normalizedVideoSevenPacket &&
    videoSevenReturnPacketIssues(normalizedVideoSevenPacket).length === 0 &&
    normalizedVideoSevenPacket.includes('EARLIER SELF:') &&
    !normalizedVideoSevenPacket.includes('**EARLIER SELF:**'),
  'Harmless Video 7 packet formatting or excess private evidence still blocks generation.'
);
assert(
  normalizeVideoSevenReturnPacket(validVideoSevenPacket.replace(/^FALL:.*$/m, '')) === '',
  'Video 7 packet normalization fabricated a missing journey anchor.'
);
[
  'The current Journey Direction and current-video answers are authoritative.',
  'Do not return a checklist, montage, collection of examples, or several adjacent arguments.'
].forEach(requirement => {
  assert(EPISODE_ARCHITECT_SYSTEM.includes(requirement), 'Shared episode architect is missing: ' + requirement);
});
for (let video = 1; video <= 7; video++) {
  const continuity = episodeContinuityVideos(video);
  const activeSystem = episodeArchitectSystem(video);
  assert(EPISODE_STAGE_SCHEMAS[video], 'Video ' + video + ' is missing its active stage schema.');
  assert(
    activeSystem.includes(EPISODE_STAGE_SCHEMAS[video]) &&
      Object.entries(EPISODE_STAGE_SCHEMAS)
        .filter(([number]) => Number(number) !== video)
        .every(([, schema]) => !activeSystem.includes(schema)),
    'Video ' + video + ' receives a competing stage schema.'
  );
  assert(
    continuity.every(previous => previous < video),
    'Video ' + video + ' episode planning includes future story context.'
  );
}
assert(
  engineSource.includes('The current Journey Direction and current-video answers are the authoritative brief'),
  'The shared prompt engine is missing current-video source ownership.'
);
[
  engineSource,
  browserEngineSource
].forEach((source, index) => {
  assert(
    source.includes('The Journey Direction is also the private Viewer Premise Source.') &&
      source.includes('Translate its essential premise once near the beginning of MEAT'),
    (index ? 'Browser' : 'API') + ' prompt engine is missing the Overview-to-Meat premise contract.'
  );
  assert(
    source.includes('Organize the complete journey around one governing identity transformation') &&
      source.includes('Omit additional events that perform a narrative job already completed') &&
      source.includes('Make the full journey understandable to a cold viewer'),
    (index ? 'Browser' : 'API') + ' prompt engine is missing Video 7 audience-canon synthesis.'
  );
});
assert(
  appHtml.includes('/js/script-prompt-engine.js?v=video7-epic-return-2') &&
    testerHtml.includes('/js/script-prompt-engine.js?v=video7-epic-return-2'),
  'The live app or admin tester can retain the pre-premise browser prompt engine from cache.'
);
assert(
  generationSource.includes('[SeenInSeven model empty]') &&
    generationSource.includes('if (attempt === 0) continue;') &&
    generationSource.includes("throw new Error('The AI returned an empty response.')"),
  'The shared model call does not diagnose and retry empty provider responses.'
);
assert(
  !engineSource.includes('callHookModel'),
  'Hook generation still has a second empty-response retry layered over the shared retry.'
);
assert(
  appSource.includes('The current Journey Direction and current-video answers are the authoritative brief') ||
    browserEngineSource.includes('The current Journey Direction and current-video answers are the authoritative brief'),
  'The browser prompt engine is missing current-video source ownership.'
);
assert(
  engineSource.includes('The viewer hears this before the Meat. Make it independently intelligible') &&
    engineSource.includes('Never rely on an antecedent that appears only in private context or later Meat.'),
  'The dedicated Open Loop Studio still permits private-context shorthand.'
);
assert(
  generationSource.includes('VIDEO 7 MEAT REGENERATION REQUIREMENT: Treat EARLIER SELF, FIRST SHIFT, FALL, and RETURN as the complete evidence budget') &&
    generationSource.includes('Develop those four anchors into complete spoken thoughts') &&
    generationSource.includes('VIDEO 7 CONCLUSION REGENERATION REQUIREMENT: Use RESERVED RETURN alone') &&
    generationSource.includes('Do not replay an anchor event') &&
    generationSource.includes('MEAT REGENERATION REQUIREMENT: Preserve EPISODE NUCLEUS') &&
    generationSource.includes('Rebuild the standalone viewer premise near the beginning of [MEAT]') &&
    generationSource.includes('preserveViewerPremiseSource(input.userContext, preparedContext, input.video)'),
  'Full generation or section regeneration can lose its level-specific architecture.'
);
assert(
  promptTestSource.includes('preserveViewerPremiseSource(userMessage, preparedUserMessage, video)'),
  'Admin Prompt Tester does not preserve the standalone premise through specialized preparation.'
);
assert(
  EPISODE_STAGE_SCHEMAS[6].includes('For Level 1, the truth must be earned through the Video 5 ordeal and aftermath.') &&
    EPISODE_STAGE_SCHEMAS[6].includes('For Level 2, the source may be Video 5, Video 3, another experience, or a broader pattern; no earlier chapter is required to cause it.'),
  'Level 2 Video 6 material routing still forces an earlier chapter to cause the elixir.'
);

const levelTwoVideoFour = extractTaggedSection(published.prompt, 'l2_v4_rules');
[
  'A market trend, industry argument, technology shift, competitor outcome, or later professional philosophy cannot serve as the result.',
  'An ideal-audience description is context, not a character, event, result, or conclusion.',
  'infer one plausible, non-quantified occurrence that follows directly from the current action and choice'
].forEach(requirement => {
  assert(
    levelTwoVideoFour.includes(requirement),
    'Level 2 Video 4 is missing its human-scale payoff boundary: ' + requirement
  );
});
const focusedVideoFourBrief = extractCurrentVideoBrief(
  [
    'ONBOARDING DATA:',
    '- Background: supporting archive only',
    '',
    'CURRENT VIDEO 4 JOURNEY DIRECTION (private planning context only):',
    'Keep the rate accessible while the old approach appears to be winning.',
    'Use this as the intended subject and place in the seven-part journey.',
    '',
    'CURRENT VIDEO 4 PROMPTS:',
    'Question 1: I changed the rate.',
    'Question 2: A more expensive approach won the visible opportunity.',
    'Question 3: I kept my choice while I was uncertain.',
    'Question 4: A human-scale response made continuing possible.',
    '',
    'CURRENT FULL SCRIPT (for context only; write a fresh complete script):',
    'This stale draft must not enter preparation.'
  ].join('\n'),
  4
);
assert(
  focusedVideoFourBrief.startsWith('CURRENT VIDEO 4 JOURNEY DIRECTION') &&
    focusedVideoFourBrief.includes('CURRENT VIDEO 4 PROMPTS:') &&
    !focusedVideoFourBrief.includes('supporting archive only') &&
    !focusedVideoFourBrief.includes('stale draft'),
  'Level 2 Video 4 preparation still drops its Journey Direction or includes unrelated context.'
);
const currentDirection = extractCurrentJourneyDirection(
  [
    'CURRENT VIDEO 4 JOURNEY DIRECTION (private planning context only):',
    'I kept an unconventional rate while the visible market rewarded the opposite choice.',
    'Use this as the intended subject and place in the seven-part journey. Translate its essential premise once near the beginning of MEAT without quoting it, recapping prior videos, or revealing the reserved Conclusion. Do not pull in future journey directions.',
    '',
    'CURRENT VIDEO 4 PROMPTS:',
    'Question 1: I acted on the belief.'
  ].join('\n'),
  4
);
assert(
  currentDirection === 'I kept an unconventional rate while the visible market rewarded the opposite choice.',
  'The Viewer Premise Source cannot be isolated from the current Overview answer.'
);
const architectSource = buildEpisodeArchitectSource(
  [
    'ONBOARDING DATA:',
    '- Name: Test',
    '',
    'VIDEO 2 FINAL SCRIPT (voice and continuity reference; use once, do not repeat it):',
    'The ordinary-world script.',
    '',
    'VIDEO 3 FINAL SCRIPT (voice and continuity reference; use once, do not repeat it):',
    'The first-epiphany script.',
    '',
    'CURRENT VIDEO 4 JOURNEY DIRECTION (private planning context only):',
    currentDirection,
    'Use this as the intended subject and place in the seven-part journey.',
    '',
    'CURRENT VIDEO 4 PROMPTS:',
    'Question 1: I acted on the belief.'
  ].join('\n'),
  2,
  4,
  'The current Video 4 script must remain the same episode.'
);
assert(
  architectSource.includes('LEVEL: 2') &&
    architectSource.includes('VIDEO: 4') &&
    architectSource.includes('The ordinary-world script.') &&
    architectSource.includes('The first-epiphany script.') &&
    architectSource.includes('CURRENT FULL SCRIPT FOR SECTION CONTINUITY:') &&
    architectSource.includes('The current Video 4 script must remain the same episode.') &&
    (architectSource.match(new RegExp(currentDirection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 1,
  'The shared episode architect source loses continuity or duplicates the current Journey Direction inside a prior script.'
);
const preservedPremise = preserveViewerPremiseSource(
  [
    'CURRENT VIDEO 4 JOURNEY DIRECTION (private planning context only):',
    currentDirection,
    'Use this as the intended subject and place in the seven-part journey.',
    '',
    'CURRENT VIDEO 4 PROMPTS:',
    'Question 1: I acted on the belief.'
  ].join('\n'),
  'Generate Video 4 script.\n\nCURATED RECOVERABLE-TRIAL MATERIAL:\nA prepared story packet.',
  4
);
assert(
  preservedPremise.includes('CURRENT VIDEO VIEWER PREMISE SOURCE:') &&
    preservedPremise.includes(currentDirection) &&
    preservedPremise.includes('A prepared story packet.'),
  'Specialized story preparation still discards the current Overview premise.'
);
const alreadyCompleteContext = [
  'CURRENT VIDEO 4 JOURNEY DIRECTION (private planning context only):',
  currentDirection,
  'Use this as the intended subject and place in the seven-part journey.',
  '',
  'CURRENT VIDEO 4 PROMPTS:',
  'Question 1: I acted on the belief.'
].join('\n');
assert(
  preserveViewerPremiseSource(alreadyCompleteContext, alreadyCompleteContext, 4) === alreadyCompleteContext,
  'Standard generation duplicates the Viewer Premise Source instead of using the existing Journey Direction.'
);
const preparedVideoSevenReturn = 'Generate Video 7 script.\n\nCURATED VIDEO 7 RETURN:\nA complete synthesis.';
assert(
  preserveViewerPremiseSource(alreadyCompleteContext, preparedVideoSevenReturn, 7) === preparedVideoSevenReturn,
  'Video 7 still receives raw Journey Direction after its audience canon has been synthesized.'
);

[
  'I could not tell whether the signal meant the choice was working.',
  'I did not know if the message would make me continue or stop.',
  'The blind spot was still sitting inside the decision I had to make.',
  'I saw the warning sign and chose to continue anyway.'
].forEach(example => {
  assert(
    !hasLevelTwoVideoFourHindsight(example),
    'Level 2 Video 4 incorrectly rejects in-the-moment uncertainty: ' + example
  );
});
[
  'Looking back, the message was the first proof that I was right.',
  'I would later realize the quiet response mattered more than the public reaction.',
  'What I could not see until later was why the choice worked.',
  'At the time, I did not recognize the warning that was already there.'
].forEach(example => {
  assert(
    hasLevelTwoVideoFourHindsight(example),
    'Level 2 Video 4 failed to detect explicit later hindsight: ' + example
  );
});

const easyPrompts = evaluateExpression(
  between(appSource, 'const VIDEO_EASY_PROMPTS = ', ';\n\nfunction getEasyPrompt')
);
const levelOneVideos = evaluateExpression(
  between(appSource, 'const level1Videos = ', ';\n\nconst level2Videos =')
);
const levelTwoVideos = evaluateExpression(
  between(appSource, 'const level2Videos = ', ';\n\nfunction getVideos')
);
const adminCatalog = evaluateExpression(
  between(adminQuestionsSource, 'const PROMPT_QUESTION_CATALOG = ', ';\n')
);

assert(
  JSON.stringify(easyPrompts[1].map(item => item && normalizeQuestion(item))) ===
    JSON.stringify(adminCatalog.easy.l1.map(item => item && normalizeQuestion(item))),
  'Level 1 easy questions differ between the app and admin tester.'
);
assert(
  JSON.stringify(easyPrompts[2].map(item => item && normalizeQuestion(item))) ===
    JSON.stringify(adminCatalog.easy.l2.map(item => item && normalizeQuestion(item))),
  'Level 2 easy questions differ between the app and admin tester.'
);
assert(
  JSON.stringify(levelOneVideos.map(normalizeVideo)) === JSON.stringify(adminCatalog.l1.map(normalizeVideo)),
  'Level 1 extended questions differ between the app and admin tester.'
);
assert(
  JSON.stringify(levelTwoVideos.map(normalizeVideo)) === JSON.stringify(adminCatalog.l2.map(normalizeVideo)),
  'Level 2 extended questions differ between the app and admin tester.'
);

assert(levelOneVideos[5].prompts.length === 4, 'Level 1 Video 6 should ask four journal questions.');
assert(levelTwoVideos[5].prompts.length === 4, 'Level 2 Video 6 should ask four journal questions.');
assert(
  /counterintuitive or contrary to common sense/i.test(levelTwoVideos[5].prompts[0].label),
  'Level 2 Video 6 does not ask directly for the counterintuitive elixir.'
);
assert(
  /hardest part.*neither connection is required|neither connection is required/i.test(levelTwoVideos[5].note),
  'Level 2 Video 6 still implies that Video 3 or Video 5 is required.'
);
assert(
  levelOneVideos[5].legacyPrompts.some(prompt => prompt.key === 'v5p2') &&
    levelTwoVideos[5].legacyPrompts.some(prompt => prompt.key === 'v5p2'),
  'Existing Video 6 answers would be discarded instead of retained as optional legacy context.'
);
assert(levelOneVideos[6].prompts.length === 2, 'Level 1 Video 7 should ask two extended journal questions.');
assert(levelTwoVideos[6].prompts.length === 2, 'Level 2 Video 7 should ask two extended journal questions.');
assert(
  levelOneVideos[6].prompts.map(prompt => prompt.key).join('|') === 'v6p1|v6p2' &&
    levelTwoVideos[6].prompts.map(prompt => prompt.key).join('|') === 'v6p1|v6p2',
  'Video 7 should preserve the existing present-change and unfinished answer keys.'
);
assert(
  !JSON.stringify([levelOneVideos[6], levelTwoVideos[6]]).includes('What did telling') &&
    !JSON.stringify([levelOneVideos[6], levelTwoVideos[6]]).includes('why would the right person want to keep following'),
  'Video 7 still asks the user to synthesize the journey or justify the follow.'
);

const videoSevenMessage = buildUserMessage({
  level: 2,
  video: 7,
  onboardingLines: ['- Name: Return Tester'],
  previousVideos: [{
    video: 1,
    mode: 'extended',
    answers: [{ label: 'RAW ANSWER SENTINEL', value: 'DISCARDED DETAIL SENTINEL' }],
    script: 'FINAL SCRIPT SENTINEL'
  }, {
    video: 2,
    mode: 'easy',
    easyAnswer: 'FALLBACK ANSWER SENTINEL',
    answers: [],
    script: ''
  }],
  currentMode: 'extended',
  currentEasyAnswer: '',
  currentAnswers: [{ label: 'PRESENT CHANGE', value: 'CURRENT RETURN SENTINEL' }],
  currentJourneyDirection: 'RETURN DIRECTION SENTINEL'
});
assert(videoSevenMessage.includes('FINAL SCRIPT SENTINEL'), 'Video 7 lost a prior final script.');
assert(!videoSevenMessage.includes('RAW ANSWER SENTINEL') && !videoSevenMessage.includes('DISCARDED DETAIL SENTINEL'), 'Video 7 still receives raw answers behind an existing final script.');
assert(videoSevenMessage.includes('FALLBACK ANSWER SENTINEL'), 'Video 7 lost the raw-answer fallback for a chapter without a final script.');
assert(videoSevenMessage.includes('CURRENT RETURN SENTINEL') && videoSevenMessage.includes('RETURN DIRECTION SENTINEL'), 'Video 7 lost its current return evidence or Journey Direction.');
assert(
  videoSevenMessage.includes('final scripts are the audience canon') &&
    videoSevenMessage.includes('one governing identity transformation') &&
    videoSevenMessage.includes('Omit additional events that perform a narrative job already completed') &&
    videoSevenMessage.includes('Make the full journey understandable to a cold viewer') &&
    engineSource.includes('final scripts are the audience canon') &&
    browserEngineSource.includes('final scripts are the audience canon') &&
    browserEngineSource.includes('Make the full journey understandable to a cold viewer'),
  'Production and browser prompt builders do not share the Video 7 audience-canon rule.'
);
const videoSevenArchitectSource = buildVideoSevenReturnSource(
  [
    'ONBOARDING DATA:',
    '- Name: Return Tester',
    '',
    'VIDEO 1 FINAL SCRIPT (audience canon; select only what supports the return):',
    'FIRST CANON SCRIPT SENTINEL',
    '',
    'VIDEO 2 FINAL SCRIPT (audience canon; select only what supports the return):',
    'SECOND CANON SCRIPT SENTINEL',
    '',
    'CURRENT VIDEO 7 JOURNEY DIRECTION (private planning context only):',
    'RETURN DIRECTION SENTINEL',
    'Use this to clarify the desired return destination, differentiation, unfinished flaw, or horizon. Do not translate it as a new local premise or let it replace the six final scripts. Do not pull in future journey directions.',
    '',
    'CURRENT VIDEO 7 PROMPTS:',
    'Question 1: CURRENT RETURN SENTINEL'
  ].join('\n'),
  2,
  ''
);
assert(
  extractCurrentJourneyDirection(
    [
      'CURRENT VIDEO 7 JOURNEY DIRECTION (private planning context only):',
      'RETURN DIRECTION SENTINEL',
      'Use this to clarify the desired return destination, differentiation, unfinished flaw, or horizon. Do not translate it as a new local premise or let it replace the six final scripts. Do not pull in future journey directions.',
      '',
      'CURRENT VIDEO 7 PROMPTS:',
      'Question 1: CURRENT RETURN SENTINEL'
    ].join('\n'),
    7
  ) === 'RETURN DIRECTION SENTINEL',
  'Video 7 Journey Direction extraction includes its private routing instruction.'
);
assert(
  videoSevenArchitectSource.includes('VIDEO 1 FINAL SCRIPT:\nFIRST CANON SCRIPT SENTINEL') &&
    videoSevenArchitectSource.includes('VIDEO 2 FINAL SCRIPT:\nSECOND CANON SCRIPT SENTINEL') &&
    videoSevenArchitectSource.includes('CURRENT RETURN DIRECTION:\nRETURN DIRECTION SENTINEL') &&
    videoSevenArchitectSource.includes('CURRENT VIDEO 7 ANSWERS:') &&
    !videoSevenArchitectSource.includes('FIRST CANON SCRIPT SENTINEL\n\nVIDEO 2 FINAL SCRIPT (audience canon'),
  'Video 7 synthesis cannot independently read the audience canon, return direction, and current answers.'
);

console.log('Story architecture checks passed for all 14 video paths and both question catalogs.');
