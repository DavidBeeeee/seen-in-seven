# SeenInSeven — Developer Handoff Document

**Prepared for:** Incoming developer  
**Project:** SeenInSeven — AI video script builder  
**Owner:** David Bee, Colorado Mastermind  
**Date:** June 2026, updated July 20, 2026
**Repo:** https://github.com/DavidBeeeee/seen-in-seven  
**Live app:** https://studio.coloradomastermind.com
**Studio admin:** https://studio.coloradomastermind.com/admin
**SeenInSeven admin:** https://studio.coloradomastermind.com/admin/seeninseven
**Contact:** contact@davidbee.me / 303-596-0511

---

## Roadmap source of truth

Before planning or implementing roadmap work, read `SEENINSEVEN_ROADMAP.md`.

This handoff remains the source of truth for architecture, stack, debugging history, and current implementation shape. Its older roadmap notes are partially superseded by `SEENINSEVEN_ROADMAP.md`, especially around admin priorities, test-user timing, delayed email nudges, delayed paid access, removed posted-vs-filmed work, and the placeholder-only gamification phase.

---

## July 18, 2026 implementation record: Studio, AI Boardroom, and Prompt Tester

This section records the complete Studio expansion completed on July 18, 2026. It supersedes older statements in this document that describe the superapp, unified administration, AI Boardroom, or prompt editing as future work.

### Final product shape

`studio.coloradomastermind.com` is now the master Colorado Mastermind Studio application. It provides one login and one home for all current and future tools. SeenInSeven is one app inside Studio, not the Studio itself. AI Boardroom is the second connected app.

| Surface | Purpose | Source |
|---------|---------|--------|
| `/` | Studio login and customer app hub | this repository |
| `/seeninseven` | Full SeenInSeven experience | this repository |
| `/boardroom` | Full AI Boardroom experience under the Studio domain | proxied to the `DavidBeeeee/boardroom2` Vercel app |
| `/admin` | Studio-wide customers, access, and app summaries | this repository |
| `/admin/seeninseven` | Detailed SeenInSeven progress and support admin | this repository |
| `/admin/seeninseven/prompt-tester` | Restricted prompt testing and publishing workspace | this repository |
| `/admin/boardroom` | AI Boardroom access and activity admin | this repository |

The two code repositories are deliberately separate:

- Studio, SeenInSeven, shared access, and all production Supabase migrations: `https://github.com/DavidBeeeee/seen-in-seven`
- Full AI Boardroom Next.js app: `https://github.com/DavidBeeeee/boardroom2`

`vercel.json` rewrites `/boardroom` and its child paths to `https://boardroom2.vercel.app/boardroom`. This lets Boardroom keep its own deployment while appearing under the Studio domain and using the same Studio Supabase session. Do not copy the Boardroom source into this repository or point customers directly at `boardroom2.vercel.app` without a deliberate architecture change.

### 1. Studio customer hub

The former standalone SeenInSeven root was moved to `seeninseven.html`. `index.html` is now the Studio home.

Studio provides:

- One Supabase login shared by every Studio app.
- A customer profile greeting and app workspace.
- Dark and light modes, using the same preference pattern as SeenInSeven.
- App cards that show whether access is active or locked.
- SeenInSeven and AI Boardroom as separate entitlements.
- A restrained early-access message for locked apps instead of an aggressive upsell.
- A direct email path to David Bee for early access.

Studio access is not the same as authentication. A person may have a valid Studio login but no entitlement to a particular app.

Access is stored in `studio_entitlements` using:

- `app_key`: currently `seeninseven` or `boardroom`
- `status`: `active` or `revoked`
- `access_source`: `beta`, `manual`, `systeme`, or `admin`
- optional `expires_at`

All users who existed when Studio launched received active SeenInSeven beta access. AI Boardroom access is granted separately. The old SeenInSeven `users.is_paid` field remains for legacy/future use but is not the Studio entitlement system.

Systeme.io automation is intentionally deferred. A future Systeme webhook should grant or revoke rows in `studio_entitlements`; it should not create another login system or write app access into `is_paid`.

### 2. Studio-wide administration

`/admin` is the master control room. It loads customers, Studio entitlements, SeenInSeven scripts/progress/logs, and Boardroom activity through admin-gated RPCs.

