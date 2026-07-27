import {
  buildSystemPrompt,
  extractBannedScriptTerms,
  extractTaggedSection,
  finalizeScriptHook,
  findVoiceIssues,
  HOOK_JUDGE_SYSTEM,
  HOOK_STUDIO_SYSTEM,
  parseSections,
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
assert(focusedPrompt.includes('Apply the Hook-and-Eye Seamless Rule ONLY inside [MEAT].'), 'Focused prompt lost the Meat-only continuity rule.');
assert(!focusedPrompt.includes('INFORMATION LEDGER'), 'Focused prompt still contains the superseded Information Ledger.');
assert(
  focusedPrompt.includes('[HOOK] sits outside the Hero\'s Journey and outside the chronological story architecture.'),
  'Focused prompt lost the protected Hook architecture.'
);
assert(
  focusedPrompt.includes('[OPEN LOOP] is an independent retention device.'),
  'Focused prompt lost the protected Open Loop architecture.'
);
assert(focusedPrompt.includes('It may pivot abruptly away from the Hook.'), 'Open Loop was incorrectly coupled back to the Hook.');

const hookGuidanceLines = published.source.match(/^HOOK guidance:.*$/gm) || [];
assert(hookGuidanceLines.length === 14, 'Expected one Hook Studio guidance line for every video.');
hookGuidanceLines.forEach((line, index) => {
  assert(
    line.includes('Apply the global Hook Studio after all other sections are complete.'),
    'Video blueprint ' + (index + 1) + ' reassigned Hook ownership.'
  );
});

[
  /connect directly to the concrete element in the hook/i,
  /must connect the hook/i,
  /delivering the viewer into the same open loop/i,
  /supplies the HOOK/i,
  /HOOK receives the sharpest/i,
  /HOOK\s*=\s*answer/i,
  /present self supplies the HOOK/i,
  /hook and open loop come from/i,
  /unanswered question created by the Hook/i,
  /\[HOOK\][^\n]*\nLead with/i,
  /continuous composition pass from \[?HOOK\]?/i
].forEach(pattern => {
  assert(!pattern.test(published.source), 'Protected Hook architecture contains forbidden coupling: ' + pattern.source);
});

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
const coupledHookSource = published.source.replace(
  'HOOK guidance: Apply the global Hook Studio after all other sections are complete.',
  'HOOK guidance: Journal answer 2 supplies the HOOK.'
);
assert(
  validateBlueprintSource(coupledHookSource).some(issue => /Hook architecture|Hook Studio/i.test(issue)),
  'Blueprint validation allowed a video to reassign Hook ownership.'
);

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
assert(freshRequest.includes('Apply sentence-level Hook-and-Eye only inside [MEAT].'), 'Fresh regeneration lost Meat-only continuity.');
assert(freshRequest.includes('Supply a provisional [HOOK]'), 'Fresh regeneration lost final Hook Studio separation.');

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
  'I had spent years handling difficult conversations without rehearsing every sentence.',
  'I had nothing useful to say during difficult conversations.'
);
const wholeRewriteCalls = [];
const wholeRewriteResult = await reviewAndRepairScript({
  script: flawedFreshDraft,
  systemPrompt: buildSystemPrompt(published.prompt, 1, 2),
  userMessage: freshRequest,
  level: 1,
  video: 2,
  wholeScriptRewrite: true,
  provisionalHook: true,
  callModel: async (system, user) => {
    wholeRewriteCalls.push({ system, user });
    if (wholeRewriteCalls.length === 1) {
      return JSON.stringify({
        pass: false,
        issues: [{ section: 'MEAT', reason: 'The Meat uses banned language.' }],
        replacements: { MEAT: 'A section replacement that must not be stitched into the draft.' }
      });
    }
    if (wholeRewriteCalls.length === 2) return flawedFreshDraft;
    return validFreshScript;
  }
});
assert(wholeRewriteCalls.length === 3, 'Fresh full review did not use one review followed by complete-script correction passes.');
assert(wholeRewriteCalls[1].user.includes('DRAFT TO REPLACE COMPLETELY'), 'Whole rewrite lost its complete-replacement instruction.');
assert(wholeRewriteCalls[2].user.includes('DRAFT TO REPLACE COMPLETELY'), 'Hard validation correction did not remain a complete rewrite.');
assert(!wholeRewriteResult.includes('A section replacement that must not be stitched'), 'Full regeneration stitched in a section replacement.');
assert(parseSections(wholeRewriteResult).HOOK === 'Hold on.', 'Story review did not preserve the provisional Hook boundary.');
assert(parseSections(wholeRewriteResult).MEAT === parseSections(validFreshScript).MEAT, 'Full regeneration did not return the complete fresh story rewrite.');

const hookStudioCalls = [];
const hookStudioResult = await finalizeScriptHook({
  script: wholeRewriteResult,
  systemPrompt: buildSystemPrompt(published.prompt, 1, 2),
  userMessage: freshRequest,
  level: 1,
  video: 2,
  callModel: async (system, user) => {
    hookStudioCalls.push({ system, user });
    if (system === HOOK_STUDIO_SYSTEM) {
      const studioAttempt = hookStudioCalls.filter(call => call.system === HOOK_STUDIO_SYSTEM).length;
      if (studioAttempt === 1) {
        return JSON.stringify({
          candidates: [
            'I was sitting at my desk and thinking about the recording.',
            'I opened the camera before breakfast.',
            'Yesterday I tried to record a video.',
            'This is the story of my recording.',
            'I have been making progress with the camera.',
            'Let me tell you what happened when I recorded.'
          ]
        });
      }
      assert(user.includes('chronological scene setup'), 'Hook Studio retry lost the judge feedback.');
      return JSON.stringify({
        candidates: [
          'Perfection is the most expensive hiding place.',
          'A camera can turn ten minutes into a hostage negotiation.',
          'Delete buttons have ended more careers than critics ever could.',
          'Your camera is getting blamed for a crime it did not commit.',
          'I trusted the delete button more than I trusted myself.',
          'The safest recording is the one that ruins your future.'
        ]
      });
    }
    if (system === HOOK_JUDGE_SYSTEM) {
      const judgeAttempt = hookStudioCalls.filter(call => call.system === HOOK_JUDGE_SYSTEM).length;
      return judgeAttempt === 1
        ? JSON.stringify({ pass: false, hook: '', reason: 'Every option is chronological scene setup, not an attention interrupt.' })
        : JSON.stringify({ pass: true, hook: 'Perfection is the most expensive hiding place.', reason: '' });
    }
    throw new Error('Unexpected Hook Studio test call.');
  }
});
assert(hookStudioCalls.length === 4, 'Hook Studio did not retry a scene-setting Hook through its independent judge.');
assert(parseSections(hookStudioResult).HOOK === 'Perfection is the most expensive hiding place.', 'Hook Studio did not install the selected Hook.');
assert(parseSections(hookStudioResult)['OPEN LOOP'] === parseSections(wholeRewriteResult)['OPEN LOOP'], 'Hook Studio changed the Open Loop.');
assert(parseSections(hookStudioResult).MEAT === parseSections(wholeRewriteResult).MEAT, 'Hook Studio changed the Meat.');
assert(parseSections(hookStudioResult).CONCLUSION === parseSections(wholeRewriteResult).CONCLUSION, 'Hook Studio changed the Conclusion.');
assert(parseSections(hookStudioResult).CTA === parseSections(wholeRewriteResult).CTA, 'Hook Studio changed the CTA.');

console.log('Prompt style guide checks passed with ' + bannedTerms.length + ' canonical banned terms.');
