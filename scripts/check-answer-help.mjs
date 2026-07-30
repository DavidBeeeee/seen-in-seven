import fs from 'node:fs';
import vm from 'node:vm';

const helperSource = fs.readFileSync('js/answer-help.js', 'utf8');
const journeySource = fs.readFileSync('js/journey-map.js', 'utf8');
const appSource = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('seeninseven.html', 'utf8');
const overviewPrompt = fs.readFileSync('assets/overview-character-bio-prompt.txt', 'utf8');

const context = {
  window: {},
  navigator: {},
  document: {
    createElement() {
      return { style: {}, select() {}, remove() {} };
    },
    body: { appendChild() {} },
    execCommand() {}
  }
};
vm.createContext(context);
vm.runInContext(helperSource, context);
vm.runInContext(journeySource, context);

const helper = context.window.SISAnswerHelp;
if (!helper) throw new Error('Answer Help module did not initialize.');
const journeyHelper = context.window.SISJourneyMap;
if (!journeyHelper) throw new Error('Journey Map helper did not initialize.');

for (const level of [1, 2]) {
  if (!Array.isArray(helper.ASSIGNMENTS[level]) || helper.ASSIGNMENTS[level].length !== 7) {
    throw new Error(`Level ${level} must have exactly seven Answer Help assignments.`);
  }
}

const simplePrompt = helper.buildPrompt({
  level: 2,
  videoIndex: 3,
  mode: 'simple',
  questions: [{
    label: 'CURRENT QUESTION SENTINEL',
    hint: 'CURRENT HINT SENTINEL',
    value: 'CURRENT ANSWER SENTINEL'
  }],
  journeyDirection: 'CURRENT DIRECTION SENTINEL',
  previousScripts: [{
    video: 1,
    locked: true,
    script: 'LOCKED SCRIPT SENTINEL'
  }],
  onboardingContext: 'ONBOARDING SENTINEL',
  overview: 'OVERVIEW SENTINEL'
});

[
  'CURRENT QUESTION SENTINEL',
  'CURRENT HINT SENTINEL',
  'CURRENT ANSWER SENTINEL',
  'CURRENT DIRECTION SENTINEL',
  'LOCKED SCRIPT SENTINEL',
  'ONBOARDING SENTINEL',
  'OVERVIEW SENTINEL',
  'CURRENT VIDEO JOB',
  'STORY RULE',
  'Coverage List',
  'complete route through the entire question set',
  'OPTION 1',
  'three more',
  'infer plausible motives',
  'Use as much space as the story needs',
  'Do not compress or stretch the answer to meet a word, sentence, or paragraph count'
].forEach(value => {
  if (!simplePrompt.includes(value)) throw new Error(`Simple helper prompt is missing: ${value}`);
});
[
  '150 to 250 words',
  'no more than 100 words'
].forEach(value => {
  if (simplePrompt.includes(value)) throw new Error(`Answer Help still contains an artificial length cap: ${value}`);
});

[
  'NON-NEGOTIABLE SOURCE ORDER',
  'PRIMARY STORY SOURCE',
  'CONTEXT RESET',
  'research archive, not an active assignment'
].forEach(value => {
  if (simplePrompt.includes(value)) throw new Error(`The old bloated helper instruction remains: ${value}`);
});
if (!simplePrompt.includes('Develop the complete Current Story Direction according to the Current Video Job')) {
  throw new Error('The three approaches are not bound to the complete current video job and selected story.');
}
if (!simplePrompt.includes('Stay inside what the speaker could know during this chapter')) {
  throw new Error('The helper is missing its future-chapter boundary.');
}
if (!simplePrompt.includes('This is journal-answer development, not scriptwriting')) {
  throw new Error('The raw-answer boundary is missing.');
}
if (!simplePrompt.includes('Do not mention SeenInSeven story architecture, stage names')) {
  throw new Error('Private story architecture can leak into user-facing answer options.');
}
if (!simplePrompt.includes('account for every current question') ||
    !simplePrompt.includes('without dividing the required material among the three options') ||
    !simplePrompt.includes('Do not truncate or pad it to meet a fixed length') ||
    simplePrompt.includes('Use no more than two short sentences')) {
  throw new Error('Answer Help options can still partition a multi-part story.');
}

const onboardingIndex = simplePrompt.indexOf('ONBOARDING SENTINEL');
const backgroundIndex = simplePrompt.indexOf('OVERVIEW SENTINEL');
const scriptIndex = simplePrompt.indexOf('LOCKED SCRIPT SENTINEL');
const directionIndex = simplePrompt.indexOf('CURRENT DIRECTION SENTINEL');
const questionIndex = simplePrompt.indexOf('CURRENT QUESTION SENTINEL');
if (!(onboardingIndex < backgroundIndex &&
      backgroundIndex < scriptIndex &&
      scriptIndex < directionIndex &&
      directionIndex < questionIndex)) {
  throw new Error('Answer Help source material is not ordered as onboarding, background, scripts, direction, then current Q&A.');
}

