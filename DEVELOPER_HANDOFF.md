# SeenInSeven — Developer Handoff Document

**Prepared for:** Incoming developer  
**Project:** SeenInSeven — AI video script builder  
**Owner:** David Bee, Colorado Mastermind  
**Date:** June 2026  
**Repo:** https://github.com/DavidBeeeee/seen-in-seven  
**Live app:** https://studio.coloradomastermind.com
**Admin panel:** https://studio.coloradomastermind.com/admin.html
**Contact:** contact@davidbee.me / 303-596-0511

---

## Roadmap source of truth

Before planning or implementing roadmap work, read `SEENINSEVEN_ROADMAP.md`.

This handoff remains the source of truth for architecture, stack, debugging history, and current implementation shape. Its older roadmap notes are partially superseded by `SEENINSEVEN_ROADMAP.md`, especially around admin priorities, test-user timing, delayed email nudges, delayed paid access, removed posted-vs-filmed work, and the placeholder-only gamification phase.

---

## What this app is

SeenInSeven is the free app reward for joining the 777 Challenge — a group video challenge where first-time entrepreneurs film 7 videos in sequence, building a complete digital brand from scratch.

**The most important thing to understand before touching this codebase:**

The challenge is the product. The app is the bonus. Every design, copy, and UX decision should reinforce that users are part of a community of content creators who are using this to connect with an audience and ultimately earn life-changing income, just as others are doing all around the world — not using an AI tool in isolation. The app interviews the user, finds their voice, and produces fully customized scripts for all 7 videos faster and easier than they could possibly expect. The scripts are built on a proprietary Hero's Journey framework that cannot be replicated.

The current business model: $7 gets access to the community challenge, with this ($300+) app as a free bonus. The upsell at completion is the Exit Escalator Engine (EEE) at $77/month founding rate, which teaches the full 5E framework for ongoing content creation and business building.

---

## Where the code lives

**There is no local codebase to hand off.** The GitHub repository is the single source of truth:

`https://github.com/DavidBeeeee/seen-in-seven`

To start working on this, clone the repo:

```bash
git clone https://github.com/DavidBeeeee/seen-in-seven
cd seen-in-seven
```

No build step, no `npm install`, no bundler. Static files served directly. You can run it locally with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Note: the DeepSeek API proxy (`/api/generate.js`) requires the `DEEPSEEK_API_KEY` environment variable which is stored in Vercel. Script generation won't work locally without it, but the auth flow, dashboard, and all navigation can be tested locally.

**Deployment is automatic.** Every push to the `main` branch on GitHub triggers a Vercel deploy in approximately 30 seconds. There is no manual deployment step.

**Claude works out of a temporary container** (`/home/claude/seen-in-seven`) that resets between sessions. All changes are committed and pushed to GitHub before the session ends. If a new Claude session or developer picks this up, they pull from GitHub — the container history is irrelevant.

---

## What's in the repository

This repo is the entire 777 Challenge project folder, not just the app. Here's everything it contains:

**The SeenInSeven app (deployed to Vercel):**
- `index.html` — the full app
- `admin.html` — admin dashboard
- `css/app.css` — all styles
- `js/app.js` — all application logic
- `js/supabase.js` — auth and database layer
- `prompts/blueprints.js` — core IP, never modify
- `api/generate.js` — DeepSeek serverless proxy
- `vercel.json` — URL routing

**Landing page HTML blocks (for Systeme.io):**
Located in `funnel-pages/`. These are the custom HTML blocks that get pasted into Systeme.io's page builder for the challenge landing pages, checkout pages, upsell/downsell pages, daily challenge pages, and thank you pages. They are not deployed by Vercel — they live here for version control and are manually copied into Systeme.io when updated.

**Project and planning documents:**
- `777_Challenge_Launch_Plan.docx` — full launch plan
- `7v7d7-project-document.docx` — project brief
- `Hero's Journey 777 Video Challenge.md` — framework reference
- `social-launch-kit.md` — social content
- `funnel-audit-brunson.md` — funnel analysis
- `LANDING_PAGES_INVENTORY.md` and `LANDING_PAGES_EDITS_SUMMARY.md` — landing page tracking
- `DEAR_FUTURE_CLAUDE.md` — debugging history (read this)
- `DEVELOPER_HANDOFF.md` — this file

---

## How GitHub Desktop fits in

David uses **GitHub Desktop** on his local machine to sync the repo. The local folder on his machine (inside his project folder) is a clone of this repository.

**Two different Claude tools push to this same repo:**

