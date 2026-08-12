# 777 Launch Operator Checklist

> **Archived reference.** The September group cycle is deferred during private Tiny Challenge validation. Do not execute this checklist until a new group cycle is approved after the 10-run and 5-enrollment proof gates.

## Once Per Cycle

- [ ] Set the next cycle dates in `js/777-launch-cycle.js` using Mountain Time.
- [ ] Update the public page dates, email dates, and both presentation title slides.
- [ ] Confirm the `$7` 777 price plan and `$77/month` EEE founders plan IDs have not changed.
- [ ] Confirm the Systeme webhook still subscribes to `New sale` and `Sale canceled`.
- [ ] Confirm the webhook signing secret matches Vercel `SYSTEME_WEBHOOK_SECRET`.
- [ ] Confirm Kickoff and Graduation Zoom room URLs.
- [ ] Send a registration test through each event form and confirm both tags.

## Before September 7

- [ ] Keep all Day 1-7 pages public.
- [ ] Publish the Kickoff registration state at `/kickoff`.
- [ ] Confirm the Kickoff confirmation page reveals the Zoom room only after registration.
- [ ] Open the `$7` 777 checkout.
- [ ] Keep the `$77` EEE checkout closed.
- [x] Run a real `$7` purchase with a fresh email. Verified August 9, 2026
- [ ] Confirm purchase email, Studio pre-enrollment, magic-link entry, and SeenInSeven access.
- [ ] Confirm a public visitor cannot reach paid Studio tools.

## September 7 Kickoff

- [ ] Open the Zoom room by 10:45 AM Mountain Time.
- [ ] Deliver the Day 1 deck.
- [ ] Demonstrate SeenInSeven with a non-admin test account.
- [ ] Post the Day 1 public page and Video 1 instruction.
- [ ] Record the live session.
- [ ] After the event, replace registration with the Kickoff replay state.

## September 8-14

- [ ] Advance the public challenge page each morning.
- [ ] Send the daily prospect and purchaser emails.
- [ ] Keep Studio access instructions out of prospect emails.
- [ ] Publish the September 14 catch-up and Graduation reminder.
- [ ] Hide the Kickoff replay before Graduation opens.

## September 15 Graduation

- [ ] Open the `$77/month` EEE founders checkout before the live invitation.
- [ ] Confirm `/yeees` shows the open-cart state.
- [ ] Open Zoom by 10:45 AM Mountain Time.
- [ ] Deliver the Graduation deck and demonstrate all five EEE components.
- [ ] Tag verified attendees `777 - Graduation Attended`.
- [ ] Record the live session.
- [ ] Replace Graduation registration with the replay state.

## September 16-18

- [ ] Send replay and FAQ.
- [ ] Send decision-support email.
- [ ] Send the 24-hour warning on September 18.
- [ ] Confirm the checkout remains available and the founders price is `$77/month`.

## September 19 Close

- [ ] Send the final-day email.
- [ ] Close the `$77/month` checkout at 11:59 PM Mountain Time.
- [ ] Confirm `/yeees` shows the closed state.
- [ ] Remove expired purchase buttons from public pages.
- [ ] Hide the Graduation replay.
- [ ] Confirm existing EEE members retain access.
- [ ] Export purchase, cancellation, and webhook status for the cycle archive.

## Recovery

- [ ] Use Studio Admin webhook history to identify failed or ignored events.
- [ ] Retry only after the underlying configuration is corrected; message IDs are duplicate-safe.
- [ ] Never repair a refund by removing the member's manual or beta grants.
- [ ] Restore a Systeme custom-code block from `funnel-pages/backups/2026-08-06-live/` if a live edit regresses.
