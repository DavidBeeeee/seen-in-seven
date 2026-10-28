# StorySculpt rendered walk: webkit

Run 2026-10-28T12:10:44.019Z in 153s against `api/_hub/storysculpt.html` in webkit with every network call stubbed.

**21 of 21 checks pass. 0 findings.** Requests refused: 0 (0 that could have reached production).

## Checks

- PASS layout holds at 375/1280, 200% zoom, 24px font, light and dark across 10 screens: 0 layout faults
- PASS zero serious or critical axe-core violations (WCAG 2.1 A/AA) on every state, light and dark: 0 serious/critical
- PASS keyboard-only walk dark 1280px: 25 stops via Alt+Tab, 0 without visible focus
- PASS keyboard-only walk dark 375px: 25 stops via Alt+Tab, 0 without visible focus
- PASS keyboard-only walk light 1280px: 25 stops via Alt+Tab, 0 without visible focus
- PASS keyboard-only walk light 375px: 25 stops via Alt+Tab, 0 without visible focus
- PASS Escape closes the help dialog: closed
- PASS first visit greets member with clear start: Start a script the way you talk.
- PASS 60-turn fixture collapses earlier turns: 12 visible messages before expand
- PASS expanding 60-turn fixture renders all turns without fault: 60 messages rendered
- PASS answer exclusion is visible, saved and reversible: excluded=1, pressed=1, saved=true, restored=true, restoredSaved=true
- PASS /rant step path loads with 5E Talking Head mode: 5E Talking Head
- PASS finished script renders script text and refine box: Here is why your product is not selling.

You keep
- PASS network drop mid-generation: reports error and keeps composer usable: send button enabled=true
- PASS signed-out member meets the access gate: gate visible=true
- PASS screen-reader first-visit: every control is named and headings form an outline: 0 faults, 10 controls, 7 headings
- PASS screen-reader interview: every control is named and headings form an outline: 0 faults, 20 controls, 3 headings
- PASS screen-reader finished: every control is named and headings form an outline: 0 faults, 24 controls, 3 headings
- PASS screen-reader story-profile: every control is named and headings form an outline: 0 faults, 29 controls, 4 headings
- PASS screen-reader help-dialog: every control is named and headings form an outline: 0 faults, 25 controls, 12 headings
- PASS no request left the machine except font and icon GETs; zero POSTs to production: 0 refused, 0 non-benign

## Findings

None.
