# StorySculpt rendered walk: chromium

Run 2026-11-11T15:13:04.453Z in 200s against `api/_hub/storysculpt.html` in chromium with every network call stubbed.

**66 of 66 checks pass. 0 findings.** Requests refused: 0 (0 that could have reached production).

## Checks

- PASS layout holds at 375/1280, 200% zoom, 400% zoom, 24px font, light and dark across 10 screens: 0 layout faults
- PASS At 400 percent zoom nothing overlaps or hides across 10 screens: 0 zoom-400 faults (320px CSS width)
- PASS zero serious or critical axe-core violations (WCAG 2.1 A/AA) on every state, light and dark: 0 serious/critical
- PASS keyboard-only walk dark 1280px: 30 stops via Tab, 0 without visible focus
- PASS keyboard-only walk dark 375px: 31 stops via Tab, 0 without visible focus
- PASS keyboard-only walk light 1280px: 30 stops via Tab, 0 without visible focus
- PASS keyboard-only walk light 375px: 31 stops via Tab, 0 without visible focus
- PASS Escape closes the help dialog: closed
- PASS Mobile tabs: selection exposed to assistive technology matches Chat, Script, Chat: true/true false/false | false/false true/true | true/true false/false
- PASS UGC pills: aria-pressed follows the highlight on every group after a click: {"allMatch":true,"count":11,"direct":"true","thirty":"true","sixty":"false"}
- PASS archive acknowledged: active rail hides chat without deleting content: proj-interview-1
- PASS archive flushes the pending title before hiding the chat: debounce and archive share the save queue
- PASS all archived is not a first visit: orientation stays hidden
- PASS Archived filter exposes restore and selected state: recoverable
- PASS restore returns original chat and content to All: no content change
- PASS failed archive keeps chat visible and names recovery: not deleted, retry available
- PASS stale archive is refused without hiding chat: reload before retry
- PASS Delete names what is lost in an in-page dialog; Escape keeps the project: {"dialogState":{"open":true,"role":"alertdialog","modal":"true","title":"Delete \"Stop selling features\"?","desc":"This permanently removes the chat, its recorded versions, and the finished script. This cannot be undone once completed.","activeId":"story-delete-dialog-cancel"},"afterEscape":{"closed":true,"activeAction":"delete-project"},"trapPass":true}
- PASS Undo within the window restores the project with nothing lost: rowDeleted=true, hasUndo=true, restored=true, contentIntact=true
- PASS first visit greets member with clear start: Start a script the way you talk.
- PASS first visit explains 5E and voice in one place: card visible=true, 5E/voice=true
- PASS return visit does not repeat the orientation: card visible=false, title=Start a new script.
- PASS return visit names where member left off and what next script could build on: You left off on “Stop selling features”. Pick up that interview where you stopped, or start your next script to test a different hook.
- PASS rail shows finished and filmed counts across projects: finished=1, filmed=0
- PASS opening Help closes the account menu instead of covering its answers: launcher menu closed
- PASS Help answers how long and what happens after: how long=true, what after=true
- PASS Help answers what finishing locks and what a lapsed membership pauses: locks=true, pauses=true
- PASS Help distinguishes self-serve StorySculpt deletion from full Studio account deletion: deleting=true, accountDeletion=true, selfServe=true
- PASS Help answers what happens if something hard comes up, with 988 and findahelpline.com: hardMoment=true
- PASS Help close returns focus to the visible account button: not a hidden menu item
- PASS 60-turn fixture collapses earlier turns: 13 visible messages before expand
- PASS collapsed thread includes a bounded earlier-answer excerpt, not a new card: Last earlier answer: “Turn 48: Audit their customer list and find the top twenty percent that generates eighty percent of margin.”
- PASS expanding 60-turn fixture renders all turns without fault: 60 messages rendered
- PASS earlier-answer recap disappears when the actual history is open: expanded history replaces the excerpt
- PASS answer exclusion is visible, saved and reversible: excluded=1, pressed=1, saved=true, restored=true, restoredSaved=true
- PASS /rant step path loads with 5E Talking Head mode: 5E Talking Head
- PASS finished script renders script text and refine box: Here is why your product is not selling.