It supports:

- Total customer and active-access summaries.
- SeenInSeven and Boardroom usage summaries.
- Customer search and access filters.
- Granting and revoking SeenInSeven or Boardroom access.
- A per-customer drawer showing each connected app.
- Direct entry into each app-specific admin.

App-specific administration remains available because the master view cannot replace detailed troubleshooting:

- `/admin/seeninseven` shows onboarding, scripts, video progress, events, errors, and SeenInSeven support details.
- `/admin/boardroom` shows access, profile completion, conversation/message/document counts, active and completed work cards, and last activity.

Revoking Boardroom access blocks entry immediately but does not delete the user's workspace or saved work. Regranting access restores the same data.

### 3. AI Boardroom integration

The fully developed `boardroom2` app was connected, not the old single-file HTML experiment.

Boardroom now uses the Studio Supabase project and enforces two checks on every workspace operation:

1. The signed-in Studio customer has an active `boardroom` entitlement.
2. The authenticated Supabase user is a member of the requested Boardroom workspace.

First entry calls `boardroom_ensure_workspace()`. It creates a private workspace, owner membership, workspace settings, and starter profile when needed. Every Boardroom data row carries `workspace_id`, and Row Level Security prevents one customer from seeing another customer's data.

Boardroom data includes:

- Workspaces and workspace members.
- Workspace settings and guardrails.
- Private uploaded documents in the `boardroom-documents` Storage bucket.
- Conversations and messages.
- Advisor Work Cards.
- Generated memory entries.
- One private CEO profile per workspace.

The customer's CEO profile contains preferred name, role, business name, business description, ideal customer, offers, goals, constraints, and additional context. New customers complete it before entering the Boardroom and can edit it later under My Profile.

The profile is verified workspace context in every group and one-to-one conversation. Context order is important: profile and workspace guardrails, documents, memory, recent conversation, then active work-card context. The prompt explicitly tells advisors not to assume every customer is David or reuse another workspace's identity.

David's existing workspace was seeded with his Colorado Mastermind profile so his current behavior stayed intact. Other customers receive their own blank/starter profile.

Fresh Start intentionally clears conversations, cards, and generated memory while preserving the profile, uploaded documents, workspace settings, and membership.

Advisor personalities and the current team were intentionally left functionally unchanged. A future phase may add advisor creation, removal, and personality editing, but this was not part of today's integration.

### 4. SeenInSeven Prompt Tester

The Prompt Tester at `/admin/seeninseven/prompt-tester` is an administrator-only workspace for rapid blueprint iteration.

It contains:

- The complete currently published `prompts/blueprints.js` source.
- A browser-local working draft with edit undo and restore-published controls.
- Real user onboarding, previous scripts, and available prompt answers loaded as read-only copies.
- Level- and video-specific question boxes.
- Easy and Extended question modes for Videos 2 through 7.
- Prefilled answers when a user has saved them.
- Blank editable test fields when no answer exists, plus Clear Test Answers and Restore User Answers.
- The complete assembled user-message window showing all context that will influence the test.
- Test generation through the existing DeepSeek proxy without saving the output to the user.
- Raw and final output views.

Tester state is stored only in the administrator's browser. The selected user, video, level, question mode, test answers, and assembled message survive reloads or navigating away. Tester changes never update the selected user's onboarding, scripts, or prompt answers.

SeenInSeven itself now saves a level-keyed copy of users' prompt answers in `onboarding.video_answers`. Level 1 and Level 2 are separated to prevent their shared field names from colliding. This enables future cross-device restore and Prompt Tester prefilling. Video 1 can also be reconstructed from onboarding data. Older Video 2 through 7 answers that only existed in a user's browser before this change cannot be recovered centrally; future answers are saved as users type.

The Prompt Tester question catalog is in `js/admin-prompt-questions.js`. It is an admin-only copy of the question labels, hints, keys, and placeholders in `js/app.js`. When SeenInSeven questions change, update both and run a parity check.

#### Focused prompt architecture

`prompts/blueprints.js` remains one source file, but its generation rules are organized in level order: Level 1 Videos 1 through 7, followed by Level 2 Videos 1 through 7. Each of the 14 sections contains that exact level/video combination's video blueprint, level rules, and local section guidance.

