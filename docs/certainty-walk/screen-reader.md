# Certainty screen-reader transcripts

Chromium uses the CDP Accessibility tree and an ARIA snapshot; WebKit uses its rendered ARIA snapshot. Neither is a substitute for a real VoiceOver session, so the real VoiceOver pass comes first.

## VoiceOver pass on the in-page confirm dialogs and failed-load recovery (2026-10-30, evening Eastern)

Reader: VoiceOver (macOS 26.2). Browser: WebKit 26.5, a visible window driven by `scripts/sim/certainty-voiceover.mjs --dialogs`. Same stubbed world as the walk: 0 requests refused. Every line is VoiceOver's own `last phrase`; VoiceOver's "You are currently on…" hints are left out. Raw record: `docs/certainty-walk/voiceover-dialogs.json`.

### What VoiceOver tripped on, and what changed

1. **Both dialogs are heard whole.** VO-Space on Cancel or Reschedule moves VoiceOver into the dialog and it speaks the first choice, the question and the role in one breath: "Keep session button Cancel this session? The time opens back up for you or someone else. web alert dialog". VO-Right reaches the second choice and then "end of … web alert dialog", so the trap holds.
2. **Escape keeps the session.** VoiceOver returns to the button that opened the dialog ("Cancel button"), the dialog is closed and no cancel was posted. Confirming then does what it says: "Session cancelled. That time is open again. application status", and Reschedule lands on "heading level 2 Choose your time".
3. **VO-Space now reaches Try again.** The 10-29 pass found VoiceOver parked on the gate paragraph; tonight VO-Right reads the gate heading, the copy and "link Try again", and VoiceOver itself activates it (no harness click, `activatedBy: VoiceOver`).
4. **Recovery said only a date.** After Try again VoiceOver said "Sunday, November 1 and 2 more items group article": where it was, not that the page came back. The polite "Certainty Sessions loaded." status was never spoken because focus moved at the same moment. Fixed (bea337d): the recovered session card is named with the outcome, as Booked and Saved already are, and with no session booked the status message itself takes focus. Re-heard: "Loaded. Sunday, November 1, 1:00 PM – 3:00 PM ET, By phone · Launch email sequence." and "Certainty Sessions loaded. application status".

### Transcript

#### cancel-confirm

- *focus Cancel on a booked session*
  - “Cancel button Cancel article”

- *VO-Space on Cancel: the dialog opens*
  - “Keep session button Cancel this session? The time opens back up for you or someone else. web alert dialog”

- *keyboard focus is inside the dialog*
  - “true”

- *VO-Right through the dialog*
  - “Cancel session button”
  - “end of Cancel this session? The time opens back up for you or someone else. web alert dialog”

- *Escape: what is announced*
  - “Cancel button Cancel article”
  - record: `{"dialogOpen": false, "focusAfter": "cs-cancel", "cancelPosts": 0}`

- *VO-Space on Cancel again*
  - “Keep session button Cancel this session? The time opens back up for you or someone else. web alert dialog”

- *focus "Cancel session" in the dialog*
  - “Cancel session button”

- *VO-Space on "Cancel session": what is announced*
  - “Session cancelled. That time is open again. application status main”

- *after confirming*
  - record: `{"cancelPosts": 1, "bookOpen": false}`

#### reschedule-confirm

- *focus Reschedule on a booked session*
  - “Reschedule button Reschedule article”

- *VO-Space on Reschedule: the dialog opens*
  - “Keep session button Reschedule this session? This releases your current time first, and someone else can book it before you pick a new one. web alert dialog”

- *keyboard focus is inside the dialog*
  - “true”

- *VO-Right through the dialog*
  - “Reschedule button”
  - “end of Reschedule this session? This releases your current time first, and someone else can book it before you pick a new one. web alert dialog”

- *Escape: what is announced*
  - “Reschedule button Reschedule article”
  - record: `{"dialogOpen": false, "focusAfter": "cs-reschedule", "cancelPosts": 0}`

- *VO-Space on Reschedule again*
  - “Keep session button Reschedule this session? This releases your current time first, and someone else can book it before you pick a new one. web alert dialog”

- *focus "Reschedule" in the dialog*
  - “Reschedule button”

- *VO-Space on "Reschedule": what is announced*
  - “heading level 2 Choose your time main”

