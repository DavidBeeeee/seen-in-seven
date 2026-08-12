import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const W = 1280;
const H = 720;
const C = {
  ink: '#121212',
  paper: '#F7F5F0',
  white: '#FFFFFF',
  coral: '#F45B4F',
  teal: '#15847A',
  yellow: '#F2C94C',
  blue: '#246BCE',
  muted: '#686662',
  line: '#D9D5CC',
  soft: '#ECE8DF'
};

async function imageBytes(path) {
  const bytes = await fs.readFile(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function textbox(slide, text, x, y, width, height, style = {}) {
  const shape = slide.shapes.add({
    geometry: 'textbox',
    position: { left: x, top: y, width, height },
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 }
  });
  shape.text = text;
  shape.text.style = {
    fontFamily: 'Arial',
    fontSize: 28,
    color: C.ink,
    ...style
  };
  return shape;
}

function rect(slide, x, y, width, height, fill, radius = 0, line = 'none') {
  return slide.shapes.add({
    geometry: radius ? 'roundRect' : 'rect',
    position: { left: x, top: y, width, height },
    fill,
    line: { style: 'solid', fill: line, width: line === 'none' ? 0 : 1 },
    ...(radius ? { borderRadius: radius } : {})
  });
}

function baseSlide(deck, label, index, total, accent = C.coral) {
  const slide = deck.slides.add();
  slide.background.fill = C.paper;
  rect(slide, 0, 0, W, 10, accent);
  textbox(slide, label.toUpperCase(), 62, 36, 640, 24, {
    fontSize: 13,
    bold: true,
    color: C.muted
  });
  textbox(slide, `${index} / ${total}`, 1120, 36, 100, 24, {
    fontSize: 13,
    bold: true,
    color: C.muted,
    alignment: 'right'
  });
  return slide;
}

function title(slide, heading, subheading, accent = C.coral) {
  textbox(slide, heading, 62, 112, 1050, 168, {
    fontSize: 52,
    bold: true,
    color: C.ink
  });
  rect(slide, 62, 304, 92, 8, accent);
  textbox(slide, subheading, 62, 340, 950, 112, {
    fontSize: 24,
    color: C.muted
  });
}

function threeSteps(slide, items, y = 220) {
  const width = 350;
  items.forEach((item, i) => {
    const x = 62 + i * 392;
    textbox(slide, String(i + 1).padStart(2, '0'), x, y, 70, 36, {
      fontSize: 18,
      bold: true,
      color: item.color
    });
    textbox(slide, item.title, x, y + 56, width, 74, {
      fontSize: 29,
      bold: true
    });
    textbox(slide, item.body, x, y + 142, width, 130, {
      fontSize: 18,
      color: C.muted
    });
  });
}

async function addScreenshot(slide, path, alt, x, y, width, height) {
  slide.images.add({
    blob: await imageBytes(path),
    contentType: path.endsWith('.png') ? 'image/png' : 'image/jpeg',
    alt,
    fit: 'cover',
    position: { left: x, top: y, width, height },
    geometry: 'roundRect',
    borderRadius: 6
  });
}

async function makeKickoff() {
  const deck = Presentation.create({ slideSize: { width: W, height: H } });
  const total = 9;

  let s = baseSlide(deck, '777 Challenge', 1, total, C.coral);
  title(s, 'Seven videos. One story worth finishing.', 'Live Kickoff | September 7, 2026 | 11:00 AM Mountain Time', C.coral);
  textbox(s, 'Today we stop preparing to begin.', 62, 560, 930, 58, { fontSize: 30, bold: true, color: C.teal });

  s = baseSlide(deck, 'The room', 2, total, C.teal);
  textbox(s, 'This is not a performance test.', 62, 112, 1040, 90, { fontSize: 48, bold: true });
  threeSteps(s, [
    { title: 'Stay specific', body: 'A real moment beats a polished summary.', color: C.coral },
    { title: 'Stay unfinished', body: 'The story can still be happening while you tell it.', color: C.teal },
    { title: 'Keep moving', body: 'A posted chapter is more useful than a perfect draft.', color: C.blue }
  ]);

  s = baseSlide(deck, 'The seven days', 3, total, C.yellow);
  textbox(s, 'The arc we are building', 62, 92, 720, 70, { fontSize: 44, bold: true });
  const beats = ['Begin', 'Ordinary world', 'First realization', 'Road of trials', 'The fall', 'The elixir', 'Return home'];
  beats.forEach((beat, i) => {
    const x = 62 + i * 166;
    rect(s, x, 236, 124, 124, i === 4 ? C.coral : i === 6 ? C.teal : C.white, 6, C.line);
    textbox(s, String(i + 1), x + 12, 250, 28, 26, { fontSize: 14, bold: true, color: i === 4 || i === 6 ? C.white : C.muted });
    textbox(s, beat, x + 10, 290, 104, 62, { fontSize: 15, bold: true, color: i === 4 || i === 6 ? C.white : C.ink });
  });
  textbox(s, 'Each video carries one job. Together they create the journey.', 62, 430, 950, 60, { fontSize: 26, color: C.muted });

  s = baseSlide(deck, 'Community', 4, total, C.blue);
  title(s, 'Do the challenge beside people who are also doing it.', 'Join the community, post the imperfect chapter, and respond to the human being before you respond to the algorithm.', C.blue);
  textbox(s, 'The community link belongs in the live chat and follow-up email.', 62, 548, 960, 42, { fontSize: 17, color: C.muted });

  s = baseSlide(deck, 'SeenInSeven', 5, total, C.teal);
  textbox(s, 'Build the story. Keep your voice.', 62, 92, 660, 80, { fontSize: 44, bold: true });
  textbox(s, 'SeenInSeven turns rough answers into one connected seven-video journey without asking you to understand story architecture first.', 62, 196, 500, 150, { fontSize: 22, color: C.muted });
  await addScreenshot(s, join(ROOT, 'assets/seeninseven-preview.jpg'), 'SeenInSeven Studio interface', 628, 106, 590, 370);
  textbox(s, 'LIVE DEMO', 62, 488, 180, 28, { fontSize: 14, bold: true, color: C.coral });
  textbox(s, 'Overview → questions → script → lock', 62, 530, 620, 60, { fontSize: 31, bold: true });

  s = baseSlide(deck, 'Video 1', 6, total, C.coral);
  textbox(s, 'Why now?', 62, 104, 560, 72, { fontSize: 52, bold: true });
  threeSteps(s, [
    { title: 'What must be visible?', body: 'Name the knowledge, story, or experience you can no longer keep private.', color: C.coral },
    { title: 'Who needs it?', body: 'Picture one person who would recognize their own stalled chapter.', color: C.teal },
    { title: 'Why today?', body: 'Name what changed, closed, arrived, or became too expensive to postpone.', color: C.blue }
  ], 216);

  s = baseSlide(deck, 'Record', 7, total, C.yellow);
  textbox(s, 'The first recording is allowed to feel like the first recording.', 62, 104, 1060, 116, { fontSize: 45, bold: true });
  const recordItems = ['Read it once', 'Record one full take', 'Choose the take with life in it', 'Post before editing becomes hiding'];
  recordItems.forEach((item, i) => {
    const y = 282 + i * 72;
    rect(s, 62, y, 42, 42, i === 3 ? C.coral : C.ink, 6);
    textbox(s, String(i + 1), 76, y + 7, 20, 24, { fontSize: 15, bold: true, color: C.white, alignment: 'center' });
    textbox(s, item, 128, y + 2, 870, 42, { fontSize: 25, bold: i === 3 });
  });

  s = baseSlide(deck, 'Post', 8, total, C.blue);
  title(s, 'Publication completes Day 1.', 'Use a plain caption, include Video 1 of 7, and let the next chapter create the reason to return.', C.blue);
  textbox(s, 'Do not apologize for the rough edge that proves you actually began.', 62, 532, 1050, 62, { fontSize: 27, bold: true, color: C.coral });

  s = baseSlide(deck, 'Q&A', 9, total, C.teal);
  textbox(s, 'What is still between you and record?', 62, 118, 1050, 110, { fontSize: 50, bold: true });
  textbox(s, 'Ask the practical question. Name the emotional one too.', 62, 270, 900, 64, { fontSize: 28, color: C.muted });
  rect(s, 62, 430, 480, 96, C.teal, 6);
  textbox(s, 'Then make Video 1.', 94, 455, 400, 42, { fontSize: 31, bold: true, color: C.white });

  return deck;
}

async function makeGraduation() {
  const deck = Presentation.create({ slideSize: { width: W, height: H } });
  const total = 10;

  let s = baseSlide(deck, '777 Graduation', 1, total, C.teal);
  title(s, 'You brought the story home.', 'Graduation | September 15, 2026 | 11:00 AM Mountain Time', C.teal);
  textbox(s, 'Now the completed arc gets to change what happens next.', 62, 552, 1030, 58, { fontSize: 29, bold: true, color: C.coral });

  s = baseSlide(deck, 'Celebrate', 2, total, C.yellow);
  textbox(s, 'Seven public acts of becoming', 62, 104, 940, 82, { fontSize: 48, bold: true });
  threeSteps(s, [
    { title: 'You began', body: 'The first chapter broke the private stalemate.', color: C.coral },
    { title: 'You stayed', body: 'The middle carried doubt, resistance, and the fall.', color: C.blue },
    { title: 'You returned', body: 'The final chapter named what is true now without pretending the work is finished.', color: C.teal }
  ], 236);

  s = baseSlide(deck, 'The completed arc', 3, total, C.coral);
  textbox(s, 'One journey. Seven distinct jobs.', 62, 92, 900, 70, { fontSize: 44, bold: true });
  const beats2 = ['Commit', 'Belong', 'Question', 'Test', 'Fall', 'Discover', 'Return'];
  beats2.forEach((beat, i) => {
    const x = 62 + i * 166;
    rect(s, x, 230, 124, 124, i === 4 ? C.coral : i === 6 ? C.teal : C.white, 6, C.line);
    textbox(s, beat, x + 10, 270, 104, 52, { fontSize: 18, bold: true, alignment: 'center', color: i === 4 || i === 6 ? C.white : C.ink });
  });
  textbox(s, 'The final video did not erase the unresolved flaw. It made the speaker trustworthy enough to keep following.', 62, 430, 1080, 90, { fontSize: 27, color: C.muted });

  s = baseSlide(deck, 'The next problem', 4, total, C.blue);
  textbox(s, 'Visibility reveals the next bottleneck.', 62, 104, 1040, 82, { fontSize: 48, bold: true });
  threeSteps(s, [
    { title: 'What matters?', body: 'Choose the real decision instead of collecting more options.', color: C.blue },
    { title: 'How do I say it?', body: 'Shape a message without sanding away the point of view.', color: C.coral },
    { title: 'How does it finish?', body: 'Stay with implementation until the work exists outside your head.', color: C.teal }
  ], 230);

  s = baseSlide(deck, 'EEE', 5, total, C.teal);
  textbox(s, 'One Studio for the work after clarity.', 62, 88, 570, 112, { fontSize: 42, bold: true });
  await addScreenshot(s, join(ROOT, 'assets/eee/eee-home.png'), 'EEE Studio home', 700, 120, 460, 460);
  textbox(s, 'EEE keeps the message, decision, examples, advisors, and direct support in the same operating space.', 62, 214, 530, 150, { fontSize: 24, color: C.muted });
  textbox(s, 'Not another login. Not another library to finish.', 62, 438, 560, 60, { fontSize: 28, bold: true, color: C.coral });

  s = baseSlide(deck, 'The five parts', 6, total, C.yellow);
  textbox(s, 'Five different jobs. One shared identity.', 62, 82, 1000, 66, { fontSize: 42, bold: true });
  const five = [
    ['StorySculpt', 'Shape the message'],
    ['Navigator', 'Choose the next action'],
    ['Solution Vault', 'Learn from working examples'],
    ['AI Boardroom', 'Pressure-test the decision'],
    ['Certainty Sessions', 'Work directly with David']
  ];
  five.forEach((item, i) => {
    const y = 190 + i * 86;
    rect(s, 62, y, 8, 58, [C.coral, C.blue, C.yellow, C.teal, C.ink][i]);
    textbox(s, item[0], 92, y, 300, 35, { fontSize: 23, bold: true });
    textbox(s, item[1], 420, y + 2, 650, 34, { fontSize: 21, color: C.muted });
  });

  s = baseSlide(deck, 'Live demonstration', 7, total, C.blue);
  textbox(s, 'Watch one stuck project move.', 62, 90, 760, 72, { fontSize: 46, bold: true });
  threeSteps(s, [
    { title: 'Name the constraint', body: 'Navigator reduces the field to one action.', color: C.blue },
    { title: 'Shape the message', body: 'StorySculpt interviews for the raw material before it writes.', color: C.coral },
    { title: 'Finish the work', body: 'A Certainty Session stays with the actual obstacle.', color: C.teal }
  ], 228);

  s = baseSlide(deck, 'Founders', 8, total, C.coral);
  textbox(s, '$77 / month', 62, 118, 540, 100, { fontSize: 64, bold: true, color: C.coral });
  textbox(s, 'Founders invitation', 62, 240, 520, 54, { fontSize: 31, bold: true });
  textbox(s, 'Open September 15-19', 62, 308, 520, 44, { fontSize: 24, color: C.muted });
  rect(s, 700, 110, 470, 360, C.white, 6, C.line);
  textbox(s, 'Included', 738, 144, 370, 34, { fontSize: 20, bold: true, color: C.teal });
  textbox(s, 'StorySculpt\nNext Step Navigator\nSolution Vault\nAI Boardroom\nCertainty Sessions', 738, 202, 380, 230, { fontSize: 25, bold: true });
  textbox(s, 'The founders period repeats monthly until it is permanently retired. Standard membership then becomes $127/month.', 62, 500, 1080, 80, { fontSize: 22, color: C.muted });

  s = baseSlide(deck, 'The decision', 9, total, C.yellow);
  textbox(s, 'Join for movement, not more information.', 62, 108, 1060, 94, { fontSize: 48, bold: true });
  threeSteps(s, [
    { title: 'The work is real', body: 'There is a current project, message, decision, or obstacle.', color: C.coral },
    { title: 'Context matters', body: 'Generic advice keeps missing the actual starting point.', color: C.blue },
    { title: 'Finishing matters', body: 'The result must exist outside the conversation.', color: C.teal }
  ], 244);

  s = baseSlide(deck, 'Q&A', 10, total, C.teal);
  textbox(s, 'What does the next chapter need?', 62, 116, 1020, 100, { fontSize: 51, bold: true });
  textbox(s, 'Ask about the work, the membership, or the obstacle that appeared when the seven-video story ended.', 62, 262, 960, 88, { fontSize: 27, color: C.muted });
  rect(s, 62, 448, 580, 96, C.teal, 6);
  textbox(s, 'Founders closes September 19.', 92, 474, 520, 42, { fontSize: 29, bold: true, color: C.white });

  return deck;
}

async function exportDeck(deck, name) {
  const out = join(ROOT, 'launch', 'decks', name);
  await fs.mkdir(out, { recursive: true });
  for (const [index, slide] of deck.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, '0')}`;
    const png = await deck.export({ slide, format: 'png', scale: 1 });
    await fs.writeFile(`${out}/${stem}.png`, new Uint8Array(await png.arrayBuffer()));
    const layout = await slide.export({ format: 'layout' });
    await fs.writeFile(`${out}/${stem}.layout.json`, await layout.text());
  }
  const montage = await deck.export({ format: 'webp', montage: true, scale: 1 });
  await fs.writeFile(`${out}/montage.webp`, new Uint8Array(await montage.arrayBuffer()));
  const pptx = await PresentationFile.exportPptx(deck);
  await pptx.save(`${out}/${name}.pptx`);
}

await exportDeck(await makeKickoff(), '777-kickoff-september-2026');
await exportDeck(await makeGraduation(), '777-graduation-september-2026');
// ARCHIVED SEPTEMBER SOURCE: do not generate current event decks from this file.
// Build a new dated source after private validation meets both proof gates.
