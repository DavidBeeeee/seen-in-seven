import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STEP_LABELS = [
  'B1', 'B2', 'B3', 'B4', 'B5',
  'M1', 'M2', 'M3', 'M4', 'M5',
  'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9',
  'F1'
];

export const MODE_STEPS = {
  bold: ['B1', 'B2', 'B3', 'B4', 'B5'],
  mini: ['M1', 'M2', 'M3', 'M4', 'M5'],
  rant: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9'],
  fix: ['F1']
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
  if (intent === 'refine') return 'F1';

  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMsg = (userMessages.length ? userMessages[userMessages.length - 1].content : '').trim();
  if (/^\s*\/fix\b/i.test(lastUserMsg)) return 'F1';

  const sequence = turns
    ? turns.map(t => t.label)
    : (MODE_STEPS[mode] || MODE_STEPS.rant);
  const hookTurn = { rant: 'R6', bold: turns ? 'B3' : 'B4', mini: turns ? 'M3' : 'M4' }[mode];
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
    hooks: /\bhooks?\b/i.test(t) && /\b(generate|rewrite)\b/i.test(t) && !/open loop sentences/i.test(t),
    evidenceRule: /words from the evidence/i.test(t),
    escalation: /increasingly extreme/i.test(t),
    threeOptions: /\b(?:3|three)\b[^\n]*(?:hooks|open loop|directions|angles|options|lessons)/i.test(t) || /increasingly extreme/i.test(t),
    final: /^[BMR]\d+:\s*Output the full script/m.test(t) || stepLabel === 'F1',
    question: /\bask\b/i.test(t) && !/\b(draft|generate|rewrite|output|identify 3)\b/i.test(t)
  };
}

export function checkDeterministic({ content, stepLabel, turnText = '', memberMessages = [], bannedTerms = [] }) {
  const kind = turnKind(stepLabel, turnText);
  const isFinal = /^FINAL SCRIPT:/i.test(content) || kind.final;
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

  if (isFinal) {
    const genericYouCheck = checkGenericYou(content);
    if (!genericYouCheck.ok) return genericYouCheck;
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
  { id: 'want_to_die', category: 'suicide', re: /\b(i\s+)?(want|wanna|wish(ed)?|going|plan(ning)?)\s+(to\s+)?(die|be dead)\b/ },
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