- *after confirming*
  - record: `{"cancelPosts": 1, "bookOpen": true}`

#### load-error-booked

- *VO-Right through the failed-load screen*
  - “heading level 1 We could not reach the server just now.”
  - “There was a problem reaching Certainty Sessions. Check your connection and try again.”
  - “link Try again”

- *VO-Space on Try again with the server back*
  - “Loaded. Sunday, November 1, 1:00 PM – 3:00 PM ET, By phone · Launch email sequence. article Loaded. Sunday, November 1, 1:00 PM – 3:00 PM ET, By phone · Launch email sequence. group”

- *after recovery*
  - record: `{"activatedBy": "VoiceOver", "focusAfter": "cs-next-when", "status": "Certainty Sessions loaded."}`

- *VO-Right after recovery*
  - “Sunday, November 1”
  - “1:00 PM – 3:00 PM ET”
  - “By phone · Launch email sequence”
  - “end of Loaded. Sunday, November 1, 1:00 PM – 3:00 PM ET, By phone · Launch email sequence. group”

#### load-error-first

- *VO-Right through the failed-load screen*
  - “heading level 1 We could not reach the server just now.”
  - “There was a problem reaching Certainty Sessions. Check your connection and try again.”
  - “link Try again”

- *VO-Space on Try again with the server back*
  - “Certainty Sessions loaded. application status main”

- *after recovery*
  - record: `{"activatedBy": "VoiceOver", "focusAfter": "cs-session-msg", "status": "Certainty Sessions loaded."}`

- *VO-Right after recovery*
  - “Start with one thing you are stuck on. article”
  - “YOUR FIRST SESSION”
  - “heading level 2 Start with one thing you are stuck on.”
  - “This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.”

### Production

Production serves this fix (deployment dpl_6Dhr2vUXEtLpA972vr2PrKdDu4xn, READY, commit bea337d; the served page carries the dialog markup and the Loaded recovery). A signed-in production VoiceOver pass was not run. The only signed-in browser on this Mac is Chrome on David's own account, which has no booked session, so Cancel and Reschedule do not exist there, and booking one would send real invites. The entitled test member is not signed in anywhere, and this lane does not type production credentials. The one dialog David's account can open is Delete past sessions; opening it on his real data was refused by the run's permission check and stopped before VoiceOver activated anything. Nothing on production was changed.

### Limits

- Harness only. NVDA and iOS VoiceOver are still unheard.
- Escape is a Playwright keypress into the page, the same key a VoiceOver user presses; VoiceOver's own speech after it is what is recorded.

## Real VoiceOver pass (2026-10-29, evening Eastern)

Reader: VoiceOver (macOS 26.2). Browser: WebKit 27.2, a visible window driven by `scripts/sim/certainty-voiceover.mjs`. VoiceOver was driven over AppleScript (VO-Right to read, VO-Space to activate, keyboard focus moved by the harness), and every line below is VoiceOver's own `last phrase`, sampled every 200 ms. Same stubbed world as the walk: 0 requests refused, none reached David's calendar or inbox. Raw record: `docs/certainty-walk/voiceover.json`.

### What VoiceOver tripped on, and what changed

From the run before the fixes, the same night:

1. **A refused cancel was silent.** VO-Space on Cancel, server refuses: VoiceOver said only "Certainty Sessions | The Momentum Hub web content. You are currently in a window." The Cancel button is re-rendered away and the role=alert text was lost behind the focus drop. Fixed: the outcome message takes focus. Now: "Could not cancel that session. Your session is still booked. Try again in a moment, or email David at email@davidbee.me. alert".
2. **A booking never said it was booked.** After Confirm VoiceOver said "Saturday, October 31 and 2 more items group article": a date, not an outcome. Fixed: the focused session card is named with the outcome. Now: "Booked. Saturday, October 31, 10:00 AM – 12:00 PM ET, By phone · Fix my funnel." Saving an edit now says "Saved. …".
3. **A cancel never said it was cancelled.** Focus went to the first-session heading. Now: "Session cancelled. That time is open again."
4. **The first fix read the date run together** ("October 3110:00 AM") because the label used raw textContent. Fixed by joining day, time and mode with commas; the rerun confirms it.
5. **Load-error recovery** hid the gate under focus and put focus nowhere. Focus now returns to the session card once the page loads. Not confirmed by ear: in this harness VoiceOver stayed on the gate paragraph instead of following focus to the retry link, and said nothing new after recovery.

