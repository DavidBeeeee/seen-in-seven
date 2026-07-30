import fs from 'node:fs';
import vm from 'node:vm';

const mapSource = fs.readFileSync('js/journey-map.js', 'utf8');
const engineSource = fs.readFileSync('js/script-prompt-engine.js', 'utf8');
const appSource = fs.readFileSync('js/app.js', 'utf8');
const html = fs.readFileSync('seeninseven.html', 'utf8');

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
vm.runInContext(mapSource, context);
vm.runInContext(engineSource, context);

const map = context.window.SISJourneyMap;
const engine = context.window.SISPromptEngine;
if (!map || !engine) throw new Error('Journey Map shared modules did not initialize.');

for (const level of [1, 2]) {
  if (map.QUESTIONS[level].length !== 7) throw new Error(`Level ${level} must have exactly seven Journey Map questions.`);
  if (map.QUESTIONS[level].some(question => !/\bI\b|\bmy\b|\bme\b/.test(question))) {
    throw new Error(`Every Level ${level} question must be written in first person.`);
  }
}

const message = engine.buildUserMessage({
  level: 2,
  video: 4,
  onboardingLines: ['- Name: Test'],
  previousVideos: [],
  currentMode: 'easy',
  currentEasyAnswer: 'Detailed current answer.',
  currentAnswers: [],
  currentJourneyDirection: 'I tested my belief and met resistance.'
});
if (!message.includes('CURRENT VIDEO 4 JOURNEY DIRECTION')) throw new Error('Current Journey direction was not included.');
if (!message.includes('I tested my belief and met resistance.')) throw new Error('Current Journey answer was not included.');
if (!message.includes('private Viewer Premise Source') ||
    !message.includes('Translate its essential premise once near the beginning of MEAT')) {
  throw new Error('Current Journey direction is not assigned to the standalone Meat premise.');
}
if (message.includes('VIDEO 5 JOURNEY DIRECTION')) throw new Error('A future Journey direction leaked into the current prompt.');

if (!appSource.includes("'screen-checklist','screen-journey-map','screen-mvo2'")) {
  throw new Error('Journey Map is not positioned between Overview and Video 1 preparation.');
}
if (!html.includes('id="screen-journey-map"') || !html.includes('openJourneyMapSettings()')) {
  throw new Error('Journey Map onboarding or Settings entry is missing.');
}

console.log('Journey Map checks passed for both levels, current-video prompt isolation, onboarding order, and Settings access.');
