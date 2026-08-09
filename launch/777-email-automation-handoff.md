# 777 Systeme Email And Participation Handoff

Last updated: August 7, 2026

## Purpose

This document is the operating and developer handoff for the 777 Systeme email and participation system. Systeme is the contact, email, monthly broadcast, refund, and participation authority. Studio remains the access authority through its existing signed webhook.

No SeenInSeven prompt, script, regeneration, loading-screen, interface, or story architecture was changed during this work.

## Current Status

The tagging model and seven workflow structures now exist in Systeme. Purchase state, refund state, Day 1, and Day 7 tag-only workflows are active. Email-bearing workflows remain paused because Systeme's sender selector is empty inside both campaigns and workflow emails, even though `email@davidbee.me` appears as a verified email address in account settings.

Do not activate the purchase, abandonment, or prospect-welcome workflows until a sender address can be selected and every draft email has been reviewed.

The custom sending-domain list is also empty. SPF, DKIM, and DMARC therefore remain a launch deliverability blocker.

## Live Customer URLs

| Destination | URL | Notes |
| --- | --- | --- |
| 777 opt-in | https://content.coloradomastermind.com/777 | Applies the Interest tag through the existing automation rule. |
| 777 checkout | https://content.coloradomastermind.com/777challenge | Public $7 checkout. |
| Buyer start page | https://content.coloradomastermind.com/startnow | Checkout redirect; sends purchasers to Studio. |
| Studio | https://studio.coloradomastermind.com | Secure application and access authority. |
| Systeme workflows | https://systeme.io/dashboard/workflows | All workflow structures listed below. |
| Systeme tags | https://systeme.io/dashboard/tags | Account is currently at its tag limit. |

Kickoff and Graduation remain public pages in separate funnel containers. They no longer require separate registration in the planned customer journey.

## Systeme Resource IDs

### Funnels And Checkout

| Resource | ID |
| --- | ---: |
| 777Challenge funnel | `6979185` |
| Opt-in step | `23988253` |
| Checkout page | `39062530` |
| Buyer start page | `39063396` |
| $7 one-time price plan | `3122070` |
| Kickoff funnel | `7474912` |
| Kickoff page | `25000883` |
| Graduation funnel | `7474913` |
| Graduation page | `25000885` |

### Contact Tags

| Tag | ID | Purpose |
| --- | ---: | --- |
| `777 - Interest` | `2122025` | Active prospect pool. |
| `777 - Purchase` | `2122027` | Current $7 participation right in Systeme. |
| `777 - Checkout Started` | `2122024` | Recognized checkout visitor who has not completed the tracked purchase. |
| `777 - 2026-09 Participant` | `2122031` | Known contact visited September Day 1. |
| `777 - 2026-09 Day 7` | `2122026` | Known contact visited September Day 7. |
| `EEE - Purchase` | `2122029` | Existing EEE purchase state; outside this implementation. |
| `EEE - Canceled` | `2122030` | Existing EEE cancellation state; outside this implementation. |

The account rejected new tags because the current plan limit has been reached. To preserve the approved model without upgrading, two obsolete event-registration tags were repurposed:

- `2122024`: `777 - Kickoff Registered` became `777 - Checkout Started`.
- `2122026`: `777 - Graduation Registered` became `777 - 2026-09 Day 7`.

### Workflows

| Workflow | ID | Status | Current Structure |
| --- | ---: | --- | --- |
| 777 Purchase State | `540307` | Active | New sale on 777 checkout -> add Purchase -> remove Checkout Started. This keeps purchase tagging live without depending on email configuration. |
| 777 Purchase and Onboarding | `540295` | Paused | New sale on 777 checkout -> add Purchase -> remove Checkout Started -> draft immediate email -> wait 24 hours -> confirm Purchase tag before continuing. |
| 777 Refund and Prospect Restore | `540299` | Active | Sale canceled on 777 checkout -> remove Purchase -> add Interest -> remove Checkout Started. |
| 777 Checkout Abandonment | `540300` | Paused | Checkout page visited -> add Checkout Started -> wait 24 hours -> check Purchase tag -> draft reminder only on No branch. |
| 777 2026-09 Day 1 Participation | `540301` | Active | Day 1 page visited -> add September Participant tag. |
| 777 2026-09 Day 7 Completion | `540303` | Active | Day 7 page visited -> add September Day 7 tag. |
| 777 Prospect Welcome | `540304` | Paused | 777 opt-in form submitted -> draft immediate welcome email. |