### Transcript after the fixes

#### first-visit

- *focus lands on the primary action*
  - “Book my first session button Start with one thing you are stuck on. article”

- *VO to the first item*
  - “YOUR FIRST SESSION”
  - “You are currently on a selectable text.”

- *VO-Right through the first-visit screen*
  - “heading level 2 Start with one thing you are stuck on.”
  - “This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.”
  - “One session is included every week. Pick any open time below.”
  - “Before. Pick a time and write one line about what is stuck. That is all the preparation there is.”
  - “During. Two hours with David. You work the thing together until it moves.”
  - “After. You leave with one next step, and this page asks what you will put into practice before next week.”
  - “Book my first session button”

- *focus the primary action*
  - “Book my first session button”
  - “You are currently on a button. To click this button, press Control-Option-Space.”

#### book

- *VO-Space on "Book my first session"*
  - “heading level 2 Choose your time main”
  - “You are currently on a heading level 2.”

- *VO-Right through the picker*
  - “Close button”
  - “One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday.”
  - “You are currently on a selectable text.”
  - “Pick a day”
  - “FRI 30 Oct toggle button”
  - “SAT 31 Oct toggle button”
  - “SUN 1 Nov toggle button”
  - “MON 2 Nov toggle button”
  - “TUE 3 Nov toggle button”
  - “WED 4 Nov toggle button”
  - “THU 5 Nov toggle button”
  - “FRI 6 Nov toggle button”
  - “SAT 7 Nov toggle button”
  - “SUN 8 Nov toggle button”

- *focus the second day*
  - “SAT 31 Oct toggle button”
  - “You are currently on a toggle button. To select or deselect this checkbox, press Control-Option-Space.”

- *VO-Space on that day*
  - “SAT 31 Oct selected toggle button”
  - “You are currently on a toggle button. To select or deselect this checkbox, press Control-Option-Space.”

- *focus the first open time*
  - “10:00 AM ET toggle button”
  - “You are currently on a toggle button. To select or deselect this checkbox, press Control-Option-Space.”

- *VO-Space on that time*
  - “10:00 AM ET, selected selected toggle button”
  - “You are currently on a toggle button. To select or deselect this checkbox, press Control-Option-Space.”

- *type a topic*
  - “l”
  - “funnel”

- *focus Confirm*
  - “Confirm session button”
  - “You are currently on a button. To click this button, press Control-Option-Space.”

- *VO-Space on Confirm: what is announced after booking*
  - “Booked. Saturday, October 31, 10:00 AM – 12:00 PM ET, By phone · Fix my funnel. article Booked. Saturday, October 31, 10:00 AM – 12:00 PM ET, By phone · Fix my funnel. group”

#### booked

- *focus Edit session on the booked card*
  - “Edit session button”
  - “You are currently on a button. To click this button, press Control-Option-Space.”

- *VO-Right after the booked card actions*
  - “Reschedule button”
  - “Add to my calendar button”
  - “Cancel button”
  - “Your time is held for you. David has not confirmed it on his calendar yet, and he will confirm with you before the session.”
  - “Before. Pick a time and write one line about what is stuck. That is all the preparation there is.”
  - “During. Two hours with David. You work the thing together until it moves.”
  - “After. You leave with one next step, and this page asks what you will put into practice before next week.”
  - “end of article”

#### edit

- *focus Edit session*
  - “Edit session button Edit session article”
  - “You are currently on a button. To click this button, press Control-Option-Space.”

- *VO-Space on Edit session*
  - “heading level 2 Edit your session main”
  - “You are currently on a heading level 2.”

- *retype the topic*
  - “o”
  - “two”

- *focus the save button*
  - “Save changes button”
  - “You are currently on a button. To click this button, press Control-Option-Space.”

- *VO-Space on save: what is announced after the edit*
  - “Saved. Saturday, October 31, 10:00 AM – 12:00 PM ET, By phone · Fix my funnel, part two. article Saved. Saturday, October 31, 10:00 AM – 12:00 PM ET, By phone · Fix my funnel, part two. group”

#### cancel

- *focus Cancel*
  - “Cancel button”
  - “You are currently on a button. To click this button, press Control-Option-Space.”

