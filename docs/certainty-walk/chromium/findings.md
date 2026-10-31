# Certainty rendered walk: chromium

Run 2026-10-31T03:10:23.656Z in 150s against `api/_hub/certainty.html` in chromium with every network call stubbed.

**45 of 45 checks pass. 0 findings.** Requests refused: 0 (0 that could have reached production).

## Checks

- PASS first visit greets a first-timer: first-session heading 1
- PASS book: the next session shows with its topic: Your first sessionSunday, November 19:00 AM – 11:00 AM ETOn Zoom · Fix my funnelJoin on Zo
- PASS edit: update sent with the session id and the new topic shows: update id=upcoming-2
- PASS cancel: the session is gone and booking is offered again: Your first sessionStart with one thing you are stuck on.This is two hours, one-o
- PASS rebook after cancel: 2 book requests
- PASS lapsed member is welcomed back with their last topic: Welcome backYour seat with David is still here.Your last session was September 30, about 4
- PASS ended membership closes booking and says how to come back: Your Certainty Sessions membership has ended.
- PASS sign-in failure shows the sign-in gate: Sign in to enter Certainty Sessions.
- PASS server unreachable on load shows a retry, not a blank page: We could not reach the server just now.
- PASS Try again recovers once the server answers
- PASS Try again after a failed load announces the loaded state and moves focus: {"text":"Certainty Sessions loaded.","role":"status","live":"polite","focusedTag":"div","focusedId":"cs-session-msg"}
- PASS network drop mid-booking: says so, keeps the choice, button usable: Something interrupted the booking. Try again.
- PASS slot taken by someone else: plain message and a fresh pick: Someone just took that time. Pick another open slot.
- PASS double submit sends exactly one booking: 1 book requests
- PASS a neighbour's two-hour session blocks the overlapping hours: disabled hours 13,14,15
- PASS cancel network drop is reported to the member: Your session is still booked. Try again in a moment, or email David at email@davidbee.me.
- PASS cancel server error is reported to the member: Could not cancel that session. Your session is still booked. Try again in a moment, or email David at email@davidbee.me.
- PASS reschedule stops and says so when the old time cannot be released: Could not cancel that session. Your session is still booked. Try again in a moment, or email David at email@davidbee.me.
- PASS Cancel asks in an in-page dialog; Escape keeps the session and returns focus: {"dialogState":{"open":true,"role":"alertdialog","modal":"true","title":"Cancel this session?","desc":"The time opens back up for you or someone else.","activeId":"cs-dialog-cancel"},"afterEscape":{"closed":true,"activeId":"cs-cancel"},"cancelSent":false}
- PASS Reschedule confirm is labelled and focus-trapped: {"reschedDialog":{"labelled":true,"described":true,"titleText":"Reschedule this session?","descText":"This releases your current time first, and someone else can book it before you pick a new one.","activeId":"cs-dialog-cancel"},"focusWrappedBack":"cs-dialog-confirm","focusWrappedForward":"cs-dialog-cancel"}
- PASS keyboard-only booking dark 1280px: booked 2026-11-01 10:00 phone via Tab, 42 stops, 0 without visible focus
- PASS keyboard-only booking dark 375px: booked 2026-11-01 10:00 phone via Tab, 35 stops, 0 without visible focus
- PASS keyboard-only booking light 1280px: booked 2026-11-01 10:00 phone via Tab, 42 stops, 0 without visible focus
- PASS keyboard-only booking light 375px: booked 2026-11-01 10:00 phone via Tab, 35 stops, 0 without visible focus
- PASS Escape closes the booking panel and returns focus to the Book button: focus on Book my first session
- PASS zero serious or critical axe-core violations (WCAG 2.1 A/AA) on every state, light and dark: 0 serious/critical
- PASS layout holds at 375/1280, 200% zoom, 24px font, light and dark across 6 screens: 0 layout faults
- PASS screen-reader first-visit: every control is named and headings form an outline: 0 faults, 12 controls, 8 headings
- PASS screen-reader picker: every control is named and headings form an outline: 0 faults, 30 controls, 9 headings
- PASS screen-reader mode-choice: every control is named and headings form an outline: 0 faults, 43 controls, 9 headings
- PASS selected day and time are announced as selected: [{"selector":".cs-day.sel","pressed":"true","name":"Sun1Nov✓"},{"selector":".cs-time.sel","pressed":"true","name":"10:00 AM ET, selected"}]
- PASS screen-reader confirm: every control is named and headings form an outline: 0 faults, 44 controls, 9 headings
- PASS screen-reader booked: every control is named and headings form an outline: 0 faults, 15 controls, 7 headings
- PASS booked confirmation is announced: {"focused":"Sunday, November 19:00 AM – 11:00 AM ETBy phone · Screen reader booking","live":""}
- PASS screen-reader edit: every control is named and headings form an outline: 0 faults, 47 controls, 8 headings
- PASS screen-reader cancel: every control is named and headings form an outline: 0 faults, 12 controls, 8 headings
- PASS screen-reader lapsed: every control is named and headings form an outline: 0 faults, 12 controls, 10 headings
- PASS screen-reader ended: every control is named and headings form an outline: 0 faults, 2 controls, 1 headings
- PASS screen-reader signed-out-gate: every control is named and headings form an outline: 0 faults, 1 controls, 1 headings
- PASS screen-reader server-error-gate: every control is named and headings form an outline: 0 faults, 1 controls, 1 headings
- PASS screen-reader network-error: every control is named and headings form an outline: 0 faults, 43 controls, 9 headings
- PASS live announcement network-error: {"text":"Something interrupted the booking. Try again.","live":"polite"}
- PASS screen-reader slot-taken: every control is named and headings form an outline: 0 faults, 43 controls, 9 headings
- PASS live announcement slot-taken: {"text":"Someone just took that time. Pick another open slot.","live":"polite"}
- PASS no request left the machine except font and icon GETs; zero POSTs to production: 0 refused, 0 non-benign

## Findings

None.
