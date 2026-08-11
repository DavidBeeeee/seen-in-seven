# SeenInSeven / Colorado Mastermind Studio: Claude Code Brief

**Last verified: August 8, 2026.** If you are reading this more than a cycle later, verify the launch dates in `js/777-launch-cycle.js` and the Systeme price plan IDs before trusting Section "Launch Cycle" below.

## What This Is

Colorado Mastermind Studio is the authenticated product home for David Bee's paid offers. It lives at `studio.coloradomastermind.com` and hosts several apps behind one login.

SeenInSeven is the first and most complete app inside it. Users answer onboarding questions, the app generates seven personalized video scripts through the DeepSeek API, and users film, post, and track progress. SeenInSeven is the bonus that makes the 777 Challenge easier to finish. The challenge is the product.

Systeme.io remains the public funnel, checkout, and email platform. Studio never sells; it only delivers.

**Owner:** David Bee (David Kamau)
**Stack:** Vanilla HTML + CSS + JS, no framework, no build step, no bundler. Supabase for auth and database. Vercel for hosting and serverless functions. DeepSeek for script and mission-statement generation.
**Repo:** github.com/DavidBeeeee/seen-in-seven
**Live:** https://studio.coloradomastermind.com
**Studio admin:** /admin
**SeenInSeven admin:** /admin/seeninseven

---

## Routes

| Route | What it is |
|---|---|
| `/` | Studio dashboard and login |
| `/seeninseven` | SeenInSeven app |
| `/eee` | Exit Escalator Engine home |
| `/storysculpt` | StorySculpt AI (5E script app) |
| `/navigator` | Next Step Navigator |
| `/vault` | Solution Vault |
| `/boardroom` | AI Boardroom (separate `boardroom2` Vercel project, shares Studio auth and this Supabase project) |
| `/admin` | Studio-wide customer directory and app access |
| `/admin/seeninseven` | Detailed SeenInSeven progress, scripts, errors, support |
| `/admin/seeninseven/prompt-tester` | Admin-only prompt experiment workspace |
| `/dashboard` | David-only WorkerBee operating dashboard and Journal |
| `/todo` | David-only mobile headings and checkbox lists |
| `/admin.html` | Legacy direct link, still resolves to Studio admin |
| `/api/generate` | SeenInSeven script generation |
| `/api/systeme-webhook` | Systeme purchase and cancellation receiver |

The other 1-1 property, `yes.davidbee.me`, is a **separate Vercel project** (`buildwithbee`) and is not part of this repo.

---

## File Structure

