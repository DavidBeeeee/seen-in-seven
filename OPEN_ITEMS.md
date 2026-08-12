# Open Items: Consolidated

**Assembled August 8, 2026.** Merged from the WebApps Running Notes (Aug 7), the roadmap's outstanding items, `launch/operator-checklist.md`, `launch/rehearsal-checklist.md`, and a live check of Supabase and Vercel.

Nothing here has been acted on. This is a single list to replace hunting across five documents.

> **Status changed August 12, 2026.** The September group launch is deferred. Sections below remain historical product and launch debt, but they do not drive current priority. The active validation work lives in `launch/private-tiny-challenge/`.

Ordering now begins with proof for the private Tiny Challenge. Group-only items remain parked until both gates are met.

---

## Tier 1: Private validation

- [x] Build the facilitator playbook, intake, commitment, session-note, Graduation, scorecard, and structured ledger.
- [x] Make the September browser cycle and EEE checkout source fail closed.
- [ ] David selects and invites the first qualified private participant.
- [ ] Complete Run 1 with one approved script on Day One and a complete scorecard at Graduation.
- [ ] Complete 10 private runs.
- [ ] Enroll 5 participants in the private partnership.
- [ ] Convert the proven experience into a new group cycle only after both gates are met.

## Parked group-launch work

The items below were previously Tier 1 for September. Preserve them, but do not execute them as current work.

### 1.1 Finish the purchase-path rehearsal

The HMAC verification, price-plan routing, duplicate-safe message IDs, source-aware revocation, pre-enrollment, profile claim, and admin history are built. One real $7 purchase now exists; the remaining rehearsal steps are login click-through, retry, and refund behavior.

**Update, August 9, 2026, from a real rehearsal purchase on `hq@ancientcosmic.com`:** the money and grant side works. `systeme_webhook_events` shows one `SALE_NEW` row, `status: processed`, `delivery_count: 1`. `studio_entitlements` shows an active `seeninseven` row, `access_source: systeme`, granted the same second the webhook was received. So the paid flag did fire, that half is confirmed working.

**Repair applied August 9:** `check_email_exists` now returns active SeenInSeven entitlement status, and the sign-in flow accepts either saved challenge progress or an active entitlement before sending the magic link. The live RPC returns `has_access: true` for the rehearsal buyer. The thank-you source now accurately tells buyers to request the secure link with their purchase email. One manual click-through remains before the rehearsal line can be closed.

**Welcome-email diagnosis, August 9:** the rehearsal contact has the live `777 - Purchase` tag and is neither bounced nor unsubscribed, but no onboarding email was eligible to send. Systeme workflow `540295`, `777 Purchase and Onboarding`, remains paused by design because its sender selector was empty and its email body was not approved. The signed webhook grants Studio access but does not send email. This is why the buyer received the native purchase receipt and nothing else. Repair requires a verified selectable sender, approved immediate buyer copy, one test send, and then activation of the existing purchase workflow. Do not add a second webhook email path unless Systeme cannot be repaired, or buyers may receive duplicate onboarding messages later.

Fix is either: send a real magic link and pre-seed a level record the moment the webhook grants the entitlement, or change the sign-in check to look at `studio_entitlements` instead of `has_level`. First one matches the thank-you page copy without rewriting it.

**Admin repair applied August 9:** the SeenInSeven admin now treats an active `systeme` SeenInSeven entitlement as payment truth while retaining the legacy manual paid flag for older records. Beta and admin-granted access are not mislabeled as purchases.

- [x] Real $7 purchase on a fresh email. Confirmed August 9, 2026: webhook processed, entitlement granted
- [ ] Same purchase carried through to actual SeenInSeven sign-in. Code and live RPC repaired; one manual magic-link click-through remains
- [ ] Retry the same webhook message, confirm no second grant and no duplicate profile
- [ ] Refund that fresh buyer, confirm only the matching Systeme grant disappears
- [ ] Refund against an existing beta account, confirm the beta grant survives
- [ ] Confirm a public visitor cannot reach paid Studio tools
- [ ] Confirm magic link and password both land on the same Studio profile

### 1.2 Zoom rooms and replays do not exist