### Draft Workflow Emails

| Workflow | Subject shell | Copy status |
| --- | --- | --- |
| Purchase and Onboarding | `[DRAFT] Your 777 access and Day 1` | Subject shell only. Sender unavailable; body not approved. |
| Checkout Abandonment | `[DRAFT] Did the checkout get in your way?` | Subject shell only. Sender unavailable; body not approved. |
| Prospect Welcome | `[DRAFT] Your 777 Challenge starts here` | Subject shell only. Sender unavailable; body not approved. |

No email-bearing workflow is active, so these draft shells cannot send.

## Existing Automation Rules

The primary opt-in rule that applies `777 - Interest` should remain active. Three legacy tag names still exist (`777 Challenge`, `7 Videos`, and `777 - Graduation Attended`); do not delete them until their old funnels and contacts are audited.

Four duplicate event-registration rules were removed because the approved journey no longer requires separate Kickoff or Graduation registration:

- `2363074`
- `2363073`
- `2363016`
- `2363015`

## Data Flows

### Prospect

1. Contact submits `/777`.
2. Existing Systeme automation applies `777 - Interest`.
3. Prospect Welcome workflow sends the immediate welcome email after sender repair and copy approval.
4. Contact is redirected to `/777challenge` by the funnel.
5. A recognized checkout visit starts the Checkout Abandonment workflow.
6. Systeme adds `777 - Checkout Started`, waits 24 hours, and checks for `777 - Purchase`.
7. Only the No branch sends one reminder.

### Buyer

1. The customer completes price plan `3122070`.
2. Systeme's native New sale trigger starts active workflow `540307`.
3. Systeme applies `777 - Purchase` and removes `777 - Checkout Started`.
4. The checkout redirects to `/startnow`.
5. The existing signed Studio webhook independently grants the purchase-created SeenInSeven entitlement.
6. Paused workflow `540295` handles buyer onboarding immediately, after 24 hours, and after 72 hours once its sender and email content are completed.
7. Each delayed email must be preceded by a Purchase-tag decision so a refund stops future buyer onboarding.

Workflow `540295` currently repeats the two purchase-tag actions before its first email. Those actions are idempotent, but they may be removed when the email workflow is finalized so `540307` remains the single purchase-state owner.

### Refund

1. Systeme's native Sale canceled trigger starts workflow `540299`.
2. Systeme removes `777 - Purchase`.
3. Systeme restores `777 - Interest` and removes `777 - Checkout Started`.
4. The signed webhook revokes only the Studio grant created by that purchase.
5. Beta, manual, and unrelated Studio grants remain untouched.

### Participation

1. A known Day 1 visitor receives `777 - 2026-09 Participant`.
2. A known Day 7 visitor receives `777 - 2026-09 Day 7`.
3. Email clicks and page visits are the reporting signals.
4. Script completion, locking, regeneration, and detailed progress remain inside Studio and are not synchronized to Systeme.

## Email Sender Blocker

Observed account state:

- `email@davidbee.me` appears verified in Systeme email settings.
- Sender name is `David Bee`.
- The default sender selection did not persist after saving and reloading.
- Campaign creation shows an empty required sender list.
- Workflow email editing also shows `It looks like this list is empty` for Sender email address.
- The authenticated-domain list is empty.
- The unsubscribe footer is enabled.

Recovery order:

