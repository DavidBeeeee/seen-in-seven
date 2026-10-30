# StorySculpt rendered walk: chromium

Run 2026-10-30T05:00:47.471Z in 168s against `api/_hub/storysculpt.html` in chromium with every network call stubbed.

**40 of 40 checks pass. 0 findings.** Requests refused: 0 (0 that could have reached production).

## Checks

- PASS layout holds at 375/1280, 200% zoom, 24px font, light and dark across 10 screens: 0 layout faults
- PASS zero serious or critical axe-core violations (WCAG 2.1 A/AA) on every state, light and dark: 0 serious/critical
- PASS keyboard-only walk dark 1280px: 30 stops via Tab, 0 without visible focus
- PASS keyboard-only walk dark 375px: 29 stops via Tab, 0 without visible focus
- PASS keyboard-only walk light 1280px: 30 stops via Tab, 0 without visible focus
- PASS keyboard-only walk light 375px: 29 stops via Tab, 0 without visible focus
- PASS Escape closes the help dialog: closed
- PASS archive acknowledged: active rail hides chat without deleting content: proj-interview-1
- PASS archive flushes the pending title before hiding the chat: debounce and archive share the save queue
- PASS all archived is not a first visit: orientation stays hidden
- PASS Archived filter exposes restore and selected state: recoverable
- PASS restore returns original chat and content to All: no content change
- PASS failed archive keeps chat visible and names recovery: not deleted, retry available
- PASS stale archive is refused without hiding chat: reload before retry
- PASS first visit greets member with clear start: Start a script the way you talk.
- PASS first visit explains 5E and voice in one place: card visible=true, 5E/voice=true
- PASS return visit does not repeat the orientation: card visible=false, title=Start a new script.
- PASS return visit names where member left off and what next script could build on: You left off on “Stop selling features”. Pick up that interview where you stopped, or start your next script to test a different hook.
- PASS rail shows finished and filmed counts across projects: finished=1, filmed=0
- PASS opening Help closes the account menu instead of covering its answers: launcher menu closed
- PASS Help answers how long and what happens after: how long=true, what after=true
- PASS Help close returns focus to the visible account button: not a hidden menu item
- PASS 60-turn fixture collapses earlier turns: 12 visible messages before expand
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
- PASS network drop mid-generation: reports error and keeps composer usable: send button enabled=true
- PASS signed-out member meets the access gate: gate visible=true
- PASS screen-reader first-visit: every control is named and headings form an outline: 0 faults, 10 controls, 7 headings
- PASS screen-reader interview: every control is named and headings form an outline: 0 faults, 21 controls, 3 headings
- PASS screen-reader finished: every control is named and headings form an outline: 0 faults, 25 controls, 3 headings
- PASS screen-reader story-profile: every control is named and headings form an outline: 0 faults, 35 controls, 4 headings
- PASS screen-reader help-dialog: every control is named and headings form an outline: 0 faults, 28 controls, 15 headings
- PASS no request left the machine except font and icon GETs; zero POSTs to production: 0 refused, 0 non-benign

## Findings

None.
