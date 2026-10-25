# Certainty readiness: a thousand members tomorrow

Written 2026-10-24 (evening, WBR-458; Stranger 100, Developer 100) from the code on `main` and the production database as they stood that night. Production then held one member and four sessions, one of them booked.

## What breaks first

**1. There are not enough hours. This is the binding limit.**
Every member gets one two-hour session with David every week (David, 2026-10-25: that offer is not changing). Sessions can start on any hour from 10:00 to 22:00 Eastern, and there is one David. As of tonight no two sessions can overlap, so the most that fit is 7 a day (10, 12, 14, 16, 18, 20, 22), which is **49 a week**. At 49 active members the week is full, and member 50 cannot be given the session they paid for. Nothing in the code stops more people from joining than there are seats.
Keeping the guarantee means keeping active members under the weekly seat count, or adding hours or hosts as membership grows. Until one of those is in place, Certainty should not be sold past about 40 members, which leaves room for reschedules.

**2. Double booking: fixed tonight.**
Before tonight the database refused only a second booking at the *same* start time. One member at 10:00 and another at 11:00 both landed, so David was booked into two sessions at once for an hour. With one member this never happened (0 overlapping pairs on read-back). With two or more it would have. Fixed:
- `supabase_migrations/2026-10-24-certainty-no-overlap.sql`: a trigger refuses any booked session that overlaps another one, under a lock so two members racing for neighbouring hours cannot both get through. It raises the same `SLOT_TAKEN` the page already explains. Applied to production as `certainty_no_overlap_20261024` and read back. A rolled-back probe showed an overlapping insert refused and a back-to-back one accepted.
- The picker now greys out the hour before and after anyone else's session, so members are not offered times that would be refused.

**3. Supabase bandwidth.** The afternoon lane recorded an accumulated bandwidth warning and a possible restriction on October 26. Every Certainty page load reads up to 50 history rows plus state. That is small per member, but if the project is restricted, every Hub app stops, not only Certainty. This needs David or the Supabase dashboard, not code.

**4. Rate limit.** `state` allows 60 calls per member per quota window and answers past that with a friendly 429. One member reloading is fine. A thousand members share no quota, so this does not limit the crowd.

**5. Reminder email volume.** Reminders go through Resend from `sessions@coloradomastermind.com`, sent one by one inside a 60-second job. Because of item 1 there are at most 49 sessions a week, which is about 100 reminder emails a week plus invites. That fits any Resend plan. If item 1 is solved with more hosts, check the Resend plan's daily cap before going past a few hundred sessions a week.

**6. Vercel functions.** 24 API files today. Certainty adds none tonight.

## What a member at the edges meets (from the rendered walk)

`scripts/sim/certainty-walk.mjs` drives the real page in headless Chromium with every network call stubbed. Tonight it found and this run fixed:
- Cancel or reschedule that failed (network drop or server error) said nothing, and reschedule then opened the booking panel anyway, inviting a second booking while the first still stood. Now the page checks the server and tells the member their session is still booked.
- Keyboard: opening the panel left focus behind, choosing a day or a time dropped focus to the top of the page, confirming dropped it to the page body, and Escape did nothing. All four are fixed.
- Day buttons had a spoken name that did not match their visible text.
- Text contrast below WCAG AA in several places, mostly in light mode (3.4 to 4.3 against the 4.5 minimum). Fixed on this page only, so other Hub pages are unchanged.
- A member who sets a larger default font got larger headings but the same small shell text and body copy. That text now scales too.
- A signed-out member saw "Sign in to enter EEE." It now says Certainty Sessions and sends them back here after sign-in.

The walk ends 25 of 25 checks green, with zero serious or critical axe-core violations and no request leaving the machine.

## Not verified tonight

- Real screen-reader output (VoiceOver or NVDA). The walk checks focus and accessible names, not speech.
- Emailed calendar invites. That is the overnight Antigravity order (WO-20261024-agnight).
- Load: no load test was run against production, and none should be without David's say-so.