1. In Systeme Email settings, remove and re-add or reconfirm `email@davidbee.me` if the address is not available to the sender selector.
2. Authenticate `davidbee.me` with the DNS records Systeme supplies.
3. Verify SPF, DKIM, and DMARC from the Systeme domain screen and an external DNS lookup.
4. Set `David Bee <email@davidbee.me>` as the default sender.
5. Open a workflow email and confirm the address appears in the sender dropdown.
6. If the address remains absent, contact Systeme support with screenshots of the verified-address page and empty workflow sender selector.

Do not work around this by sending from an unverified address.

## Remaining Technical Work

1. Repair the sender selector and authenticate the sending domain.
2. Finish buyer onboarding in workflow `540295`:
   - Optionally remove its duplicate Purchase and Checkout Started tag actions, leaving workflow `540307` as the state owner.
   - Complete and approve the immediate email.
   - On the Purchase=yes branch after 24 hours, add the access-check email.
   - Add a 48-hour delay, another Purchase-tag decision, and the 72-hour participation email.
3. Complete and approve the single No-branch abandonment reminder in workflow `540300`.
4. Complete and approve the Prospect Welcome email in workflow `540304`.
5. Activate email-bearing workflows only after sender, links, suppression, and unsubscribe tests pass.
6. Build the September buyer and prospect newsletter batches after final copy review.
7. Run one real $7 purchase and refund with the owner's approval.

## Monthly Newsletter Inventory

Create separate buyer and prospect editions for:

| Date | Job |
| --- | --- |
| September 1 | Invite the contact into the coming cycle. |
| September 6 | The challenge begins tomorrow. |
| September 7 | Day 1 and Kickoff. |
| September 8 | Day 2. |
| September 9 | Day 3. |
| September 10 | Day 4. |
| September 11 | Day 5. |
| September 12 | Day 6. |
| September 13 | Day 7. |
| September 14 | Catch-up. |
| September 15 | Graduation. |

Buyer editions link to SeenInSeven and account for starting, resuming, repeating Level 1, finishing, or continuing into Level 2. Prospect editions link to the public daily page and invite the reader into the $7 challenge.

Exclude `777 - Purchase` contacts from prospect editions. Buyer editions require `777 - Purchase`. Purchase messaging must stop immediately when the Purchase tag appears.

The monthly batch is manually duplicated, date-adjusted, reviewed, and scheduled until the journey becomes evergreen.

## Copywriting Status

- Dedicated guide: `launch/email-style-guide.md`
- Existing launch drafts: `launch/email-copy.md`
- Final buyer onboarding: pending
- Final prospect welcome: pending
- Final abandonment reminder: pending
- September buyer newsletters: pending sequence-level rewrite
- September prospect newsletters: pending sequence-level rewrite

Technical transactional copy should prioritize exact status and access instructions. Promotional and participation copy should use the sequence-level Brunson architecture described in the email guide without forcing one formula into every message.

## Activation Checklist

Before activating any workflow:

- Confirm the trigger is scoped to the `777Challenge` funnel and correct page.
- Confirm Purchase and Interest tag IDs match this handoff.
- Confirm each delayed buyer email is protected by a Purchase-tag decision.
- Confirm the abandonment reminder exists only on the Purchase=no branch.
- Confirm the sender is `David Bee <email@davidbee.me>`.
- Confirm the footer contains a functioning unsubscribe link.
- Send a test to Gmail and another provider and inspect spam placement and links.
- Keep email-bearing workflows paused until all checks pass.

## Focused Acceptance Tests

