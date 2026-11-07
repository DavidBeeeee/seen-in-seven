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

// A signed-in load saves during its database restore, before the page has its place.
// That save wrote the default level over the saved one, so a Level 2 member got the
// Level 1 guide and their paste went into the Level 1 map (2026-11-05).
if (!appSource.includes('if (phase2.resume && resumePositionApplied) {') ||
    !appSource.includes("journeyMapMode === 'onboarding' ? state.level : resume.journeyLevel")) {
  throw new Error('A signed-in reload must not overwrite the saved place, and onboarding must use the member level.');
}

// David, 2026-11-06: Video 1 comes from the onboarding answers, and the map is outside
// research. Part 1 reaches Video 1 only as background, never as its brief or an answer.
if (appSource.includes('The story direction behind this video') ||
    !appSource.includes("currentJourneyDirection: videoIdx === 0 ? '' : journeyDirectionFor(videoIdx, level)") ||
    !appSource.includes('Background from my outside story research')) {
  throw new Error('Video 1 must be built from onboarding, with the map as background only.');
}

// David, 2026-11-06: the map part shows above the "anything else" box on every video.
if (!html.includes('id="video-one-story-part"') || !appSource.includes("storyPart.innerHTML = direction") ||
    !appSource.includes('    ${journeyDirectionHTML}\n')) {
  throw new Error('Every video must show its map part above the anything-else box.');
}

// David, 2026-11-06: a quirky Part 2 made a good story that did the wrong job. Part 2 is
// the ordinary life, and it covers what that level's Video 2 questions ask for.
if (!map.buildHelperPrompt(2, '', '').includes('what made me dismiss it or assume it could never be real work') ||
    !map.buildHelperPrompt(1, '', '').includes('one thing about me people would not expect')) {
  throw new Error('Part 2 must carry what its Video 2 questions ask for on both levels.');
}

// David, 2026-11-06: tracker blocks open finished scripts, and future videos stay plain.
if (!appSource.includes('function openTrackerScript(idx)') || !appSource.includes('if (hasScript && !(context === \'script\' && i === currentVideoIndex))')) {
  throw new Error('Finished scripts must open from the video tracker.');
}

// The full start-over popup sat inside the dashboard screen, so it opened at zero size
// from every other page and the button looked dead (2026-11-06).
if (html.indexOf('id="start-over-confirm"') > html.search(/class="screen[" ]/)) {
  throw new Error('The start-over popup must live outside every screen.');
}

// David, 2026-11-06: after copying a prompt, the member sees the next step and a button
// back to the box their AI's answer goes in.
for (const piece of ['id="journey-help-next"', 'id="answer-help-next"', 'pasteJourneyHelpAnswer()', 'pasteAnswerHelpAnswer()']) {
  if (!html.includes(piece)) throw new Error(`The helper next step lost: ${piece}`);
}
if (!appSource.includes("journeyHelpTarget = 'journey-import'") || !appSource.includes("journeyHelpTarget = 'journey-answer-' + index")) {
  throw new Error('Each helper must lead back to its own paste box.');
}

// David, 2026-11-06: a part with no event makes a script that repeats itself. The event
// lines above the map carry no numbers, so a whole-message paste still reads as seven parts.
const wholeMessage = 'The test: the night Dana asked me to take over.\nThe fall: the week the show stopped.\n\n```\n' + seven(n => `${n}. Story part ${n}.`) + '\n```';
const wholeParts = map.parseImportedMap(wholeMessage);
if (!wholeParts || wholeParts[0] !== 'Story part 1.' || !wholeParts[6].includes('Story part 7')) throw new Error('Event lines above the map must not be read as parts.');

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
// Later runs wrote well about the same five milestones, so it must now search past them.
// A strict cause-and-effect chain then pushed it back to those milestones, so the
// parts share one question and build emotionally without having to cause each other.
const longStory = 'word '.repeat(330).trim();
const longParts = map.parseImportedMap(seven(n => `${n}. ${longStory}`));
if (!longParts || longParts.some(part => part !== longStory)) throw new Error('The paste box cut a full-length story part.');
for (const level of [1, 2]) {
  const fullGuide = map.buildHelperPrompt(level, '', '');
  for (const value of ['no more than 60', 'one or two', 'up to three', 'no limit on these questions', 'maximum of five', 'what part 4 starts', 'run in time order', 'start by asking', 'one short question per message', 'about eight questions', 'ask me for it', 'never invent', 'made up', 'only what is true', 'real event']) {
    if (fullGuide.toLowerCase().includes(value)) throw new Error(`The Level ${level} guide still says: ${value}`);
  }
  for (const value of ['ONCE I CHOOSE, WRITE THE MAP', 'with no questions first', 'Never ask me anything you already know', 'That choice is usually the only thing you need from me', 'never more than two in all', 'The map itself gets all the space it needs', 'follow the job', 'is built on one event', 'one short line for each of Parts 2 through 7 naming its event', 'choose one event from the list', 'Part 2 is the exception: it should be the actual job or life I was living', 'This does not apply to Part 2', 'ONE DEVELOPING STORY', 'the one question that connects all seven parts', 'do not need to cause one another', 'pull you back to the obvious milestones', 'does not pass', 'the moment it hit me hardest', 'privately list at least 20 specific moments', 'Only one project, job, or period', 'use the smaller moment', 'name the day or conversation', 'one specific day or conversation', 'cannot be taken back', 'way back', 'usually 100 to 200 words', 'It holds one event', 'invent plausible details', 'things I would never have said or thought of', 'Imagine the most compelling plausible version', 'HOW TO TALK TO ME']) {
    if (!fullGuide.includes(value)) throw new Error(`The Level ${level} guide lost: ${value}`);
  }
  if (level === 2 && !fullGuide.includes('a realization about myself does not count')) throw new Error('Level 2 Part 6 must stay a way of working someone could argue with.');
  if ((level === 2) !== fullGuide.includes('the objection a sensible person would raise')) throw new Error('The objection test belongs on Level 2 Part 6 only.');
  if (level === 2 && !fullGuide.includes('Then tell one specific time it happened')) throw new Error('Level 2 Part 6 must open with the practice.');
  const partGuide = map.buildPartHelperPrompt(level, 3, '', []);
  if (partGuide.includes('no more than 60') || !partGuide.includes('Do not ask me questions') || partGuide.includes('never invent') || !partGuide.includes('invent plausible details') || !partGuide.includes('usually 100 to 200 words')) throw new Error(`The Level ${level} part helper still asks for a summary.`);
}

if (!/id="journey-import-error" role="alert"/.test(appSource) || !appSource.includes('function journeyImportProblem(') || /field\.placeholder = 'Please paste all seven/.test(appSource)) {
  throw new Error('An unreadable paste must show a visible error, not only change the placeholder.');
}

console.log('Journey Map checks passed for both levels, thirteen paste formats, the visible paste error, the guide output format, per-part story jobs, current-video prompt isolation, onboarding order, and Settings access.');
