import {
  buildSystemPrompt,
  extractBannedScriptTerms,
  extractTaggedSection,
  findVoiceIssues,
  publishedPrompt,
  reviewAndRepairScript,
  validateBlueprintSource
} from '../api/_lib/prompt-engine.js';
import { regenerationMessage } from '../api/generate.js';

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
assert(focusedPrompt.includes('one continuous composition pass'), 'Focused prompt lost the unified composition rule.');
assert(!focusedPrompt.includes('INFORMATION LEDGER'), 'Focused prompt still contains the superseded Information Ledger.');
assert(
  focusedPrompt.includes('[HOOK] is an independent pattern interrupt.'),
  'Unified composition changed the protected Hook contract.'
);
assert(
  focusedPrompt.includes('[OPEN LOOP] is an independent interest device.'),
  'Unified composition changed the protected Open Loop contract.'
);

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

const freshRequest = regenerationMessage({
  mode: 'full-regeneration',
  userContext: 'ORIGINAL ANSWERS SENTINEL',
  existingScript: 'PREVIOUS SCRIPT SENTINEL',
  feedback: 'Try a different storytelling approach.',
  level: 2,
  video: 4
});
assert(freshRequest.includes('ORIGINAL ANSWERS SENTINEL'), 'Fresh regeneration lost the original answers.');
assert(!freshRequest.includes('PREVIOUS SCRIPT SENTINEL'), 'Fresh regeneration leaked the previous script.');
assert(freshRequest.includes('FRESH FULL REGENERATION'), 'Fresh regeneration lost its explicit rewrite contract.');
assert(freshRequest.includes('write the final visible script once'), 'Fresh regeneration lost unified composition.');

const validFreshScript = `[HOOK]
I deleted the recording before breakfast.

[OPEN LOOP]
The camera exposed a question I couldn't answer yet: why did a ten-minute recording feel heavier than work I had already survived?

[MEAT]
I had spent years handling difficult conversations without rehearsing every sentence. Put a camera in front of me, though, and I checked every word before saying it. I recorded the same opening four times, watched each attempt back, and deleted every file. By breakfast, I had completed the work I feared and erased all evidence that I had tried. The recording took ten minutes. The deleting took the rest of the morning, since each replay gave me another detail to judge. Eventually I closed the camera and returned to the routine that already felt familiar.

[CONCLUSION]
I could survive being recorded. Letting the recording remain visible was the part I kept refusing.

[CTA]
That refusal followed me longer than the recording did. Follow because this is Video 2 of my 7 Video Challenge, and the next chapter reveals the belief that kept choosing silence for me.`;
const flawedFreshDraft = validFreshScript.replace(
  'I deleted the recording before breakfast.',
  'I had nothing worth recording before breakfast.'
);
const wholeRewriteCalls = [];
const wholeRewriteResult = await reviewAndRepairScript({
  script: flawedFreshDraft,
  systemPrompt: buildSystemPrompt(published.prompt, 1, 2),
  userMessage: freshRequest,
  level: 1,
  video: 2,
  wholeScriptRewrite: true,
  callModel: async (system, user) => {
    wholeRewriteCalls.push({ system, user });
    if (wholeRewriteCalls.length === 1) {
      return JSON.stringify({
        pass: false,
        issues: [{ section: 'HOOK', reason: 'The Hook uses banned language.' }],
        replacements: { HOOK: 'A section replacement that must not be stitched into the draft.' }
      });
    }
    if (wholeRewriteCalls.length === 2) return validFreshScript;
    return JSON.stringify({ pass: true, issues: [], replacements: {} });
  }
});
assert(wholeRewriteCalls.length === 3, 'Fresh full review did not use one review, one whole rewrite, and one re-review.');
assert(wholeRewriteCalls[1].user.includes('DRAFT TO REPLACE COMPLETELY'), 'Whole rewrite lost its complete-replacement instruction.');
assert(!wholeRewriteResult.includes('A section replacement that must not be stitched'), 'Full regeneration stitched in a section replacement.');
assert(wholeRewriteResult === validFreshScript, 'Full regeneration did not return the complete fresh rewrite.');

console.log('Prompt style guide checks passed with ' + bannedTerms.length + ' canonical banned terms.');
