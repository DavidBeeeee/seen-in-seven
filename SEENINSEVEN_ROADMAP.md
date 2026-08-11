# SeenInSeven / Colorado Mastermind Studio Roadmap

**Project:** SeenInSeven, 777 Challenge, Colorado Mastermind Studio
**Owner:** David Bee
**Status:** Source of truth for roadmap direction
**Created:** June 2026
**Last revised:** August 8, 2026

---

## Purpose Of This Document

This exists so future Codex sessions, Claude sessions, GitHub Desktop work, and human developers stop reinterpreting project direction from older handoff notes.

`DEVELOPER_HANDOFF.md` remains the reference for architecture history and debugging lore. `CLAUDE.md` is the current working brief for anyone touching code. **This file is the source of truth for what should be built next, what should wait, and what should not be resurrected until David Bee reopens it.**

### What Changed In The August 8, 2026 Revision

The July version of this document was accurate when written and is no longer. Three things moved:

1. **Phase 6 got built.** Systeme purchase routing, webhook verification, and source-aware revocation are live. The July text listing "No Systeme.io webhook right now" under Do Not Build Yet was correct at the time and is now wrong. It has been removed.
2. **The launch moved to September 7 through 19, 2026.** A `launch/` directory now holds the operating source for the cycle.
3. **The EEE component apps now exist as routes.** `/eee`, `/storysculpt`, `/navigator`, `/vault` exist inside Studio.

None of this changes the sequencing rule. It changes which items are already behind us.

---

## Project Positioning

SeenInSeven is the bonus and delivery tool for the 777 Challenge. The 777 Challenge is the product.

Colorado Mastermind Studio is the authenticated home for everything paid. Systeme.io stays the public funnel, registration, checkout, and email platform. Studio never sells. Systeme never delivers the app experience.

The current operating assumptions:

- Access to a paid app comes from an entitlement, not from possession of a link.
- Existing beta users keep their access. A refund never removes a beta or manual grant.
- Gamification exists but its numbers are unproven.
- In-app lifecycle email still does not exist. Systeme carries the launch sequence.

---

## Operating Principles

### Make It Work Before Adding Complexity

The app is a working vanilla HTML/CSS/JS product on Supabase, DeepSeek, and Vercel. Do not introduce frameworks, build steps, bundlers, rewrites, or abstractions unless David Bee asks or a real technical blocker forces it.

### Protect The Core IP

`prompts/blueprints.js` holds the AI system prompt and proprietary Hero's Journey logic. Do not modify it without explicit instruction. The admin Prompt Tester plus `api/prompt-blueprint.js` is the only sanctioned write path, and it must keep its verification, validation, and undo behavior intact.

### Preserve The Supabase Auth Rule

Supabase can hold an internal navigator lock during `onAuthStateChange`. Do not `await` database calls inside that callback body. Defer with `setTimeout(0)` or an equivalent next tick. This rule came from an expensive debugging session and is load-bearing.

### Preserve Screen Structure

All `.screen` elements in `seeninseven.html` must remain direct children of `body`. Before and after any HTML screen edit, run:

```js
[...document.querySelectorAll('.screen')]
  .filter(s => s.parentElement !== document.body)
  .map(s => s.id + ' inside: ' + s.parentElement.id)
```

The expected result is an empty array.

### Keep Access Sources Separate

Studio access has a source: `beta`, `admin`, or `systeme`. Revocation must only ever remove grants matching the source that created them. Repairing a refund by stripping someone's manual or beta access is a bug, not a fix.

### Grant By Price Plan ID, Never By Name

Product names, prices, and page copy change every cycle. Immutable price plan IDs do not. Routing lives in the `systeme_product_routes` table so a plan change is a data edit rather than a deploy.

### Follow David Bee Voice And Offer Rules

- The 777 Challenge is the product. SeenInSeven is the bonus.
- Refer to David Bee by first and last name in public-facing copy.
- Do not expose private offer details publicly. The $250/month partnership rate is revealed only after a discovery call.
- No em dashes in customer-facing copy.
- Respect the style guide's banned phrasing, money-flinch words, and Pinterest list.
- Audience: first-time entrepreneurs, often 45 to 60, often non-technical, often camera-shy.

