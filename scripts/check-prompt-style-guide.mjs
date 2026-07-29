import { readFileSync } from 'node:fs';
import {
  buildSystemPrompt,
  extractBannedScriptTerms,
  extractTaggedSection,
  finalizeScriptHook,
  finalizeScriptOpenLoop,
  findLexicalRepetitionIssues,
  findVoiceIssues,
  HOOK_JUDGE_SYSTEM,
  HOOK_STUDIO_SYSTEM,
  OPEN_LOOP_ARCHITECT_SYSTEM,
  OPEN_LOOP_WRITER_SYSTEM,
  parseSections,
  publishedPrompt,
  QUALITY_REVIEW_SYSTEM,
  reviewAndRepairScript,
  validateOutput,
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
assert(
  !focusedPrompt.includes('LEXICAL AND CONCEPT ECONOMY:') &&
    QUALITY_REVIEW_SYSTEM.includes('After story structure and MEAT continuity are secure'),
  'Lexical repetition pressure was not moved out of initial composition and into post-draft editing.'
);
assert(!focusedPrompt.includes('INFORMATION LEDGER'), 'Focused prompt still contains the superseded Information Ledger.');
assert(
  focusedPrompt.includes('[HOOK] sits outside the Hero\'s Journey and outside the chronological story architecture.'),
  'Focused prompt lost the protected Hook architecture.'
);
assert(
  focusedPrompt.includes('[OPEN LOOP] is an independent retention device.'),
  'Focused prompt lost the protected Open Loop architecture.'
);
assert(focusedPrompt.includes('Zeigarnik Retention Gap'), 'Focused prompt lost the Zeigarnik Retention Gap definition.');
assert(focusedPrompt.includes('Payoff Firewall'), 'Focused prompt lost the Open Loop payoff firewall.');
assert(focusedPrompt.includes('It may pivot abruptly away from the Hook.'), 'Open Loop was incorrectly coupled back to the Hook.');

const generationSource = readFileSync(new URL('../api/generate.js', import.meta.url), 'utf8');
const promptTestSource = readFileSync(new URL('../api/prompt-test.js', import.meta.url), 'utf8');
const sectionGenerationSource = generationSource.slice(
  generationSource.indexOf('async function generateSectionCore'),
  generationSource.indexOf('async function generateSection(', generationSource.indexOf('async function generateSectionCore'))
);
assert(
  generationSource.indexOf("const retentionContent = await measureStage(timings, 'open-loop'") <
    generationSource.indexOf("const finalContent = await measureStage(timings, 'hook'"),
  'Production generation no longer finalizes the Open Loop before the Hook.'
);
assert(
  sectionGenerationSource.includes("if (input.section === 'OPEN LOOP')") &&
    sectionGenerationSource.includes("const content = await measureStage(timings, 'open-loop-regeneration'") &&
    sectionGenerationSource.indexOf("if (input.section === 'OPEN LOOP')") <
      sectionGenerationSource.indexOf('let preparedContext = input.userContext;'),
  'Single-section Open Loop regeneration bypasses the Open Loop Studio.'
);
assert(
  promptTestSource.indexOf("const retentionContent = await measureStage(timings, 'open-loop'") <
    promptTestSource.indexOf("content = await measureStage(timings, 'hook'"),
  'Admin Prompt Tester no longer mirrors the production Open Loop and Hook order.'
);

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
  /continuous composition pass from \[?HOOK\]?/i,
  /detail is already present in \[HOOK\]/i,
  /\[OPEN LOOP\] directly continues .* \[HOOK\]/i,
  /connect the hook evidence/i,
  /bridges? from (?:the )?hook/i
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
  'somebody',
  'most people'
].forEach(term => {
  assert(bannedTerms.includes(term), 'Canonical list is missing "' + term + '".');
});

