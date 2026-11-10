# WBR-462: November 10 production member walk

Base origin/main: 9e3e72b4a4e0ef591ca408dbb34a17ce5199700c.
Production: https://studio.coloradomastermind.com/storysculpt.
Visible account: momentum-hub-test@ancientcosmic.com in the in-app browser,
not David's Chrome session. No credential, entitlement or customer row changed.
Observations occurred during 2026-11-10 22:37:25-22:46:35 UTC. Individual
second-level observation times were not captured; this is the honest observed
window, not invented server-event timestamps. This walk is incomplete.

## Seven scenarios

1. Empty and spaces-only send: FAIL for the empty Send button; whitespace PASS.
   Empty click displayed native "Please fill out this field." rather than the
   named step. Spaces displayed: "Nothing was sent, so Raw story is still
   waiting. Your earlier answers are unchanged. Type an answer to continue
   this exact step." No new conversation turn or thinking indicator appeared.
   Cause: the served textarea's `required` attribute prevents form submission
   before `sendStoryAnswer` can give its existing named-step message. Removed
   only that attribute on this branch. The existing member-state test now
   checks the served form and invokes the real handler for empty/whitespace:
   named Raw story status, unchanged conversation and zero fetch calls. That
   focused test passes. Fix is NOT integrated or verified on production.
2. Broad opening: PASS for a whole-life-story input. "I want to cover my whole
   life story: school, college, my first job, changing careers, becoming a
   parent, and starting pottery workshops. There are so many chapters and I
   do not know where to start." Result: "That spans a whole life story across
   several chapters. One short video lands best when it turns on a single
   moment. Which one moment or topic from what you shared should we build
   this script around first?" Status: "Screen stayed on this step to ask one
   narrowing question because your answer covered several topics at once."
   Limitation also observed: the shorter, vague confidence-for-everyone input
   below advanced to Choose the tension rather than asking for a moment.
   No prompt/blueprint or broad-answer heuristic was silently changed.
3. Network off mid-generation then Resume this step: NOT RUN. This browser's
   supported tab capabilities expose pageAssets and webmcp, not scoped network
   interception/offline control. No current page tool supplied fault injection.
   Did not disconnect the entire Mac or fabricate a network failure. Needs a
   capable, tab-scoped fault-test route; answer retention/retry is unverified.
4. Generation failure with a saved project: NOT RUN. No provider or scoped
   network fault control was available here. Did not exhaust real quota,
   weaken auth, change provider configuration or call a simulated failure a
   production observation. Needs a controlled live failure and exact readback.
5. Leave and return: PASS. Original test chat "WorkerBee November 10 production
   member walk" retained the confidence input and its generated follow-up.
   Leaving showed: "Paused and saved. \"WorkerBee November 10 production member
   walk\" is in your chats. Nothing is deleted when you leave." Reopening and
   then reloading restored that exact answer/question and "Next: Answer the
   next question to finish this script." No lapse banner was expected for a
   just-used chat. No chat was deleted or archived.
6. Different answers produce different follow-ups: PASS. Same 5E format and
   same opening step, two synthetic chats:
   - "I want to help everyone become more confident about everything, in every
     part of life." Follow-up: "What is the core emotion behind wanting
     confidence for others? Is it frustration, anger, grief, or something else?
     And who is the enemy we should aim the heat at: the system, industry, or
     practice that taught people to doubt themselves? Give me the real culprit,
     not a vague one."
   - "I teach pottery workshops. Yesterday a beginner hid her crooked cup
     under the table, so I showed her the lopsided cup I still use every morning.
     I want people to stop treating an imperfect first attempt as proof they
     lack talent." Follow-up: "The core emotion here feels like shame turning
     into permission. Is that the feeling you want the viewer to leave with,
     or is it closer to anger at whoever taught them to hide their first
     attempts?" Both content and status referenced the submitted answers.
7. Finished chat: PASS for displayed finished-state behavior. Existing
   synthetic "WorkerBee October 29 archive and finished acceptance" showed
   "Interview finished. This script is finished. Refine it with a note or
   start a new chat." Refine and New chat replaced the interview composer;
   the script panel showed FINISHED, its saved script and version controls,
   plus "Next: Film this script, then mark it Filmed." No finished script or
   film/post state was changed in this check.

## Verification and handoff

Four passed scenarios, one reproduced defect, two unrun fault scenarios.
This is not seven-scenario acceptance and no 300 row was regraded.
`node scripts/check-sculpt-member-states.mjs` passes, including the new
empty/whitespace regression. `npm test` reaches the existing
`check:storysculpt-state` failure: `ReferenceError: syncObjectiveInputs is not
defined` in its VM `showProject` fixture. Morning assigned that baseline test
repair to Evening; this branch does not modify that test or frozen prompts.

Evening: repair its assigned baseline fixture, review this exact one-attribute
change, run npm test green, then integrate safely. Verify empty Send on the
served production form and perform scenarios 3/4 with scoped fault control.
Retain actual observation timestamps. Do not close the order or WBR-462 from
this partial walk or its source-level regression.