---

## Phase Status Summary

| Phase | Status as of August 9, 2026 |
|---|---|
| 1. Admin Command Center | Complete |
| 2. Onboarding Update | Mostly complete, commit-moment decision open |
| 3. Full UX Audit | Visual pass done, formal walkthrough outstanding |
| 4. Gamification | Built, numbers unproven |
| 5. Script Output Update | Underway through the Prompt Tester |
| 6. Paid Access and Checkout Bridge | Real purchase and grant validated; repaired login awaits manual click-through |
| 7. Email and Follow-Up | Deferred. Systeme carries the launch |
| 8. Studio Foundation | Live; David-only WorkerBee workspace approved and in Preview development |

---

## Phase 1: Admin Command Center And Stability

**Complete.**

Studio-wide admin at `/admin` owns the customer directory and app access. Detailed SeenInSeven administration lives at `/admin/seeninseven`. Boardroom has its own activity view. The admin surfaces users, onboarding status, level, scripts, videos filmed and posted, last active, magic-link activity, script failures, logged errors, points totals with full earning breakdown, pre-auth funnel events, entitlements, and Systeme webhook history.

Manual controls available: grant or revoke app access, enroll a Studio customer by email, toggle `is_paid`, set catalog visibility, delete subjects.

---

## Phase 2: Onboarding Update

**Mostly complete.**

Delivered:

- Overview screen with a character-bio helper that uses the assessment-first prompt, appends current onboarding context and the existing draft, and returns a source document the user reviews before pasting back.
- A seven-part **Journey Map** after the Overview and before Video 1 preparation. One shared question set per level. Planned directions stay separate from detailed answers, and only the active video's direction enters generation. Existing users can edit either level from Settings. Level-specific resets preserve the Overview and both Journey Maps. Delete Everything returns to onboarding while preserving the Studio account.
- **Per-video answer help** for all fourteen video paths. A copied prompt for an outside AI that offers three source directions before writing paste-ready journal answers, uses only the current Journey direction, and treats previous scripts as continuity rather than material to recycle. It changes no production blueprint and saves nothing back automatically.
- Mission statement, commitment declaration, and commitment reasons persisted on the onboarding row.
- Free-text content-intent route that saves the user's exact words, lets them choose a personal-story or expertise direction, flows into generation, and renders in admin.

**Still open:**

1. **Commit-moment redesign.** The current commit sequence still reads more like a form than a declaration. This is waiting on David Bee to describe the experience he wants. Three questions need answers before any code:
   - What does the ideal commitment moment look, feel, and say?
   - Should the mission statement be editable after the fact?
   - Should it appear anywhere outside the dashboard, such as the script view or a completion screen?

**Deferred within Phase 2:** the knowledge base / context document paste-in. Still worth building, still text-only when it happens, still capped around 2,000 characters, still routed through `buildAPIUserMessage()` rather than through the blueprint.

---

## Phase 3: Full User Experience Audit

**Visual half done. The formal walkthrough has not been run.**

A full visual language is now in production: aurora atmosphere, glass card surfaces, gradient typography, jewel primary actions, motion identity, dark and light themes. That addresses how the app feels. It was not accompanied by the systematic flow-by-flow pass below, which remains outstanding and is worth doing before the first real cohort arrives on September 7.

### Audit Scope

First visit. Returning-user detection. Magic-link auth. Password auth. Skipping auth. Onboarding choices. Journey Map. Answer help. Name capture. Recap. Topic freewrite. MVO screens. Video 1 preface. Script prompt screen. Script generation. Script error and fallback states. Structured script view. Edit view. Regeneration. Undo and redo. Locking a script. Marking filmed. Marking posted with a link. Skipping a video. Dashboard return. Copy single script. Copy all scripts. PDF export. Version history. Settings. Re-run onboarding. Level switch. Delete and start over. Points strip and vault. Studio dashboard with and without each entitlement. Mobile layout. Desktop layout.

