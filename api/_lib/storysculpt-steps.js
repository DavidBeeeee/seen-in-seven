import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 2026-10-12: every format asks for a length, shows its draft and waits, then
// hooks, then open loops, then the assembled script. The Rant hook-escalation
// round (old R7) is gone; Bold and Mini no longer fold hooks into the draft.
export const STEP_LABELS = [
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
  'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7',
  'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8',
  'F1', 'F2'
];

export const MODE_STEPS = {
  bold: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'],
  mini: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'],
  rant: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'],
  fix: ['F1', 'F2']
};

export function extractBannedTerms(source) {
  const match = String(source || '').match(/<banned_script_terms>([\s\S]*?)<\/banned_script_terms>/);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

export function parseInstructions(content, bannedTermsList = []) {
  const formatIndex = content.search(/\n\/Bold:/);
  let globalText = content.slice(0, formatIndex !== -1 ? formatIndex : 1000).trim();
  const cmdIdx = globalText.search(/\nCommands to follow/i);
  if (cmdIdx !== -1) globalText = globalText.slice(0, cmdIdx).trim();

  if (bannedTermsList.length && globalText.includes('BANNED WORDS:')) {
    const bwIndex = globalText.indexOf('BANNED WORDS:');
    const lineEnd = globalText.indexOf('\n', bwIndex);
    const before = lineEnd !== -1 ? globalText.slice(0, lineEnd) : globalText;
    const after = lineEnd !== -1 ? globalText.slice(lineEnd) : '';
    globalText = before + '\n' + bannedTermsList.join('\n') + after;
  }

  const steps = {};
  for (let i = 0; i < STEP_LABELS.length; i++) {
    const label = STEP_LABELS[i];
    const startIndex = content.search(new RegExp(`(^|\\n)${label}[:\\s]`));
    if (startIndex === -1) {
      throw new Error('Missing step label in instructions.txt: ' + label);
    }
    const realStart = content[startIndex] === '\n' ? startIndex + 1 : startIndex;

    let nextBoundary = content.length;
    for (let j = i + 1; j < STEP_LABELS.length; j++) {
      const nextIdx = content.search(new RegExp(`\\n${STEP_LABELS[j]}[:\\s]`));
      if (nextIdx !== -1 && nextIdx > realStart && nextIdx < nextBoundary) {
        nextBoundary = nextIdx;
        break;
      }
    }
    const sectionMatches = content.slice(realStart, nextBoundary).match(/\n\/(?:Mini|Rant|Bold|fix)\b/);
    if (sectionMatches) {
      nextBoundary = realStart + sectionMatches.index;
    }
    steps[label] = content.slice(realStart, nextBoundary).trim();
  }

  return { globalText, steps };
}

// ── Turns (WBR-436 repair, 2026-10-08) ──────────────────────────────────────
//
// David's file marks its own turn boundaries with "STOP and WAIT" / "WAIT"
// lines, not with its step labels. B3 (draft) and B4.1-B4.2 (hooks) are one
// turn ("In the same response as the B3 draft... show the draft, then...
// generate 3 scroll-stopping hooks"), and B4.3-B4.4 is the next turn. The
// first engine sent one label per turn, so Bold and Mini split a single
// response across two turns. Each turn below is the file's own text between
// two wait markers, byte for byte, plus the format's own preface line.
const MODE_HEADERS = [
  { mode: 'bold', re: /^\/Bold:/m },
  { mode: 'mini', re: /^\/Mini:/m },
  { mode: 'rant', re: /^\/Rant:/m },
  { mode: 'fix', re: /^\/fix\s*$/m }
];
const WAIT_LINE = /^(?:STOP and WAIT|WAIT)\b.*$/;
const LABEL_LINE = /^([BMRF]\d+(?:\.\d+)?)\b/;

export function parseTurns(content) {
  const text = String(content || '');
  const firstFormat = text.search(/^\/Bold:/m);
  const positions = MODE_HEADERS
    .map(h => {
      const sub = text.slice(Math.max(firstFormat, 0));
      const idx = sub.search(h.re);
      return { mode: h.mode, index: idx === -1 ? -1 : idx + Math.max(firstFormat, 0) };
    })
    .filter(p => p.index !== -1)
    .sort((a, b) => a.index - b.index);
  const modes = {};
  positions.forEach((pos, i) => {
    const block = text.slice(pos.index, i + 1 < positions.length ? positions[i + 1].index : text.length).trim();
    const lines = block.split('\n');
    const firstLabel = lines.findIndex(line => LABEL_LINE.test(line.trim()));
    const preface = (firstLabel === -1 ? lines : lines.slice(0, firstLabel)).join('\n').trim();
    const body = firstLabel === -1 ? [] : lines.slice(firstLabel);
    const turns = [];
    let current = [];
    const flush = () => {
      const chunk = current.join('\n').trim();
      current = [];
      if (!chunk) return;
      const label = (chunk.split('\n').map(l => l.trim()).find(l => LABEL_LINE.test(l)) || '').match(LABEL_LINE);
      turns.push({ label: label ? label[1] : 'T' + (turns.length + 1), text: chunk });
    };
    for (const line of body) {
      current.push(line);
      if (WAIT_LINE.test(line.trim())) flush();
    }
    flush();
    modes[pos.mode] = { preface, turns };
  });
  return modes;
}

// Is the member asking to change what is on screen rather than moving on?
const REVISE = /\b(revise|rewrite|re-write|redo|regenerate|try again|another (?:option|version|set|round)|(?:three|3) more|more options|different (?:ones|options|hooks|versions)|change (?:this|that|it|the|some|a|my)|keep what works|make it (?:more|less|shorter|longer)|can you (?:change|make|fix|tweak|adjust|rework)|tweak|adjust|rework|fix (?:the|this|it))\b/i;

const PUNCH_UP = /(?:^|\s)\/fix\b|\bpunch (?:it |this )?up\b|\bmake it (?:better|pop|more viral|go viral)\b|\bimprove (?:it|this|the script)\b|\bmore viral\b|\bmaximi[sz]e virality\b/i;

export function isPunchUpRequest(text) {
  const note = String(text || '').replace(/^Please revise the script above\. Keep what works and change this:\s*/i, '');
  return PUNCH_UP.test(note);
}

export function isRevisionRequest(text) {
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (/^(?:option\s*)?#?\d\b/i.test(clean) && clean.length < 40) return false;
  return REVISE.test(clean);
}

function turnIndexFor(turns, label) {
  if (!label) return -1;
  const exact = turns.findIndex(t => t.label === label);
  if (exact !== -1) return exact;
  // Older projects stored one label per step (for example "B4"); map it to the
  // turn that contains that label's text.
  return turns.findIndex(t => new RegExp(`(^|\\n)${label.replace('.', '\\.')}[.:\\s]`).test(t.text));
}

export function resolveStep({ mode, intent, messages = [], currentStep = null, turns = null }) {
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMsg = (userMessages.length ? userMessages[userMessages.length - 1].content : '').trim();
  // A revision note is carried out as written (F2). Only an explicit ask to
  // punch up or improve the script runs the ten-ways virality pass (F1).
  // Until 2026-10-12 every note went to F1, whose job is to keep the hook and
  // open loop, so notes like "lead with ..." were quietly ignored.
  if (intent === 'refine') return isPunchUpRequest(lastUserMsg) ? 'F1' : 'F2';
  if (/^\s*\/fix\b/i.test(lastUserMsg)) return 'F1';

  const sequence = turns
    ? turns.map(t => t.label)
    : (MODE_STEPS[mode] || MODE_STEPS.rant);
  const hookTurn = { rant: 'R6', bold: 'B5', mini: 'M5' }[mode];
  if (/skip to (?:the )?hooks?/i.test(lastUserMsg) && hookTurn) return hookTurn;

  const currentIdx = turns ? turnIndexFor(turns, currentStep) : sequence.indexOf(currentStep);
  if (currentIdx !== -1) {
    if (isRevisionRequest(lastUserMsg)) return sequence[currentIdx];
    return sequence[Math.min(currentIdx + 1, sequence.length - 1)];
  }

  // No stored position (older projects, or a save that lost it): the browser
  // shows the first turn's question itself, so each assistant reply already in
  // the thread is one turn done.
  const assistantCount = messages.filter(m => m.role === 'assistant').length;
  const targetIdx = Math.min(Math.max(assistantCount, 0), sequence.length - 1);
  if (assistantCount > 0 && isRevisionRequest(lastUserMsg)) return sequence[Math.max(targetIdx - 1, 0)];
  return sequence[targetIdx];
}

export function getReferenceDocsForStep(stepLabel, stepText, knowledgeMap = {}) {
  const docs = [];
  const add = name => {
    if (knowledgeMap[name] && !docs.includes(knowledgeMap[name])) {
      docs.push(knowledgeMap[name]);
    }
  };

  if (stepLabel === 'R6' || stepLabel === 'R7') {
    add('Hooks and CTA Scripts for 2026.txt');
  }

  if (stepText.includes('Hooks and CTA Scripts for 2026')) {
    add('Hooks and CTA Scripts for 2026.txt');
  }
  if (stepText.includes('_mini example script')) {
    add('_mini example script.txt');
  }
  if (stepText.includes('60 Second Perfect Framework') || stepText.includes('mini-webinar framework')) {
    add('60 Second Perfect Framework for Video Shorts.txt');
  }
  if (stepText.includes("Example Scripts for the 5 E's") || stepText.includes("5 E's Framework")) {
    add("Example Scripts for the 5 E's.txt");
  }
  if (stepText.includes('Tiktok Hooks')) {
    add('Tiktok Hooks.txt');
  }
  if (stepText.includes('Hook, Engage, and Influence')) {
    add('Hook, Engage, and Influence - Your Essential Video Short Guide.txt');
  }
  if (stepText.includes('Writing Examples For David Bee')) {
    add('Writing Examples For David Bee.txt');
  }

  return docs.join('\n\n');
}

export const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', "aren't", 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', "can't", 'cannot', 'could', "couldn't",
  'did', "didn't", 'do', 'does', "doesn't", 'doing', "don't", 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', "hadn't", 'has', "hasn't", 'have', "haven't", 'having', 'he', "he'd", "he'll", "he's", 'her', 'here', "here's", 'hers', 'herself', 'him', 'himself', 'his', 'how', "how's",
  'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', "isn't", 'it', "it's", 'its', 'itself', "let's", 'me', 'more', 'most', "mustn't", 'my', 'myself',
  'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', "shan't", 'she', "she'd", "she'll", "she's", 'should', "shouldn't", 'so', 'some', 'such', 'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', "there's", 'these', 'they', "they'd", "they'll", "they're", "they've", 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', "wasn't", 'we', "we'd", "we'll", "we're", "we've", 'were', "weren't", 'what', "what's", 'when', "when's", 'where', "where's", 'which', 'while', 'who', "who's", 'whom', 'why', "why's", 'with', "won't", 'would', "wouldn't",
  'you', "you'd", "you'll", "you're", "you've", 'your', 'yours', 'yourself', 'yourselves'
]);