`kickoffRoom`, `kickoffReplay`, `graduationRoom`, and `graduationReplay` are all empty strings in `js/777-launch-cycle.js`. The same blanks exist in the confirmation pages, the email drafts, and both decks. This was deliberate, since inventing URLs is worse, though the meetings now need to be created.

- [ ] Create both Zoom meetings
- [ ] Add the URLs to `js/777-launch-cycle.js`, `/kickoff-confirmed`, `/graduation-confirmed`, `launch/email-copy.md`, and both decks
- [ ] Confirm the Kickoff confirmation page reveals the room only after registration

### 1.3 Per-cycle configuration confirmations

- [ ] Confirm price plans `3122070` ($7) and `3134754` ($77/month) are unchanged
- [ ] Confirm the Systeme webhook still subscribes to New sale and Sale canceled
- [ ] Confirm the signing secret matches Vercel `SYSTEME_WEBHOOK_SECRET`
- [ ] Send a registration test through both event forms, confirm both tags fire
- [ ] Confirm `/yeees` blocks purchase outside September 15 to 19

### 1.4 The $7 page still contradicts itself

From the running notes, and worth treating as launch-blocking since it sits on the money page:

- [x] Replace generated-ID CTA targeting in both repository funnel blocks with runtime email-form discovery. Live Systeme blocks still need republishing and confirmation
- [ ] "Free to start, no credit card needed" is wrong here. That copy belongs to the app trial page. This page collects $7, and the framing is $297+ of value for $7. Note: every page and document currently saying $311 needs the same correction
- [x] Remove the comment-to-client formula offer from repository source. Live Systeme block still needs republishing
- [x] Update thank-you page step two to match the automated access behavior in repository source. Live Systeme block still needs republishing
- [ ] Confirm no public page links to OnlineCourseHost

---

## Tier 2: Security and hygiene, do before the cohort grows

- [ ] Enable leaked-password protection in the Supabase Auth dashboard. **Confirmed still off as of August 8.** One toggle, no code
- [ ] Rotate the two admin test-account passwords
- [x] Review the six tables with RLS on and zero policies. Added explicit deny-direct-access policies; revoked the unnecessary inherited direct grants on `preauth_events`; server-side RPCs remain the access path
- [x] Confirm current application source does not point at the paused `Boardroom V2` Supabase project. All active clients use the healthy SeenInSeven project

---

## Tier 3: Quality pass before real users arrive

### 3.1 The Phase 3 audit has never been formally run

The visual redesign covered how the app feels. The flow-by-flow walkthrough did not happen. Both levels, both themes, mobile and desktop, across roughly thirty flows including auth edge cases, script error and fallback states, regeneration, undo and redo, locking, marking filmed, marking posted, PDF export, version history, level switch, and delete-and-start-over.

### 3.2 SeenInSeven app fixes (from the running notes)

- [x] After all seven videos, the dashboard offers the Level 1 to Level 2 switch with a completion message
- [x] Temu affiliate visibility restored after three filmed videos
- [ ] One-click copy for the L1 and L2 question sets and the onboarding prompt
- [x] Regeneration uses an empty textarea, explicit improve action, working state, retry state, and preserves the prior draft on failure
- [x] Delete-and-start-over asks before clearing the current video's script and answers; full onboarding restart remains a separate Settings action
- [ ] Add a transition sentence between the declaration and the introduction. Currently a harsh jump. Possibly a second API call before final output
- [ ] Level 2 needs a name. Level 1 is "The Relatable Hero," Level 2 is still "The ?? Authority"
- [x] Add metaphorical land/landed and ship/shipped to the app's banned-word checks, preserving literal uses
- [x] Friendlier returning-user message with a paid-buyer variant
- [x] Extended topic context accepts and persists up to 12,000 characters and has paste-ready Answer Help

### 3.3 Phase 2 leftovers

- [x] Free-text "say it in my own words" option on the content-intent grid, saving to state, choosing the personal or expertise route, flowing into generation, and rendering in admin
- [ ] Commit-moment redesign. **Waiting on David.** Three questions need answers first: what the ideal commitment moment looks and feels and says, whether the mission statement stays editable afterward, and whether it appears anywhere outside the dashboard

