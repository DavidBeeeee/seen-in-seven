// StorySculpt output fidelity: a deterministic check of every finished script
// against what the member actually said (WBR-458 and WBR-462, Momentum 300
// StorySculpt Developer 41-47, 63, 64, 68, 78 and Stranger 77, 78).
//
// classifyOutput() in storysculpt-observability.js already refuses an invented
// testimonial or credential outright. This goes further and asks, of a script
// that will be spoken in the member's own voice, whether it puts anything in
// their mouth they never gave StorySculpt:
//   - credential:   a qualification, title or authority marker
//   - result:       an outcome claim (doubled, six figures, quit my job)
//   - testimonial:  someone else praising them, quoted or reported
//   - inference:    an unstated feeling, motive or meaning asserted as fact
//   - history:      an unstated place, event or earlier personal history
//   - number:       a figure, digits or spelled out from three upward
//   - date:         a month, a year, a weekday
//   - diagnosis:    a medical or psychological condition
//   - memory:       a claim that StorySculpt remembers them or a past talk
//   - overconfident: guarantee or universal-certainty words the member never used
//   - voice:        too little of the script is in the member's own words
//
// Pure and synchronous. It never sees the prompt and never changes it; the
// prompts and blueprints stay frozen. api/storysculpt.js runs it on a finished
// script, retries once with the flags named, and if the retry is still flagged
// shows the better draft with a plain note and logs storysculpt_output_rejected.
// Flags carry kinds and counts to the event, never the member's words.

// Lowest share of a script's content words that must come from the member's
// own words. Set from production on 2026-10-25 and rechecked on 2026-10-29:
// the latest 20 stored scripts had median share 0.415 and two below 0.15,
// counts only, computed in SQL. See docs/storysculpt-fidelity-report.md. A
// good hook brings fresh imagery, so 0.25 would flag substantially more real
// scripts; 0.15 remains the conservative lost-voice boundary.
export const VOICE_SHARE_MIN = 0.15;

// Too short to judge voice: a ten-word script cannot "lose" anything.
const VOICE_MIN_WORDS = 40;

const STOP = new Set(('a an and are as at be been but by can could did do does done for from get got had has have he her here him his how i if in into is it its just me more most my no not now of off on once one only or our out over own same she so some such than that the their them then there these they this those through to too under up us very was we were what when where which while who why will with would you your yours yourself im ive id ill youre youve dont didnt doesnt isnt wasnt cant wont thats theres whats lets also about after again all am any because before being below between both each few further other should until down during above against nor very s t').split(' '));

const CREDENTIAL = [
  /\bph\.?\s?d\b/i, /\bm\.?b\.?a\b/i, /\bdoctor(?:ate)?\b/i, /\bdr\.\s/i,
  /\b(?:board[- ])?certified\b/i, /\blicen[cs]ed\b/i, /\baccredited\b/i,
  /\baward[- ]winning\b/i, /\bbest[- ]?sell(?:ing|er)\b/i, /#\s?1\b/, /\bnumber\s+one\b/i,
  /\bas\s+seen\s+(?:in|on)\b|\bfeatured\s+(?:in|on)\b/i, /\bforbes\b|\btedx?\b|\bharvard\b|\bstanford\b|\boprah\b/i,
  /\b\d+\+?\s+years?\s+(?:of\s+)?experience\b/i, /\bworld[- ]class\b/i, /\bleading\s+expert\b/i, /\bfounder\s+of\b/i
];

const RESULT = [
  /\b(?:doubled|tripled|quadrupled|10x(?:ed)?)\b/i,
  /\b(?:six|seven|eight)[- ]figures?\b/i,
  /\bquit\s+my\s+(?:job|nine[- ]to[- ]five|9[- ]to[- ]5)\b/i,
  /\bwent\s+from\s+(?:\$?\d|zero\b|nothing\b|broke\b)\S*(?:\s+\S+){0,3}\s+to\s+\S+/i,
  /\bsold\s+out\b/i,
  /\bwent\s+viral\b/i,
  /\bhundreds\s+of\s+(?:clients|students|people|customers)\b/i,
  /\bthousands\s+of\s+(?:clients|students|people|customers|followers)\b/i
];