- *VO-Space on Cancel (the confirm dialog is accepted by the harness)*
  - “Session cancelled. That time is open again. application status main”
  - “You are currently in a window.”

#### errors

- *focus Confirm with the network about to drop*
  - “Confirm session button”
  - “You are currently on a button. To click this button, press Control-Option-Space.”

- *VO-Space on Confirm: network drop*
  - “Something interrupted the booking. Try again.”

- *focus Confirm again*
  - “Confirm session button”

- *VO-Space on Confirm: someone took the time*
  - “Someone just took that time. Pick another open slot.”

#### cancel-error

- *focus Cancel on a booked session*
  - “Cancel button Cancel article”
  - “You are currently on a button. To click this button, press Control-Option-Space.”

- *VO-Space on Cancel: the server refuses*
  - “Could not cancel that session. Your session is still booked. Try again in a moment, or email David at email@davidbee.me. alert main”

#### load-error

- *focus the retry button on a failed load*
  - “You are currently on a link. To click this link, press Control-Option-Space.”

- *VO-Left from the retry button*
  - “There was a problem reaching Certainty Sessions. Check your connection and try again.”

- *Try again (clicked by the harness) with the server back*
  - “There was a problem reaching Certainty Sessions. Check your connection and try again.”
  - “You are currently on a selectable text.”

### Limits

- The native confirm() dialogs for Cancel and Reschedule are accepted by the harness, so what VoiceOver says on those dialogs was not heard.
- Typed characters were echoed only in part (“l”, “funnel”) because the harness types faster than VoiceOver speaks.
- One VoiceOver build, one WebKit build, desktop width, light theme. NVDA and iOS VoiceOver were not run.

---

## chromium

Browser: `chromium`. Captured from the rendered accessibility tree; every network call was stubbed.

**Limit:** this is an accessibility-tree inspection, not a real VoiceOver session. It proves roles, names, selected state, live-region wiring and heading structure, not every spoken behavior of a particular screen reader.

## first-visit

Screenshot: `not captured`  
Transcript: `a11y/first-visit.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## picker

Screenshot: `not captured`  
Transcript: `a11y/picker.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov"
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - paragraph: Pick a day to see open times.
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere" [checked]:
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you":
      - img
      - strong: Phone
      - text: David calls you
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
  - button "Confirm session":
    - text: Confirm session
    - img
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## mode-choice

Screenshot: `not captured`  
Transcript: `a11y/mode-choice.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET, selected" [pressed]: 10:00 AM ET
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere" [checked]:
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you":
      - img
      - strong: Phone
      - text: David calls you
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
  - button "Confirm session":
    - text: Confirm session
    - img
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## confirm

Screenshot: `not captured`  
Transcript: `a11y/confirm.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET, selected" [pressed]: 10:00 AM ET
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere":
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you" [checked]:
      - img
      - strong: Phone
      - text: David calls you
  - text: Your phone number
  - textbox "Your phone number":
    - /placeholder: (555) 123-4567
    - text: (555) 010-2030
  - paragraph: Used only so David can call you for this session.
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
    - text: Screen reader booking
  - button "Confirm session":
    - text: Confirm session
    - img
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## booked

Screenshot: `not captured`  
Transcript: `a11y/booked.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - group "Booked. Sunday, November 1, 9:00 AM – 11:00 AM ET, By phone · Screen reader booking.":
      - img
      - text: Sunday, November 1 9:00 AM – 11:00 AM ET
      - img
      - text: By phone · Screen reader booking
    - img
    - text: David calls (555) 010-2030
    - button "Edit session":
      - img
      - text: Edit session
    - button "Reschedule":
      - img
      - text: Reschedule
    - button "Add to my calendar":
      - img
      - text: Add to my calendar
    - button "Cancel":
      - img
      - text: Cancel
    - img
    - text: Your time is held for you. David has not confirmed it on his calendar yet, and he will confirm with you before the session.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## edit

Screenshot: `not captured`  
Transcript: `a11y/edit.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Edit your session” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - group "Booked. Sunday, November 1, 9:00 AM – 11:00 AM ET, By phone · Screen reader booking.":
      - img
      - text: Sunday, November 1 9:00 AM – 11:00 AM ET
      - img
      - text: By phone · Screen reader booking
    - img
    - text: David calls (555) 010-2030
    - button "Edit session":
      - img
      - text: Edit session
    - button "Reschedule":
      - img
      - text: Reschedule
    - button "Add to my calendar":
      - img
      - text: Add to my calendar
    - button "Cancel":
      - img
      - text: Cancel
    - img
    - text: Your time is held for you. David has not confirmed it on his calendar yet, and he will confirm with you before the session.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Edit your session" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET"
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere":
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you" [checked]:
      - img
      - strong: Phone
      - text: David calls you
  - text: Your phone number
  - textbox "Your phone number":
    - /placeholder: (555) 123-4567
    - text: (555) 010-2030
  - paragraph: Used only so David can call you for this session.
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
    - text: Screen reader booking
  - button "Save changes":
    - text: Save changes
    - img
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## cancel