### Desired Outcome

A non-technical, camera-shy person aged 45 to 60 should always know where they are, what is done, what to do next, and whether their work is saved. They should not feel punished for moving slowly. The app should feel like it is helping them finish the challenge rather than competing with it.

### Out Of Scope

This is a refinement pass, not a feature sprint.

---

## Phase 4: Gamification And Completion Experience

**Built.** What exists:

- **Points engine.** Derived, never ledgered, from onboarding depth, script generation, extended-mode answers, script locking, filming, and posting. Computed identically in `js/points.js` and `compute_user_points()`, so the number cannot be gamed by deleting and regenerating content.
- **Dashboard trophy panel and wealth vault.** A progress strip showing current milestone and points, opening into eight collectible gems plus a money pile that grows with the total.
- **Posted-video tracking.** Self-reported posting with an optional link for bonus points.
- **Engagement points.** Sponsor tool clicks (Vubli, Temu), watching the Graduation Event, and scheduling a 1-1.
- **Admin visibility.** Per-user point totals, full earning breakdown, and posted-video links.

**Still open:**

- Point values and milestone thresholds are starting numbers. With eleven users and fourteen video-progress rows on record, there is not yet enough real behavior to tune against. Adjust `points_config` in Supabase once the September cohort is active. No redeploy needed.
- The Graduation Event and 1-1 cards are complete but hidden, waiting on `ENGAGE_LINKS` in `js/app.js`.
- No streak mechanics, no badges beyond the gem system, no community posting flow. These remain undefined and should not be invented.

---

## Phase 5: Script Output Update

**Underway, through a controlled tool rather than direct edits.**

The admin Prompt Tester now allows testing the complete blueprint against copies of real admin data, editing drafts, confirming, publishing through a verified GitHub path restricted to `prompts/blueprints.js`, and undoing via a reversal commit. `scripts/check-prompt-style-guide.mjs` and `scripts/check-story-architecture.mjs` provide automated checks on output shape and story architecture.

That infrastructure exists so blueprint changes can be tested and reversed. It does not authorize open-ended rewrites. Blueprint work still requires an explicit brief from David Bee.

Known areas of interest, unchanged:

- How free-text onboarding answers influence personalization compared to preset answers.
- How the deferred knowledge-base context should flow into output when it exists.
- Whether users get format, length, or style options.
- A transition sentence between the declaration and the introduction, since the current jump reads abruptly. David has flagged this and suggested a second API call before final output.

---

## Phase 6: Paid Access And Checkout Bridge

**Built. A real purchase has validated the payment and grant path; the repaired login path awaits one final manual click-through.**

What exists:

- `POST /api/systeme-webhook` verifies Systeme's HMAC signature against the raw request body.
- Every message ID is recorded, making retries duplicate-safe.
- Access is granted by immutable price plan ID through the `systeme_product_routes` table:
  - `3122070`, 777 Challenge $7, grants `seeninseven`
  - `3134754`, EEE Founders $77/month, grants `eee` and `boardroom`
- Refunds and cancellations revoke only grants created by the matching purchase.
- Buyers are pre-enrolled in Studio and claim their profile on first sign-in, so purchase and login can happen in either order.
- Studio Admin shows webhook history with processing status for recovery.
- Catalog visibility for `eee` is `automatic`, tied to the cart window, so the tile appears and disappears without manual work.

**What is not done:**

The August 9 rehearsal confirmed a genuine $7 sale, one processed webhook delivery, pre-enrollment, and an active `systeme` SeenInSeven entitlement. It also exposed and led to repair of the fresh-buyer login gate and the admin's legacy payment display. Finish the same buyer's magic-link click-through, then confirm a retry creates no second grant and a refund leaves an existing beta grant intact.

The humane-access principle still holds. A real buyer must never get locked out over an email mismatch or magic-link confusion. Manual admin enrollment exists precisely for that.

---

## Phase 7: Email And Follow-Up System

**Deferred, deliberately.**

Systeme carries the September launch sequence. Approved copy and audience rules live in `launch/email-copy.md`, with a hard rule that prospect emails never carry Studio access instructions.