const TESTIMONIAL = [
  /\b(?:a|one|my)\s+(?:client|student|customer|member|reader|follower)\s+(?:told|said|wrote|messaged|emailed|texted)\b/i,
  /\b(?:clients|students|customers|people)\s+(?:tell|told|say|said)\s+me\b/i,
  /\b(?:called|calls)\s+me\s+(?:the|a|an)\b/i,
  /\bchanged\s+my\s+life\b/i
];

const DIAGNOSIS = [
  /\badhd\b/i, /\bADD\b/, /\bptsd\b/i, /\bocd\b/i, /\bbipolar\b/i, /\bautis(?:m|tic)\b/i,
  /\bdepress(?:ion|ed)\b/i, /\banxiety\b/i, /\bpanic\s+(?:attack|disorder)s?\b/i,
  /\bcancer\b/i, /\bdiabet(?:es|ic)\b/i, /\bchronic\s+\w+/i, /\bdiagnos(?:ed|is)\b/i,
  /\beating\s+disorder\b/i, /\baddict(?:ion|ed)\b/i, /\bdyslexi[ac]\b/i, /\bburnout\b/i
];

const MEMORY = [
  /\bremember\s+when\s+(?:you|we)\b/i,
  /\bas\s+you\s+(?:told|said\s+to|mentioned\s+to|shared\s+with)\s+me\b/i,
  /\blast\s+time\s+we\s+(?:talked|spoke|met|worked)\b/i,
  /\blike\s+(?:i|we)\s+(?:said|talked\s+about|discussed)\s+(?:before|last\s+time|earlier)\b/i,
  /\byou\s+(?:told|showed)\s+me\s+(?:last|before|earlier|yesterday)\b/i,
  /\bwhen\s+we\s+(?:first\s+)?(?:met|talked|spoke)\b/i
];

// WBR-462: high-confidence first-person claims, not a general semantic guess.
// Each expression includes the whole claim through its punctuation. The exact
// claim must occur in the member's material, so a sourced statement passes while
// a new motive, wound, place or personal history is named for the retry.
const INFERENCE = [
  /\b(?:i|we)\s+(?:was|were|am|are|felt|feel)\s+(?:so\s+|really\s+|very\s+)?(?:afraid|scared|terrified|ashamed|embarrassed|insecure|unworthy|not good enough)\b[^.;!?\n]{0,80}/gi,
  /\b(?:i|we)\s+(?:just\s+)?(?:wanted|needed|was trying|were trying)\s+to\s+(?:prove|please|impress|fit in|be liked|be accepted)\b[^.;!?\n]{0,80}/gi,
  /\b(?:i|we)\s+(?:did|do)\s+(?:it|this|that)\s+because\s+(?:i|we)\s+(?:was|were|am|are|felt|feel)\b[^.;!?\n]{0,80}/gi
];

const HISTORY = [
  /\b(?:i|we)\s+(?:grew up|was raised|were raised)\s+[^.;!?\n]{2,100}/gi,
  /\b(?:i|we)\s+(?:started|founded|launched|opened|attended|graduated from|moved to|worked at|worked for)\s+[^.;!?\n]{2,100}/gi,
  /\bwhen\s+(?:i|we)\s+(?:was|were)\s+(?:a\s+)?(?:child|kid|teenager|younger)\b[^.;!?\n]{0,100}/gi,
  /\b(?:my|our)\s+(?:first|childhood|early)\s+(?:job|business|company|career|home|school|memory)\s+[^.;!?\n]{2,100}/gi
];