```
index.html               Studio dashboard and login
seeninseven.html         SeenInSeven single-page app (all challenge screens live here)
eee.html                 EEE home
storysculpt.html         StorySculpt AI
navigator.html           Next Step Navigator
vault.html               Solution Vault
admin.html               Studio-wide customer and app-access admin
admin-seeninseven.html   Detailed SeenInSeven app admin
admin-boardroom.html     Boardroom activity admin
admin-prompt-tester.html Admin-only prompt experiment workspace
dashboard.html          David-only WorkerBee operating dashboard and Journal
todo.html               David-only document-like task editor

js/app.js                    SeenInSeven application logic (largest file in the project)
js/supabase.js               Supabase client, auth, DB read/write, event logging
js/studio.js                 Studio auth, profile, theme, app-access display
js/points.js                 Gamification points engine (client mirror of the SQL compute)
js/journey-map.js            Seven-part Journey Map screens
js/answer-help.js            Per-video "copy this prompt to your own AI" helper
js/script-prompt-engine.js   Assembles the per-video generation payload
js/777-launch-cycle.js       Launch-state controller (see Launch Cycle below)
js/eee.js, navigator.js, storysculpt.js, vault.js   EEE component apps
js/admin-studio.js           Studio admin auth, summaries, customer directory, access controls
js/admin-seeninseven*        SeenInSeven admin
js/admin-boardroom.js        Boardroom admin
js/admin-prompt-tester.js    Prompt tester: read-only test assembly, drafts, confirm, undo
js/admin-prompt-questions.js Prompt tester question set
js/workerbee.js               WorkerBee auth, Todo, Dashboard, and Journal client

css/app.css              Dark mode (default theme), all structural + dark styles
css/light.css            Light mode overrides only
css/studio.css           Studio dashboard styles, both themes
css/admin-studio.css     Studio admin layout and responsive styles
css/admin-prompt-tester.css, css/admin-boardroom.css
css/workerbee.css        WorkerBee Dashboard and mobile Todo styles

prompts/blueprints.js    AI system prompts. DO NOT MODIFY without explicit instruction.
api/generate.js          DeepSeek proxy for script generation
api/systeme-webhook.js   Systeme purchase and cancellation receiver
api/prompt-blueprint.js  Admin-verified GitHub publisher, restricted to prompts/blueprints.js
api/prompt-test.js       Prompt tester generation endpoint
api/guest-config.js, api/guest-verify.js   Guest / pre-auth access
api/_lib/prompt-engine.js, api/_lib/blueprints.txt, api/_lib/security.js
api/workerbee.js         David-admin or server-secret gateway to narrow WorkerBee RPCs

launch/                  September 2026 cycle operating source (README, checklists, email copy, decks)
funnel-pages/            Canonical custom-code blocks pasted into Systeme pages
funnel-pages/backups/2026-08-06-live/   Untouched pre-launch backup of the live Systeme blocks
scripts/                 Node check scripts (journey map, lock state, level consistency, style guide, story architecture)
supabase_migrations/     Dated .sql files, one per applied change
```

---

## Critical Rules

### Do Not Touch

- **`prompts/blueprints.js`** holds the proprietary Hero's Journey script logic. Never modify it without explicit instruction from David Bee. The only sanctioned write path is `api/prompt-blueprint.js`, driven by the admin Prompt Tester.
- **Screen DOM structure.** All `.screen` elements in `seeninseven.html` must remain direct children of `<body>`. If a screen renders blank, check structure before changing JS. Verify with:
  `[...document.querySelectorAll('.screen')].filter(s => s.parentElement !== document.body).map(s => s.id)`
  An unclosed `</div>` once cost a full day of debugging. See `DEAR_FUTURE_CLAUDE.md`.

### Supabase Auth Rule (load-bearing)

Never `await` a Supabase database call inside the `onAuthStateChange` callback body. Defer with `setTimeout(0)`. Supabase holds an internal navigator lock during that callback and awaiting inside it deadlocks forever. The pattern in `js/supabase.js` is already correct. Both the Studio and SeenInSeven admin auth callbacks follow the same rule.

### Admin Privilege Rule (load-bearing)

`users.is_admin` and `users.is_paid` cannot be set by a client-side `update()` or `insert()`. A `BEFORE UPDATE` trigger, `prevent_privilege_self_escalation`, silently reverts any change to those two columns unless the caller is already an admin or is `service_role`.

The only client path to admin is `sb.rpc('provision_admin_account')`, which checks the caller's JWT email against a server-side allowlist before granting anything. Do not "fix" a broken admin flow by writing `is_admin` directly from JS. That reopens a real privilege-escalation hole where any signed-in user could self-grant.

To add an admin email, update the allowlist in `provision_admin_account()` in Supabase **and** `ADMIN_EMAILS` in both `js/admin-studio.js` and `admin-seeninseven.html`.

### Studio Access Rule

Access is three separate ideas, and code should keep them separate:

1. A person can have a Studio login.
2. A person can have access to a particular app (`studio_entitlements`, keyed by `app_key`).
3. An app can still honor a temporary beta or local-device path.

App keys in use: `seeninseven`, `eee`, `boardroom`. Access sources in use: `beta`, `admin`, `systeme`. A Boardroom customer can exist with no SeenInSeven access, and the reverse.

