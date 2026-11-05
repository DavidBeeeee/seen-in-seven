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

if (!appSource.includes("'screen-recap','screen-story-discovery','screen-journey-map','screen-journey-review','screen-mvo2'")) {
  throw new Error('Hero orientation, Story Discovery, Journey review, and Video 1 are not in the required order.');
}
if (!html.includes('id="screen-journey-map"') || !html.includes('id="screen-journey-review"') || !html.includes('openJourneyMapSettings()')) {
  throw new Error('Journey Map onboarding, review, or Settings entry is missing.');
}

// A pasted seven-part map is read whatever heading style the member's AI used,
// and a paste that cannot be read says why on the page (2026-11-02).
const seven = make => [1, 2, 3, 4, 5, 6, 7].map(make).join('\n\n');
const IMPORT_FORMATS = {
  'plain': seven(n => `${n}. Story part ${n}.`),
  'intro line first': 'Here is your map:\n\n' + seven(n => `${n}. Story part ${n}.`),
  'title then text': seven(n => `${n}. The Ordinary World\nStory part ${n}.`),
  'Part with em dash': seven(n => `Part ${n} \u2014 The Call\nStory part ${n}.`),
  'bold Part heading': seven(n => `**Part ${n}: The Call**\nStory part ${n}.`),
  'bold number heading': seven(n => `**${n}. The Call**\nStory part ${n}.`),
  'markdown heading': seven(n => `### ${n}. The Call\nStory part ${n}.`),
  'Video label': seven(n => `Video ${n}: Story part ${n}.`),
  'bare number': seven(n => `${n} Story part ${n}.`),
  'code fence': '```text\n' + seven(n => `${n}. Story part ${n}.`) + '\n```',
  'escaped markdown': seven(n => `${n}\\. Story part ${n}.`),
  'escaped bold heading': seven(n => `\\*\\*Part ${n}\\*\\*\nStory part ${n}.`),
  'number inside a part': seven(n => n === 5 ? '5. We drove all night.\n3: that was the year.\n6:00 pm we stopped.' : `${n}. Story part ${n}.`)
};
for (const [name, text] of Object.entries(IMPORT_FORMATS)) {
  const answers = map.parseImportedMap(text);
  if (!answers || answers.length !== 7) throw new Error(`Seven-part paste not read: ${name}.`);
  if (answers.some(answer => /\*\*|```/.test(answer))) throw new Error(`Formatting marks left in the answers: ${name}.`);
  if (!answers[6].includes('Story part 7')) throw new Error(`Part 7 lost its text: ${name}.`);
}
const fifth = map.parseImportedMap(IMPORT_FORMATS['number inside a part'])[4];
if (!fifth.includes('3: that was the year') || !fifth.includes('6:00 pm')) throw new Error('A number inside Part 5 was read as a new part.');
const short = map.parseImportedMapDetail('1. a\n2. b\n3. c');
if (short.answers || short.found.length !== 3) throw new Error('A three-part paste must report three parts found.');
const guide = map.buildHelperPrompt(1, '', '');
if (!guide.includes('plain-text code block') || !guide.includes('Each line starts with its number and a period') || !guide.includes('No titles, part names, headings, bold')) {
  throw new Error('The Story Discovery guide does not ask for the exact format the paste box reads.');
}
// A good paste must leave the paste screen. saveProgress replaces state.phase2,
// so the imported mode set after it was lost and the box silently reset (2026-11-03).
const importBody = appSource.slice(appSource.indexOf('function importJourneyMap('), appSource.indexOf('function openJourneyPartHelp('));
if (importBody.indexOf("p2.storyDiscoveryMode = 'imported'") === -1 || importBody.indexOf("p2.storyDiscoveryMode = 'imported'") > importBody.indexOf('saveProgress()')) {
  throw new Error('importJourneyMap must set the imported mode before saveProgress.');
}
// A map saved under the old ordering has a timestamp and the ai mode. It must
// open on its seven answers, and choosing AI again must still reach the box (2026-11-03).
const phase2Body = appSource.slice(appSource.indexOf('function ensurePhase2('), appSource.indexOf('function escapeHTML('));
if (!phase2Body.includes("state.phase2.storyDiscoveryMode === 'ai' && state.phase2.storyMapImportedAt")) {
  throw new Error('ensurePhase2 must reopen a saved import on its answers, not on an empty paste box.');
}
const chooseBody = appSource.slice(appSource.indexOf('function chooseStoryDiscovery('), appSource.indexOf('function selectCardAnswer('));
if (!chooseBody.includes("p2.storyMapImportedAt = ''") || chooseBody.indexOf("p2.storyMapImportedAt = ''") > chooseBody.indexOf('saveProgress()')) {
  throw new Error('chooseStoryDiscovery must clear the import timestamp before saving, or a member can never paste a new map.');
}

// The map must come back as seven separate story bases, not one idea in seven
// parts (2026-11-03): every part keeps its own job in both guides, on both levels.
for (const level of [1, 2]) {
  const fullGuide = map.buildHelperPrompt(level, '', '');
  if (!fullGuide.includes('seven different stories, not one idea explained seven ways') || !fullGuide.includes('WHAT EACH PART MUST DO')) {
    throw new Error(`The Level ${level} guide lost the separate-stories rule.`);
  }
  for (const [index, label] of ['The decision', 'The ordinary life', 'The first realization', 'The test', 'The fall', 'The larger truth', 'The return'].entries()) {
    if (!fullGuide.includes(`${index + 1}. ${label}:`)) throw new Error(`The Level ${level} guide lost the job for Part ${index + 1}.`);
    const partGuide = map.buildPartHelperPrompt(level, index, '', []);
    if (!partGuide.includes(`WHAT THIS PART MUST DO\n${label}:`)) throw new Error(`The Level ${level} helper for Part ${index + 1} lost its job.`);
  }
}

// A part is a full story (2026-11-05). Sixty words forced a summary, the box cut
// every part at 600 characters. David, 2026-11-05: the AI keeps its leeway to
// infer and invent. Holding it to what was said wrecks the process, because the
// point is to uncover what would otherwise never be said or thought of.
// David, same day: no interview. The AI works it out, the member only picks a story,
// and it never asks what it already knows. It may ask only for genuine clarification.
const longStory = 'word '.repeat(330).trim();
const longParts = map.parseImportedMap(seven(n => `${n}. ${longStory}`));
if (!longParts || longParts.some(part => part !== longStory)) throw new Error('The paste box cut a full-length story part.');
for (const level of [1, 2]) {
  const fullGuide = map.buildHelperPrompt(level, '', '');
  for (const value of ['no more than 60', 'one or two', 'up to three', 'no limit on these questions', 'maximum of five', 'start by asking', 'one short question per message', 'about eight questions', 'ask me for it', 'never invent', 'made up', 'only what is true', 'real event']) {
    if (fullGuide.toLowerCase().includes(value)) throw new Error(`The Level ${level} guide still says: ${value}`);
  }
  for (const value of ['ONCE I CHOOSE, WRITE THE MAP', 'with no questions first', 'Never ask me anything you already know', 'That choice is usually the only thing you need from me', 'never more than two in all', 'The map itself gets all the space it needs', 'follow the job', 'usually 100 to 200 words', 'It holds one event', 'invent plausible details', 'things I would never have said or thought of', 'Imagine the most compelling plausible version', 'HOW TO TALK TO ME']) {
    if (!fullGuide.includes(value)) throw new Error(`The Level ${level} guide lost: ${value}`);
  }
  const partGuide = map.buildPartHelperPrompt(level, 3, '', []);
  if (partGuide.includes('no more than 60') || !partGuide.includes('Do not ask me questions') || partGuide.includes('never invent') || !partGuide.includes('invent plausible details') || !partGuide.includes('usually 100 to 200 words')) throw new Error(`The Level ${level} part helper still asks for a summary.`);
}

if (!/id="journey-import-error" role="alert"/.test(appSource) || !appSource.includes('function journeyImportProblem(') || /field\.placeholder = 'Please paste all seven/.test(appSource)) {
  throw new Error('An unreadable paste must show a visible error, not only change the placeholder.');
}

console.log('Journey Map checks passed for both levels, thirteen paste formats, the visible paste error, the guide output format, per-part story jobs, current-video prompt isolation, onboarding order, and Settings access.');