On July 20, 2026, David explicitly authorized a full prompt refinement pass. The old copyable Hook/Open Loop/Conclusion/CTA examples were replaced with per-video guidance about the move each section must make. The global generation order is now: choose the engagement ending, write MEAT, write CONCLUSION, design OPEN LOOP backward from that conclusion, engineer HOOK as a separate pattern interrupt, then write CTA. The hook captures pre-story attention; the open loop converts that interruption into one exact unanswered question; the conclusion answers it; and the CTA bridges from the conclusion before stating an action and reason. Hooks must not be progress reports, summaries, soft identification, or early lesson reveals. Open loops must not disclose the result or use an unnamed "something changed" as the mystery. CTAs must not begin with a video/series label.

The internal seven-video arc is currently: V1 declaration/introduction, V2 ordinary world and human identity, V3 first epiphany, V4 road of trials, V5 fall/ordeal, V6 second epiphany/finding the elixir, V7 return. The challenge itself remains intentionally named in the fixed Video 1 declaration and existing series orientation. Internal Hero's Journey terms are not used in the revised Level 1 question titles or explanations.

On July 20, the full Level 1 question contract was rebuilt around that arc. V1 keeps the fixed challenge declaration, the specific blocker, why the challenge matters now, and optional context; the required "who are you here to reach" field was removed for Level 1 because onboarding already provides audience context. V2 is a broad human introduction: background, an unexpected detail, and what the speaker naturally cares about. V3 collects one thing the speaker used to think was true, the moment or pattern that challenged it, and the cost; the blueprint infers the narrowest defensible first reframe rather than making the participant answer the same insight several ways. V4 is an honest midpoint report built from expected versus actual, one concrete detail, an emerging change, what remains difficult, and why the speaker continues. V5 now returns to the participant's larger life story and tells the ordeal that followed the first realization; it is explicitly not a report about filming the challenge. V6 reveals the larger second epiphany earned through that ordeal and must deepen rather than repeat V3. V7 compares the person's earlier and present identity, acknowledges what remains unfinished, and explains what telling the story across seven videos helped clarify without claiming the challenge caused their entire life transformation.

Level 1 and Level 2 now have separate Easy Mode question sets. The Level 2 extended questions were not redesigned in this pass. The user-facing question catalog in `js/app.js` and the admin copy in `js/admin-prompt-questions.js` must remain identical. The Prompt Tester chooses the matching level's Easy Mode question instead of using one shared list.

`js/script-prompt-engine.js` is the shared assembly layer used by both SeenInSeven and the Prompt Tester. For a generation request, it sends the global rules plus only the matching level/video section. This prevents one video from receiving all 14 sets of specialized instructions while keeping a single editable blueprint source.

Generation context is cumulative within the active level only. Each prior video contributes its latest current or locked script and its actual saved answers once. The current video's answers are placed last so they have the strongest immediate relevance. Edited script-version history is not sent.

Both production and the Prompt Tester use the same prompt focusing, context assembly, output validation, semantic review, targeted repair, and final-script assembly. As of July 21, 2026, every first draft receives a low-temperature DeepSeek story-editor pass even when its labels and word counts are valid. The editor judges whether the Hook is a real pattern interrupt, the Open Loop preserves one concrete unanswered relationship without leaking the Conclusion, the Meat carries the local Hero's Journey movement without repetition, the Conclusion creates an earned turn, and the CTA bridges naturally into a follow request. It also checks disguised false balance and generic AI phrasing. When a section fails, the editor returns replacements only for the failed sections; passing sections are preserved exactly. One precision re-review checks the merged script. Production Preview keeps the production drafting temperature of `0.8`, Consistent Test keeps `0.25`, and both use `0.15` for the shared review pass.