export function stem(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return w;
  if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ies')) w = w.slice(0, -2);
  else if (w.endsWith('ss')) {}
  else if (w.endsWith('ing')) {
    let base = w.slice(0, -3);
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) base = base.slice(0, -1);
    w = base;
  } else if (w.endsWith('ed')) {
    let base = w.slice(0, -2);
    if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) base = base.slice(0, -1);
    w = base;
  } else if (w.endsWith('es')) {
    w = w.slice(0, -2);
  } else if (w.endsWith('s') && !w.endsWith('ss')) {
    w = w.slice(0, -1);
  }
  if (w.endsWith('tion') || w.endsWith('sion')) w = w.slice(0, -3);
  else if (w.endsWith('ment')) w = w.slice(0, -4);
  else if (w.endsWith('ness')) w = w.slice(0, -4);
  else if (w.endsWith('ly')) w = w.slice(0, -2);
  return w;
}

export function extractStems(text) {
  const words = text.toLowerCase().replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  const stems = new Set();
  for (const word of words) {
    if (!STOPWORDS.has(word)) {
      stems.add(stem(word));
    }
  }
  return stems;
}

const OPTION_START = /^(?:\d+\s*[.):-]|[-*\u2022]\s|option\s*\d+\s*[:.)-]?|level\s+(?:one|two|three|\d+)\s*[:.)-]?|hook\s*\d+\s*[:.)-]?)\s*/i;