Screenshot: `not captured`  
Transcript: `a11y/cancel.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - status: Session cancelled. That time is open again.
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## lapsed

Screenshot: `not captured`  
Transcript: `a11y/lapsed.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Your seat with David is still here.” → h2 “Your session on Wednesday, September 30, 2026 is complete.” → h2 “2 sessions with David” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Welcome back
    - heading "Your seat with David is still here." [level=2]
    - paragraph:
      - text: Your last session was September 30, about 4 weeks ago, when you brought
      - strong: Pricing page rewrite
      - text: . However those weeks went, that is a fine place to pick back up. Bring where it landed, or whatever is in the way now.
    - paragraph: Your weekly session is still included, and this week's is open.
    - button "Pick a time this week":
      - img
      - text: Pick a time this week
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - region "After your session":
    - paragraph: After your session
    - heading "Your session on Wednesday, September 30, 2026 is complete." [level=2]
    - paragraph: What is one thing you want to put into practice before your next session?
  - paragraph: Your sessions so far
  - heading "2 sessions with David" [level=2]
  - paragraph: Every week your membership includes is one of these.
  - text: "0 sessions this month 2 sessions since joining (September 2026) Topics brought over time: Pricing page rewrite Getting started"
  - list:
    - listitem:
      - img
      - text: Wednesday, September 30, 2026
      - img
      - text: By phone · Pricing page rewrite 11:00 PM – 1:00 AM ET
    - listitem:
      - img
      - text: Wednesday, September 23, 2026
      - img
      - text: First session milestone
      - img
      - text: On Zoom · Getting started 11:00 PM – 1:00 AM ET
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## ended

Screenshot: `not captured`  
Transcript: `a11y/ended.yml`

Heading outline: h1 “Your Certainty Sessions membership has ended.”

```yaml
- main:
  - text: CS
  - heading "Your Certainty Sessions membership has ended." [level=1]
  - paragraph:
    - text: "Booking is closed. Your past sessions are kept on your account, so if you come back they are still here. How to come back: email David at"
    - link "email@davidbee.me":
      - /url: mailto:email@davidbee.me
    - text: or return to My Studio.
  - link "Return to My Studio":
    - /url: /
    - text: Return to My Studio
    - img
```

## signed-out-gate

Screenshot: `not captured`  
Transcript: `a11y/signed-out-gate.yml`

Heading outline: h1 “Sign in to enter Certainty Sessions.”

```yaml
- main:
  - text: CS
  - heading "Sign in to enter Certainty Sessions." [level=1]
  - paragraph: Use the Studio email connected to your membership.
  - link "Go to Studio sign in":
    - /url: /?access=certainty
    - text: Go to Studio sign in
    - img
```

## server-error-gate

Screenshot: `not captured`  
Transcript: `a11y/server-error-gate.yml`

Heading outline: h1 “We could not reach the server just now.”

```yaml
- main:
  - text: CS
  - heading "We could not reach the server just now." [level=1]
  - paragraph: There was a problem reaching Certainty Sessions. Check your connection and try again.
  - link "Try again":
    - /url: "#"
    - text: Try again
    - img
```

## network-error

