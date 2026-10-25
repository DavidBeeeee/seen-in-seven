# Certainty rendered walk

Run 2026-10-25T03:07:25.857Z in 166s against `api/_hub/certainty.html` with every network call stubbed (`scripts/sim/certainty-walk.mjs`).

**25 of 25 checks pass. 0 findings.** Requests refused: 0 (0 that could have reached production).

## Checks

- PASS first visit greets a first-timer: first-session heading 1
- PASS book: the next session shows with its topic: Your first sessionSunday, October 2510:00 AM – 12:00 PM ETOn Zoom · Fix my funnelJoin on Z
- PASS edit: update sent with the session id and the new topic shows: update id=upcoming-2
- PASS cancel: the session is gone and booking is offered again: Your first sessionStart with one thing you are stuck on.This is two hours, one-o
- PASS rebook after cancel: 2 book requests
- PASS lapsed member is welcomed back with their last topic: Welcome backYour seat with David is still here.Your last session was September 24, about 4
- PASS ended membership closes booking and says how to come back: Your Certainty Sessions membership has ended.
- PASS sign-in failure shows the sign-in gate: Sign in to enter Certainty Sessions.
- PASS server unreachable on load shows a retry, not a blank page: We could not reach the server just now.
- PASS Try again recovers once the server answers
- PASS network drop mid-booking: says so, keeps the choice, button usable: Something interrupted the booking. Try again.
- PASS slot taken by someone else: plain message and a fresh pick: Someone just took that time. Pick another open slot.
- PASS double submit sends exactly one booking: 1 book requests
- PASS a neighbour's two-hour session blocks the overlapping hours: disabled hours 13,14,15
- PASS cancel network drop is reported to the member: Your session is still booked. Try again in a moment, or email David at email@davidbee.me.
- PASS cancel server error is reported to the member: Could not cancel that session. Your session is still booked. Try again in a moment, or email David at email@davidbee.me.
- PASS reschedule stops and says so when the old time cannot be released: Could not cancel that session. Your session is still booked. Try again in a moment, or email David at email@davidbee.me.
- PASS keyboard-only booking dark 1280px: booked 2026-10-25 10:00 phone, 43 stops, 0 without visible focus
- PASS keyboard-only booking dark 375px: booked 2026-10-25 10:00 phone, 36 stops, 0 without visible focus
- PASS keyboard-only booking light 1280px: booked 2026-10-25 10:00 phone, 43 stops, 0 without visible focus
- PASS keyboard-only booking light 375px: booked 2026-10-25 10:00 phone, 36 stops, 0 without visible focus
- PASS Escape closes the booking panel and returns focus to the Book button: focus on Book my first session
- PASS zero serious or critical axe-core violations (WCAG 2.1 A/AA) on every state, light and dark: 0 serious/critical
- PASS layout holds at 375/1280, 200% zoom, 24px font, light and dark across 6 screens: 0 layout faults
- PASS no request left the machine except font and icon GETs; zero POSTs to production: 0 refused, 0 non-benign

## Findings

None.