### 3.4 Points tuning

- [ ] Adjust `points_config` once September behavior exists. Currently eleven users and fourteen video-progress rows, which is not enough to tune against. No redeploy needed
- [ ] Add the Graduation Event and 1-1 scheduling URLs to `ENGAGE_LINKS` in `js/app.js`, which unhides two finished dashboard cards

---

## Tier 4: Infrastructure comfort

- [ ] Sign-in emails should come from something like "CoMM Studio" rather than Supabase
- [ ] Turn off the Vercel notification email on every completed deploy

---

## Tier 5: Boardroom

- [ ] One-on-one chatrooms do not open a separate room. They bleed into the main room and should be isolated
- [ ] Only Tony and Chanos have the colored left edge bar on their chat window. Everyone should
- [ ] Add gender and preferred pronouns to the intake questions
- [ ] Add a short-answer toggle, since not everyone wants the depth David prefers
- [ ] Add Malcolm Gladwell to the group chat

---

## Tier 6: Next Step Navigator

- [ ] One-time versus recurring toggle on products
- [ ] Customer journey logic is wrong. It claims a Linktree visitor goes through the welcome email even when "message manually" was selected. The whole logic path needs review. If they have no social media, the honest answer is talking to people one at a time in person
- [ ] Let users add product names and social site names directly on the work cards
- [ ] Make "back to roadmap" the highlighted button and "email my plan" the secondary
- [ ] Make "view biz profile" much bigger
- [ ] Rename "paid experience" to "inexpensive paid sample"
- [ ] The CRM bubble does not trigger on the roadmap
- [ ] Expand the Bee Formula roadmap instructions considerably, and drop the word "leak" in favor of descriptive, friendly language
- [ ] Rework the income calculator. It presents as a views calculator, though the real point is a ten-to-one ratio where any field is editable and everything else adjusts. Whichever area someone focuses on gets them the result. **David has flagged that this needs a conversation before building**

---

## Tier 7: StorySculpt / 5E app

- [ ] Convert the 777 app structure into the 5E app, initially **without** full script generation. Generation is a separate large update, and it needs a way to make small tweaks for tuning
- [ ] Three content types: talking-head connection using the 5E, talking-head sales using the mini training format, and UGC sales videos with their own frameworks
- [ ] Cinematography suggestion toggle per type. Light touch for talking head, since acting and shot direction is unwelcome there. Useful suggestions are practical ones: walking, getting ready, making coffee, cooking, creative transitions
- [ ] UGC needs heavy creative emphasis, including a product research step pulling reviews, complaints, ratings, and comparisons before writing
- [ ] Sweep the David Bee business folder for material that becomes Solution Vault guides

---

## Tier 8: Content and copy

- [ ] Full content audit of the funnel against the updated style guide, including the money-flinch words and the Pinterest list
- [ ] Comprehensive copy rewrite for yes.davidbee.me
- [ ] Fix "video 1 takes 5 minutes" to "about 18 seconds per video" wherever it appears
- [ ] Autoplay and loop the app preview video on page 1
- [ ] Make onboarding steps 1 and 2 buttons larger and clearer. Step 2 should read as an instruction with the course-portal button image, pointing at the existing coupon URL
- [ ] Decide how Graduation Day stays valuable for someone who skipped the seven days
- [ ] Add a fresh column to the audience tracking sheet. The last one is January 21, 2026, so there is no recent baseline to measure the launch against

---

## Documentation reconciliation

Handled in this pass, listed so the trail is clear:

- `CLAUDE.md` rewritten to cover Studio, the EEE apps, the Systeme webhook, the launch cycle controller, and the current schema
- `SEENINSEVEN_ROADMAP.md` corrected. Phase 6 marked built, the stale "no Systeme webhook" entry removed from Do Not Build Yet, September context added
- Master Business Document raised to V4 with the September cycle replacing the retired April one, plus Studio routes and price plan routing
- Project memory rewritten
- The five June `DEVELOPER_HANDOFF` copies in Drive should be archived so a future session cannot pull one by accident