No in-app lifecycle email exists and none should be added until the September cycle has run, the flow-by-flow audit is done, and script quality satisfies David. Supabase built-in email is not the long-term system. When this phase opens, pick a real provider such as Postmark or Resend.

Later touchpoints worth considering: first script generated, several days stuck, all seven complete.

**Related open item:** sign-in emails currently come from Supabase and should come from something like "CoMM Studio." That is sender configuration, not a lifecycle system, and can happen now.

---

## Phase 8: Long-Term Superapp Foundation

**Live.**

Studio is the root dashboard. SeenInSeven is intact at `/seeninseven`. Shared login, per-app entitlements, Studio-wide admin at `/admin`, and app-specific admin areas all work. Boardroom is connected and grantable. The EEE component apps exist as routes: `/eee`, `/storysculpt`, `/navigator`, `/vault`.

The component apps are at very different maturity levels. `solution_vault_items` holds thirteen rows, `storysculpt_projects` holds one, and `navigator_states` holds none. Treat StorySculpt and Navigator as early rather than finished, and see the open-items list for David's specific direction on each.

Still deliberately absent for customers: cross-app user history, a unified activity feed, additional customer apps beyond those listed, and any architecture rewrite. David explicitly approved one private exception on August 10, 2026: `/dashboard` and `/todo` form his David-only WorkerBee operating workspace inside the existing Studio stack. It does not create customer-facing activity history and does not alter SeenInSeven's vanilla structure, auth, saved work, prompts, points, screen system, or admin tools.

---

## Do Not Build Yet

- No community bridge implementation.
- No in-app lifecycle email.
- No streak mechanics, badges beyond the gem system, or community posting flows until David defines them.
- No additional customer-facing Studio apps beyond the five already routed. The approved David-only WorkerBee workspace is the sole current exception.
- No cross-app user history or unified activity feed.
- No framework migration.
- No broad state-management rewrite.
- No changes to `prompts/blueprints.js` outside the Prompt Tester and an explicit brief.
- No new gamification rules bolted onto the generation pipeline. Points read what users already typed and must not touch `buildAPIUserMessage()`.

**Removed from this list in the August 2026 revision:** paid gating and the Systeme webhook, both of which are now built. See Phase 6.

---

## Verification Standards For Future Work

After any app change:

- `git status` understood before editing.
- `prompts/blueprints.js` unchanged unless explicitly requested.
- All `.screen` elements remain direct children of `body`.
- Dashboard restore works.
- Magic-link and password auth both still work.
- Supabase auth callback work remains deferred.
- LocalStorage restore still works.
- Studio admin and SeenInSeven admin both still load data.
- User-entered data is escaped before display in admin views.
- Mobile and desktop layouts remain readable.
- Entitlement changes tested against all three access sources.
- Relevant `scripts/check-*.mjs` pass.

For documentation-only work:

- No app code changed.
- This file remains the canonical roadmap reference, linked from `DEVELOPER_HANDOFF.md` and `CLAUDE.md`.

---

## Current Immediate Next Step

Ordered for the thirty days before September 7, 2026.

1. **Finish the rehearsal checklist.** Complete the repaired fresh buyer's magic-link entry, then test an identical webhook retry and source-aware refunds for both the fresh buyer and an existing beta account.
2. **Supply the missing URLs.** Kickoff and Graduation Zoom rooms and replays in `js/777-launch-cycle.js`, the confirmation pages, the email drafts, and both decks. Plus `ENGAGE_LINKS` in `js/app.js`, which is holding two finished features hidden.
3. **Security housekeeping.** Enable leaked-password protection in the Supabase Auth dashboard, which is a toggle rather than a code change, and rotate the two admin test-account passwords.
4. **Run the actual Phase 3 audit** across the flows listed above, both levels, both themes, mobile and desktop.
5. **Finish Phase 2's commit moment** after David supplies the three product decisions. The content-intent free-text route is complete.
6. **Tune `points_config`** once the September cohort produces real behavior.

Do not skip ahead of this list without David Bee explicitly changing the priority.