Screenshot: `not captured`  
Transcript: `a11y/network-error.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET, selected" [pressed]: 10:00 AM ET
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere" [checked]:
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you":
      - img
      - strong: Phone
      - text: David calls you
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
  - button "Confirm session":
    - text: Confirm session
    - img
  - alert: Something interrupted the booking. Try again.
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## slot-taken

Screenshot: `not captured`  
Transcript: `a11y/slot-taken.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET, selected" [pressed]: 10:00 AM ET
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere" [checked]:
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you":
      - img
      - strong: Phone
      - text: David calls you
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
  - button "Confirm session":
    - text: Confirm session
    - img
  - alert: Someone just took that time. Pick another open slot.
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```


---

## webkit

Browser: `webkit`. Captured from the rendered accessibility tree; every network call was stubbed.

**Limit:** this is an accessibility-tree inspection, not a real VoiceOver session. It proves roles, names, selected state, live-region wiring and heading structure, not every spoken behavior of a particular screen reader.

## first-visit

Screenshot: `not captured`  
Transcript: `a11y/first-visit.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## picker

Screenshot: `not captured`  
Transcript: `a11y/picker.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov"
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - paragraph: Pick a day to see open times.
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere" [checked]:
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you":
      - img
      - strong: Phone
      - text: David calls you
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
  - button "Confirm session":
    - text: Confirm session
    - img
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## mode-choice

Screenshot: `not captured`  
Transcript: `a11y/mode-choice.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET, selected" [pressed]: 10:00 AM ET
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere" [checked]:
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you":
      - img
      - strong: Phone
      - text: David calls you
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
  - button "Confirm session":
    - text: Confirm session
    - img
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## confirm

Screenshot: `not captured`  
Transcript: `a11y/confirm.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET, selected" [pressed]: 10:00 AM ET
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere":
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you" [checked]:
      - img
      - strong: Phone
      - text: David calls you
  - text: Your phone number
  - textbox "Your phone number":
    - /placeholder: (555) 123-4567
    - text: (555) 010-2030
  - paragraph: Used only so David can call you for this session.
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
    - text: Screen reader booking
  - button "Confirm session":
    - text: Confirm session
    - img
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## booked

Screenshot: `not captured`  
Transcript: `a11y/booked.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - group "Booked. Sunday, November 1, 9:00 AM – 11:00 AM ET, By phone · Screen reader booking.":
      - img
      - text: Sunday, November 1 9:00 AM – 11:00 AM ET
      - img
      - text: By phone · Screen reader booking
    - img
    - text: David calls (555) 010-2030
    - button "Edit session":
      - img
      - text: Edit session
    - button "Reschedule":
      - img
      - text: Reschedule
    - button "Add to my calendar":
      - img
      - text: Add to my calendar
    - button "Cancel":
      - img
      - text: Cancel
    - img
    - text: Your time is held for you. David has not confirmed it on his calendar yet, and he will confirm with you before the session.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## edit

Screenshot: `not captured`  
Transcript: `a11y/edit.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Edit your session” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - group "Booked. Sunday, November 1, 9:00 AM – 11:00 AM ET, By phone · Screen reader booking.":
      - img
      - text: Sunday, November 1 9:00 AM – 11:00 AM ET
      - img
      - text: By phone · Screen reader booking
    - img
    - text: David calls (555) 010-2030
    - button "Edit session":
      - img
      - text: Edit session
    - button "Reschedule":
      - img
      - text: Reschedule
    - button "Add to my calendar":
      - img
      - text: Add to my calendar
    - button "Cancel":
      - img
      - text: Cancel
    - img
    - text: Your time is held for you. David has not confirmed it on his calendar yet, and he will confirm with you before the session.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Edit your session" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET"
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere":
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you" [checked]:
      - img
      - strong: Phone
      - text: David calls you
  - text: Your phone number
  - textbox "Your phone number":
    - /placeholder: (555) 123-4567
    - text: (555) 010-2030
  - paragraph: Used only so David can call you for this session.
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
    - text: Screen reader booking
  - button "Save changes":
    - text: Save changes
    - img
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## cancel

Screenshot: `not captured`  
Transcript: `a11y/cancel.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - status: Session cancelled. That time is open again.
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## lapsed

