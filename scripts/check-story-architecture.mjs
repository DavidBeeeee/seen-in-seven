import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  buildSystemPrompt,
  extractTaggedSection,
  hasLevelTwoVideoFourHindsight,
  publishedPrompt,
  stageContract,
  validateBlueprintSource
} from '../api/_lib/prompt-engine.js';
import {
  buildEpisodeArchitectSource,
  EPISODE_ARCHITECT_HEADINGS,
  EPISODE_ARCHITECT_SYSTEM,
  EPISODE_STAGE_SCHEMAS,
  episodeArchitectSystem,
  episodeContinuityVideos,
  extractCurrentJourneyDirection,
  extractCurrentVideoBrief,
  preserveViewerPremiseSource
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

const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../seeninseven.html', import.meta.url), 'utf8');
const testerHtml = readFileSync(new URL('../admin-prompt-tester.html', import.meta.url), 'utf8');
const adminQuestionsSource = readFileSync(new URL('../js/admin-prompt-questions.js', import.meta.url), 'utf8');
const generationSource = readFileSync(new URL('../api/generate.js', import.meta.url), 'utf8');
const promptTestSource = readFileSync(new URL('../api/prompt-test.js', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('../api/_lib/prompt-engine.js', import.meta.url), 'utf8');
const browserEngineSource = readFileSync(new URL('../js/script-prompt-engine.js', import.meta.url), 'utf8');

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
});
assert(
  appHtml.includes('/js/script-prompt-engine.js?v=standalone-context-1') &&
    testerHtml.includes('/js/script-prompt-engine.js?v=standalone-context-1'),
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
  generationSource.includes("const sectionInstruction = input.section === 'MEAT'") &&
    generationSource.includes('MEAT REGENERATION REQUIREMENT: Preserve EPISODE NUCLEUS') &&
    generationSource.includes('Rebuild the standalone viewer premise near the beginning of [MEAT]') &&
    generationSource.includes('preserveViewerPremiseSource(input.userContext, preparedContext, input.video)'),
  'Full generation or Meat regeneration can lose the standalone viewer premise.'
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

console.log('Story architecture checks passed for all 14 video paths and both question catalogs.');