You keep
- PASS finished interview says it is finished and shows one next action: finishedLine=Interview finished. This script is finished. Refine it with a note or start a new chat.New chat; nextStep=Film this script, then mark it Filmed.
- PASS Refine reopens the script and the walk proves it: revised script active with v2 (latest)
- PASS a new turn after finish is explained, not a raw 409: This script is already finished. Use Refine with a note to change it.
- PASS Finishing warns once that the interview locks: Choose your open loopThe sentence right after your hook that makes people stay to hear the rest. Finishing locks the interview so your script stays stable; you can refine the finished script with a note anytime.
- PASS An old story profile shows its age and a refresh offer: Story profile updated 88 days ago. Review your audience, offers, or facts to keep future scripts current.Review details
- PASS A member back after a long gap lands on their last chat with a kind line: Welcome back. Your last chat, "Old Pottery Lesson", is right where you left it. Pick it up or start something new.
- PASS A second lapse past 21 days gets its own kind line: Welcome back. Another stretch away is okay. Your last chat, "Second Stretch Pottery Lesson", is right where you left it. Pick it up or start something new.
- PASS With CSS off the step list reads in order and the text-only path works without layout-only meaning: {"cssOffFirst":{"isOrderedList":true,"headings":["h1:StorySculpt","h2:Chats","h2:Start a script the way you talk.","h3:Turn raw thoughts into video scripts that sound like you.","h4:1. Why the 5E interview keeps your voice","h4:2. What to expect: 5 to 10 minutes","h4:3. What happens when your script is ready"],"steps":["Step 1 Choose your format Pick a format below and answer questions in your own words.","Step 2 Review your script Refine lines with a quick note, edit text inline, or export.","Step 3 Record and mark filmed Get on camera, track your momentum, and repeat."],"modesCount":4,"headingsInDomOrder":true,"stepsInOrder":true,"orientationColsOrdered":true,"tabsHaveSelected":true,"pillsHavePressed":true},"cssOffInterview":{"editorVisible":true,"turnCount":3}}
- PASS network drop mid-generation: reports error and keeps composer usable: send button enabled=true
- PASS network drop names the connection and says the answer does not need retyping: connection=true, noRetype=true, errorBubbles=0
- PASS A five-topic answer gets one narrowing question (bounded in code): {"turnCount":3,"lastTurn":{"role":"assistant","content":"You named several distinct stories here (how I priced my first coaching offer too low; why hiring a virtual assistant too early burn...; moving my studio to Denver after college). One short video lands best when it turns on a single moment. Which one of those should we build this script around first?","step":"narrow","narrowingQuestion":true,"forStep":"B1","key":"narrow:mwc9d0f5np46dilckw"},"statusLine":"Screen stayed on this step to ask one narrowing question because your answer covered several topics at once.","secondCheck":{"broad":false,"reason":"already-narrowed"}}
- PASS A step that fails mid-generation resumes at that step with the answer kept: {"failedStepState":{"step":"B1","interruptedStep":{"step":"B1","lastAnswer":"Let us focus on pricing my first coaching offer too low.","turnKey":"turn:mwc9d0hjn4g7yq9hfbg","reason":"The writing attempt did not finish. Your saved chat is safe. Choose Try again to continue from the same answer.","at":"2026-11-11T15:12:42.743Z"},"keptAnswer":"Let us focus on pricing my first coaching offer too low.","statusText":"The writing attempt did not finish. Your saved chat is safe. Choose Resume this step to continue from the same answer. Step paused on Choose your topic before StorySculpt finished replying. Your last answer (“Let us focus on pricing my first coaching offer…”) is kept. Press Resume this step to continue from Choose your topic.","hasRetry":true},"resumedState":{"interruptedCleared":true,"stepAfter":"evidence","statusText":"Screen updated to Step evidence because your earlier answer (“Let us focus on pricing my first coaching o…”) shaped this question.","finalStatusLine":"Screen changed to your finished script because every interview step is complete. Strong work bringing this story together, your script is ready to film.","userCountForAnswer":1}}
- PASS The status line names why the screen changed and keeps strongest praise for the finished script: {"stepStatus":"Screen updated to Step evidence because your earlier answer (“Let us focus on pricing my first coaching o…”) shaped this question.","finalStatus":"Screen changed to your finished script because every interview step is complete. Strong work bringing this story together, your script is ready to film."}
- PASS A new chat lists the saved facts it will use and one can be left out: {"composed":"MEMBER STORY PROFILE (standing facts the member set once):\nName: Alex\nWhat they do: Founder and positioning coach\nWho their videos are for: Bootstrapped B2B founders selling high-ticket services\nVoice and phrasing: Direct, calm, practical, no hype words\nOffers and recurring calls to action: Quarterly positioning sprint\nOther notes: Prefers short sentences and concrete examples","standingStillHasFacts":true,"excludedInChat":true,"previewText":"Using 6 of 7 saved entries for this chat (1 left out)From your story profile and answers you confirmed in finished projects. Leave any entry out for this chat without deleting it.Name: Alex Leave out of this chatWhat they do: Founder and positioning coach Leave out of this chatWho their videos are for: Bootstrapped B2B founders selling high-ticket services Leave out of this chatVoice and phrasing: Direct, calm, practical, no hype words Leave out of this chatOffers and recurring calls to action: Quarterly positioning sprint Leave out of this chatFacts and results to reuse: Built three profitable micro-SaaS companies; 12 years consulting Left out of this chatUse in this chatOther notes: Prefers short sentences and concrete examples Leave out of this chat"}
- PASS A remembered line is never resurfaced twice and a corrected emotional detail never comes back: {"cleaned":"Which direction fits best?","repeatedRoleGone":true,"staleEmotionGone":true,"keptQuestion":true}
- PASS Settings show format, theme and story profile together: {"settingsBefore":{"formatText":"5E Talking Head (locked for this chat; start a new chat for a different format)","themeText":"Dark mode active","profileSummary":"7 of 7 standing fields saved below (reused across chats unless left out for a chat)","roleInputVal":"Founder and positioning coach"},"themeAfter":"Light mode active"}
- PASS 40-turn interrupted interview preserves all 40 turns, resumes the paused step, and finishes: {"collapsedBtnText":"Show earlier answers (28 messages)","midInterrupt":{"totalTurns":41,"interruptedStep":{"step":"B5","lastAnswer":"When I stopped discounting my audit, three clients signed in one week.","turnKey":"turn:mwc9d292umjeh8es1mo","reason":"The writing attempt did not finish. Your saved chat is safe. Choose Try again to continue from the same answer.","at":"2026-11-11T15:12:45.034Z"},"statusText":"The writing attempt did not finish. Your saved chat is safe. Choose Resume this step to continue from the same answer. Step paused on Choose your hook before StorySculpt finished replying. Your last answer (“When I stopped discounting my audit, three clie…”) is kept. Press Resume this step to continue from Choose your hook."},"afterResume":{"finished":true,"interruptedStep":null,"totalTurns":41,"refineVisible":true}}
- PASS 30-day return welcomes the member back, names carried work, and continues from the exact step: {"returnState":{"daysAway":30,"noticeVisible":true,"noticeText":"Welcome back. Your last chat, \"Old Pottery Lesson\", is right where you left it. Pick it up or start something new.","genStatus":"Welcome back. Your answer “A founder spent nine months building twenty-four integration...” and the work through Step epiphany carried forward. Answer the current question above to continue from this step; you do not need to start over.","stepBefore":"epiphany"},"finishedAfterReturn":true}
- PASS Adversarial answer at every step is safely escaped, narrowed or refused when empty, and completes cleanly: {"emptyCheck":{"turnsAfterEmpty":1,"stepAfterEmpty":"B1","statusLine":"Nothing was sent, so Step B1 is still waiting. Your earlier answers are unchanged. Type an answer to continue this exact step."},"narrowedStep":true,"adversarialAudit":{"xssTriggered":false,"injectedScriptCount":0,"userTurnsCount":8,"finished":true}}
- PASS Mid-save network failure keeps unsaved changes on device and saves them when connection returns: {"duringOutage":{"saveStatus":"Not saved, retrying. Your latest changes are kept on this device; retry when your connection returns or you reopen this chat.","keptPresent":true,"keptTitle":"Retained After Mid-Save Failure"},"afterRecovery":{"saveStatus":"Your kept changes are saved.","keptCleared":true},"serverSavedTitle":"Retained After Mid-Save Failure"}
- PASS Full start, finish, refine, export, archive, restore, delete, undo journey completes end to end: {"refinedVersionCount":2,"exportReceipt":{"download":"why-most-founders-underprice-revised.txt","href":"blob:http://storysculpt.walk.test/20062e0d-95a7-48e2-ab1b-e3bf0cb97e91"},"countInAllAfterArchive":0,"countInArchived":1,"countInAllAfterRestore":1,"finalJourneyState":{"activeId":"proj-101","outputPresent":true,"versionsCount":2,"archived":false,"pendingDeletes":0}}
- PASS Stated objective in intake, finished panel, story profile, and Help, plus posted/graded member control: {"skippedObjState":"unset","statedObjText":"Stated objective: For Bootstrapped founders who hate pitching -> Next action: Book a 20-minute strategy call (conversion)","editedObjText":"Stated objective: For Independent studio owners -> Next action: Reply with their biggest bottleneck (conversation)","weightBefore":"1","weightFilmed":"2","weightPosted":"3","postedInStrip":"1"}
- PASS signed-out member meets the access gate: gate visible=true
- PASS screen-reader first-visit: every control is named and headings form an outline: 0 faults, 10 controls, 7 headings
- PASS screen-reader interview: every control is named and headings form an outline: 0 faults, 30 controls, 3 headings
- PASS screen-reader finished: every control is named and headings form an outline: 0 faults, 31 controls, 3 headings
- PASS screen-reader story-profile: every control is named and headings form an outline: 0 faults, 49 controls, 4 headings
- PASS screen-reader help-dialog: every control is named and headings form an outline: 0 faults, 39 controls, 19 headings
- PASS no request left the machine except font and icon GETs; zero POSTs to production: 0 refused, 0 non-benign

## Findings

None.