function normaliseOptionLine(line) {
  return String(line || '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^[>"\u201c\u2018']+/, '')
    .trim();
}

export function extractOptions(text) {
  const lines = String(text || '').split('\n').map(normaliseOptionLine).filter(Boolean);
  const options = [];
  let currentOption = '';
  for (const line of lines) {
    if (OPTION_START.test(line)) {
      if (currentOption) options.push(currentOption);
      currentOption = line;
    } else if (currentOption && !/[?]\s*$/.test(line)) {
      currentOption += ' ' + line;
    } else if (currentOption) {
      options.push(currentOption);
      currentOption = '';
    }
  }
  if (currentOption) options.push(currentOption);
  // The spoken option, without its "1." / "Level One:" marker.
  return options.map(option => option.replace(OPTION_START, '').replace(OPTION_START, '').replace(/^["\u201c]|["\u201d]$/g, '').trim()).filter(Boolean);
}

export function checkBannedTerms(text, bannedTerms = []) {
  const clean = text.toLowerCase();
  for (const term of bannedTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
    if (re.test(clean)) {
      return { ok: false, issue: `banned-term: "${term}"` };
    }
  }
  return { ok: true };
}

// Everyday words that carry no evidence. R6: "Treat the member's raw text as the
// Evidence and the hook as the Verdict. If a hook contains words from the
// evidence, you have failed." The evidence is the raw text the member typed at
// R1, not every reply in the chat ("go for the hook" is not evidence), and the
// words that matter are the distinctive ones: "montage", "clone", "rejection",
// not "good" or "people".
const COMMON = new Set([
  'just', 'like', 'really', 'thing', 'things', 'want', 'need', 'know', 'think', 'make', 'made', 'good', 'well', 'even',
  'still', 'much', 'many', 'every', 'thing', 'people', 'time', 'times', 'work', 'will', 'also', 'back', 'want', 'going',
  'gonna', 'yeah', 'okay', 'something', 'anything', 'everything', 'nothing', 'someone', 'everyone', 'anyone', 'way',
  'ways', 'same', 'different', 'most', 'more', 'less', 'right', 'part', 'kind', 'sort', 'stuff', 'into', 'than',
  'then', 'when', 'what', 'with', 'without', 'from', 'that', 'this', 'they', 'them', 'there', 'their', 'have', 'been',
  'being', 'doing', 'does', 'done', 'said', 'says', 'tell', 'telling', 'get', 'gets', 'getting', 'got', 'take', 'come',
  'look', 'feel', 'feels', 'felt', 'year', 'years', 'day', 'days', 'life', 'real', 'actually', 'probably', 'maybe'
].map(stem));

