import fs from 'node:fs';
import vm from 'node:vm';

const helperSource = fs.readFileSync('js/answer-help.js', 'utf8');
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

const helper = context.window.SISAnswerHelp;
if (!helper) throw new Error('Answer Help module did not initialize.');

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
  'binding scope',
  'PRIMARY STORY SOURCE',
  'OPTION 1',
  'three more',
  'invent plausible connective scenes',
  '150 to 250 words'
].forEach(value => {
  if (!simplePrompt.includes(value)) throw new Error(`Simple helper prompt is missing: ${value}`);
});

if (simplePrompt.includes('FUTURE DIRECTION SENTINEL')) {
  throw new Error('A future Journey direction leaked into Answer Help.');
}
if (!simplePrompt.includes('all three options must stay inside that same story and time window')) {
  throw new Error('The selected Journey direction is not protected across all three options.');
}
if (!simplePrompt.includes('Reusing an established setting, job, relationship, event, or life fact is allowed')) {
  throw new Error('Continuity facts are still being mistaken for repetition.');
}
if (simplePrompt.includes('different source events or time periods') || simplePrompt.includes('Search a different time period')) {
  throw new Error('The old cross-story variety rule is still present.');
}
if (simplePrompt.indexOf('CURRENT DIRECTION SENTINEL') > simplePrompt.indexOf('OVERVIEW SENTINEL')) {
  throw new Error('The Overview appears before the binding Current Story Direction.');
}
if (!simplePrompt.includes('not scriptwriting')) {
  throw new Error('The raw-answer boundary is missing.');
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

if (!html.includes('id="answer-help-overlay"') || !html.includes('/js/answer-help.js?v=answer-help-2')) {
  throw new Error('Answer Help modal or shared script include is missing.');
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