[
  'The thing I protected was my reputation.',
  'I had nothing left to prove.',
  'I kept selling the same offer.',
  'Someone paid me for the answer.',
  'Somebody messaged me after reading the comment.',
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

const inflectedRepetition = findLexicalRepetitionIssues({
  HOOK:'A sharp independent interruption uses help once.',
  'OPEN LOOP':'Why did the help disappear when the work became difficult?',
  MEAT:'I helped for years. Helping felt natural, so I kept helping after the request had already been answered.',
  CONCLUSION:'That help protected my comfort.',
  CTA:'Follow because this seven-video challenge continues with the decision that followed.'
});
assert(
  inflectedRepetition.some(issue => issue.root === 'help' && issue.section === 'MEAT'),
  'Inflected meaningful repetition across the story body was not detected.'
);

const protectedRetentionAnchor = findLexicalRepetitionIssues({
  HOOK:'Price is a costume confidence wears.',
  'OPEN LOOP':'Why did support disappear at the exact moment I needed support most?',
  MEAT:'I opened the material, completed the assignment, and waited for a response that never arrived.',
  CONCLUSION:'Support had been the missing promise.',
  CTA:'Follow because this is Video 3 of my seven-video challenge and the next chapter tests that realization.'
});
assert(
  !protectedRetentionAnchor.some(issue => issue.root === 'support'),
  'The intentional Open Loop-to-Conclusion answer anchor was treated as body repetition.'
);

const structuralWords = findLexicalRepetitionIssues({
  HOOK:'Watch this.',
  'OPEN LOOP':'Why did the video matter?',
  MEAT:'I recorded the video, watched the video, and posted the video.',
  CONCLUSION:'The video changed the decision.',
  CTA:'Follow because this is Video 2 of my seven-video challenge and Video 3 continues the series.'
});
assert(
  !structuralWords.some(issue => ['video', 'seven', 'challenge', 'follow', 'series'].includes(issue.root)),
  'Required series language was incorrectly counted as lexical repetition.'
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
The camera exposed a question I couldn't answer yet: why did a ten-minute recording feel heavier than difficult work I had already survived without hesitation for years?

[MEAT]
I had spent years handling difficult conversations without rehearsing every sentence. Put a camera in front of me, though, and I checked every word before saying it. I recorded the same opening four times, watched each attempt back, and deleted every file. By breakfast, I had completed the work I feared and erased all evidence that I had tried. The recording took ten minutes. The deleting took the rest of the morning, since each replay gave me another detail to judge. Eventually I closed the camera and returned to the routine that already felt familiar.

[CONCLUSION]
I could survive being seen. Leaving the evidence visible was the part I kept refusing.

[CTA]
The refusal followed me longer than that morning did, so follow because this is Video 2 of my 7 Video Challenge, and the next chapter reveals the belief that kept choosing silence for me.`;

const connectedCtaValidation = validateOutput(validFreshScript, 2, 1, '', focusedPrompt);
assert(
  !(connectedCtaValidation.sectionIssues.CTA || []).some(issue => /bridge|hinge|follow request/i.test(issue)),
  'A grammatically connected CTA bridge was rejected.'
);
const repetitiveButOtherwiseEquivalent = validFreshScript.replace(
  'Eventually I closed the camera',
  'Eventually I faced the camera, then closed the camera'
);
const repetitionAdvisoryValidation = validateOutput(repetitiveButOtherwiseEquivalent, 2, 1, '', focusedPrompt);
assert(
  repetitionAdvisoryValidation.valid === connectedCtaValidation.valid &&
    repetitionAdvisoryValidation.advisories.some(issue => /"camera"/.test(issue)) &&
    !(repetitionAdvisoryValidation.issues || []).some(issue => /"camera"/.test(issue)),
  'Lexical repetition should guide editorial repair without becoming a hard generation failure.'
);
const brokenCtaScript = validFreshScript.replace(
  'The refusal followed me longer than that morning did, so follow because',
  'The refusal followed me longer than that morning did. Follow because'
);
const brokenCtaValidation = validateOutput(brokenCtaScript, 2, 1, '', focusedPrompt);
assert(
  (brokenCtaValidation.sectionIssues.CTA || []).some(issue => /ends its bridge|grammatical hinge/i.test(issue)),
  'A CTA with a full stop between its bridge and follow command passed validation.'
);
const disposableOpenLoopDraft = validFreshScript.replace(
  "The camera exposed a question I couldn't answer yet: why did a ten-minute recording feel heavier than work I had already survived?",
  'Anybody could call this the thing that changed everything, although the draft kept expanding into a long summary that repeated every event, every result, and every explanation before the conclusion had a chance to reveal its own meaning to the viewer watching the full story.'
);
const provisionalStudioReviewCalls = [];
const provisionalStudioReviewResult = await reviewAndRepairScript({
  script: disposableOpenLoopDraft,
  systemPrompt: buildSystemPrompt(published.prompt, 1, 2),
  userMessage: freshRequest,
  level: 1,
  video: 2,
  provisionalHook: true,
  provisionalOpenLoop: true,
  callModel: async (system, user) => {
    provisionalStudioReviewCalls.push({ system, user });
    assert(user.includes('[HOOK] and [OPEN LOOP] are temporary placeholders'), 'Story review was not told to ignore both Studio-owned sections.');
    assert(!user.includes('Anybody could call this'), 'The disposable draft Open Loop reached story review.');
    return JSON.stringify({ pass: true, issues: [], replacements: {} });
  }
});
assert(provisionalStudioReviewCalls.length === 1, 'A disposable Open Loop caused extra story-review passes before the Studio.');
assert(
  parseSections(provisionalStudioReviewResult)['OPEN LOOP'].startsWith('A central question remains unresolved'),
  'Story review did not preserve the provisional Open Loop boundary for the Studio.'
);
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
    return JSON.stringify({
      pass:false,
      issues:[],
      replacements:{ MEAT:parseSections(validFreshScript).MEAT }
    });
  }
});
assert(wholeRewriteCalls.length === 3, 'Fresh full review did not use one review, one complete rewrite, and one mechanical cleanup.');
assert(wholeRewriteCalls[1].user.includes('DRAFT TO REPLACE COMPLETELY'), 'Whole rewrite lost its complete-replacement instruction.');
assert(wholeRewriteCalls[2].user.includes('DETERMINISTIC FAILURES'), 'Hard validation correction did not become a mechanical cleanup.');
assert(!wholeRewriteResult.includes('A section replacement that must not be stitched'), 'Full regeneration stitched in a section replacement.');
assert(parseSections(wholeRewriteResult).HOOK === 'Hold on.', 'Story review did not preserve the provisional Hook boundary.');
assert(parseSections(wholeRewriteResult).MEAT === parseSections(validFreshScript).MEAT, 'Full regeneration did not return the complete fresh story rewrite.');

const payoffScript = `[HOOK]
Hold on.

[OPEN LOOP]
I wondered whether a direct message would prove the work had reached the right person.

[MEAT]
I kept answering detailed questions in the same group, even while each response seemed to disappear beneath louder posts. One reply collected three likes while a polished promotion nearby collected a wall of praise. I considered copying the presentation that looked successful, although I kept returning to the plain answer in front of me. The visible reaction gave me little reason to continue, yet I typed another response the following evening.

[CONCLUSION]
A group member sent me a direct message saying my answer was the first explanation that had made sense all week.

[CTA]
That private response gave the quiet work a pulse, so follow because this is Video 4 of my 7 Video Challenge, and the next chapter shows the collapse that nearly ended it.`;
const cleanRetentionGap = 'Three likes made the work look invisible, although the number could only measure public reaction. I kept returning to the same question: how long could I continue when the evidence I could see kept telling me to stop?';
const openLoopStudioCalls = [];
const openLoopStudioResult = await finalizeScriptOpenLoop({
  script: payoffScript,
  systemPrompt: buildSystemPrompt(published.prompt, 1, 4),
  userMessage: 'The source supplied the group, three likes, and the later private response.',
  level: 1,
  video: 4,
  callModel: async (system, user) => {
    openLoopStudioCalls.push({ system, user });
    if (system === OPEN_LOOP_ARCHITECT_SYSTEM) {
      assert(!user.includes('I wondered whether a direct message'), 'Open Loop Architect received the draft Open Loop it was meant to replace.');
      return JSON.stringify({
        answer_kind: 'EVENT',
        retention_question: 'Could quiet useful work matter beyond the public reaction visible beneath it?',
        conclusion_answer: 'A private response proves the answer reached and helped one reader.',
        meat_boundary: 'The Meat establishes the choice to keep answering and must stop before evidence that the work reached a reader.',
        known_before_payoff: 'Three visible likes made the work appear ignored while the speaker continued without proof of reach.',
        quarantined_details: ['direct message', 'group member', 'private response', 'inbox']
      });
    }
    if (system === OPEN_LOOP_WRITER_SYSTEM) {
      assert(user.includes('Could quiet useful work matter beyond the public reaction visible beneath it?'), 'Open Loop Writer lost the approved retention question.');
      assert(user.includes('must stop before evidence that the work reached a reader'), 'Open Loop Writer lost the Meat boundary.');
      assert(user.includes('VISIBLE SCRIPT STYLE PACKET:'), 'Open Loop Writer lost the visible-script style packet.');
      assert(user.includes('<banned_script_terms>'), 'Open Loop Writer lost the canonical banned terms.');
      assert(user.includes('<internal_story_language_firewall>'), 'Open Loop Writer lost the internal-language firewall.');
      assert(user.includes('STAGE OWNERSHIP CONTRACT:'), 'Open Loop Writer lost the active stage boundary.');
      assert(!user.includes('FOCUSED BLUEPRINT AND STYLE GUIDE:'), 'Open Loop Writer received the full focused blueprint instead of the narrow style packet.');
      return JSON.stringify({ open_loop: cleanRetentionGap });
    }
    throw new Error('Unexpected Open Loop architecture test call.');
  }
});
assert(openLoopStudioCalls.length === 2, 'Open Loop construction did not use one architecture pass and one writing pass.');
assert(parseSections(openLoopStudioResult)['OPEN LOOP'] === cleanRetentionGap, 'Open Loop Studio did not install the selected retention gap.');
assert(parseSections(openLoopStudioResult).HOOK === parseSections(payoffScript).HOOK, 'Open Loop Studio changed the Hook.');
assert(parseSections(openLoopStudioResult).MEAT === parseSections(payoffScript).MEAT, 'Open Loop Studio changed the Meat.');
assert(parseSections(openLoopStudioResult).CONCLUSION === parseSections(payoffScript).CONCLUSION, 'Open Loop Studio changed the Conclusion.');
assert(parseSections(openLoopStudioResult).CTA === parseSections(payoffScript).CTA, 'Open Loop Studio changed the CTA.');

const imperfectRetentionGap = 'Three likes looked final, while the quiet work still left me wondering whether visible reaction measured its real reach.';
const repairedRetentionGap = 'Three public likes made the answer look invisible, although that number could not reveal whether the right person had quietly read it. How long could I continue without knowing whether the work had reached beyond the reaction I could see?';
let imperfectWriterCalls = 0;
let imperfectRepairCalls = 0;
const imperfectOpenLoopResult = await finalizeScriptOpenLoop({
  script: payoffScript,
  systemPrompt: buildSystemPrompt(published.prompt, 1, 4),
  userMessage: 'Use the same supported story facts.',
  level: 1,
  video: 4,
  callModel: async system => {
    if (system === OPEN_LOOP_ARCHITECT_SYSTEM) {
      return JSON.stringify({
        answer_kind: 'EVENT',
        retention_question: 'Could quiet useful work matter beyond visible reaction?',
        conclusion_answer: 'A private response shows that one reader was helped.',
        meat_boundary: 'Stop before evidence that the work reached a reader.',
        known_before_payoff: 'The public reaction looked discouraging.',
        quarantined_details: ['direct message']
      });
    }
    if (system === OPEN_LOOP_WRITER_SYSTEM) {
      imperfectWriterCalls += 1;
      return imperfectRetentionGap;
    }
    if (system.includes('final mechanical copy editor')) {
      imperfectRepairCalls += 1;
      return JSON.stringify({
        pass:false,
        issues:[],
        replacements:{ 'OPEN LOOP':repairedRetentionGap }
      });
    }
    throw new Error('Unexpected imperfect Open Loop test call.');
  }
});
assert(imperfectWriterCalls === 2, 'Open Loop Writer did not receive one focused cleanup attempt.');
assert(imperfectRepairCalls === 1, 'A known-invalid Open Loop did not receive mechanical cleanup.');
assert(
  parseSections(imperfectOpenLoopResult)['OPEN LOOP'] === repairedRetentionGap,
  'Open Loop mechanical cleanup did not replace the known-invalid fallback.'
);

const hookStudioCalls = [];
const hookStudioResult = await finalizeScriptHook({
  script: openLoopStudioResult,
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
assert(parseSections(hookStudioResult)['OPEN LOOP'] === parseSections(openLoopStudioResult)['OPEN LOOP'], 'Hook Studio changed the Open Loop.');
assert(parseSections(hookStudioResult).MEAT === parseSections(openLoopStudioResult).MEAT, 'Hook Studio changed the Meat.');
assert(parseSections(hookStudioResult).CONCLUSION === parseSections(openLoopStudioResult).CONCLUSION, 'Hook Studio changed the Conclusion.');
assert(parseSections(hookStudioResult).CTA === parseSections(openLoopStudioResult).CTA, 'Hook Studio changed the CTA.');

const levelTwoHookCalls = [];
const levelTwoHookResult = await finalizeScriptHook({
  script: openLoopStudioResult,
  systemPrompt: buildSystemPrompt(published.prompt, 2, 6),
  userMessage: 'Level 2 Video 6 context with an ordeal-earned but independent second epiphany.',
  level: 2,
  video: 6,
  callModel: async (system, user) => {
    levelTwoHookCalls.push({ system, user });
    if (system === HOOK_STUDIO_SYSTEM) {
      assert(user.includes('LEVEL: 2'), 'Level 2 Hook Studio lost the active level.');
      assert(user.includes('VIDEO: 6'), 'Level 2 Hook Studio lost the active video.');
      assert(user.includes('VIDEO 6 — EPIPHANY #2'), 'Level 2 Hook Studio lost the focused Video 6 blueprint.');
      return JSON.stringify({
        candidates: [
          'Certainty can survive failure right up until the evidence learns your name.',
          'A polished answer can hide a year of being wrong.',
          'The worst lesson is the one that almost works.',
          'Conviction gets expensive when reality sends the invoice.',
          'I trusted the explanation longer than I trusted the evidence.',
          'Failure has terrible timing and excellent memory.'
        ]
      });
    }
    if (system === HOOK_JUDGE_SYSTEM) {
      return JSON.stringify({
        pass: true,
        hook: 'The worst lesson is the one that almost works.',
        reason: ''
      });
    }
    throw new Error('Unexpected Level 2 Hook Studio test call.');
  }
});
assert(levelTwoHookCalls.length === 2, 'Level 2 Hook Studio did not use the shared Studio and judge path.');
assert(parseSections(levelTwoHookResult).HOOK === 'The worst lesson is the one that almost works.', 'Level 2 Hook Studio did not install the selected Hook.');
assert(parseSections(levelTwoHookResult)['OPEN LOOP'] === parseSections(openLoopStudioResult)['OPEN LOOP'], 'Level 2 Hook Studio changed the Open Loop.');
assert(parseSections(levelTwoHookResult).MEAT === parseSections(openLoopStudioResult).MEAT, 'Level 2 Hook Studio changed the Meat.');

console.log('Prompt style guide checks passed with ' + bannedTerms.length + ' canonical banned terms across both Hook Studio levels.');