| Test | Status | Evidence or next action |
| --- | --- | --- |
| Fresh opt-in receives Interest tag | Existing rule present; live test pending | Submit a fresh alias through `/777`. |
| Fresh opt-in receives welcome email | Blocked | Repair sender, finish email, activate workflow `540304`. |
| Recognized checkout visitor receives Checkout Started | Structure ready; live test pending | Activate workflow `540300` after email completion. |
| Nonbuyer receives one reminder after 24 hours | Structure ready; live test pending | Confirm only No branch contains the email. |
| Buyer suppresses abandonment | Structure ready; live test pending | Purchase-tag decision routes buyer to empty Yes branch. |
| $7 sale adds Purchase and clears Checkout Started | Active; real transaction pending | Run one approved $7 transaction through workflow `540307`. |
| $7 sale grants Studio access | Webhook deployed; real transaction pending | Verify webhook event and Studio entitlement. |
| Refund restores prospect state | Structure ready; real refund pending | Refund the approved test transaction. |
| Refund revokes only purchase-created Studio grant | Webhook designed for source-aware revocation; real test pending | Compare entitlement sources before and after refund. |
| Day 1 visit applies Participant | Active; live test pending | Visit Day 1 as a known contact and verify tag `2122031`. |
| Day 7 visit applies Day 7 | Active; live test pending | Visit Day 7 as a known contact and verify tag `2122026`. |
| SPF, DKIM, DMARC | Blocked | Authenticate `davidbee.me`. |
| Buyer/prospect newsletter exclusions | Pending | Build and preview September batches. |

## Recovery Procedures

### Missing Or Incorrect Tag

1. Open the contact in Systeme.
2. Confirm whether the trigger event appears in contact activity.
3. Add or remove the expected tag manually.
4. Inspect the corresponding workflow run before reactivating or retrying it.

### Duplicate Or Incorrect Email

1. Pause the workflow or unschedule the newsletter.
2. Inspect the contact's Purchase and Checkout Started tags.
3. Confirm the decision branch and delay are attached in the correct order.
4. Do not re-enroll the entire audience while diagnosing one contact.

### Failed Webhook Or Studio Access

1. Check Studio Admin webhook event history by Systeme message ID and purchaser email.
2. Confirm the signature was accepted and price plan `3122070` was routed to SeenInSeven.
3. Retry the failed event only when it is safe to do so; processing is message-ID idempotent.
4. If access must be repaired manually, create a manual entitlement instead of rewriting purchase history.

### Refund Did Not Revoke Access

1. Confirm Systeme emitted Sale canceled and removed the Purchase tag.
2. Confirm the signed webhook received the cancellation event.
3. Inspect all entitlement sources before removal.
4. Remove only the purchase-created grant. Preserve beta, manual, and unrelated access.

## September Operating Checklist

1. Repair sender and domain authentication.
2. Finalize and test buyer onboarding, prospect welcome, and abandonment copy.
3. Duplicate and schedule separate buyer and prospect newsletter batches.
4. Verify all links and exclusions before September 1.
5. Confirm public Kickoff and Graduation links require no separate registration.
6. On September 7, monitor purchases, webhook events, Studio access, and Day 1 tags.
7. On September 13, monitor Day 7 tags.
8. On September 15, publish Graduation communication.
9. After the cycle, export conversion, Day 1, Day 7, refund, click, and unsubscribe results.
10. Duplicate the monthly batch and update cycle-specific participation tags for the next run.

## Known Limitations

- Systeme is at its current tag limit.
- Workflow and campaign sender dropdowns are empty despite a verified email address.
- No custom sending domain is authenticated.
- Three email-bearing workflows are paused; purchase state, refund state, and both participation workflows are active.
- No real transaction or refund was performed during this implementation.
- Open rates are not treated as reliable reporting.
- Kickoff and Graduation are logically part of the main journey but remain in separate funnel containers.
- Legacy tags and old funnel rules remain until their contacts and historical use are audited.

## Change Log

### August 7, 2026

- Removed four duplicate Kickoff and Graduation registration rules.
- Repurposed two obsolete registration tags for Checkout Started and September Day 7 tracking.
- Created seven Systeme workflows for purchase state, buyer onboarding, refund, abandonment, opt-in, Day 1, and Day 7.
- Scoped purchase and refund triggers to the live $7 checkout.
- Activated purchase tagging independently from email delivery.
- Added purchase suppression and refund-restoration tag logic.
- Added Day 1 and Day 7 page-visit participation tracking.
- Activated refund restoration and both participation workflows.
- Created three clearly marked draft email shells.
- Confirmed sender selection and domain authentication are launch blockers.
- Added a dedicated 777 email-copy guide without changing SeenInSeven.