Deterministic validation checks all five labels, enforces the 50-word Open Loop maximum, rejects vague or conclusion-leaking Open Loops, and applies the absolute banned-language list section by section. `version`, `lazy`, and `resonate` are banned as complete words in every context, along with the other listed phrases. Every CTA must make follow the primary action, use `because` exactly once, identify the current installment inside the seven-part sequence, and keep series orientation out of its opening bridge sentence. Video 7 has extra gates: it must acknowledge the completed Video 7 of 7 arc, invite late viewers back to Video 1, create an ongoing relational reason to follow, and avoid another-installment promises or manufactured urgency. Video 1's prewritten challenge declaration is still inserted between Open Loop and Meat in the canonical final script used for display, copy, PDF, database `final_content`, and future-video context. Section regeneration uses the same focused system prompt and cumulative context as full generation, then runs the semantic editor against only the requested section while treating the other four sections as read-only context.

The tester's Comparison Mode still produces one output at a time. Consistent Test uses lower creativity (`0.25`) for close comparisons; Production Preview uses the production setting (`0.8`). Every newly generated script records a 12-character fingerprint of the exact system prompt in `scripts.prompt_version`. Existing scripts remain unchanged with a null version. Prompt versions are administrator-facing only.

### 5. Blueprint publishing safety

Prompt publishing is handled by `api/prompt-blueprint.js`, not by direct browser access to GitHub.

The publishing flow:

1. Validates the Supabase session and current admin status.
2. Validates the complete blueprint structure and required markers.
3. Shows a change review.
4. Requires two confirmations, including typing `APPLY BLUEPRINT`.
5. Creates a commit directly on `main` for `prompts/blueprints.js` only.
6. Allows Undo Last Publish only when the latest relevant commit came from the Prompt Tester. Undo creates a new reversal commit rather than rewriting history.

Vercel has a restricted `GITHUB_PROMPT_TOKEN`. It must remain a fine-grained token with Contents read/write access to only `DavidBeeeee/seen-in-seven`. Never replace it with a broad personal token or expose it to the browser.

Outside this explicit admin publishing flow, `prompts/blueprints.js` remains protected core IP and must not be edited without David's direct instruction.

### 6. Authentication and administrator corrections

All Studio admin surfaces currently recognize these administrator emails:

- `contact@davidbee.me`
- `davidkamau.t@gmail.com`
- `davidkamau@live.com`

The matching server-side allowlist lives inside `provision_admin_account()`. Client allowlists exist in `js/admin-studio.js`, `admin-seeninseven.html`, `js/admin-boardroom.js`, and `js/admin-prompt-tester.js`. All copies must be changed together when an admin is added or removed.

`contact@davidbee.me` and `davidkamau.t@gmail.com` are separate Supabase identities even though they belong to David. Both were granted admin access. Do not try to merge their database identities merely because the inboxes belong to the same person.

`shytanthecat@yahoo.com` remains a non-admin test account.

The Prompt Tester originally appeared to remain logged out because `.auth-screen` had a display rule that overrode the HTML `hidden` attribute. The stylesheet now contains `[hidden] { display:none !important; }`. Preserve that rule on admin pages that use the `hidden` attribute.

The critical Supabase auth rule still applies everywhere: do not await database work directly inside `onAuthStateChange`. Defer it with `setTimeout(0)` so Supabase can release its internal navigator lock.

### 7. Supabase migrations applied during this implementation

These migration files in the Studio repository describe the production changes and were applied to project `zdtkwpzdwnzzmdwrvmka`:

1. `2026-07-18-add-studio-entitlements.sql`
2. `2026-07-18-add-boardroom-to-studio.sql`
3. `2026-07-18-fix-boardroom-admin-activity-order.sql`
4. `2026-07-18-add-boardroom-user-profiles.sql`
5. `2026-07-18-fix-boardroom-profile-workspace-setup.sql`
6. `2026-07-19-fix-admin-email-allowlist.sql`
7. `2026-07-20-add-video-prompt-answers.sql`
8. `2026-07-19-add-script-prompt-version.sql`

The SQL files inside the `boardroom2/supabase` directory belong to the older standalone Boardroom setup and are historical reference only. Do not apply them to Studio. The Studio repository migrations are the production schema source of truth.

### 8. Deployment and verification record

The work shipped through SeenInSeven pull requests #1 through #8 and Boardroom pull request #1 plus the private-profile follow-up commit.

Production verification covered:

