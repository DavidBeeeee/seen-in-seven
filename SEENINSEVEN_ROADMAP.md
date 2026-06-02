# SeenInSeven Roadmap

**Project:** SeenInSeven / 777 Challenge / Colorado Mastermind  
**Owner:** David Bee  
**Status:** Source of truth for roadmap direction after the current developer handoff  
**Created:** June 2026

---

## Purpose Of This Document

This document exists so future Codex sessions, Claude sessions, GitHub Desktop work, and human developers do not reinterpret the project direction from older handoff notes.

`DEVELOPER_HANDOFF.md` remains the source of truth for architecture, debugging history, current stack, file structure, screen flow, and known technical constraints. This file is the source of truth for what should be built next, what should wait, and what should not be resurrected until David Bee explicitly reopens it.

The immediate objective is not to add more user-facing features. The immediate objective is visibility, stability, and test-readiness.

---

## Project Positioning

SeenInSeven is the bonus and delivery tool for the 777 Challenge. The 777 Challenge is the product.

The app interviews the user, helps them find their voice, and generates the seven scripts that make the challenge easier to complete. The app should feel impressive, supportive, and unusually helpful, but it should not be positioned as the main offer when the user is inside the challenge context.

The current test-period assumption is simple:

- Anyone with the app link is authorized to use it.
- There is no paid access gate yet.
- The existing `is_paid` admin toggle may remain visible for later use, but it must not block access during the test period.
- There are no automated email nudges yet.
- Gamification and completion mechanics are intentionally undefined until David Bee describes that phase.
- The long-term superapp direction is real, but it is not current implementation scope.

---

## Operating Principles

### Make It Work Before Adding Complexity

The app is already a working vanilla HTML/CSS/JS product with Supabase, DeepSeek, Vercel, and a single-page screen system. Do not introduce frameworks, build steps, bundlers, major rewrites, or abstractions unless David Bee explicitly asks for them or a clear technical blocker requires them.

### Protect The Core IP

`prompts/blueprints.js` contains the AI system prompt and proprietary Hero's Journey script logic. Do not modify it without explicit instruction from David Bee.

### Preserve The Supabase Auth Rule

Supabase can hold an internal navigator lock during `onAuthStateChange` callbacks. Do not `await` Supabase database calls inside that callback body. Defer database work with `setTimeout(0)` or an equivalent next-tick pattern. This rule is load-bearing and comes from a prior expensive debugging session.

### Preserve Screen Structure

All `.screen` elements in `index.html` must remain direct children of `body`. If a dashboard or screen renders blank, first check DOM structure and parent dimensions before changing JavaScript.

Run this check before and after HTML screen edits:

```js
[...document.querySelectorAll('.screen')]
  .filter(s => s.parentElement !== document.body)
  .map(s => s.id + ' inside: ' + s.parentElement.id)
```

The expected result is an empty array.

### Follow David Bee Voice And Offer Rules

The app and docs should preserve the Colorado Mastermind / David Bee rules:

- The 777 Challenge is the product. SeenInSeven is the bonus.
- David Bee should be referred to as David Bee in public-facing copy.
- Do not expose private offer details publicly.
- No em dashes in customer-facing copy.
- Avoid banned or overused marketing/LLM phrasing from the style guides.
- Keep the audience in mind: first-time entrepreneurs, often 45-60, often non-technical, often camera-shy.

### Prioritize Test-User Visibility

Before expanding the user experience, David Bee needs to see what the first few users do, where they stall, which scripts they generate, which errors happen, and what needs quick support.

That is why Phase 1 is an admin command center, not a user-facing expansion.

---

## Phase 1: Admin Command Center And Stability

**Goal:** Turn the admin panel into the control room for the first test users.

This phase is the immediate priority. It should give David Bee enough data to understand what is working, what users liked, what users disliked, where people got stuck, and which issues need fast manual intervention.

### Stability Fixes Included In Phase 1