Revocation is source-aware. A refund removes only grants created by that matching purchase. Never repair a refund by stripping someone's manual or beta grants.

### Systeme Webhook Rule

`api/systeme-webhook.js` verifies Systeme's HMAC signature against the **raw** request body, records every message ID for duplicate safety, and calls the source-aware Supabase access layer. Access is granted by immutable **price plan ID**, never by product name or price string, since names and prices change between cycles.

The signing secret hash lives in `systeme_webhook_config` and must match the Vercel `SYSTEME_WEBHOOK_SECRET` environment variable. If webhooks stop granting access, compare those two before touching code.

Routing lives in the `systeme_product_routes` table, not in code, so a plan ID change is a data edit rather than a deploy.

### Prompt Tester Publishing Rule

`/admin/seeninseven/prompt-tester` may test the complete blueprint against copies of real admin data, but test generations must never write to user records or the `scripts` table. Publishing happens only through `api/prompt-blueprint.js`, which verifies the Supabase user and the `is_admin()` result, validates the full source shape, and is hardcoded to `prompts/blueprints.js` on `main`. It requires a fine-grained `GITHUB_PROMPT_TOKEN` Vercel variable with Contents read/write on only `DavidBeeeee/seen-in-seven`. Do not swap in a broad personal token. Undo must create a reversal commit and stay available only when the latest blueprint commit came from the Prompt Tester.

### Points System Rule (load-bearing)

Points are **derived, never ledgered**. There is no points-transactions table. `computePoints(state)` in `js/points.js` and the SQL function `compute_user_points(uuid)` each independently recompute a total from data that already exists: onboarding answers, scripts, video_progress, logs. They must agree rule for rule.

Changing a point rule means editing **three places together**: `POINTS_RULES` in `js/points.js`, the matching branch in `compute_user_points()`, and the seed row in the `points_config` table. That table row is what David can tune live without a redeploy; the client keeps a baked-in copy only as an offline and anonymous fallback.

A mismatch shows up as a different total in the dashboard versus the admin panel. That is the first thing to check when points look wrong. `compute_user_points()` has no direct grants and is reachable only through `get_my_points()` (self) and `admin_get_points()` (admin-gated).

### Launch Cycle Rule

`js/777-launch-cycle.js` holds a frozen `cycle` config and controls **page-state visibility only**. It never grants access. Access comes from `studio_entitlements` and the webhook.

It sets `data-kickoff-state`, `data-graduation-state`, `data-cart-state`, and `data-challenge-day` on `<body>`, then shows or hides `[data-launch-show]` elements and fills `[data-launch-href]` anchors from the `routes` map. An empty route gets `aria-disabled` rather than a broken link. That is deliberate: never render a placeholder URL to users.

Update this file once per monthly cycle, along with the public page dates, email dates, and both deck title slides.

### Engagement Links Rule

`ENGAGE_LINKS` near the top of `js/app.js` holds the Graduation Event and 1-1 scheduling URLs. Both are empty by default and their dashboard cards stay hidden until real URLs are pasted in. Never render a placeholder link.

### No Frameworks

Do not introduce React, Vue, build steps, bundlers, or major abstractions. This is intentional and stays that way unless David Bee explicitly asks otherwise.

---

## Launch Cycle (September 2026)

All times America/Denver. Source of truth for operations is `launch/`, and the browser config is `js/777-launch-cycle.js`.

| Date | State |
|---|---|
| Sep 7, 11:00 AM | Kickoff and Video 1 |
| Sep 8 to 13 | Videos 2 through 7 |
| Sep 14 | Catch-up and Graduation reminder |
| Sep 15, 11:00 AM | Graduation, EEE founders cart opens |
| Sep 16 to 18 | Replay, FAQ, decision support |
| Sep 19, 11:59 PM | EEE founders cart closes |

**Product routing:**