- Studio and each admin route.
- Shared authentication behavior.
- App entitlement grant and revoke flows.
- Boardroom workspace creation, profile isolation, and admin activity.
- Prompt Tester authentication and hidden-state behavior.
- Correct Level 1 and Level 2 question catalogs.
- Prefill, clear, restore, and browser persistence in the Prompt Tester.
- Desktop and mobile overflow checks.
- SeenInSeven startup after answer persistence was added.
- Confirmation that `prompts/blueprints.js` remained byte-for-byte unchanged during the tester build.
- Focused selection of exactly one of the 14 level/video rule sections per generation.
- Same-level cumulative context with one latest current script per prior video.
- Production and Prompt Tester parity for prompt assembly, validation, repair, and Video 1 declaration placement.
- Prompt-version recording for newly generated scripts.

### 9. Deliberately deferred next steps

- Systeme.io webhook automation for Studio entitlements.
- Paid-access enforcement outside the current beta period.
- Additional EEE apps inside Studio.
- Cross-app progress reporting beyond the current Studio summaries.
- Custom Boardroom advisor creation, removal, and personality editing.
- General-purpose ongoing prompt controls after David finishes the intensive blueprint iteration phase.

Do not create a second Studio, second SeenInSeven deployment, or separate login for a future app. New tools should use the Studio Supabase identity and `studio_entitlements`, then appear in the Studio hub and both levels of administration.

---

## What this app is

SeenInSeven is the free app reward for joining the 777 Challenge — a group video challenge where first-time entrepreneurs film 7 videos in sequence, building a complete digital brand from scratch.

**The most important thing to understand before touching this codebase:**

The challenge is the product. The app is the bonus. Every design, copy, and UX decision should reinforce that users are part of a community of content creators who are using this to connect with an audience and ultimately earn life-changing income, just as others are doing all around the world — not using an AI tool in isolation. The app interviews the user, finds their voice, and produces fully customized scripts for all 7 videos faster and easier than they could possibly expect. The scripts are built on a proprietary Hero's Journey framework that cannot be replicated.

The current business model: $7 gets access to the community challenge, with this ($300+) app as a free bonus. The upsell at completion is the Exit Escalator Engine (EEE) at $77/month founding rate, which teaches the full 5E framework for ongoing content creation and business building.

---

## Where the code lives

The GitHub repository is the shared source of truth. Developers and coding tools may work from local or temporary clones, but completed work must be committed and published here:

`https://github.com/DavidBeeeee/seen-in-seven`

To start working on this, clone the repo:

```bash
git clone https://github.com/DavidBeeeee/seen-in-seven
cd seen-in-seven
```

The Studio and SeenInSeven repository has no build step, package install, or bundler. Its static files can be run locally with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Note: the DeepSeek API proxy (`/api/generate.js`) requires the `DEEPSEEK_API_KEY` environment variable which is stored in Vercel. Script generation won't work locally without it, but the auth flow, dashboard, and all navigation can be tested locally.

**Deployment is automatic.** Every push to the `main` branch on GitHub triggers a Vercel deploy in approximately 30 seconds. There is no manual deployment step.

Coding tools may work from David's local checkout or from a temporary cloud clone. In either case, GitHub `main` is the handoff point and Vercel deployment source. Pull the latest published changes before beginning new work.

---

## What's in the repository

This repo is the entire 777 Challenge project folder, not just the app. Here's everything it contains:

**The SeenInSeven app (deployed to Vercel):**
- `index.html` — Colorado Mastermind Studio dashboard
- `seeninseven.html` — the full SeenInSeven app
- `admin.html` — Studio-wide customer and app-access dashboard
- `admin-seeninseven.html` — detailed SeenInSeven progress and support dashboard
- `admin-boardroom.html` — AI Boardroom access and activity dashboard
- `admin-prompt-tester.html` — restricted SeenInSeven prompt testing workspace
- `css/app.css` — all styles
- `js/app.js` — all application logic
- `js/admin-boardroom.js` — Boardroom administration
- `js/admin-prompt-tester.js` — Prompt Tester state, testing, and publishing
- `js/admin-prompt-questions.js` — Prompt Tester's level/video question catalog
- `js/supabase.js` — auth and database layer
- `prompts/blueprints.js` — protected core IP; modify only with David's explicit instruction
- `api/generate.js` — DeepSeek serverless proxy
- `api/prompt-blueprint.js` — admin-gated blueprint read, publish, and undo endpoint
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
| Database + Auth | Supabase (PostgreSQL, Row Level Security, shared email/password and magic link auth) |
| AI scripts | DeepSeek API via Vercel serverless proxy (`/api/generate.js`) |
| Studio + SeenInSeven frontend | Vanilla HTML/CSS/JS, no framework |
| AI Boardroom | Separate Next.js app in `DavidBeeeee/boardroom2`, proxied under `/boardroom` |
| Node version | 24.x on Vercel |

