# Certainty: what a screen reader hears

Browser: `webkit`. Captured from the rendered accessibility tree; every network call was stubbed.

**Limit:** this is an accessibility-tree inspection, not a real VoiceOver session. It proves roles, names, selected state, live-region wiring and heading structure, not every spoken behavior of a particular screen reader.

## first-visit

Screenshot: `docs/certainty-walk/webkit/shots/084-a11y-first-visit.jpg`  
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

Screenshot: `docs/certainty-walk/webkit/shots/085-a11y-picker.jpg`  
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
  - button "Fri 30 Oct"
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

Screenshot: `docs/certainty-walk/webkit/shots/086-a11y-mode-choice.jpg`  
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
  - button "Fri 30 Oct"
  - button "Sat 31 Oct" [pressed]
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

Screenshot: `docs/certainty-walk/webkit/shots/087-a11y-confirm.jpg`  
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
  - button "Fri 30 Oct"
  - button "Sat 31 Oct" [pressed]
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

Screenshot: `docs/certainty-walk/webkit/shots/088-a11y-booked.jpg`  
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
    - group "Booked. Saturday, October 31, 10:00 AM – 12:00 PM ET, By phone · Screen reader booking.":
      - img
      - text: Saturday, October 31 10:00 AM – 12:00 PM ET
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

Screenshot: `docs/certainty-walk/webkit/shots/089-a11y-edit.jpg`  
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
    - group "Booked. Saturday, October 31, 10:00 AM – 12:00 PM ET, By phone · Screen reader booking.":
      - img
      - text: Saturday, October 31 10:00 AM – 12:00 PM ET
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
  - button "Fri 30 Oct"
  - button "Sat 31 Oct" [pressed]
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

Screenshot: `docs/certainty-walk/webkit/shots/090-a11y-cancel.jpg`  
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

Screenshot: `docs/certainty-walk/webkit/shots/091-a11y-lapsed.jpg`  
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
      - text: By phone · Pricing page rewrite 10:00 AM – 12:00 PM ET
    - listitem:
      - img
      - text: Wednesday, September 23, 2026
      - img
      - text: First session milestone
      - img
      - text: On Zoom · Getting started 10:00 AM – 12:00 PM ET
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

Screenshot: `docs/certainty-walk/webkit/shots/092-a11y-ended.jpg`  
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

Screenshot: `docs/certainty-walk/webkit/shots/093-a11y-signed-out-gate.jpg`  
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

Screenshot: `docs/certainty-walk/webkit/shots/094-a11y-server-error-gate.jpg`  
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

Screenshot: `docs/certainty-walk/webkit/shots/095-a11y-network-error.jpg`  
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
  - button "Fri 30 Oct"
  - button "Sat 31 Oct" [pressed]
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

Screenshot: `docs/certainty-walk/webkit/shots/096-a11y-slot-taken.jpg`  
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
  - button "Fri 30 Oct"
  - button "Sat 31 Oct" [pressed]
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
