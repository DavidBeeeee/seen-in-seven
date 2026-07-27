import {
  buildSystemPrompt,
  extractBannedScriptTerms,
  extractTaggedSection,
  findVoiceIssues,
  publishedPrompt,
  validateBlueprintSource
} from '../api/_lib/prompt-engine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const published = publishedPrompt();
const blueprintErrors = validateBlueprintSource(published.source);
assert(!blueprintErrors.length, 'Blueprint validation failed: ' + blueprintErrors.join(' '));

const focusedPrompt = buildSystemPrompt(published.prompt, 2, 5);
assert(focusedPrompt.includes('<style_guide>'), 'Focused prompt lost the canonical style guide.');
assert(focusedPrompt.includes('VIDEO 5 — THE FALL — THE ORDEAL'), 'Focused prompt lost the active video rules.');
assert(!focusedPrompt.includes('VIDEO 4 — THE CHOICE BEFORE PROOF'), 'Focused prompt leaked Video 4 rules.');
assert(!focusedPrompt.includes('VIDEO 6 — EPIPHANY #2'), 'Focused prompt leaked Video 6 rules.');

for (const level of [1, 2]) {
  for (let video = 1; video <= 7; video++) {
    const section = extractTaggedSection(published.prompt, 'l' + level + '_v' + video + '_rules');
    const focused = buildSystemPrompt(published.prompt, level, video);
    assert(section && focused.endsWith(section), 'Focused prompt lost Level ' + level + ', Video ' + video + '.');
    assert(focused.includes('<style_guide>'), 'Style guide is missing from Level ' + level + ', Video ' + video + '.');
  }
}

const bannedTerms = extractBannedScriptTerms(focusedPrompt);
[
  'thing',
  'nothing',
  'selling',
  'sold',
  'paid',
  'payments',
  'purchased',
  'anyone',
  'most people'
].forEach(term => {
  assert(bannedTerms.includes(term), 'Canonical list is missing "' + term + '".');
});

[
  'The thing I protected was my reputation.',
  'I had nothing left to prove.',
  'I kept selling the same offer.',
  'Someone paid me for the answer.',
  'I could tell the message landed with her.',
  'I finally shipped the product.'
].forEach(sample => {
  assert(findVoiceIssues(sample, focusedPrompt).length, 'Expected a style issue for: ' + sample);
});

assert(
  !findVoiceIssues('The plane landed in Denver before noon.', focusedPrompt).length,
  'Literal physical landing was incorrectly blocked.'
);
assert(
  !findVoiceIssues('The cargo ship crossed the Atlantic.', focusedPrompt).length,
  'A literal ship was incorrectly blocked.'
);

const malformedSource = published.source.replace('<banned_script_terms>', '');
assert(validateBlueprintSource(malformedSource).length, 'A malformed style guide passed validation.');

console.log('Prompt style guide checks passed with ' + bannedTerms.length + ' canonical banned terms.');
