# Open Items: Consolidated

**Assembled August 8, 2026.** Merged from the WebApps Running Notes (Aug 7), the roadmap's outstanding items, `launch/operator-checklist.md`, `launch/rehearsal-checklist.md`, and a live check of Supabase and Vercel.

Nothing here has been acted on. This is a single list to replace hunting across five documents.

Ordering is by risk to the September 7 launch, not by effort.

---

## Tier 1: Blocks the launch

### 1.1 The purchase path has never met a real transaction

Everything is built: HMAC verification, price-plan routing, duplicate-safe message IDs, source-aware revocation, pre-enrollment, profile claim on first sign-in, admin webhook history. `systeme_webhook_events` holds **one** row, and every line of `launch/rehearsal-checklist.md` is unchecked.

**Update, August 9, 2026, from a real rehearsal purchase on `hq@ancientcosmic.com`:** the money and grant side works. `systeme_webhook_events` shows one `SALE_NEW` row, `status: processed`, `delivery_count: 1`. `studio_entitlements` shows an active `seeninseven` row, `access_source: systeme`, granted the same second the webhook was received. So the paid flag did fire, that half is confirmed working.

What did not carry through: signing in afterward. The Studio sign-in screen calls `check_email_exists`, which returns `has_level`, true only if the email already has a saved script/level record. It has nothing to do with `studio_entitlements`. A brand-new paying customer has an entitlement but no level record yet, so sign-in returns "No saved challenge found for that email yet. Start the challenge first, then we can save your progress" (`js/app.js`, around line 681), which is the message David hit. The thank-you page (`funnel-pages/sis-page6-block1-thankyou.html`) tells the buyer "your login link has been sent," but nothing in the purchase or webhook path actually creates that first level record or sends a magic link at checkout. Two systems, purchase and challenge progress, that were never wired together.

Fix is either: send a real magic link and pre-seed a level record the moment the webhook grants the entitlement, or change the sign-in check to look at `studio_entitlements` instead of `has_level`. First one matches the thank-you page copy without rewriting it.

**Third disconnected signal, same update:** the admin dashboard's "Paid" column (`admin-seeninseven.html`) reads `users.is_paid`, a plain boolean nothing in the webhook path ever writes. The only way it becomes true is an admin clicking "Set Paid," which calls `admin_set_paid`. Confirmed `is_paid: false` on the `hq@ancientcosmic.com` row despite the active entitlement, which is why the dashboard told David the purchase hadn't registered. Three separate "did they pay" signals exist in this system (`studio_entitlements`, `users.is_paid`, `has_level`) and the webhook only ever updates the first. Whichever fix gets picked for the sign-in gate should also make `users.is_paid` true at the same moment, or the dashboard should stop reading it and read `studio_entitlements` directly instead.

- [x] Real $7 purchase on a fresh email. Confirmed August 9, 2026: webhook processed, entitlement granted
- [ ] Same purchase carried through to actual SeenInSeven sign-in. Blocked on the `has_level` vs. entitlement mismatch above
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

- [ ] Buttons scroll to a dead spot instead of the opt-in form. **Likely cause, needs confirming on the live published page:** the button hrefs point at Systeme's auto-generated section IDs, like `#section-91ec91a8` on the 777 landing block and `#form-input-aa036ba5` on the SeenInSeven block. Systeme regenerates those IDs when a page is re-saved in its visual builder, so a button saved before the last edit can point at an ID that moved or no longer exists. Source files checked in `funnel-pages/777-challenge-page1-block1-optin-above-form.html` and `funnel-pages/sis-page1-block1-main-body.html`, but the true fix has to happen on the live Systeme page since that is what actually serves traffic
- [ ] "Free to start, no credit card needed" is wrong here. That copy belongs to the app trial page. This page collects $7, and the framing is $297+ of value for $7. Note: every page and document currently saying $311 needs the same correction
- [ ] Remove the comment-to-client formula offer for now
- [ ] Update thank-you page step two to match the automated access behavior
- [ ] Confirm no public page links to OnlineCourseHost

---

## Tier 2: Security and hygiene, do before the cohort grows

- [ ] Enable leaked-password protection in the Supabase Auth dashboard. **Confirmed still off as of August 8.** One toggle, no code
- [ ] Rotate the two admin test-account passwords
- [ ] Review the six tables with RLS on and zero policies: `api_usage`, `preauth_events`, `studio_access_grants`, `systeme_product_routes`, `systeme_webhook_config`, `systeme_webhook_events`. Deny-by-default so not a leak, though the Systeme tables hold routing and a secret hash and deserve an intentional decision
- [ ] Confirm nothing still points at the paused `Boardroom V2` Supabase project

---

## Tier 3: Quality pass before real users arrive

### 3.1 The Phase 3 audit has never been formally run

The visual redesign covered how the app feels. The flow-by-flow walkthrough did not happen. Both levels, both themes, mobile and desktop, across roughly thirty flows including auth edge cases, script error and fallback states, regeneration, undo and redo, locking, marking filmed, marking posted, PDF export, version history, level switch, and delete-and-start-over.

### 3.2 SeenInSeven app fixes (from the running notes)

- [ ] After all seven videos, the bottom box still says "film it" while the top box already links to filming. Change the bottom box to offer the Level 1 to Level 2 switch, with a congratulations moment for finishing a level
- [ ] Temu affiliate link no longer appears
- [ ] One-click copy for the L1 and L2 question sets and the onboarding prompt
- [ ] Regenerate modal: the placeholder gets typed in as a real answer and is the wrong color. Gray out the screen or reuse the loading screen while regenerating
- [ ] Delete-and-start-over should return to onboarding question 1, or ask first
- [ ] Add a transition sentence between the declaration and the introduction. Currently a harsh jump. Possibly a second API call before final output
- [ ] Level 2 needs a name. Level 1 is "The Relatable Hero," Level 2 is still "The ?? Authority"
- [ ] Add "land / landed" and "ship / shipped" to the app's banned word list
- [ ] Friendlier returning-user message: "Welcome Back! We recognize you've already started your SeenInSeven scripts, check your email for a magic link back to your dashboard"
- [ ] On the "what do you want to talk about" onboarding question, extended question 3 subtitle should be a strong ready-to-paste AI prompt, up to 12k characters

### 3.3 Phase 2 leftovers

- [ ] Free-text "say it in my own words" option on the content-intent grid, saving to state, flowing into generation, and rendering in admin wherever preset labels appear
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