Screenshot: `not captured`  
Transcript: `a11y/lapsed.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Your seat with David is still here.” → h2 “Your session on Wednesday, September 30, 2026 is complete.” → h2 “2 sessions with David” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Welcome back
    - heading "Your seat with David is still here." [level=2]
    - paragraph:
      - text: Your last session was September 30, about 4 weeks ago, when you brought
      - strong: Pricing page rewrite
      - text: . However those weeks went, that is a fine place to pick back up. Bring where it landed, or whatever is in the way now.
    - paragraph: Your weekly session is still included, and this week's is open.
    - button "Pick a time this week":
      - img
      - text: Pick a time this week
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - region "After your session":
    - paragraph: After your session
    - heading "Your session on Wednesday, September 30, 2026 is complete." [level=2]
    - paragraph: What is one thing you want to put into practice before your next session?
  - paragraph: Your sessions so far
  - heading "2 sessions with David" [level=2]
  - paragraph: Every week your membership includes is one of these.
  - text: "0 sessions this month 2 sessions since joining (September 2026) Topics brought over time: Pricing page rewrite Getting started"
  - list:
    - listitem:
      - img
      - text: Wednesday, September 30, 2026
      - img
      - text: By phone · Pricing page rewrite 11:00 PM – 1:00 AM ET
    - listitem:
      - img
      - text: Wednesday, September 23, 2026
      - img
      - text: First session milestone
      - img
      - text: On Zoom · Getting started 11:00 PM – 1:00 AM ET
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## ended

Screenshot: `not captured`  
Transcript: `a11y/ended.yml`

Heading outline: h1 “Your Certainty Sessions membership has ended.”

```yaml
- main:
  - text: CS
  - heading "Your Certainty Sessions membership has ended." [level=1]
  - paragraph:
    - text: "Booking is closed. Your past sessions are kept on your account, so if you come back they are still here. How to come back: email David at"
    - link "email@davidbee.me":
      - /url: mailto:email@davidbee.me
    - text: or return to My Studio.
  - link "Return to My Studio":
    - /url: /
    - text: Return to My Studio
    - img
```

## signed-out-gate

Screenshot: `not captured`  
Transcript: `a11y/signed-out-gate.yml`

Heading outline: h1 “Sign in to enter Certainty Sessions.”

```yaml
- main:
  - text: CS
  - heading "Sign in to enter Certainty Sessions." [level=1]
  - paragraph: Use the Studio email connected to your membership.
  - link "Go to Studio sign in":
    - /url: /?access=certainty
    - text: Go to Studio sign in
    - img
```

## server-error-gate

Screenshot: `not captured`  
Transcript: `a11y/server-error-gate.yml`

Heading outline: h1 “We could not reach the server just now.”

```yaml
- main:
  - text: CS
  - heading "We could not reach the server just now." [level=1]
  - paragraph: There was a problem reaching Certainty Sessions. Check your connection and try again.
  - link "Try again":
    - /url: "#"
    - text: Try again
    - img
```

## network-error

Screenshot: `not captured`  
Transcript: `a11y/network-error.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET, selected" [pressed]: 10:00 AM ET
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere" [checked]:
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you":
      - img
      - strong: Phone
      - text: David calls you
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
  - button "Confirm session":
    - text: Confirm session
    - img
  - alert: Something interrupted the booking. Try again.
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

## slot-taken

Screenshot: `not captured`  
Transcript: `a11y/slot-taken.yml`

Heading outline: h1 “One private working session with David, every week.” → h2 “Start with one thing you are stuck on.” → h2 “Choose your time” → h2 “Your settings” → h2 “What happens if you miss a week, drift off, or leave.” → h3 “You miss a week” → h3 “You stop booking for a while” → h3 “You need a different time” → h3 “Your membership ends”

