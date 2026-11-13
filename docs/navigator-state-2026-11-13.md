# WBR-459: Navigator implementation map, November 13

This is a code-and-test map for the next Morning rescore, not a rescore or a
signed-in acceptance walk. Inspected origin/main 5fc0418a65e87cf35b72c80cde561e28cd4920e4
against the October 18 build order in WorkerBee's
drafts/momentum-hub-three-hundred/scoring/nsn.md. The October 21 PART retirement
does not mean every old gap is still missing after later commits.

The full `npm test` suite passed at that exact main commit on November 13.
Its Navigator milestone, lapse, safety, roadmap, retry, idempotency, import,
repetition and integrity checks are deterministic checks, not a substitute for
real member lifecycle or spoken accessibility evidence. No scores changed.

| October 18 requested item | Built or missing, with code evidence |
| --- | --- |
| False milestones | Built by 4c84346. `js/navigator-milestones.mjs` assembles every TASK_DATA level, separates audit-covered from finished-here levels, and requires every phase for roadmap completion. The page calls that assembly in `renderMilestones`; `scripts/check-navigator-milestones.mjs` tests one-level false positives and all-phase completion. Live member acceptance remains separate. |
| Show all | Built by 4c84346. `js/navigator-history.mjs:bindToggleOnce` binds one handler, used by `js/navigator.js:renderHistory`. The double-toggle bug is gone in code and tested. Remaining limitation: only the newest 50 moves are fetched/displayable; the helper explicitly tells members older moves remain saved but are not shown. This is not unlimited history browsing. |
| Over-time link before the first move | Built by 4c84346. `api/_hub/navigator.html` places `openNavigatorOverTime()` on the first wizard screen, before audit or Next Move; the milestone check asserts this placement. The modal states retention and the consequences of starting fresh. |
| Bee Formula explained before use | Built by 4c84346. The opening wizard explains the 11-stage order in plain language before the audit. `check-navigator-milestones.mjs` checks that this is its first Bee Formula mention. |
| Why not a chatbot | Built by 4c84346. The opening wizard says Navigator remembers the audit, moves and finished work, rather than treating each question as a fresh conversation. Source copy and its presence check exist; this map does not claim measured comprehension. |
| Progressive questionnaire | Built in `api/_hub/navigator.html:renderQuestion`, retained by 4c84346. One current question's options are rendered; choosing an option advances `currentQIndex`, and Back revisits a prior question. Remaining accessibility risk: options are clickable divs rather than native buttons; no signed-in keyboard acceptance is supplied here. |
| Audit-to-ongoing handoff | Built by 4c84346. The results screen's `audit-handoff` explains Priority One, Next Move and returning, followed by CHOOSE MY FOCUS. Presence is checked in `check-navigator-milestones.mjs`; this is not proof of a complete live journey. |
| Text-only roadmap | Built by 4c84346. `js/navigator-milestones.mjs:buildTextRoadmap` labels every phase/level and Priority One; `api/_hub/navigator.html` wires the text view and toggle. The milestone suite checks the full list and the focused level. |
| Settings panel, export and reset consequences | Built by 658f865 plus earlier 1cbf5b4. `screen-settings`, `downloadNavigatorData`, `eraseMyNavigatorData` and `resetApp` in `api/_hub/navigator.html` expose account export, permanent erase and Start Fresh. The erase warning names all Navigator records and says membership/other apps are unaffected; Start Fresh names retained past versions and Next Moves. `js/navigator-roadmap-store.mjs` owns data operations, exercised by `check-navigator-integrity.mjs`. Missing from settings itself: a direct over-time-rules reminder/link; that modal is elsewhere. No destructive live erase was run for this documentation assignment. |
| Distinct very-long-absence line | Missing. `js/navigator.js:computeEngagement` has only 8-day quiet and 21-day lapsed thresholds; `computeReturnNotice` uses the same lapsed message for every longer absence. The existing 21-day return and retention message is built by ed58cc7, not the distinct very-long-absence treatment requested. |
| Signed-in full lifecycle walk | Missing current end-to-end evidence. Existing earlier records cited by the scoring source predate the newer roadmap and data-integrity changes. The present deterministic gates cover pieces, but no November 13 signed-in Navigator audit-to-roadmap-to-move-to-return/export/reset lifecycle was executed. Do not upgrade these rows from tests alone. |
| Accessibility walk | Missing current complete real-member/assistive-technology evidence. Roadmap status has aria-live, but that does not prove focus, keyboard, modal, question selection and screen-reader behavior end to end. The clickable questionnaire divs are a specific code risk to test. No dry or source-only check is called spoken acceptance. |

Next receiver: WO-20261113-evening uses this map before its assigned Navigator
saved-record integrity work; Morning owns all later question-by-question scores.
No StorySculpt rebuild, prompt edit, new migration or production dependency is
part of this documentation change.