const assignmentChecks = {
  1: [
    'declaration and emotional starting point',
    'ordinary life',
    'first personal Epiphany',
    'Road of Trials',
    'genuine ordeal',
    'larger truth earned through the Video 5 ordeal',
    'present-day evidence the Return still needs'
  ],
  2: [
    'remaining quiet stop feeling acceptable now',
    'unpolished origin',
    'first professional Epiphany',
    'one Road of Trials story',
    'apparently irreversible collapse',
    'more significant counterintuitive way',
    'present-day evidence the Return still needs'
  ]
};
for (const level of [1, 2]) {
  assignmentChecks[level].forEach((phrase, index) => {
    if (!helper.ASSIGNMENTS[level][index].includes(phrase)) {
      throw new Error(`Level ${level} Video ${index + 1} Answer Help job is missing: ${phrase}`);
    }
  });
}

const extendedPrompt = helper.buildPrompt({
  level: 1,
  videoIndex: 4,
  mode: 'extended',
  questions: [
    { label: 'FIRST EXACT QUESTION', hint: '', value: '' },
    { label: 'SECOND EXACT QUESTION', hint: '', value: '' }
  ]
});
if (!extendedPrompt.includes('repeat each current question exactly as written')) {
  throw new Error('Extended paste-ready formatting contract is missing.');
}
if (!extendedPrompt.includes('different job, scene, or piece of evidence')) {
  throw new Error('Extended answers are not protected from repeating each other.');
}
if (!extendedPrompt.includes('Use as much space as each answer needs') ||
    !extendedPrompt.includes('Do not compress or stretch an answer to meet a word, sentence, or paragraph count')) {
  throw new Error('Extended paste-ready answers still risk being compressed by an artificial length target.');
}

const journeyPrompt = journeyHelper.buildHelperPrompt(
  2,
  'LONG HISTORY SENTINEL',
  'JOURNEY ONBOARDING SENTINEL'
);
[
  'Use one or two direct sentences',
  'Contain no more than 60 words',
  'Directly address every part of its question',
  'make sense when copied into a separate conversation by itself',
  'Do not force every video into the same event-cause-lesson formula',
  'Make causal relationships explicit when they are necessary',
  'LONG HISTORY SENTINEL',
  'JOURNEY ONBOARDING SENTINEL'
].forEach(value => {
  if (!journeyPrompt.includes(value)) throw new Error(`Journey helper prompt is missing: ${value}`);
});
if (!appSource.includes("${count} / 60 words") ||
    !appSource.includes("count > 60") ||
    appSource.includes("${count} / 25 words")) {
  throw new Error('Journey direction editing does not match the new 60-word guidance.');
}

if (!html.includes('id="answer-help-overlay"') || !html.includes('/js/answer-help.js?v=answer-depth-1')) {
  throw new Error('Answer Help modal or shared script include is missing.');
}
if (!html.includes('/js/journey-map.js?v=journey-map-3') || !/\/js\/app\.js\?v=[^"]+/.test(html)) {
  throw new Error('Journey Map or app cache version is missing.');
}
if (!html.includes('openCurrentMvoAnswerHelp()')) {
  throw new Error('Video 1 Answer Help entry is missing.');
}
if (!appSource.includes("openAnswerHelp(${idx},'simple')") || !appSource.includes("openAnswerHelp(${idx},'extended')")) {
  throw new Error('Simple or Extended Answer Help entry is missing from Videos 2 through 7.');
}
if (!html.includes('openOverviewAnswerHelp()') || !appSource.includes('/assets/overview-character-bio-prompt.txt?v=overview-help-1')) {
  throw new Error('Overview Answer Help entry or prompt asset is missing.');
}
if (!overviewPrompt.includes('REQUIRED RESPONSE PROCESS') || !overviewPrompt.includes('ZERO-CHILL RULE')) {
  throw new Error('The supplied Overview character-bio prompt is incomplete.');
}
if (!appSource.includes('under 11,500 characters')) {
  throw new Error('The Overview helper does not protect the 12,000-character app field.');
}
if (!appSource.includes('requestId !== answerHelpRequestId')) {
  throw new Error('Overview prompt loading can overwrite a newer Answer Help view.');
}

console.log('Answer Help checks passed for Overview, 14 video assignments, context isolation, anti-repetition, interactive choices, and paste-ready output.');