| Product | Price plan | Grants |
|---|---:|---|
| 777 Challenge, $7 | `3122070` | `seeninseven` |
| EEE Founders, $77/month | `3134754` | `eee` + `boardroom` |

**Known blanks as of August 8, 2026:** `kickoffRoom`, `kickoffReplay`, `graduationRoom`, and `graduationReplay` in `js/777-launch-cycle.js` are all empty strings, and `ENGAGE_LINKS` in `js/app.js` is empty. The Zoom meetings do not exist yet. Do not invent URLs.

---

## Supabase Schema

Project: `SeenInSeven` (`zdtkwpzdwnzzmdwrvmka`). The separate `Boardroom V2` project is paused; Boardroom data lives here.

**SeenInSeven core**

| Table | Key columns |
|---|---|
| `users` | id, auth_id, email, name, level, blocker, is_paid, is_admin, last_active |
| `onboarding` | user_id, posted, business, mvo_q2/q3/q4, topic_freewrite, phase2_context (jsonb), mission_statement, commitment_declaration, commitment_reasons |
| `scripts` | user_id, video_number, level, content, version, is_current, thumbs_up, generated_at, edited_at |
| `video_progress` | user_id, video_index, level, status (filmed/skipped/null), filmed_at, locked_at, posted, posted_at, post_url |
| `logs` | user_id, event_type, detail (jsonb), created_at |
| `preauth_events` | anon_session_id, user_id (nullable), email, event_type, detail (jsonb), created_at |
| `points_config` | id=1 single row, version, rules (jsonb), world-readable |
| `sessions_legacy` | pre-Studio session records, retained |

**Studio and commerce**

| Table | Purpose |
|---|---|
| `studio_entitlements` | user_id, app_key, status, access_source, granted_at, expires_at |
| `studio_access_grants` | grant records tied to their originating source |
| `studio_catalog_settings` | per-app catalog visibility mode (`eee` is currently `automatic`, driven by the cart window) |
| `systeme_product_routes` | price_plan_id to app_keys mapping, active flag |
| `systeme_webhook_events` | every received message, for duplicate safety and admin recovery |
| `systeme_webhook_config` | singleton, holds the signing secret hash |
| `api_usage` | per-subject and per-IP quota accounting |

**David-only WorkerBee**

`workerbee_sections`, `workerbee_tasks`, `workerbee_updates`, `workerbee_journal`, `workerbee_read_state`, `workerbee_change_history`, and `workerbee_config` are private operational records. Browser roles have no direct table privileges. `/api/workerbee` verifies David through the existing admin boundary or a server-only bridge secret, then calls only `workerbee_bootstrap()` or `workerbee_mutate()`.

**EEE component apps**

`storysculpt_projects`, `navigator_states`, `solution_vault_items`, `solution_vault_progress`

**Boardroom**

`boardroom_workspaces`, `boardroom_workspace_members`, `boardroom_workspace_settings`, `boardroom_documents`, `boardroom_conversations`, `boardroom_messages`, `boardroom_advisor_cards`, `boardroom_memory_entries`, `boardroom_profiles`

Scripts use `generated_at` and `edited_at`, not `created_at` and `updated_at`. `video_progress.status` allows `null`, since a script can be locked before it is filmed.

**Admin RPCs** (all gated on `is_admin = true`, granted to `authenticated` only): `admin_get_users`, `admin_get_scripts`, `admin_get_progress`, `admin_get_onboarding`, `admin_get_logs`, `admin_get_preauth_events`, `admin_get_points`, `admin_get_studio_entitlements`, `admin_get_studio_access_grants`, `admin_get_systeme_webhook_events`, `admin_get_boardroom_activity`, `admin_set_studio_access`, `admin_set_studio_catalog_visibility`, `admin_set_paid`, `admin_enroll_studio_customer`, `admin_delete_subjects`, `provision_admin_account` (server-side email allowlist).

Trigger-only functions, `prevent_privilege_self_escalation` and `set_script_version`, have no RPC grants at all.

---