Fix these known issues before or during the admin overhaul:

- Returning local users can land on the dashboard with the header nav hidden because startup restores the dashboard and then updates progress as if still on `screen-0`.
- `admin.html` currently awaits admin data loading directly inside the Supabase auth callback. It should follow the same deferred pattern used by the main app.
- The admin "errors in last 24 hours" statistic should count both `error` and `script_failed` only inside the 24-hour window.
- Admin-rendered user data should be escaped before display so unusual pasted content cannot break the admin layout or run as HTML.

### Admin Visibility Requirements

The admin panel should make the first test group easy to observe at a glance.

It should show:

- Total users.
- Users created today or recently active.
- Onboarding status.
- Level selected.
- Scripts generated.
- Videos filmed.
- Last active time.
- Magic-link activity.
- Script generation activity.
- Script failures.
- Other logged errors.
- Per-user progress through the challenge.

### Per-User Detail Requirements

For each user, the admin panel should make it easy to answer:

- Did they start onboarding?
- Did they finish onboarding?
- What answers did they provide?
- Which level are they in?
- Which scripts exist?
- Which scripts were edited or regenerated?
- Which videos were marked filmed?
- Did any generation fail?
- When were they last active?
- What might David Bee need to help them with?

### Admin Troubleshooting Requirements

The admin panel should support fast issue resolution.

It should:

- Show dataset-specific load failures instead of one generic failure.
- Keep useful empty states for new test periods.
- Surface recent errors clearly.
- Make script content readable enough for quick review.
- Keep the manual `is_paid` toggle visible for later operations, but non-blocking during the test period.

### Out Of Scope For Phase 1

Phase 1 does not include:

- Paid access enforcement.
- Systeme.io webhook work.
- Email nudges.
- Gamification.
- Completion redesign.
- Community bridge implementation.
- Posted-vs-filmed tracking.
- Superapp architecture changes.
- Changes to `prompts/blueprints.js`.

---

## Phase 2: Onboarding Update

**Goal:** Make the onboarding the strongest possible foundation for script personalization, mission commitment, and ongoing script context.

This phase will affect the script generation output, the admin panel data structure, and the dashboard mission statement. It needs to be built carefully so nothing in the existing flow breaks. `prompts/blueprints.js` should not be modified — changes to how data is collected and passed to the AI must go through `buildAPIUserMessage()` in `app.js`.

### Add "Say My Own Thing" to Every Choice Screen

Every question that currently uses fixed-option choice cards needs a free-text fallback. Currently screens 2a, 2b, 3, 4 (goal grid), and 5 (mini-goal grid) all use `autoAdvance()` tap-to-select cards with no custom option. Users who don't see themselves in the options either pick the closest wrong answer or feel unseen.

Each screen needs a final option that says something like "Something else — let me say it in my own words" which reveals a short text input. The typed answer saves to state and flows into the script generation the same way a preset answer would. The admin panel needs to display custom answers wherever it currently shows preset answer labels.

This is a significant change — it touches every onboarding screen, the state object, `saveOnboardingToDb`, and how the admin panel renders onboarding data. Plan for it to break things if done carelessly.

### Mission Statement Overhaul

The current mission statement on the dashboard is generated from a simple template combining the user's goal and mini-goal answers. It exists but doesn't land with the emotional weight it should. The commit moment (currently the name screen and the "I'm In" button on screen-6) needs to be redesigned so the user feels like they're making a real declaration, not filling out a form.

This is intentionally left open for David Bee to describe the exact experience he wants. The technical work will follow once the vision is clear. The existing `miniGoalMap` and `missionLine` logic in `buildPlan()` is the starting point.

Key questions David Bee needs to answer before this is built:
- What does the ideal commitment moment look, feel, and say?
- Should the mission statement be editable by the user after the fact?
- Should it appear anywhere outside the dashboard (script view, completion screen)?

### Knowledge Base / Context Documents