const OVERCONFIDENT = [
  /\bguarantee[ds]?\b/i, /\bguaranteed\b/i, /\bfoolproof\b/i, /\bfail[- ]?proof\b/i, /\bnever\s+fails?\b/i,
  /\b100\s?%|\bhundred\s+percent\b/i, /\bproven\b/i, /\bscientifically\b/i, /\bthe\s+only\s+way\b/i,
  /\bovernight\b/i, /\binstantly\b/i, /\beffortless(?:ly)?\b/i, /\bwill\s+change\s+your\s+life\b/i,
  /\bwithout\s+fail\b/i, /\bevery\s+single\s+time\b/i, /\bnothing\s+else\s+works\b/i,
  /\b(?:always|never)\s+(?:works?|happens?|fails?|wins?)\b/i,
  /\b(?:everyone|everybody|no one|nobody)\s+(?:always|never|will|can|must|should)\b/i,
  /\bwill\s+(?:always|never)\b/i
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { hundred: 100, thousand: 1000, million: 1000000 };

function normal(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/(\d),(\d)/g, '$1$2')
    .replace(/[^a-z0-9$%#'\s]/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text) {
  return normal(text).split(' ').filter(Boolean);
}

// A crude stem so "launching" in the script matches "launch" from the member.
function stem(word) {
  return word.replace(/(?:ing|ed|es|s|ly)$/, '') || word;
}

function contentWords(text) {
  return words(text).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

// Did the member's material already contain what this pattern matched?
function sourced(match, haystack) {
  return haystack.includes(normal(match));
}

function patternFlags(kind, patterns, body, haystack) {
  const out = [];
  for (const pattern of patterns) {
    const m = body.match(pattern);
    if (m && !sourced(m[0], haystack)) out.push(kind);
  }
  return out;
}

// Every figure in a text as digits: "200", "two hundred", "twenty-five" and
// "a hundred" all become numbers, so the script and the member are compared in
// one form. Returns [{ value, figurative }].
function figures(text) {
  const tokens = words(String(text || '').replace(/-/g, ' '));
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    let value = null;
    let j = i;
    const unit = t.match(/^(\d+(?:\.\d+)?)(am|pm|th|st|nd|rd|s|k|m)?$/);
    if (unit) value = Number(unit[1]) * (unit[2] === 'k' ? 1000 : unit[2] === 'm' ? 1000000 : 1);
    else if (t in SMALL) value = SMALL[t];
    else if (t in TENS) { value = TENS[t]; if (tokens[j + 1] in SMALL && SMALL[tokens[j + 1]] < 10) { value += SMALL[tokens[j + 1]]; j += 1; } }
    else if (t in SCALE && (tokens[i - 1] === 'a' || tokens[i - 1] === 'an')) value = SCALE[t];
    if (value == null) continue;
    while (tokens[j + 1] in SCALE) { value *= SCALE[tokens[j + 1]]; j += 1; }
    const after = tokens[j + 1] || '';
    // "a hundred times", "a million things": figures of speech, not claims.
    const figurative = (t === 'hundred' || t === 'thousand' || t === 'million' || /^(?:a|an)$/.test(tokens[i - 1] || '')) && /^(?:times|things|ways|reasons|ideas|questions|tabs)$/.test(after);
    out.push({ value, figurative });
    i = j;
  }
  return out;
}

function numberFlags(body, haystack) {
  const known = new Set(figures(haystack).map(f => f.value));
  const out = [];
  for (const f of figures(body)) {
    // A lone one or two is ordinary speech ("one thing", "a time or two").
    if (f.value <= 2 || f.figurative || known.has(f.value)) continue;
    out.push('number');
  }
  return out;
}

function dateFlags(body, haystack) {
  const tokens = new Set(words(haystack));
  const out = [];
  const list = words(body);
  list.forEach((raw, i) => {
    const w = raw.replace(/s$/, '');
    if (!((MONTHS.includes(w) && w !== 'may' && w !== 'march') || WEEKDAYS.includes(w))) return;
    if (tokens.has(w) || tokens.has(w + 's')) return;
    // "Not a Monday, not in June": a day ruled out is not a claim about one.
    if (list[i - 1] === 'not' || (list[i - 2] === 'not' && /^(?:a|on|in)$/.test(list[i - 1]))) return;
    out.push('date');
  });
  // "may" and "march" are verbs far more often than months; only a date shape counts.
  for (const m of normal(body).matchAll(/\b(?:may|march)\s+\d{1,2}\b|\bin\s+(?:may|march)\b/g)) {
    if (!sourced(m[0], haystack)) out.push('date');
  }
  for (const m of body.matchAll(/\b(?:19|20)\d{2}\b/g)) {
    if (!tokens.has(m[0])) out.push('date');
  }
  return out;
}

// Share of the script's content words (stemmed) that the member used.
export function voiceShare(script, memberText) {
  const own = new Set(contentWords(memberText).map(stem));
  const mine = contentWords(script);
  if (!mine.length) return 1;
  const kept = mine.filter(w => own.has(stem(w))).length;
  return kept / mine.length;
}

// script: the finished script body. source: everything in the thread including
// options StorySculpt offered (a chosen hook is the member's once chosen).
// memberText: only what the member typed, for voice and overconfidence.
export function checkFidelity(script, { source = '', memberText = '' } = {}) {
  const body = String(script || '');
  const haystack = normal(source + '\n' + memberText);
  const own = normal(memberText);
  const flags = [
    ...patternFlags('credential', CREDENTIAL, body, haystack),
    ...patternFlags('result', RESULT, body, haystack),
    ...patternFlags('testimonial', TESTIMONIAL, body, haystack),
    ...patternFlags('inference', INFERENCE, body, own),
    ...patternFlags('history', HISTORY, body, own),
    ...patternFlags('diagnosis', DIAGNOSIS, body, haystack),
    ...patternFlags('memory', MEMORY, body, haystack),
    ...patternFlags('overconfident', OVERCONFIDENT, body, own),
    ...numberFlags(body, haystack),
    ...dateFlags(body, haystack)
  ];
  const share = voiceShare(body, memberText);
  if (contentWords(body).length >= VOICE_MIN_WORDS && share < VOICE_SHARE_MIN) flags.push('voice');
  const counts = {};
  for (const f of flags) counts[f] = (counts[f] || 0) + 1;
  const kinds = Object.keys(counts).sort();
  return { ok: kinds.length === 0, kinds, counts, voiceShare: Math.round(share * 100) / 100 };
}

// Lower is better, for keeping the less-bad of the first draft and its retry.
export function fidelityScore(result) {
  return Object.values(result.counts || {}).reduce((a, b) => a + b, 0);
}

// What the retry is told. Kinds only, phrased as instructions, no member words.
const RETRY_LINES = {
  credential: 'Remove any title, qualification or authority the member did not state.',
  result: 'Remove any outcome or result the member did not state.',
  testimonial: 'Remove anything other people said about the member that the member did not report.',
  inference: 'Do not turn a guessed feeling, motive or meaning into a fact about the member.',
  history: 'Remove any personal history, place or earlier event the member did not state.',
  number: 'Use only numbers the member gave; drop any other figure.',
  date: 'Use only dates, months, years or days the member gave.',
  diagnosis: 'Do not name any medical or psychological condition the member did not name.',
  memory: 'Do not claim to remember the member or any earlier conversation.',
  overconfident: 'Do not promise or guarantee; drop words like guaranteed, proven, always works, overnight.',
  voice: 'Keep far more of the member\'s own words and phrasing; it should sound like them.'
};
export function fidelityRetryDirective(result) {
  return 'The finished script put things in the member\'s mouth they never said. ' + result.kinds.map(k => RETRY_LINES[k]).join(' ') + ' Keep everything else.';
}

// The plain note shown above a script that was still flagged after its retry.
const NOTE_PARTS = {
  credential: 'a title or qualification',
  result: 'a result',
  testimonial: 'something someone said about you',
  inference: 'a guessed feeling or motive',
  history: 'personal history',
  number: 'a number',
  date: 'a date',
  diagnosis: 'a health condition',
  memory: 'a memory of an earlier talk',
  overconfident: 'a promise or guarantee',
  voice: 'wording that drifts from your own'
};
export function fidelityNote(result) {
  const parts = result.kinds.map(k => NOTE_PARTS[k]);
  const list = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' or ' + parts[parts.length - 1] : parts[0];
  return 'Check this draft before you film it: it may include ' + list + ' you did not give StorySculpt. Change or remove anything that is not true for you.';
}