export function evidenceText(memberMessages = []) {
  const first = memberMessages.find(m => m.role === 'user');
  return first ? String(first.content || '') : '';
}

export function evidenceWords(memberMessages = []) {
  const words = evidenceText(memberMessages).toLowerCase().replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Map();
  for (const word of words) {
    const clean = word.replace(/[^a-z]/g, '');
    if (clean.length < 4 || STOPWORDS.has(word)) continue;
    const st = stem(clean);
    if (st.length < 3 || COMMON.has(st)) continue;
    if (!out.has(st)) out.set(st, clean);
  }
  return out;
}

export function hookEvidenceViolations(hookOptions, memberMessages = []) {
  const evidence = evidenceWords(memberMessages);
  return hookOptions.map(opt => {
    const hits = [];
    for (const word of String(opt).toLowerCase().replace(/[^\w\s'-]/g, ' ').split(/\s+/)) {
      const st = stem(word.replace(/[^a-z]/g, ''));
      if (evidence.has(st) && !hits.includes(evidence.get(st))) hits.push(evidence.get(st));
    }
    return hits;
  });
}

export function checkHookEvidence(hookOptions, memberMessages = []) {
  const violations = hookEvidenceViolations(hookOptions, memberMessages);
  const index = violations.findIndex(v => v.length);
  if (index === -1) return { ok: true };
  return { ok: false, issue: `hook-contains-evidence-stem: "${violations[index][0]}"`, words: [...new Set(violations.flat())], badOptions: violations.filter(v => v.length).length };
}

export function checkR7Shape(text) {
  const options = extractOptions(text);
  const hasThree = options.length === 3 || /\blevel\s+(?:one|1)\b/i.test(text) && /\blevel\s+(?:two|2)\b/i.test(text) && /\blevel\s+(?:three|3)\b/i.test(text);
  if (!hasThree) {
    return { ok: false, issue: 'r7-shape: must have exactly 3 escalating intensity level options' };
  }
  return { ok: true };
}

export function checkThreeOptions(text) {
  const options = extractOptions(text);
  if (options.length < 3) {
    return { ok: false, issue: 'three-options: step requires at least 3 options' };
  }
  return { ok: true };
}

export function checkGenericYou(scriptText) {
  let body = scriptText.replace(/^Title:?[^\n]*\n+/i, '').trim();
  const sentences = body.split(/(?<=[.?!])\s+/);
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i].trim();
    if (!s) continue;
    if (s.endsWith('?')) continue;
    if (i >= sentences.length - 2 && /\b(?:follow|comment|join|dm|share|let me know|if you)\b/i.test(s)) continue;
    if (/\b(?:you\s+(?:can|could|have\s+to|must|need\s+to|will|would|never|always|know|see|think|feel|experience|go\s+through)|a\s+scene\s+you|makes?\s+you|gives?\s+you)\b/i.test(s)) {
      return { ok: false, issue: 'generic-you: "' + s + '"' };
    }
  }
  return { ok: true };
}

// What a turn's own text asks for, read from the file rather than a label list,
// so an edit to instructions.txt moves the checks with it.
export function turnKind(stepLabel, turnText = '') {
  const t = String(turnText);
  return {
    hooks: /\bhooks?\b/i.test(t) && /\b(generate|rewrite|write)\b/i.test(t) && !/open loop sentences/i.test(t) && !/Script Draft/i.test(t),
    evidenceRule: /words from the evidence/i.test(t),
    escalation: /increasingly extreme/i.test(t),
    threeOptions: /\b(?:3|three)\b[^\n]*(?:hooks|open loop|directions|angles|options|lessons)/i.test(t) || /increasingly extreme/i.test(t),
    final: /^[BMR]\d+:\s*Output the full script/m.test(t) || /^F\d$/.test(stepLabel || ''),
    draft: /Script Draft/i.test(t),
    question: /\bask\b/i.test(t) && !/\b(draft|generate|rewrite|output|identify 3)\b/i.test(t)
  };
}

