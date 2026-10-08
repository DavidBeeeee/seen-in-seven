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

export function resolveStep({ mode, intent, messages = [], currentStep = null }) {
  if (intent === 'refine') return 'F1';

  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMsg = (userMessages.length ? userMessages[userMessages.length - 1].content : '').trim();

  if (/^\s*\/fix\b/i.test(lastUserMsg)) return 'F1';

  if (/skip to (?:the )?hook/i.test(lastUserMsg)) {
    if (mode === 'rant') return 'R6';
    if (mode === 'bold') return 'B4';
    if (mode === 'mini') return 'M4';
  }

  if (/^(?:revise this|revise|try again|redo|redo this|another option)\b/i.test(lastUserMsg) || lastUserMsg.toLowerCase().includes('revise this')) {
    if (currentStep) return currentStep;
  }

  const sequence = MODE_STEPS[mode] || MODE_STEPS.rant;
  if (currentStep) {
    const idx = sequence.indexOf(currentStep);
    if (idx !== -1) {
      if (idx < sequence.length - 1) return sequence[idx + 1];
      return sequence[idx];
    }
  }

  const assistantCount = messages.filter(m => m.role === 'assistant').length;
  if (assistantCount === 0) return sequence[0];
  if (assistantCount === 1) return sequence[1] || sequence[0];
  const targetIdx = Math.min(assistantCount, sequence.length - 1);
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

export function extractOptions(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const options = [];
  let currentOption = '';
  for (const line of lines) {
    if (/^(?:(?:\d+[\.\)]|[-*•]|option\s+\d+:?|level\s+(?:one|two|three|\d+):?|hook\s+\d+:?))\s+/i.test(line)) {
      if (currentOption) options.push(currentOption);
      currentOption = line;
    } else if (currentOption) {
      currentOption += ' ' + line;
    }
  }
  if (currentOption) options.push(currentOption);
  return options;
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

export function checkHookEvidence(hookOptions, memberMessages = []) {
  const memberText = memberMessages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join(' ');
  const evidenceStems = extractStems(memberText);

  for (const opt of hookOptions) {
    const optStems = extractStems(opt);
    for (const s of optStems) {
      if (evidenceStems.has(s)) {
        return { ok: false, issue: `hook-contains-evidence-stem: "${s}" in option: "${opt}"` };
      }
    }
  }
  return { ok: true };
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

export function checkDeterministic({ content, stepLabel, memberMessages = [], bannedTerms = [] }) {
  const bannedCheck = checkBannedTerms(content, bannedTerms);
  if (!bannedCheck.ok) return bannedCheck;

  if (stepLabel === 'R6' || stepLabel === 'R7') {
    const options = extractOptions(content);
    if (options.length > 0) {
      const evidenceCheck = checkHookEvidence(options, memberMessages);
      if (!evidenceCheck.ok) return evidenceCheck;
    }
  }

  if (stepLabel === 'R7') {
    const shapeCheck = checkR7Shape(content);
    if (!shapeCheck.ok) return shapeCheck;
  }

  const THREE_OPTION_STEPS = new Set(['B2', 'B4', 'M4', 'R6', 'R7', 'R8']);
  if (THREE_OPTION_STEPS.has(stepLabel) && !/^FINAL SCRIPT:/i.test(content)) {
    const threeCheck = checkThreeOptions(content);
    if (!threeCheck.ok) return threeCheck;
  }

  if (/^FINAL SCRIPT:/i.test(content) || stepLabel === 'B5' || stepLabel === 'M5' || stepLabel === 'R9' || stepLabel === 'F1') {
    const genericYouCheck = checkGenericYou(content);
    if (!genericYouCheck.ok) return genericYouCheck;
  }

  return { ok: true };
}

export function stepFallbackMessage(stepLabel, stepText) {
  let question = '';
  const askMatch = stepText.match(/Ask:?\s*"([^"]+)"/i) || stepText.match(/Ask:?\s*([^\n]+)/i);
  if (askMatch) {
    question = askMatch[1].trim();
  } else {
    const lines = stepText.split('\n').filter(l => l.trim() && !l.startsWith('STOP') && !l.startsWith('WAIT'));
    question = lines.slice(1, 3).join(' ').trim();
  }
  return `NEXT QUESTION: ${question}\n\n(Note: I had trouble shaping the options for this step. Please share your preference or let me know how you would like to proceed.)`;
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
