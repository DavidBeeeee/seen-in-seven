import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  buildSystemPrompt,
  extractTaggedSection,
  publishedPrompt,
  stageContract,
  validateBlueprintSource
} from '../api/_lib/prompt-engine.js';

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
    assert(stageContract(level, video), 'Missing stage contract for Level ' + level + ', Video ' + video + '.');
  }
}

for (const level of [1, 2]) {
  const videoSix = extractTaggedSection(published.prompt, 'l' + level + '_v6_rules');
  assert(/Video 5|VIDEO 5/.test(videoSix), 'Level ' + level + ' Video 6 lost its required Video 5 cause.');
  assert(/optional continuity|relationship is optional|does not have to/.test(videoSix), 'Level ' + level + ' Video 6 still lacks an explicit optional Video 3 relationship.');
}

const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const adminQuestionsSource = readFileSync(new URL('../js/admin-prompt-questions.js', import.meta.url), 'utf8');
const generationSource = readFileSync(new URL('../api/generate.js', import.meta.url), 'utf8');
const promptTestSource = readFileSync(new URL('../api/prompt-test.js', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('../api/_lib/prompt-engine.js', import.meta.url), 'utf8');

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

assert(
  generationSource.includes("if (input.level === 2 && input.video === 1)") &&
    generationSource.includes('preparedContext = await prepareLevelTwoVideoOneMaterial(input.userContext);'),
  'Production section regeneration does not use Level 2 Video 1 material preparation.'
);
assert(
  promptTestSource.includes('preparedUserMessage = await prepareLevelTwoVideoOneMaterial(userMessage);'),
  'Admin Prompt Tester does not mirror Level 2 Video 1 production preparation.'
);
assert(
  generationSource.includes("'OPTIONAL VIDEO 3 CONNECTION'") &&
    generationSource.includes('Video 3 may be related, but that relationship is optional'),
  'Level 2 Video 6 material routing does not preserve optional Video 3 continuity.'
);

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
  levelOneVideos[5].legacyPrompts.some(prompt => prompt.key === 'v5p2') &&
    levelTwoVideos[5].legacyPrompts.some(prompt => prompt.key === 'v5p2'),
  'Existing Video 6 answers would be discarded instead of retained as optional legacy context.'
);

console.log('Story architecture checks passed for all 14 video paths and both question catalogs.');