Users should be able to upload or paste in supporting documents that give the AI richer context for their scripts. Examples: a master business description, a personal style guide, writing samples, a bio, an offer overview, a list of client results.

This is a meaningful addition to the script personalization system. The uploaded context should be stored per user in Supabase, surfaced in the prompts screen so users know it's active, passed into `buildAPIUserMessage()` as additional context, and visible in the admin panel so David Bee can see what context each user brought in.

Technical considerations:
- Text-only for now. No PDF parsing, no file uploads. Paste-in textarea only.
- Store in a new `user_context` table or as a JSONB field on the users row.
- Cap at a reasonable character limit (around 2,000 characters) so it doesn't blow up the API prompt length.
- The `buildAPIUserMessage()` function will need a new section that appends available context when present.

### Out Of Scope For Phase 2

- Changes to `prompts/blueprints.js`.
- Redesigning the video prompt questions (screen-7). That is covered in Phase 3.
- Paid access enforcement.
- Email automation.

---

## Phase 3: Full User Experience Audit

**Goal:** Once admin visibility is solid and onboarding has been updated, walk the entire user journey end to end and make sure every step feels clear, warm, and safe for a non-technical 45-60 year old who is camera shy. Not a feature sprint — a refinement pass.

### Audit Scope

Review the full journey:

- First visit.
- Returning user detection.
- Magic-link auth.
- Skipping auth.
- Onboarding choices including new free-text options.
- Name capture.
- Recap.
- Topic freewrite.
- MVO screens.
- Video 1 preface.
- Script prompt screen.
- Script generation.
- Script error and fallback states.
- Structured script view.
- Edit view.
- Regeneration.
- Undo and redo.
- Locking a script.
- Marking filmed.
- Skipping a video.
- Dashboard return.
- Copy single script.
- Copy all scripts.
- PDF export.
- Version history.
- Settings.
- Re-run onboarding.
- Level switch.
- Delete and start over.
- Mobile layout.
- Desktop layout.

### Desired Outcome

The experience should make a non-technical, camera-shy user feel:

- They know where they are.
- They know what is done.
- They know what to do next.
- Their work is saved or they understand when it is not.
- They are not being punished for moving slowly.
- The app is helping them complete the challenge, not distracting them from it.

### Out Of Scope For Phase 3

Phase 3 should not become a new feature sprint. It is an audit and refinement phase. Do not add paid gating, email automation, broad gamification, or superapp features here.

---

## Phase 4: Gamification And Completion Experience

**Goal:** Reserved for a later experience layer defined by David Bee.

This phase replaces earlier ideas about immediate community bridge work and a standalone graduation/completion phase. Those older ideas should not be implemented from the handoff. David Bee has a future plan for this and will describe it later.

Until David Bee defines this phase, do not invent:

- Reward mechanics.
- Streak mechanics.
- Completion badges.
- Community posting flows.
- Graduation Event flows.
- Challenge celebration mechanics.
- New progress rituals.

This phase exists as a placeholder so future work has a clear slot without prematurely defining the experience.

---

## Phase 5: Script Output Update

**Goal:** Improve script quality, personalization depth, and output options before the paid access gate goes live.

This phase is intentionally placed after the user experience audit and before paid access enforcement, so that paying users receive the best possible version of the scripts from day one.

David Bee will define the specifics of this phase. The following are known areas of interest:

- Script logic improvements. This is a separate project with its own scope. It will involve working with `buildAPIUserMessage()` and potentially `prompts/blueprints.js` under David Bee's direct instruction. Do not attempt this without an explicit brief.
- Improving how knowledge base context (added in Phase 2) flows into the script output.
- Improving how free-text onboarding answers (added in Phase 2) influence script personalization compared to preset answers.
- Output format options. Whether users can choose different script formats, lengths, or styles is TBD.

### Out Of Scope For Phase 5

- Changes to `prompts/blueprints.js` without explicit instruction from David Bee.
- New video series or challenge types.
- Paid gating (that is Phase 6).