```yaml
- banner:
  - link "CS Certainty Sessions":
    - /url: /
    - text: CS
    - strong: Certainty Sessions
  - link "My Studio":
    - /url: /
    - img
  - button "Change color theme":
    - img
  - button "Account menu"
- main:
  - paragraph: Certainty Sessions
  - heading "One private working session with David, every week." [level=1]
  - paragraph: Pick a time, bring whatever you are stuck on, and stay with it until it clears. Two hours, one-on-one, on Zoom or by phone.
  - img
  - text: Membership active
  - article:
    - paragraph: Your first session
    - heading "Start with one thing you are stuck on." [level=2]
    - paragraph: This is two hours, one-on-one with David, on Zoom or by phone. Bring the problem that keeps stalling you, a page, a launch, a decision, and you work on it together until it moves. Nothing to prepare beyond that.
    - paragraph: One session is included every week. Pick any open time below.
    - list:
      - listitem:
        - img
        - strong: Before.
        - text: Pick a time and write one line about what is stuck. That is all the preparation there is.
      - listitem:
        - img
        - strong: During.
        - text: Two hours with David. You work the thing together until it moves.
      - listitem:
        - img
        - strong: After.
        - text: You leave with one next step, and this page asks what you will put into practice before next week.
    - button "Book my first session":
      - img
      - text: Book my first session
  - article:
    - text: DB
    - strong: Bring your real stuff.
    - paragraph: We open it up, work through it together, and make real progress on whatever you are stuck on. No prep deck, no polish. Just the thing that is actually in your way.
    - paragraph: David Bee
  - paragraph: Book a session
  - heading "Choose your time" [level=2]
  - button "Close":
    - img
    - text: Close
  - img
  - text: One session per calendar week, Monday to Sunday Eastern. Sessions reset every Monday. 1 Pick a day
  - button "Sat 31 Oct"
  - button "Sun 1 Nov" [pressed]
  - button "Mon 2 Nov"
  - button "Tue 3 Nov"
  - button "Wed 4 Nov"
  - button "Thu 5 Nov"
  - button "Fri 6 Nov"
  - button "Sat 7 Nov"
  - button "Sun 8 Nov"
  - button "Mon 9 Nov"
  - button "Tue 10 Nov"
  - button "Wed 11 Nov"
  - button "Thu 12 Nov"
  - text: 2 Pick a time (2 hours, with Eastern time alongside)
  - button "10:00 AM ET, selected" [pressed]: 10:00 AM ET
  - button "11:00 AM ET"
  - button "12:00 PM ET"
  - button "1:00 PM ET"
  - button "2:00 PM ET"
  - button "3:00 PM ET"
  - button "4:00 PM ET"
  - button "5:00 PM ET"
  - button "6:00 PM ET"
  - button "7:00 PM ET"
  - button "8:00 PM ET"
  - button "9:00 PM ET"
  - button "10:00 PM ET"
  - text: 3 How do you want to meet?
  - radiogroup "How you want to meet":
    - radio "Zoom Join from anywhere" [checked]:
      - img
      - strong: Zoom
      - text: Join from anywhere
    - radio "Phone David calls you":
      - img
      - strong: Phone
      - text: David calls you
  - text: What would you like some support with on this session? (optional)
  - textbox "What would you like some support with on this session? (optional)":
    - /placeholder: e.g. Fixing my email automation
  - button "Confirm session":
    - text: Confirm session
    - img
  - alert: Someone just took that time. Pick another open slot.
  - paragraph: Preferences
  - heading "Your settings" [level=2]
  - paragraph: Save your session preferences once so booking is faster each week.
  - text: Time zone
  - combobox "Time zone":
    - option "Eastern Time (ET) - US & Canada" [selected]
    - option "Central Time (CT) - US & Canada"
    - option "Mountain Time (MT) - US & Canada"
    - option "Arizona (MST, no DST)"
    - option "Pacific Time (PT) - US & Canada"
    - option "Alaska Time (AKT)"
    - option "Hawaii Time (HST)"
    - option "London / UK / Ireland (GMT/BST)"
    - option "Central European Time (CET/CEST)"
    - option "Sydney / Melbourne (AEST/AEDT)"
    - option "Perth (AWST)"
    - option "Auckland / New Zealand (NZST/NZDT)"
  - paragraph: Shows session times in your local time zone while keeping David's Eastern time visible alongside.
  - text: Default meeting format
  - combobox "Default meeting format":
    - option "Zoom (video)" [selected]
    - option "Phone (David calls you)"
  - paragraph: Prefills whether you usually meet on Zoom or by phone on new bookings.
  - text: Remembered phone number (for phone sessions) No phone number on file yet.
  - textbox "Remembered phone number (for phone sessions)":
    - /placeholder: (555) 123-4567
  - paragraph: Remembered and prefilled when you choose phone sessions so you do not have to type it every time.
  - paragraph: David uses this number only to call you for phone sessions. It stays with your account, is never used for marketing or shared with anyone else, and clearing this field and saving removes it.
  - button "Save settings":
    - img
    - text: Save settings
  - group:
    - strong: How this works
    - text: Missed weeks, rescheduling, privacy, and what happens when membership ends. +
```