- **Claude.ai (browser)** — makes changes inside a temporary cloud container (`/home/claude/seen-in-seven`) and pushes directly to GitHub via git CLI. After a Claude.ai session, David needs to **pull in GitHub Desktop** to get those changes onto his local machine.

- **Claude Code (desktop/terminal tool)** — runs on David's local machine and pushes directly to GitHub via git CLI from there. The changes are already local when they go up.

Both tools commit under the same author name (`David Bee <contact@davidbee.me>`), so the git history doesn't distinguish between them. Both push to the `main` branch. Vercel watches `main` and auto-deploys within 30 seconds regardless of which tool pushed.

**GitHub Desktop is David's sync tool**, not a push mechanism for Claude. It gives a visual view of what's changed and is how David pulls Claude.ai session changes down to his local machine.

---

## Technical stack

| Layer | Technology |
|-------|-----------|
| Hosting | Vercel (auto-deploys from GitHub main branch, ~30s) |
| Database + Auth | Supabase (PostgreSQL, Row Level Security, magic link auth) |
| AI scripts | DeepSeek API via Vercel serverless proxy (`/api/generate.js`) |
| Frontend | Vanilla HTML/CSS/JS — no framework |
| Node version | 24.x on Vercel |

**No build step. No bundler. No npm install needed to run.** Static files served directly.

---

## File structure

```
seen-in-seven/
├── index.html          — markup, all 21 screen divs, modals, overlays (~830 lines)
├── admin.html          — admin dashboard (password: magic link to email@davidbee.me only)
├── css/app.css         — all styles (~1,830 lines)
├── js/
│   ├── app.js          — all application logic, global state (~3,600+ lines)
│   └── supabase.js     — auth + database layer, event logging (~400 lines)
├── prompts/
│   └── blueprints.js   — SYSTEM_PROMPT + Hero's Journey blueprints ← CORE IP. NEVER MODIFY.
├── api/
│   └── generate.js     — DeepSeek proxy serverless function
├── vercel.json         — URL rewrites
├── DEAR_FUTURE_CLAUDE.md — debugging history (READ THIS FIRST)
└── DEVELOPER_HANDOFF.md  — this file
```

---

## Database schema (Supabase)

All tables in `public` schema. RLS enabled on all.

| Table | Purpose |
|-------|---------|
| `users` | id, auth_id, email, name, level, blocker, business_stage, is_paid, is_admin, last_active |
| `onboarding` | user_id (UNIQUE), posted, history, goal, mini_goal, mini_goal_text, business, mvo_q2/q3/q4, topic_freewrite |
| `scripts` | user_id, video_number, level, content, version, is_current, thumbs_up, generated_at, edited_at. Trigger auto-increments version on insert. |
| `video_progress` | user_id, video_index, level, status ('filmed'/'skipped'), filmed_at |
| `logs` | user_id, event_type, detail (JSONB), created_at — admin activity log |

**RPC functions (SECURITY DEFINER — bypass RLS):**
- `check_email_exists(email)` — pre-auth lookup for returning users
- `is_admin()` — checks if current user has is_admin flag
- `admin_get_users/scripts/progress/onboarding/logs()` — admin panel data
- `admin_set_paid(user_id, paid)` — toggle is_paid from admin panel

**Auth method:** Supabase magic link (passwordless email OTP). No passwords.

**Admin access:** Only `email@davidbee.me` can access `admin.html`. Gated by `is_admin = true` in the users table.

---

## Key architecture decisions and why

**1. Global mutable state in `app.js`**

The entire app state lives in a single `state` object plus a handful of globals (`currentIndex`, `currentVideoIndex`, `screenOrder`, `editingFromPlan`). This is a deliberate choice — the app started as a single-file HTML and was refactored incrementally. A full state management rewrite is on the long-term roadmap but was intentionally deferred to prove the core product first.

**2. Magic link auth only**