---

## Phase 6: Paid Access And Checkout Bridge

**Goal:** Add revenue protection after the test experience is proven and script output is strong.

This phase should wait until the first test users have helped validate the app experience, the onboarding is solid, and David Bee is satisfied with script quality.

### Intended Direction

The likely access model is:

- Systeme.io purchase occurs.
- Systeme.io sends purchase data to a Vercel endpoint.
- The endpoint finds the matching Supabase user by email.
- Supabase `users.is_paid` is set to `true`.
- Admin override remains available for manual fixes.

### Access Assumptions

When paid access is eventually enforced, it should be careful and humane. A real buyer should not get blocked because of an email mismatch or a magic-link confusion.

The likely gate is not the entire app. The likely gate is access to later videos after the first meaningful experience, but the exact gate should be decided when this phase begins.

### Out Of Scope Until Phase 6

Do not implement paid access enforcement during the test period. The current assumption remains: anyone with the link can use the app.

---

## Phase 7: Email And Follow-Up System

**Goal:** Add nudges only after the product experience is clean and paid access is working.

This phase was intentionally moved later. David Bee does not want test users receiving rough or premature automated emails.

### Timing

Do not add automated lifecycle emails until:

- Admin visibility is strong.
- The user experience has been audited.
- The core flow feels pristine.
- Script output quality is high.
- Email copy and timing can be created with care.
- A real transactional email provider is selected.

### Future Email Moments

Possible later touchpoints:

- First script generated: save progress and encourage the first filming step.
- Stuck for several days: gentle return nudge.
- All seven complete: congratulations and next-step guidance.
- Later event or program reminders when the broader flow is ready.

### Provider Note

Supabase built-in email should not be treated as the long-term lifecycle email system. When this phase begins, use a proper provider such as Postmark or Resend, or whatever provider David Bee chooses at that time.

---

## Phase 8: Long-Term Superapp Foundation

**Goal:** Keep the larger Colorado Mastermind ecosystem in view without building it prematurely.

SeenInSeven is intended to become one module in a broader suite of Colorado Mastermind tools. This larger direction is correct, but it is not current implementation scope.

Future possibilities include:

- Shared account system across multiple tools.
- A unified dashboard for multiple Colorado Mastermind apps.
- A broader admin control center.
- More robust authentication options.
- Cross-tool user history.
- Support and progress visibility across the full offer ecosystem.

Do not start a major architecture rewrite for this now. Let the first user data show what actually matters before reshaping the app around the superapp future.

---

## Do Not Build Yet

These items are intentionally not part of the current implementation plan:

- No community bridge implementation right now.
- No posted-vs-filmed tracking right now.
- No email nudges right now.
- No paid gate right now.
- No Systeme.io webhook right now.
- No gamification mechanics until David Bee defines them.
- No superapp rewrite right now.
- No framework migration.
- No broad state-management rewrite.
- No changes to `prompts/blueprints.js`.

If a future developer or AI session sees these ideas in older docs, they should treat this document as the newer roadmap source of truth.

---

## Verification Standards For Future Work

After any app change, verify:

- `git status` is understood before editing.
- `prompts/blueprints.js` was not changed unless explicitly requested.
- All `.screen` elements remain direct children of `body`.
- Dashboard restore works.
- Magic-link auth still works.
- Supabase auth callback work remains deferred safely.
- LocalStorage restore still works.
- Admin data still loads.
- User-entered admin data is displayed safely.
- Mobile and desktop layouts remain readable.

For documentation-only work, verify:

- No app code changed.
- The roadmap remains linked from `DEVELOPER_HANDOFF.md`.
- This file remains the canonical roadmap reference.

---

## Current Immediate Next Step

The next implementation phase should be Phase 1 only:

**Admin Command Center And Stability.**

Do not skip into later roadmap phases until David Bee explicitly changes the priority.