// Backstop for THE ALLY RULE, not the fix itself: the fix is that drafts are
// built from the member's input already re-aimed (see reaimMemberInput in
// api/storysculpt.js). This only catches the plain accusations that slipped
// through, e.g. 2026-10-08: "if you are about to comment that clones are the
// future, you are probably the exact person the clone tool creators are
// cashing in on". Questions are left alone.
const VIEWER_ATTACKS = [
  /\bif you(?:'re| are) about to (?:comment|say|tell me|argue|type)\b/i,
  /\byou(?:'re| are) (?:probably|just|not (?:an?|the|really)\b|the exact|lazy|hiding|scared|afraid|lying|wrong|the problem|part of the problem|delusional|kidding yourself|still pretending|making excuses)/i,
  /\byour (?:product|message|messaging|offer|content|work|business|idea|excuses?) (?:is|are) (?:weak|bad|broken|garbage|trash|the problem|not (?:good|ready|working))/i,
  /\byour (?:product|message|messaging|offer|content|work|business|idea) (?:sucks|isn't|aren't)\b/i,
  /\bwhat(?:'s| is) wrong with you\b/i,
  /\bstop (?:lying to yourself|making excuses|hiding behind)\b/i
];

export function checkViewerAttack(text) {
  const body = String(text || '').replace(/^(?:FINAL SCRIPT|NEXT QUESTION):\s*/i, '');
  const sentences = body.split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s || s.endsWith('?')) continue;
    if (VIEWER_ATTACKS.some(re => re.test(s))) return { ok: false, issue: 'viewer-attack: "' + s.slice(0, 160) + '"' };
  }
  return { ok: true };
}

export function checkDeterministic({ content, stepLabel, turnText = '', memberMessages = [], bannedTerms = [], mode = '', memberText = '' }) {
  const kind = turnKind(stepLabel, turnText);
  const isFinal = /^FINAL SCRIPT:/i.test(content) || kind.final;
  const fidelity = checkFidelity({ content, stepLabel, kind, isFinal, memberMessages, mode, memberText });
  if (!fidelity.ok) return fidelity;
  if (isFinal || kind.hooks || kind.threeOptions) {
    const bannedCheck = checkBannedTerms(content, bannedTerms);
    if (!bannedCheck.ok) return bannedCheck;
  }

  if (kind.threeOptions && !isFinal) {
    const options = extractOptions(content);
    if (options.length < 3) return { ok: false, issue: 'three-options: step requires 3 options, found ' + options.length };
    if (kind.evidenceRule || kind.escalation) {
      const evidenceCheck = checkHookEvidence(options.slice(-3), memberMessages);
      if (!evidenceCheck.ok) return evidenceCheck;
    }
  }

  if (isFinal || kind.draft || kind.threeOptions) {
    const allyCheck = checkViewerAttack(content);
    if (!allyCheck.ok) return allyCheck;
  }

  return { ok: true };
}

// ── Script fidelity (2026-10-12) ───────────────────────────────────────────
//
// From David's own chats that day: he asked for 75 seconds and got 342, 491
// and 451 words; he listed five series and the script said "three series";
// "the algorithm" appeared twice though he never said it; the final stitched
// the hook onto a draft that already opened with the same line, so "I'm going
// to die one day" was said twice; and his chosen hook came back reworded.
// These checks run on drafts and finished scripts and feed the same retry
// loop as every other check, each failure naming exactly what to fix.

// David's rule in the instructions: 300 words is about 100 seconds.
export const WORDS_PER_SECOND = 3;
export const DEFAULT_SCRIPT_WORDS = 250;
const LENGTH_TOLERANCE = 0.15;

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100
};

const REFINE_PREFIX = /^Please revise the script above\. Keep what works and change this:\s*/i;

// The member's chosen length in seconds, from a short answer like "75 seconds",
// "90s", "2 minutes" or "a minute". The last such answer wins.
export function chosenSeconds(memberMessages = []) {
  let seconds = null;
  for (const message of memberMessages) {
    if (message.role !== 'user') continue;
    const text = String(message.content || '').trim().toLowerCase();
    if (!text || text.length > 60 || REFINE_PREFIX.test(text)) continue;
    const digits = text.match(/(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?)\b/);
    if (digits) {
      const n = parseFloat(digits[1]);
      seconds = /^m/.test(digits[2]) ? n * 60 : n;
      continue;
    }
    const spelled = text.match(/\b(half a|a|one|two|three|four|five)\s+minutes?\b/);
    if (spelled) seconds = { 'half a': 30, a: 60, one: 60, two: 120, three: 180, four: 240, five: 300 }[spelled[1]];
  }
  return seconds;
}