Users never create passwords. They enter their email, get a link, click it. This creates less friction for a 50+ non-technical audience (David's primary user base) but means persistent sessions depend on the same device/browser until the token expires. The Supabase session auto-refreshes silently.

**3. `onAuthStateChange` deadlock pattern — critical**

Supabase holds an internal navigator lock during `onAuthStateChange` callbacks. Any `await` on a Supabase database call inside this callback deadlocks forever. All DB work in the auth callback is deferred via `setTimeout(0)`. This pattern is load-bearing — do not remove it or move the DB calls back into the synchronous callback body.

**4. `blueprints.js` is untouchable**

The AI system prompt and Hero's Journey blueprints in `prompts/blueprints.js` are David's core intellectual property. They run through multiple API iterations and produce something that cannot be replicated by a base LLM. This file has never been modified and must never be modified without explicit instruction from David.

**5. DeepSeek proxy**

The AI API key never hits the browser. All generation calls go through `/api/generate.js` on Vercel. The key is stored as `DEEPSEEK_API_KEY` in Vercel environment variables.

---

## Screen flow

The app has 21 screens, all `<div class="screen">` elements that are direct children of `<body>`. This is a hard structural requirement — see the debugging section.

**New user path (never posted):**
`screen-0` → `screen-1` → `screen-email` → `screen-2a` → `screen-3` → `screen-4` → `screen-5` → `screen-6` → `screen-recap` → `screen-checklist` → `screen-comm-layers` → `screen-mvo2` → `screen-mvo3` → `screen-mvo4` → `screen-7` (prompts) → `screen-script-loading` → `screen-script` → `plan-screen` (dashboard)

**Previously posted path:** Same but `screen-2b` instead of `screen-2a`.

**Key global variables:**
- `screenOrder[]` — the active screen sequence (expands after screen-1)
- `currentIndex` — position in screenOrder
- `currentVideoIndex` — which of the 7 videos is active (0-based)
- `editingFromPlan` — true when user came from dashboard to edit a script

---

## The script generation system

1. User answers onboarding questions (screens 2-6, MVO screens, prompts screen)
2. `buildAPIUserMessage(videoIdx)` constructs the user prompt from state
3. `callDeepSeekAPIRaw(systemMsg, userMsg)` calls the proxy
4. Response is parsed by `parseScriptSections(text)` into sections (HOOK, OPEN LOOP, MEAT, CTA)
5. Rendered in two views: **Structured** (section-by-section with psychological rationale) and **Edit** (clean textarea for direct editing)
6. Individual sections can be regenerated via `regenerateSection()`
7. Undo/redo system: every generation and edit (debounced 2s) pushes to a per-video undo stack in `state.videos['_undo_v' + idx]`

**Version model:**
- Script is saved to DB on first generation (`queueScriptSave`)
- Manual edits update the current row in-place (`saveScriptEditToDb`)
- New DB version created only when user clicks "Lock In This Script" (sets `locked_v{idx}` in state) or "Delete & Start Over" (explicit snapshot before wiping)
- The Supabase trigger auto-increments `version` and flips `is_current` on new inserts

---

## Roadmap

The full phased roadmap lives in `SEENINSEVEN_ROADMAP.md` in this repo. **That document is the canonical source of truth for what to build next.** Treat it as more current than any older handoff notes or session history.

The phases are strictly sequential — do not skip ahead. Phase 1 must be complete before Phase 2 begins, and so on. The roadmap document explains why each phase is ordered the way it is.

Quick summary of phases in order — do not skip ahead:
1. **Admin Command Center and Stability** — current priority
2. **Onboarding Update** — free-text options on all choice screens, mission statement overhaul, knowledge base context documents
3. **Full User Experience Audit** — end-to-end refinement pass, not a feature sprint
4. **Gamification and Completion Experience** — placeholder, defined by David Bee when ready
5. **Script Output Update** — improve personalization depth and output quality before the paywall goes live
6. **Paid Access and Checkout Bridge** — Systeme.io webhook, is_paid enforcement
7. **Email and Follow-Up System** — automated nudges, requires proper transactional email provider
8. **Long-Term Superapp Foundation** — future direction, not current scope

---

- Full onboarding flow (all 21 screens)
- Magic link authentication — new and returning users
- Script generation for all 7 videos, both levels (Relatable Hero L1, Authority Series L2)
- Section-level regeneration with undo/redo
- Dashboard with progress ring, video cards, version history modal
- Lock In workflow: Lock → Next Video button → filmed toggle → confetti → dashboard
- Settings panel (accessible from any screen): name, email, level switch, re-run onboarding
- Admin panel: all users, onboarding answers, script content, activity log, set paid toggle
- Event logging: script_generated, script_failed, auth_completed, video_filmed, magic_link_sent
- Start Over (clears scripts and onboarding, stays logged in, stays on dashboard)
- Fullscreen preview mode for scripts
- PDF export (single script and all scripts)
- Copy (single script and all scripts)
- Vubli partner card (unlocks after first script generated)

---

## What is NOT built yet (roadmap)

**Phase 5 — The business-critical items:**

**1. `is_paid` access control**
The `is_paid` column exists on every user row but is never checked. Anyone who finds the app URL can use all 7 scripts for free. When real money flows through the $7 checkout, this needs to gate access to videos 2-7. The mechanism: Systeme.io fires a webhook to a Vercel API endpoint after purchase → the endpoint updates `is_paid = true` for the matching email. David can manually flip it via the admin panel in the meantime.

**2. Community bridge**
The Facebook group (`facebook.com/groups/coloradobiz`) is a core part of the product, not a footnote. Three moments in the app need a prominent, emotional bridge to the community: after first script generated, after each video filmed, and after all 7 completed. Currently there is only a small card at the bottom of the dashboard.

**3. Graduation Event bridge**
When all 7 videos are filmed, the completion screen needs to explicitly name the Graduation Event, build anticipation, and provide a register link. Currently it just says "Level Complete" and links cold to the EEE page.

**4. Email touchpoints**
Transactional emails for: first script generated (save your progress), 3-day nudge if stuck, completion congratulations, Graduation Event reminder. Requires a transactional email provider — Supabase's built-in mailer is rate-limited and unreliable for this. Postmark or Resend are recommended.

**5. "Posted" distinction**
The app tracks "filmed" but the challenge requires videos to be posted publicly. Separating these two states would allow measuring real challenge completion and triggering the community bridge at the right moment.

**Long-term — The superapp vision:**

SeenInSeven is intended to become one module in a unified superapp that links 4+ Colorado Mastermind coaching tools. Long-term priorities include:

- A proper login screen (email/password + magic link option) rather than magic-link-only
- Supabase auth configured for email/password with OTP as an option
- A unified user account that works across multiple tools
- The admin panel growing into a full control center across all tools

When that refactor happens, the auth layer in `supabase.js` is the main thing to rewrite. The rest of the app (state, screens, generation) is largely independent of auth mechanism.

---

## David's preferences and working style

**Voice and copy rules — strictly enforced:**
- No em dashes anywhere. Ever. Use periods, commas, colons, parentheses, or ellipsis instead.
- No bold text emphasis mid-paragraph (headers and CTAs only)
- Banned words: algorithm, framework, funnel, ebook, guru, cohort, ultimately, resonate, webinar, "AI slop"
- No "not because X but because Y" / "that's not X that's Y" constructions
- No "most people" or "version of you" generalizations
- Face emojis only, at genuine emotional beats. No object or symbol emojis in copy.
- The challenge is always the product. SeenInSeven is always the bonus. Never reverse this.

**Design preferences:**
- Brand colors: Teal Deep `#0D2828`, Teal Vivid `#32B8B8`, Gold `#C8A84B`, Gold Light `#E8C86C`, Green `#4ade80`
- Fonts: Lora (headlines, serif italic), Nunito (body), Oswald (labels, buttons, eyebrows), Permanent Marker (pull quotes), Space Mono (technical, monospace labels)
- Body copy minimum 18px, line-height 1.75-1.85 (audience skews 50+)
- Buttons: 14-15px Oswald
- Eyebrows: 12px Space Mono, 0.28em letter-spacing
- One bold sentence per section (for skimmers), never em dashes

**Development preferences:**
- Make it work, don't over-engineer. Prove the core product before adding complexity.
- No new offer layers or feature additions before the existing funnel is proven.
- IP in `blueprints.js` is never touched.
- Straightforward UX — the user base is non-technical, often 50+, camera-shy, first-time content creators.
- Progress and momentum matter more than feature completeness. Every screen should answer: where am I, what's done, what's next.

**Systeme.io is the payment/landing page platform.** Custom HTML blocks on Systeme must not contain full document structure (`<!DOCTYPE>`, `<html>`, `<head>`, `<body>` tags). CSS classes are prefixed per page to prevent style bleed. OnlineCourseHost is the course delivery platform and should never be named directly in customer-facing copy.

---

## Debugging history — mistakes made, bugs found, lessons learned

Read `DEAR_FUTURE_CLAUDE.md` first. It documents the single most expensive debugging session in this project.

**The blank screen saga:**
The dashboard (`plan-screen`) was rendering with correct CSS, correct classes, correct innerHTML, but zero dimensions — `getBoundingClientRect()` returned all zeros. Multiple sessions concluded it was a JavaScript timing issue and spent hours on:
- `transitioning` flag races between concurrent auth events
- Double `showDashboard` calls from `initAuth` and `onAuthStateChange`
- Supabase auth deadlocks from awaiting DB calls inside the auth callback
- A missing `</head>` tag (real bug, not the blank screen)
- Animation timing issues in `showScreen`

**The actual cause: two missing `</div>` tags in `index.html`.** `screen-comm-layers` was never closed. The browser parsed every subsequent screen as a child of it. Since `.screen { display: none }`, all children inherited zero dimensions regardless of their own CSS. Total debugging time across multiple sessions: approximately 12-15 hours.

**The diagnostic you run first, before touching JavaScript:**
```js
const el = document.getElementById('THE-BLANK-ELEMENT');
let node = el;
while (node && node !== document.body) {
  const r = node.getBoundingClientRect();
  console.log(node.tagName, '#' + node.id, r.width + 'x' + r.height, getComputedStyle(node).display);
  node = node.parentElement;
}
```
If any ancestor has zero dimensions, the bug is in the HTML structure, not JavaScript.

**Also run this to verify all screens are direct body children:**
```js
[...document.querySelectorAll('.screen')].filter(s => s.parentElement !== document.body).map(s => s.id + ' inside: ' + s.parentElement.id)
```
Should return an empty array. If it doesn't, find and close the unclosed tag.

**Other confirmed bugs found and fixed:**

1. `renderVideoIntro()` takes a 1-based video number. Multiple navigation functions passed 0-based indices, sending users back to the same video. Always use `idx + 2` (not `idx + 1`) when calling `renderVideoIntro` from a 0-based index.

2. `onAuthStateChange` Supabase deadlock. Awaiting any DB call inside this callback causes a permanent hang. All DB work is deferred via `setTimeout(0)`. This is not optional.

3. `_mergeLocalStorage` only merged the videos object when it was empty. After `_restoreFromDatabase` runs, videos are already populated from DB, so localStorage keys like `locked_v0`, `_undo_v0`, and prompt answers were silently discarded on every return visit. Now uses an additive merge.

4. `goBackToPrompts` (both the script view back button and the prompts screen back button) was routing to `screen-7` for video 0. Video 0 uses `screen-comm-layers`, not `screen-7`. Required separate handling.

5. `dismissBanner` ("Start Fresh" on the returning user banner) was calling `signOut()`, logging the user out entirely. Should only clear local state.

6. The settings panel was inside `plan-screen` div. Since `plan-screen` has `display: none` on all other screens, `position: fixed` children are still invisible when the parent is `display: none`. The panel had to be moved to body level.

7. `confirmLevelChange` (in Settings) didn't archive existing scripts before switching levels. Scripts stored by index (`script_v0`) would render against wrong video titles after a level switch. Fixed to mirror `runItAgain()` which correctly archives L1 scripts to `l1Videos` before clearing.

8. The admin panel used direct Supabase table queries which hit RLS. Even with `is_admin = true`, the anon key couldn't read other users' data through standard queries. Fixed by using `SECURITY DEFINER` RPC functions that bypass RLS and verify admin status internally.

9. Multiple `copyScript` / `copyAllScripts` functions were reading from the textarea element value, which is empty when the user is on the Structured view. Always read from `state.videos['script_v' + idx]` as the source of truth.

10. `goBackToPrompts` set `editingFromPlan = true` when navigating backwards through normal flow. This caused the script view footer to show "Done — Back to Dashboard" instead of the normal "Next Video" CTA.

---

## Key URLs and credentials (for reference)

| Resource | URL / Value |
|----------|-------------|
| App | https://studio.coloradomastermind.com |
| Admin | https://studio.coloradomastermind.com/admin.html |
| GitHub | https://github.com/DavidBeeeee/seen-in-seven |
| Supabase project | zdtkwpzdwnzzmdwrvmka |
| Supabase URL | https://zdtkwpzdwnzzmdwrvmka.supabase.co |
| Vercel project ID | prj_z0cydoxLzaTOusdNd7kpkDyMdFou |
| Challenge landing | content.coloradomastermind.com/777challenge |
| Free trial | content.coloradomastermind.com/7videos |
| EEE membership | content.coloradomastermind.com/yeees |
| Facebook group | facebook.com/groups/coloradobiz |
| Calendly | calendly.com/davidbee |
| David email | email@davidbee.me / contact@davidbee.me |
| David phone | 303-596-0511 |

---

## What to read before writing any copy

The following principles govern every word of copy in this app and the broader Colorado Mastermind brand:

- The challenge is the product. The $311 app is the bonus. Do not reverse this.
- The Graduation Event is never called a webinar. It is a live training.
- The seven videos are not a streak challenge. Order matters. Pace does not.
- David is a peer doing the challenge alongside participants, not an expert coaching from above.
- The Facebook community is the participant's first real audience and an active algorithm boost, not just accountability. Never undersell it.
- The framework behind the 7 videos is described publicly as "scientifically, sociologically, and historically proven." Never use: framework, psychological architecture, Hero's Journey, or algorithm in public-facing copy.
- The open loop in each script is a specific mechanical device. It looks like a loose or unnecessary sentence. It is not. Never remove it.
- If it sounds like David, it stays. Loose, conversational, and playful language is correct, not a mistake.