This repository has no frontend build step. AI Boardroom has its own Node/Next.js build and deployment.

---

## File structure

> **Note (July 2026):** the file structure, schema, and RPC list below have drifted from reality in several places (screen count, `screen-comm-layers` references, password auth was added, points system was added). `CLAUDE.md` and `SEENINSEVEN_ROADMAP.md` in this repo are kept current every session and should be treated as more authoritative than this section until it gets a full rewrite. The schema/RPC tables immediately below have been corrected as of July 2026; the file-structure tree and screen-flow section further down have not.

```
seen-in-seven/
├── index.html          — Colorado Mastermind Studio dashboard and login
├── seeninseven.html    — SeenInSeven screens, modals, and overlays
├── admin.html          — Studio-wide admin (magic link, allowlisted emails only)
├── admin-seeninseven.html — detailed SeenInSeven app admin
├── admin-boardroom.html — AI Boardroom access and activity admin
├── admin-prompt-tester.html — restricted SeenInSeven prompt tester
├── css/admin-studio.css — Studio-wide admin styles
├── css/studio.css      — Studio dashboard dark and light themes
├── css/app.css         — dark mode (default) — structural + dark styles
├── css/light.css        — light mode overrides only, kept in a separate file by convention
├── js/
│   ├── app.js          — all application logic, global state (~5,900 lines)
│   ├── studio.js       — Studio auth, theme, and app access display
│   ├── admin-studio.js — Studio admin summaries, customers, and app access
│   ├── admin-boardroom.js — Boardroom access and activity administration
│   ├── admin-prompt-tester.js — prompt testing, draft state, publish, and undo
│   ├── admin-prompt-questions.js — admin copy of level/video question definitions
│   ├── supabase.js     — auth + database layer, event logging, sync queue
│   └── points.js       — gamification points engine (client mirror of the SQL compute)
├── prompts/
│   └── blueprints.js   — SYSTEM_PROMPT + Hero's Journey blueprints ← CORE IP. NEVER MODIFY.
├── api/
│   ├── generate.js     — DeepSeek proxy serverless function
│   └── prompt-blueprint.js — admin-gated blueprint read/publish/undo endpoint
├── supabase_migrations/ — dated .sql files, one per applied schema/RPC change
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
| `onboarding` | user_id (UNIQUE), posted, history, goal, mini_goal, mini_goal_text, business, mvo_q2/q3/q4, topic_freewrite, phase2_context (jsonb), video_answers (jsonb) |
| `scripts` | user_id, video_number, level, content, version, is_current, thumbs_up, generated_at, edited_at. Trigger auto-increments version on insert. |
| `video_progress` | user_id, video_index, level, status ('filmed'/'skipped'/**null**), filmed_at, **locked_at, posted, posted_at, post_url** (added July 2026 for gamification) |
| `logs` | user_id, event_type, detail (JSONB), created_at — admin activity log |
| `preauth_events` | anon_session_id, user_id (nullable), email, event_type, detail (jsonb), created_at — pre-auth funnel tracking, added mid-2026 |
| `points_config` | id=1, version, rules (jsonb) — tunable point values + milestone thresholds, added July 2026 |
| `studio_entitlements` | Per-user access to each Studio app, including status, source, and optional expiration |
| `boardroom_workspaces`, `boardroom_workspace_members` | Private Boardroom workspace ownership and membership |
| `boardroom_workspace_settings`, `boardroom_user_profiles` | Workspace guardrails and the customer's private CEO profile |
| `boardroom_documents` | Uploaded-document metadata; private files live in the `boardroom-documents` Storage bucket |
| `boardroom_conversations`, `boardroom_messages` | Private Boardroom chat history |
| `boardroom_advisor_cards`, `boardroom_memory_entries` | Advisor Work Cards and generated workspace memory |

**RPC functions (SECURITY DEFINER — bypass RLS):**
- `check_email_exists(email)` — pre-auth lookup for returning users
- `is_admin()` — checks if current user has is_admin flag
- `admin_get_users/scripts/progress/onboarding/logs/preauth_events/points()` — admin panel data
- `admin_set_paid(user_id, paid)` — toggle is_paid from admin panel
- `admin_get_studio_entitlements()` / `admin_set_studio_access(...)` — read and control per-app Studio access
- `boardroom_ensure_workspace()` — safely create or return the signed-in customer's private Boardroom workspace
- `admin_get_boardroom_activity()` — Boardroom activity and completion summary for administrators
- `admin_delete_subjects(user_ids[], anon_session_ids[])` — bulk delete from admin panel
- `provision_admin_account()` — the only way to self-grant `is_admin`; checks the caller's JWT email against a hardcoded allowlist. See the Admin Privilege Rule in `CLAUDE.md` — do not write `is_admin` directly from client code, a `BEFORE UPDATE` trigger blocks it.
- `get_my_points()` / `admin_get_points()` — wrap `compute_user_points()`, which has no direct grants of its own

**Auth method:** Supabase magic link (passwordless email OTP) **or password** (added mid-2026 — both coexist; see the sign-in screen's password toggle).

**Admin access:** Gated by `is_admin = true` in the users table, granted only via `provision_admin_account()` against matching allowlists. The client copies are in `js/admin-studio.js`, `admin-seeninseven.html`, `js/admin-boardroom.js`, and `js/admin-prompt-tester.js`; the server-side allowlist is inside the RPC. Update all copies together.

---

## Key architecture decisions and why

**1. Global mutable state in `app.js`**

The entire app state lives in a single `state` object plus a handful of globals (`currentIndex`, `currentVideoIndex`, `screenOrder`, `editingFromPlan`). This is a deliberate choice — the app started as a single-file HTML and was refactored incrementally. A full state management rewrite is on the long-term roadmap but was intentionally deferred to prove the core product first.

**2. One shared Supabase identity across Studio apps**

Email/password and magic-link login coexist. The same Supabase session identifies the customer across Studio, SeenInSeven, and AI Boardroom. App entry is then controlled separately through `studio_entitlements`; being logged in does not automatically grant access to every tool.

**3. `onAuthStateChange` deadlock pattern — critical**

Supabase holds an internal navigator lock during `onAuthStateChange` callbacks. Any `await` on a Supabase database call inside this callback deadlocks forever. All DB work in the auth callback is deferred via `setTimeout(0)`. This pattern is load-bearing — do not remove it or move the DB calls back into the synchronous callback body.

**4. `blueprints.js` is protected core IP**

The AI system prompt and Hero's Journey blueprints in `prompts/blueprints.js` are David's core intellectual property. They run through multiple API iterations and produce something that cannot be replicated by a base LLM. Modify this file only when David directly authorizes the work. The administrator Prompt Tester is the approved browser-based editing and publishing path.

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
3. `callDeepSeekAPIRaw(systemMsg, userMsg, temperature, trackPromptVersion)` calls the proxy; semantic review calls use `trackPromptVersion = false` so they do not replace the draft's prompt-version record
4. Response is parsed by `parseScriptSections(text)` into sections (HOOK, OPEN LOOP, MEAT, CONCLUSION, CTA)
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
8. **Long-Term Superapp Foundation** — foundation is now live; future app additions remain separately scoped

---

## What is built now

- Full onboarding flow (all 21 screens)
- Shared email/password and magic-link authentication for new and returning users
- Script generation for all 7 videos, both levels (Relatable Hero L1, Authority Series L2)
- Section-level regeneration with undo/redo
- Dashboard with progress ring, video cards, version history modal
- Lock In workflow: Lock → Next Video button → filmed toggle → confetti → dashboard
- Settings panel (accessible from any screen): name, email, level switch, re-run onboarding
- Studio admin: all customer profiles, connected-app access, cross-app entry points, and app-level summaries
- SeenInSeven admin: onboarding answers, script content, activity log, progress, support notes, and the legacy paid toggle
- Studio customer hub with independent SeenInSeven and AI Boardroom entitlements
- Full AI Boardroom under `/boardroom`, with isolated workspaces, profiles, documents, conversations, cards, and memory
- Boardroom app-specific admin with access and activity reporting
- SeenInSeven Prompt Tester with real read-only user context, editable test answers, safe blueprint publishing, and undo
- Event logging: script_generated, script_failed, auth_completed, video_filmed, magic_link_sent
- Start Over (clears scripts and onboarding, stays logged in, stays on dashboard)
- Fullscreen preview mode for scripts
- PDF export (single script and all scripts)
- Copy (single script and all scripts)
- Vubli partner card (unlocks after first script generated)

---

## What is NOT built yet (roadmap)

**Phase 5 — The business-critical items:**

**1. Systeme.io entitlement automation**
Studio app access currently works and can be granted or revoked manually by an administrator. The remaining payment work is a Systeme.io webhook that finds the customer by email and grants or revokes the correct `studio_entitlements` row. Do not build a second login system or use legacy `users.is_paid` as the master Studio access record.

**2. Community bridge**
The Facebook group (`facebook.com/groups/coloradobiz`) is a core part of the product, not a footnote. Three moments in the app need a prominent, emotional bridge to the community: after first script generated, after each video filmed, and after all 7 completed. Currently there is only a small card at the bottom of the dashboard.

**3. Graduation Event bridge**
When all 7 videos are filmed, the completion screen needs to explicitly name the Graduation Event, build anticipation, and provide a register link. Currently it just says "Level Complete" and links cold to the EEE page.

**4. Email touchpoints**
Transactional emails for: first script generated (save your progress), 3-day nudge if stuck, completion congratulations, Graduation Event reminder. Requires a transactional email provider — Supabase's built-in mailer is rate-limited and unreliable for this. Postmark or Resend are recommended.

**Studio expansion after the current apps:**

The superapp foundation is built. Future priorities are connecting Systeme.io to entitlements, adding EEE tools to the existing Studio catalog and shared session, and expanding cross-app progress reporting. Every future app should plug into the existing identity, entitlement, hub, and master-admin model instead of creating another login or customer-facing deployment.

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
- IP in `blueprints.js` is changed only with David's explicit instruction and the protected publishing flow.
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

11. The Prompt Tester auth overlay remained visible after a successful session because an `.auth-screen` display rule overrode the HTML `hidden` attribute. Admin styles that use hidden panels must preserve `[hidden] { display: none !important; }`.

12. Prompt Tester selections and editable answers initially reset when the page was left or reloaded. They are now namespaced in browser storage by selected user, level, and video. This storage is an administrator's test draft only and must never overwrite customer data.

13. Older SeenInSeven prompt answers lived only in each customer's browser, so they could not reliably prefill an administrator's tester. `onboarding.video_answers` now stores future answers by level while keeping Level 1 and Level 2 field names isolated.

---

## Key URLs and credentials (for reference)

| Resource | URL / Value |
|----------|-------------|
| Studio | https://studio.coloradomastermind.com |
| SeenInSeven | https://studio.coloradomastermind.com/seeninseven |
| AI Boardroom | https://studio.coloradomastermind.com/boardroom |
| Studio admin | https://studio.coloradomastermind.com/admin |
| SeenInSeven admin | https://studio.coloradomastermind.com/admin/seeninseven |
| Prompt Tester | https://studio.coloradomastermind.com/admin/seeninseven/prompt-tester |
| AI Boardroom admin | https://studio.coloradomastermind.com/admin/boardroom |
| GitHub | https://github.com/DavidBeeeee/seen-in-seven |
| AI Boardroom GitHub | https://github.com/DavidBeeeee/boardroom2 |
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
- The hook and open loop have separate jobs. The hook is a truthful pattern interrupt that captures attention before the viewer cares. The open loop converts that attention into one specific unanswered question that the conclusion later pays off. Never merge them or remove either one.
- If it sounds like David, it stays. Loose, conversational, and playful language is correct, not a mistake.