export function targetWords(memberMessages = []) {
  const seconds = chosenSeconds(memberMessages);
  return { seconds, words: seconds ? Math.round(seconds * WORDS_PER_SECOND) : DEFAULT_SCRIPT_WORDS };
}

// Pulls a title off the first line of a finished script, so the teleprompter
// text is the script alone. "Title: X", "TITLE: X", or a short line with no
// closing punctuation followed by the script.
export function splitTitle(text) {
  const clean = String(text || '').replace(/^(?:FINAL SCRIPT|NEXT QUESTION):\s*/i, '').trim();
  const lines = clean.split('\n');
  const first = (lines[0] || '').trim();
  const rest = lines.slice(1).join('\n').trim();
  const titled = /^\**\s*title\s*:/i.test(first);
  const bare = first.replace(/^\**\s*title\s*:\s*/i, '').replace(/\*\*/g, '').replace(/^["\u201c']+|["\u201d']+$/g, '').trim();
  if (rest && bare && (titled || (bare.split(/\s+/).length <= 12 && !/[.!?,]$/.test(bare)))) return { title: bare, body: rest };
  return { title: '', body: clean };
}

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

// The script inside a reply: for a finished script, everything after the
// title; for a draft shown with its question, the substantial paragraphs.
export function scriptBody(content, isFinal) {
  if (isFinal) return splitTitle(content).body;
  const clean = String(content || '').replace(/^(?:FINAL SCRIPT|NEXT QUESTION):\s*/i, '');
  return clean.split(/\n\s*\n/).filter(p => countWords(p) >= 40).join('\n\n');
}

// Items the member numbered ("1) Lessons... 2) Apparently, I'm 40..."), from
// any of their own messages except revision notes. A run must start at 1.
export function memberListItems(memberMessages = []) {
  const items = [];
  for (const message of memberMessages) {
    if (message.role !== 'user') continue;
    const text = String(message.content || '');
    if (REFINE_PREFIX.test(text)) continue;
    const marks = [...text.matchAll(/(?:^|\s)(\d{1,2})\s*[.)]\s+(?=\S)/g)];
    const run = [];
    let expect = 1;
    for (const mark of marks) {
      if (Number(mark[1]) === expect) { run.push(mark); expect++; }
    }
    if (run.length < 2) continue;
    run.forEach((mark, i) => {
      const start = mark.index + mark[0].length;
      const end = i + 1 < run.length ? run[i + 1].index : text.length;
      const item = text.slice(start, end).split('\n')[0].trim();
      if (item) items.push(item);
    });
  }
  return items;
}

function itemKeys(item) {
  const keys = new Set();
  for (const word of item.toLowerCase().replace(/[^\w\s'-]/g, ' ').split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(word)) { keys.add(word); continue; }
    const clean = word.replace(/[^a-z]/g, '');
    if (clean.length < 4 || STOPWORDS.has(word)) continue;
    const st = stem(clean);
    if (st.length >= 3 && !COMMON.has(st)) keys.add(st);
  }
  return keys;
}

function scriptKeys(text) {
  const keys = new Set(extractStems(text));
  for (const word of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (/^\d+$/.test(word)) keys.add(word);
    if (NUMBER_WORDS[word]) keys.add(String(NUMBER_WORDS[word]));
  }
  return keys;
}

// Topics the model has added on its own in real chats. Flagged only when the
// member never used the word themselves.
export const INVENTED_TOPIC_WATCH = ['algorithm', 'content calendar', 'engagement rate', 'analytics', 'funnel'];

function normWords(text) {
  return String(text || '').toLowerCase()
    .replace(/[\u2019\u2018]/g, "'")
    .replace(/\b(i|you|we|they|he|she|it|that|there|what)'(m|re|s|ve|ll|d)\b/g, (m, a, b) => a + ' ' + ({ m: 'am', re: 'are', s: 'is', ve: 'have', ll: 'will', d: 'would' })[b])
    .replace(/n't\b/g, ' not')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
}

// The hook and open loop the member picked, read from the thread: an assistant
// turn with numbered options followed by a short "1" / "option 2" / "Use 3".
export function chosenOptions(messages = []) {
  const out = { hook: '', openLoop: '' };
  for (let i = 0; i < messages.length - 1; i++) {
    const message = messages[i];
    const next = messages[i + 1];
    if (message.role !== 'assistant' || next.role !== 'user') continue;
    const reply = String(next.content || '').trim();
    const pick = reply.length <= 40 && reply.match(/^(?:option\s*|use\s*|#)?([1-3])\b/i);
    if (!pick) continue;
    const content = String(message.content || '');
    const line = content.match(new RegExp('(?:^|\\n)\\s*\\**' + pick[1] + '\\s*[.):]\\**\\s*(.+)'));
    if (!line) continue;
    const text = line[1].replace(/\*\*/g, '').replace(/^["\u201c]|["\u201d]$/g, '').trim();
    if (/open loop/i.test(content)) out.openLoop = text;
    else if (/\bhooks?\b/i.test(content)) out.hook = text;
  }
  // An open loop that restates the hook would make the assembled script say
  // the hook twice; keep only the new part.
  if (out.hook && out.openLoop) {
    const hookNorm = normWords(out.hook).join(' ');
    const loopWords = normWords(out.openLoop);
    if (loopWords.join(' ').startsWith(hookNorm) && loopWords.length > normWords(out.hook).length) {
      const index = out.openLoop.toLowerCase().indexOf(out.hook.toLowerCase().replace(/[.!?]+$/, ''));
      if (index === 0) out.openLoop = out.openLoop.slice(out.hook.replace(/[.!?]+$/, '').length).replace(/^[\s,;:.!?-]+/, '').trim();
    }
  }
  return out;
}

function coverage(needle, haystackWords) {
  const words = normWords(needle);
  if (!words.length) return 1;
  const pool = haystackWords.slice();
  let found = 0;
  for (const word of words) {
    const at = pool.indexOf(word);
    if (at !== -1) { found++; pool.splice(at, 1); }
  }
  return found / words.length;
}

// Any six-word run said twice (contractions expanded, so "I'm going to die one
// day" and "I am going to die one day" match).
export function repeatedRun(text, size = 6) {
  const words = normWords(text);
  const seen = new Map();
  for (let i = 0; i + size <= words.length; i++) {
    const run = words.slice(i, i + size).join(' ');
    if (seen.has(run) && i - seen.get(run) >= size) return run;
    if (!seen.has(run)) seen.set(run, i);
  }
  return '';
}

export function checkFidelity({ content, stepLabel, kind, isFinal, memberMessages = [], mode = '', memberText = '' }) {
  const isRevision = /^F\d$/.test(stepLabel || '');
  if (!isFinal && !kind.draft) return { ok: true };
  const body = scriptBody(content, isFinal);
  if (!body) return { ok: true };
  const userMessages = memberMessages.filter(m => m.role === 'user');
  const lastNote = isRevision ? String((userMessages[userMessages.length - 1] || {}).content || '').replace(REFINE_PREFIX, '') : '';

  // Length, unless a revision note is itself about length.
  if (!/\b(short|shorter|long|longer|length|second|seconds|minute|minutes|word|words|trim|cut|expand)\b/i.test(lastNote)) {
    const { seconds, words: target } = targetWords(memberMessages);
    const words = countWords(body);
    const low = Math.round(target * (1 - LENGTH_TOLERANCE));
    const high = Math.round(target * (1 + LENGTH_TOLERANCE));
    if (words < low || words > high) {
      const change = words > high ? `Cut about ${words - target} words` : `Add about ${target - words} words`;
      return {
        ok: false,
        issue: `length: the script is ${words} words; ${seconds ? 'the member chose ' + seconds + ' seconds, which is' : 'the format calls for'} about ${target} words. ${change}, so it lands between ${low} and ${high} words (about ${Math.round(target / 15)} sentences)`,
        words,
        target
      };
    }
  }

  // Every item the member listed (Rant and Mini; Bold narrows to one angle).
  if (mode !== 'bold' && !/\b(remove|drop|cut|delete|without|only)\b/i.test(lastNote)) {
    const keys = scriptKeys(body);
    const missing = memberListItems(memberMessages).filter(item => {
      const itemKeySet = itemKeys(item);
      return itemKeySet.size && ![...itemKeySet].some(key => keys.has(key));
    });
    if (missing.length) {
      return { ok: false, issue: `missing-item: the member listed ${missing.length === 1 ? 'an item' : 'items'} the script leaves out: ${missing.map(m => '"' + m + '"').join(', ')}. Include every item the member listed` };
    }
  }

  // Topics the member never raised.
  const source = (memberText || userMessages.map(m => m.content).join('\n')).toLowerCase();
  for (const term of INVENTED_TOPIC_WATCH) {
    const re = new RegExp('\\b' + term + 's?\\b', 'i');
    if (re.test(body) && !re.test(source)) {
      return { ok: false, issue: `invented-topic: the script mentions "${term}", which the member never said. Remove it and use only the member's own topics` };
    }
  }

  // Assembly of the finished script: the chosen hook first, word for word,
  // then the chosen open loop, and nothing said twice.
  if (isFinal && !isRevision) {
    const chosen = chosenOptions(memberMessages);
    const words = normWords(body);
    const hookLen = normWords(chosen.hook).length;
    const loopLen = normWords(chosen.openLoop).length;
    if (chosen.hook && coverage(chosen.hook, words.slice(0, hookLen + 12)) < 0.8) {
      return { ok: false, issue: `hook-not-used: the script must open with the member's chosen hook, word for word: "${chosen.hook}"` };
    }
    if (chosen.openLoop && coverage(chosen.openLoop, words.slice(0, hookLen + loopLen + 25)) < 0.8) {
      return { ok: false, issue: `open-loop-not-used: right after the hook, the script must use the member's chosen open loop, word for word: "${chosen.openLoop}"` };
    }
  }
  const repeated = repeatedRun(body);
  if (repeated) {
    return { ok: false, issue: `repeated-line: the script says "${repeated}" more than once. Say it once and rewrite the other place` };
  }
  return { ok: true };
}

// Last resort after the retries. A step that asks the member to choose must
// never arrive without the choices: show the best attempt rather than a bare
// question (2026-10-08 17:47: "which of these 3 hooks" with no hooks).
export function stepFallbackMessage(stepLabel, stepText, rawDraft = null) {
  const cleanDraft = String(rawDraft || '').replace(/^(FINAL SCRIPT:|NEXT QUESTION:)\s*/i, '').trim();
  if (cleanDraft) return `NEXT QUESTION: ${cleanDraft}`;
  const askMatch = String(stepText).match(/Ask:?\s*"([^"]+)"/i);
  const question = askMatch ? askMatch[1].trim() : 'Could you say a little more so I can take the next step?';
  return `NEXT QUESTION: ${question}`;
}

export const CRISIS_PATTERNS = [
  { id: 'kill_myself', category: 'suicide', re: /\b(kill|killing|off)\s+(my\s*self|myself)\b/ },
  { id: 'suicide_word', category: 'suicide', re: /\b(suicid(e|al)|end it all|take my (own )?life|end my (own )?life|ending my life)\b/ },
  // "Going to die" is not here on purpose (2026-10-12): "I realized I'm going
  // to die one day" is how people talk about mortality and urgency, and it
  // paused David's own script. Wanting or planning to die still trips.
  { id: 'want_to_die', category: 'suicide', re: /\b(i\s+)?(want|wanna|wish(ed)?|plan(ning)?)\s+(to\s+)?(die|be dead)\b/ },
  { id: 'not_be_here', category: 'suicide', re: /\b(don'?t|do not)\s+want\s+to\s+(be here|be alive|live|wake up)( anymore| any more)?\b/ },
  { id: 'better_off', category: 'suicide', re: /\b(better off (dead|without me)|no (reason|point) (to|in) (live|living|being alive|going on))\b/ },
  { id: 'cant_go_on', category: 'suicide', re: /\b(can'?t|cannot)\s+(go on|keep going|do this)\s+(anymore|any more)\b.*\b(life|living|alive|die|myself)\b/ },
  { id: 'self_harm', category: 'self_harm', re: /\b(self[-\s]?harm(ing)?|hurt(ing)? myself|cut(ting)? myself|harm(ing)? myself|overdos(e|ing))\b/ },
  { id: 'harm_others', category: 'harm_intent', re: /\b(going to|gonna|want to|plan(ning)? to)\s+(kill|hurt|shoot|stab)\s+(him|her|them|someone|somebody|my (wife|husband|partner|kids?|family|boss))\b/ },
];

export const CRISIS_IDIOMS = [
  /\bkilling it\b/g,
  /\b(this|it|that|work|the launch|the business)\s+is\s+killing\s+me\b/g,
  /\bdying to\b/g,
  /\bdead in the water\b/g,
  /\bkill (the|this|that) (offer|idea|launch|project|plan|funnel)\b/g,
  /\bcould kill for\b/g,
];

export function detectCrisis(text) {
  let clean = String(text || '').toLowerCase().replace(/[\u2019\u2018]/g, "'");
  for (const idiom of CRISIS_IDIOMS) clean = clean.replace(idiom, ' ');
  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.re.test(clean)) return { tripped: true, category: pattern.category, patternId: pattern.id };
  }
  return { tripped: false };
}

export function crisisResponse(name) {
  const who = name && name.trim() ? `${name.trim()}, ` : '';
  return [
    `${who}I'm going to pause StorySculpt here, because what you just wrote matters more than any script we could make today.`,
    '',
    "If you are thinking about ending your life or hurting yourself, please talk to a real person right now. You don't have to have the right words.",
    '',
    '- **US and Canada:** call or text **988** (Suicide and Crisis Lifeline)',
    '- **UK and Ireland:** call **116 123** (Samaritans)',
    '- **Australia:** call **13 11 14** (Lifeline)',
    '- **Anywhere else:** findahelpline.com lists free, confidential lines in your country',
    '- **If you are in immediate danger:** call your local emergency number',
    '',
    "StorySculpt is an AI writing tool. It can help with content, but it can't be there for you the way a real person can. Please reach out to someone you trust, too.",
    '',
    "When you're ready, StorySculpt will still be here, and so will everything you've written in it."
  ].join('\n');
}
