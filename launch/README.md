# 777 September 2026 Launch

This directory is the operating source for the September 7, 2026 cycle. Systeme remains the public funnel, registration, checkout, and email platform. Colorado Mastermind Studio remains the authenticated product home.

## Canonical Dates

All launch states use `America/Denver`.

| Date | State |
| --- | --- |
| September 7, 11:00 AM | Kickoff and Video 1 |
| September 8-13 | Videos 2-7 |
| September 14 | Catch-up and Graduation reminder |
| September 15, 11:00 AM | Graduation and EEE founders cart open |
| September 16-18 | Replay, FAQ, and decision support |
| September 19, 11:59 PM | EEE founders cart close |

The browser-side cycle controller is [`js/777-launch-cycle.js`](../js/777-launch-cycle.js). Update its configuration once per monthly cycle. It controls page-state visibility but never grants access.

## Public Routes

- Challenge opt-in: `https://content.coloradomastermind.com/777`
- Kickoff registration: `https://content.coloradomastermind.com/kickoff`
- Kickoff confirmation: `https://content.coloradomastermind.com/kickoff-confirmed`
- Graduation registration: `https://content.coloradomastermind.com/graduation`
- Graduation confirmation: `https://content.coloradomastermind.com/graduation-confirmed`
- SeenInSeven Studio: `https://studio.coloradomastermind.com/seeninseven`
- EEE Studio: `https://studio.coloradomastermind.com/eee`
- Certainty Sessions: `https://calendly.com/davidbee`

## Product Routes

Systeme purchase access is granted only by immutable price-plan ID.

| Product | Price plan | Studio access |
| --- | ---: | --- |
| 777 Challenge | `3122070` | SeenInSeven |
| EEE Founders | `3134754` | EEE and AI Boardroom |

The webhook endpoint is `POST https://studio.coloradomastermind.com/api/systeme-webhook`. It verifies Systeme's HMAC signature against the raw request, records every message ID, and calls the source-aware Supabase access layer. Refunds and cancellations can revoke only grants created by the matching purchase.

## Systeme Tags

- `777 - Interest`
- `777 - Purchase`
- `777 - Kickoff Registered`
- `777 - Graduation Registered`
- `777 - Graduation Attended`
- `EEE - Purchase`
- `EEE - Canceled`
- `777 - 2026-09 Participant`

## Source Ownership

- `funnel-pages/`: canonical custom-code sections for Systeme pages.
- `funnel-pages/backups/2026-08-06-live/`: untouched pre-launch live-page backup.
- `launch/email-copy.md`: approved sequence copy and audience rules.
- `launch/operator-checklist.md`: live operating sequence.
- `launch/rehearsal-checklist.md`: acceptance test record.
- `launch/decks/`: Kickoff and Graduation presentations.

Zoom room and replay URLs are deliberately not invented. Add the real URLs to `js/777-launch-cycle.js`, the confirmation pages, email drafts, and presentations when the meetings exist.