## Auth Flow

- Magic link (OTP) or password
- Admin magic links approved for `contact@davidbee.me`, `davidkamau.t@gmail.com`, `davidkamau@live.com`
- `initAuth()` in `supabase.js` restores the session on page load
- `loadProgress()` in `app.js` restores from localStorage for unauthenticated users
- Both paths converge on `showDashboard()` when `state.level` is set
- `_dashboardShown` prevents a double render during the auth race
- `claim_studio_profile()` links an authenticated user to a pre-enrolled Studio profile, which is how a Systeme buyer reaches their own account after purchasing before ever signing in

---

## State and Storage

- `state` in `app.js` is the in-memory source of truth
- localStorage key `bwb_challenge_v1`, 30-day expiry
- `saveProgress()` writes locally and queues a Supabase sync
- `_restoreFromDatabase()` restores after auth
- `_mergeLocalStorage()` merges local-only state into DB state additively

---

## Onboarding Flow

`screen-0 → screen-1 → screen-3 → screen-content-intent → screen-2a → screen-commit-pain → screen-commit-desire → screen-6 → screen-recap → screen-checklist → screen-mvo2 → screen-7 → screen-script → plan-screen`

A seven-part Journey Map sits after the Overview and before Video 1 preparation. One shared question set per level, planned directions kept separate from detailed answers, and only the active video's direction goes into generation.

`determineLevel()` runs after `screen-content-intent`:
- L2 when `contentIntent === 'teach'` AND `business` is `yes` or `building`
- L1 otherwise

---

## Roadmap Position (August 2026)

Full detail lives in `SEENINSEVEN_ROADMAP.md`. Short version:

| Phase | Status |
|---|---|
| 1. Admin Command Center | Complete |
| 2. Onboarding Update | Mostly complete. Free-text content intent is built; the commit-moment redesign is still waiting on David's direction |
| 3. Full UX Audit | Visual half done. The flow-by-flow walkthrough has not been formally run |
| 4. Gamification | Built. Point values and thresholds are starting numbers awaiting real-behavior tuning |
| 5. Script Output Update | Partially underway through the Prompt Tester. No blueprint rewrite without an explicit brief |
| 6. Paid Access and Checkout Bridge | **Built.** Real $7 payment and entitlement validated August 9; fresh-buyer login bridge repaired; manual link click-through, retry, and refund tests remain |
| 7. Email and Follow-Up | Systeme handles the launch sequence. No in-app lifecycle email exists |
| 8. Studio Foundation | Live. Studio is the root, SeenInSeven is intact at `/seeninseven`, Boardroom connected, EEE component apps present |

**Do not** add cross-app history, new Studio apps, or in-app lifecycle email without explicit direction.

---

## Audience and Voice Rules

- Target user: first-time entrepreneur, often 45 to 60, non-technical, camera-shy
- Refer to the owner as **David Bee**, first and last name, in public-facing copy
- No em dashes in customer-facing copy
- Avoid the banned and overused phrasing in the style guide, including money words that trigger a flinch (buy, pay, cost, price, sign up, funnel) and the Pinterest banned-word list
- The 777 Challenge is the product. SeenInSeven is the bonus. Never reverse that inside challenge context.
- SeenInSeven stands alone at $297 when sold outside the challenge. The $311 figure in older documents included bonuses no longer offered.

---

## Verification Checklist (after any code change)

- All `.screen` elements are still direct children of `<body>`
- `prompts/blueprints.js` unchanged unless explicitly requested
- Dashboard restore works for both localStorage and magic link
- Studio admin and SeenInSeven admin both still load data
- Mobile layout still readable
- No `await` inside an `onAuthStateChange` callback body
- If a points rule changed, client and server totals still agree on a real account (admin Points column versus the dashboard strip)
- If launch dates changed, `js/777-launch-cycle.js`, the public pages, the emails, and both decks all agree
- Relevant `scripts/check-*.mjs` still pass
