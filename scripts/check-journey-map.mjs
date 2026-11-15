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

if (!appSource.includes("'screen-recap','screen-story-discovery','screen-journey-map','screen-mvo2'")) {
  throw new Error('Story Discovery must lead directly from one Journey review to Video 1.');
}
if (!html.includes('id="screen-journey-map"') || html.includes('id="screen-journey-review"') || !html.includes('openJourneyMapSettings()')) {
  throw new Error('Journey must have exactly one review screen, with Settings access.');
}
if (!appSource.includes('function renderJourneyDetailNotes(') || !appSource.includes('function setJourneyStoryNote(') || !appSource.includes('journeyNoteProgress(level)')) {
  throw new Error('Journey review must show/edit detailed source answers, not only short About summaries.');
}
if (!appSource.includes("storyDiscoveryMode = 'self-review'") || !appSource.includes("p2.storyDiscoveryMode === 'self-review'")) {
  throw new Error('Self-guided and skipped journeys must reach the same one-screen review.');
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
// WBR-472, 2026-11-13: the AI returns story notes (an About line and an answer to each of
// that video's own questions), not seven finished paragraphs. The prompt must ask for
// exactly the layout the paste box reads, using the questions the app passes in.
const noteQuestions = [3, 3, 4, 3, 4, 2].map((count, part) => Array.from({ length: count }, (_, q) => ({ label: `QUESTION P${part + 2} N${q + 1}`, hint: `HINT P${part + 2} N${q + 1}` })));
const guide = map.buildHelperPrompt(2, '', '', noteQuestions);
if (!guide.includes('plain-text code block') || !guide.includes('PART 2\nAbout:') || !guide.includes('Each answer is one line that starts with its number')) {
  throw new Error('The Story Discovery prompt does not ask for the exact layout the paste box reads.');
}
for (const list of noteQuestions) for (const question of list) {
  if (!guide.includes(question.label) || !guide.includes('(' + question.hint + ')')) throw new Error('The prompt lost one of the app\'s own questions: ' + question.label);
}
if (!appSource.includes('storyNoteQuestions(journeyMapLevel)') || !appSource.includes('function importStoryNotes(')) {
  throw new Error('The app must pass its own questions to the prompt and file the answers on paste.');
}
const pastedNotes = '```\nPART 1\nI am finally saying it.\n\n' + noteQuestions.map((list, part) => `**PART ${part + 2}**\nAbout: Event ${part + 2}.\n` + list.map((_, q) => `${q + 1}. Answer ${part + 2}.${q + 1} with 3: a number inside.`).join('\n')).join('\n\n') + '\n```';
const readNotes = map.parseStoryNotes(pastedNotes, noteQuestions.map(list => list.length));
if (!readNotes || !readNotes.ok || readNotes.parts[0].about !== 'I am finally saying it.' || readNotes.parts[4].about !== 'Event 5.' || readNotes.parts[3].answers.length !== 4 || !readNotes.parts[3].answers[3].includes('3: a number inside')) {
  throw new Error('The paste box could not read story notes in the layout the prompt asks for.');
}
const shortNotes = map.parseStoryNotes(pastedNotes.replace('3. Answer 5.3 with 3: a number inside.', ''), noteQuestions.map(list => list.length));
if (!shortNotes || shortNotes.ok || !shortNotes.problems.some(problem => /Part 5 has 2 of its 3 answers/.test(problem))) throw new Error('Notes with a missing answer must say which part is short.');
if (map.parseStoryNotes(seven(n => `${n}. An older map paragraph ${n}.`), [3, 3, 4, 3, 4, 2]) !== null) throw new Error('An older seven-line map must still go to the older reader.');
if (map.parseStoryNotes(seven(n => `Draft of part ${n}: draft.`) + '\nAbout: x', [3, 3, 4, 3, 4, 2]) !== null) throw new Error('A pasted draft must not be read as final notes.');
// Both Level 1 and Level 2 have different question counts. Each must accept its
// own complete notes and reject an incomplete answer set without using an LLM.
const sourceCounts = {1:[3,3,4,5,4,2], 2:[3,3,4,3,4,2]};
for (const level of [1,2]) {
  const counts = sourceCounts[level];
  const notes = 'PART 1\nI am starting now.\n\n' + counts.map((count, offset) =>
    'PART ' + (offset + 2) + '\nAbout: Specific chapter ' + (offset + 2) +
    '\n' + Array.from({length:count}, (_, index) => (index + 1) + '. A detailed scene in answer ' + (index + 1) + '.').join('\n')
  ).join('\n\n');
  const parsed = map.parseStoryNotes(notes, counts);
  if (!parsed || !parsed.ok || parsed.parts[6].answers.length !== 2) {
    throw new Error('Level ' + level + ' complete story notes failed to import.');
  }
  const bad = map.parseStoryNotes(notes.replace('2. A detailed scene in answer 2.', ''), counts);
  if (!bad || bad.ok) throw new Error('Level ' + level + ' must reject missing source answers.');
}
if (!appSource.includes("const store = journeyNoteStore(level)") ||
    !appSource.includes("answers[Number(index)] = String(value || '').slice(0, 4000)") ||
    !appSource.includes("if (!signedIn) state.journeyMaps = {1:[],2:[]};")) {
  throw new Error('Source notes, long Part 1 answers, and returning members must not lose data.');
}
if (!appSource.includes('Existing scripts for Videos ') ||
    !appSource.includes('will not automatically update')) {
  throw new Error('Members must be warned when existing scripts predate changed story notes.');
}

// Answers typed for a video are sent whenever they exist (they were silently dropped).
if (!appSource.includes('function videoAnswerMode(') || (appSource.match(/videoAnswerMode\((?:videoIdx|index), level\)/g) || []).length < 2) {
  throw new Error('A video\'s answers must be sent for the current and the earlier videos.');
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

// David, 2026-11-06, restored 2026-11-14: Video 1 declares from the onboarding answers.
// Part 1 of the story reaches it as background only, never as its journey direction.
if (!appSource.includes("currentJourneyDirection: videoIdx === 0 ? '' : journeyDirectionFor(videoIdx, level)") ||
    !appSource.includes('Background from my outside story research')) {
  throw new Error('Video 1 must get Part 1 as background only, never as its direction.');
}
const firstVideoMessage = engine.buildUserMessage({level:2, video:1, onboardingLines:[], previousVideos:[], currentMode:'extended', currentAnswers:[{label:'Decision',value:'I am sharing my story.'}], currentJourneyDirection:'I will speak despite being afraid nobody cares.'});
if (!firstVideoMessage.includes('CURRENT VIDEO 1 JOURNEY DIRECTION') || !firstVideoMessage.includes('I will speak despite being afraid nobody cares.')) {
  throw new Error('Video 1 story direction was dropped by the prompt engine.');
}

// David, 2026-11-06: the map part shows above the "anything else" box on every video.
if (!html.includes('id="video-one-story-part"') || !appSource.includes("storyPart.innerHTML = direction") ||
    !appSource.includes('    ${journeyDirectionHTML}\n')) {
  throw new Error('Every video must show its map part above the anything-else box.');
}

// David, 2026-11-07: the AI shows a draft, says it needs one revision, then gives the final
// map. A pasted draft says so instead of failing silently.
const draftOnly = seven(n => `Draft of part ${n}: draft text ${n}.`);
if (map.parseImportedMap(draftOnly)) throw new Error('A pasted draft must not be read as the final map.');
if (!appSource.includes('This looks like the draft. Reply revise to your AI')) throw new Error('A pasted draft must say what to do.');

// The journey is designed before the story ideas, so the ideas are versions of one pursuit,
// and the return still brings something back (David, 2026-11-07).
for (const level of [1, 2]) {
  const guideText = map.buildHelperPrompt(level, '', '', noteQuestions);
  if (guideText.indexOf('FIRST, DESIGN ONE JOURNEY') === -1 || guideText.indexOf('FIRST, DESIGN ONE JOURNEY') > guideText.indexOf('Here are three things you could talk about')) {
    throw new Error(`The Level ${level} prompt must design the journey before offering story ideas.`);
  }
  if (!guideText.includes('something I can now give a person who is where I started')) throw new Error(`The Level ${level} return lost what it brings back.`);
  for (const [index, label] of ['The decision', 'The ordinary life', 'The first realization', 'The test', 'The fall', 'The larger truth', 'The return'].entries()) {
    if (!guideText.includes(`PART ${index + 1}: ${label.toUpperCase()}`)) throw new Error(`The Level ${level} prompt lost Part ${index + 1}.`);
    const partGuide = map.buildPartHelperPrompt(level, index, '', []);
    if (!partGuide.includes(`WHAT THIS PART MUST DO\n${label}:`)) throw new Error(`The Level ${level} helper for Part ${index + 1} lost its job.`);
  }
}

// Decisions the prompt must keep, each one David's:
// 2026-11-05: the AI keeps its leeway to infer and invent; no interview, at most two
// clarifying questions; search past the obvious milestones; no length cap on the paste.
// 2026-11-07: draft first, then one revision, and a pasted draft cannot be read as final.
// 2026-11-14: the AI is the storyteller. It speculates from what it knows about the person
// and writes the moments nobody would ever type, instead of the "I remember thinking" shortcut.
// 2026-11-13: one pursuit designed first; answers are scenes, not summaries; invent what
// is unknown; reach back years, not recent chats; leave the meaning out of the notes.
const longStory = 'word '.repeat(330).trim();
const longParts = map.parseImportedMap(seven(n => `${n}. ${longStory}`));
if (!longParts || longParts.some(part => part !== longStory)) throw new Error('The paste box cut a full-length story part.');
for (const level of [1, 2]) {
  const fullGuide = map.buildHelperPrompt(level, '', '', noteQuestions);
  for (const value of ['no more than 60', 'one or two', 'up to three', 'no limit on these questions', 'maximum of five', 'what part 4 starts', 'run in time order', 'start by asking', 'one short question per message', 'about eight questions', 'ask me for it', 'never invent', 'made up', 'only what is true', 'real event', 'do not invent']) {
    if (fullGuide.toLowerCase().includes(value)) throw new Error(`The Level ${level} prompt still says: ${value}`);
  }
  for (const value of ['Do not interview me', 'never more than two in all', 'You have creative freedom', 'You are a storyteller here, not a fact-checker', 'Do not look for permission in what I have told you', 'Watch for the shortcut', 'Take the bolder version', 'privately list at least 20 specific moments', 'Reach back years, not weeks', 'What I was after:', 'The belief that kept it out of reach:', 'Here are three things you could talk about. Which one feels right?', 'THEN WRITE NOTES, NOT A STORY', 'is a scene, not a summary', 'in quotation marks', 'Invent them.', 'I cannot add a story later', 'Leave out what it meant, what I learned', 'Keep my language patterns, vocabulary, rhythm, bluntness, humor, and emotional temperature', 'DRAFT FIRST, THEN ONE REVISION', 'Draft of part', 'Reply revise and I\'ll do one revision pass to make it stronger', 'The fall (Part 5):', 'an attempt to fix it that failed', 'Part 6 says the same thing as Part 3']) {
    if (!fullGuide.includes(value)) throw new Error(`The Level ${level} prompt lost: ${value}`);
  }
  const partGuide = map.buildPartHelperPrompt(level, 3, '', []);
  if (partGuide.includes('no more than 60') || !partGuide.includes('Do not ask me questions') || partGuide.includes('never invent') || !partGuide.includes('invent plausible details') || !partGuide.includes('usually 100 to 200 words')) throw new Error(`The Level ${level} part helper still asks for a summary.`);
}
// Without the app's questions (older callers), the prompt still works from the map questions.
if (!map.buildHelperPrompt(1, '', '').includes('PART 5: THE FALL\n1. ')) throw new Error('The prompt must still build when no question list is passed.');

if (!/id="journey-import-error" role="alert"/.test(appSource) || !appSource.includes('function journeyImportProblem(') || /field\.placeholder = 'Please paste all seven/.test(appSource)) {
  throw new Error('An unreadable paste must show a visible error, not only change the placeholder.');
}

console.log('Journey Map checks passed for both levels, single review, notes import and edit, legacy maps, self-guided and skipped routes, Video 1 ownership, existing-script warnings, and Settings.');
