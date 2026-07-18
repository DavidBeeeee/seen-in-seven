# SeenInSeven — Claude Code Brief

## What This Is

SeenInSeven is the delivery tool for the **777 Challenge** (Colorado Mastermind / David Bee). Users answer onboarding questions, the app generates 7 personalized video scripts via the DeepSeek API, and users film and track their progress. The app is the bonus that makes the challenge easier to complete — it is not the main offer.

**Owner:** David Bee (David Kamau)
**Stack:** Vanilla HTML + CSS + JS — no framework, no build step, no bundler. Supabase for auth and database. Vercel for hosting. DeepSeek for script and mission-statement generation.
**Repo:** github.com/DavidBeeeee/seen-in-seven
**Live URL:** https://studio.coloradomastermind.com
**Studio admin:** https://studio.coloradomastermind.com/admin
**SeenInSeven admin:** https://studio.coloradomastermind.com/admin/seeninseven

---

## File Structure

```
index.html          Colorado Mastermind Studio dashboard and login
seeninseven.html    SeenInSeven single-page app (all challenge screens live here)
js/app.js           All application logic (~5900 lines)
js/supabase.js      Supabase client, auth, DB read/write, event logging
js/studio.js        Studio auth, profile, theme, and app-access display
js/points.js        Gamification points engine (client mirror of the SQL compute)
css/app.css         Dark mode (default theme) — all structural + dark styles
css/light.css       Light mode overrides only — see header comment in the file
css/studio.css      Studio dashboard styles for both themes
css/admin-studio.css Studio-wide admin layout and responsive styles
admin.html          Studio-wide customer and app-access admin
admin-seeninseven.html Detailed SeenInSeven app admin
admin-prompt-tester.html Admin-only prompt experiment workspace
js/admin-studio.js  Studio admin auth, summaries, customer directory, and access controls
js/admin-prompt-tester.js Read-only user test assembly, draft editing, confirmations, and undo controls
prompts/blueprints.js  AI system prompts — DO NOT MODIFY without explicit instruction
api/prompt-blueprint.js Admin-verified GitHub publisher restricted to prompts/blueprints.js
supabase_migrations/   Dated .sql files, one per applied change — chronological history of schema/RPC changes
```

---

## Critical Rules

### Do Not Touch
- **`prompts/blueprints.js`** — proprietary Hero's Journey script logic. Never modify without explicit instruction from David Bee.
- **Screen DOM structure** — all `.screen` elements in `seeninseven.html` must remain direct children of `<body>`. If a screen renders blank, check structure before changing JS. Verify with: `[...document.querySelectorAll('.screen')].filter(s => s.parentElement !== document.body).map(s => s.id)`

### Supabase Auth Rule (load-bearing)
Never `await` Supabase database calls inside `onAuthStateChange` callback body. Defer with `setTimeout(0)`. This prevents a navigator lock bug that caused a hard-to-debug blank screen. See `js/supabase.js` — the pattern is already correct.

### Admin Privilege Rule (load-bearing)
`users.is_admin` and `users.is_paid` cannot be set by a direct client-side `update()`/`insert()` — a `BEFORE UPDATE` trigger (`prevent_privilege_self_escalation`) silently reverts any change to those two columns unless the caller is already an admin or is `service_role`. The only way to grant admin from the client is `sb.rpc('provision_admin_account')`, which checks the caller's JWT email against a hardcoded allowlist server-side before granting anything. Do not try to "fix" a broken admin-provisioning flow by writing `is_admin` directly from JS again — that reintroduces a real privilege-escalation hole (any signed-in user could self-grant admin). To add a new admin email, update the allowlist in `provision_admin_account()` (Supabase) and `ADMIN_EMAILS` in both `js/admin-studio.js` and `admin-seeninseven.html`.

### No Frameworks
Do not introduce React, Vue, build steps, bundlers, or major abstractions. This is intentional. The app is vanilla and should stay that way unless David Bee explicitly asks to change it.

### Prompt Tester Publishing Rule
`/admin/seeninseven/prompt-tester` may test the complete blueprint against copies of real admin data, but test generations must never write to user records or the `scripts` table. Publishing is handled only by `api/prompt-blueprint.js`, which verifies the Supabase user and `is_admin()` result, validates the full source shape, and is hardcoded to `prompts/blueprints.js` on `main`. It requires a fine-grained `GITHUB_PROMPT_TOKEN` Vercel environment variable with Contents read/write access to only `DavidBeeeee/seen-in-seven`. Do not replace it with a broad personal token. Undo must create a reversal commit and remain available only when the latest blueprint commit came from the Prompt Tester.

### Points System Rule (load-bearing)
Points are **derived, never ledgered**. There is no points-transactions table. `js/points.js` (`computePoints(state)`) and the SQL function `compute_user_points(uuid)` each independently recompute a user's total from data that already exists (onboarding answers, scripts, video_progress, logs) — they must be kept in exact agreement rule-for-rule. If you add or change a point rule, edit **three places together**: `POINTS_RULES` in `js/points.js`, the matching branch in `compute_user_points()`, and the seed row in `points_config` (Supabase table — this is the row David can tune live without a redeploy; the client only uses its baked-in copy as an offline/anonymous fallback). A rule mismatch between client and server shows up as a different total in the dashboard vs. the admin panel — that is the symptom to check first if points look wrong. `compute_user_points()` itself has no direct grants; it is only reachable through `get_my_points()` (self) and `admin_get_points()` (admin-gated).

### Engagement Links Rule
`ENGAGE_LINKS` near the top of `js/app.js` holds the Graduation Event and 1-1 scheduling URLs. Both are empty strings by default and their dashboard cards stay hidden until David pastes in real URLs — never render a placeholder link to users.

---

## Supabase Schema (key tables)

| Table | Key columns |
|---|---|
| `users` | id, auth_id, email, name, level, blocker, is_paid, is_admin, last_active |
| `onboarding` | user_id, posted, business, mvo_q2/q3/q4, topic_freewrite, phase2_context (jsonb), mission_statement, commitment_declaration, commitment_reasons |
| `scripts` | user_id, video_number, level, content, version, is_current, thumbs_up, generated_at, edited_at |
| `video_progress` | user_id, video_index, level, status (filmed/skipped/**null**), filmed_at, **locked_at, posted, posted_at, post_url** |
| `logs` | user_id, event_type, detail (jsonb), created_at |
| `preauth_events` | anon_session_id, user_id (nullable), email, event_type, detail (jsonb), created_at — pre-auth funnel tracking, attached to a user via `attach_preauth_session()` after sign-in |
| `points_config` | id=1 (single row), version, rules (jsonb) — tunable point values + milestone thresholds, world-readable |
| `studio_entitlements` | user_id, app_key, status, access_source, granted_at, expires_at — app access independent of login and SeenInSeven progress |

Scripts use `generated_at` / `edited_at` (not `created_at` / `updated_at`). `video_progress.status` allows `null` (a script can be locked before it's filmed).

Admin RPCs: `admin_get_users`, `admin_get_scripts`, `admin_get_progress`, `admin_get_onboarding`, `admin_get_logs`, `admin_get_preauth_events`, `admin_get_points`, `admin_get_studio_entitlements`, `admin_set_studio_access`, `admin_set_paid`, `admin_delete_subjects`, `provision_admin_account` — all gated by `is_admin = true` on the users row (or, for `provision_admin_account`, a server-side email allowlist). Granted to `authenticated` only, not `anon`. Trigger-only functions (`prevent_privilege_self_escalation`, `set_script_version`) have no RPC grants at all — they only fire via their triggers.

---

## Auth Flow

- Users sign in via magic link (OTP) or password
- Magic link sends to `email@davidbee.me` for admin, user email for regular users
- `initAuth()` in supabase.js handles session restore on page load
- `loadProgress()` in app.js handles localStorage restore for unauthenticated users
- Both paths converge on `showDashboard()` if `state.level` is set
- `_dashboardShown` flag prevents double-render during auth race

---

## State & Storage

- `state` object in app.js is the in-memory source of truth
- `localStorage` key: `bwb_challenge_v1` (expires 30 days)
- `saveProgress()` writes to localStorage and queues a Supabase sync
- `_restoreFromDatabase()` in supabase.js restores from DB after auth
- `_mergeLocalStorage()` merges local-only state into DB state additively

---

## Onboarding Flow (screen order)

`screen-0 → screen-1 → screen-3 → screen-content-intent → screen-2a → screen-commit-pain → screen-commit-desire → screen-6 → screen-recap → screen-checklist → screen-mvo2 → screen-7 → screen-script → plan-screen`

Level is determined by `determineLevel()` after `screen-content-intent`:
- L2 if `contentIntent === 'teach'` AND `business === 'yes' or 'building'`
- L1 everything else

---

## Roadmap Position (as of July 2026)

**Phase 1 (Admin Command Center) — Complete**
**Phase 2 (Onboarding Update) — ~60% done**
- Remaining: "say my own words" option on content intent grid
- Commit-moment UX redesign pending David Bee's direction

**Phase 3 (Full UX Audit) — Partially covered, not formally run**
- A full-app visual redesign shipped (glass surfaces, gradient typography, aurora atmosphere, motion identity, both themes) — this covers the *visual* half of Phase 3's intent, but the audit's actual checklist (walking all ~30 listed flows end-to-end, both levels, both themes, mobile + desktop) has not been formally executed and signed off.

**Phase 4 (Gamification) — Built, pending David's real-world tuning**
- Points engine, dashboard trophy panel + wealth vault (8 milestone gems + money pile), posted-video tracking with link bonus, sponsor click tracking, Graduation Event + 1-1 call cards (hidden until `ENGAGE_LINKS` is filled in) are all live on production as of this merge.
- Point values and milestone thresholds are **starting numbers**, not final — tune them in the `points_config` Supabase table (see Points System Rule above).

**Phases 5–7 — Not started**
**Phase 8 — Studio shell started by explicit owner direction**
- Studio is the root dashboard; SeenInSeven remains intact at `/seeninseven`.
- App-specific beta entitlements are live. Systeme automation remains deferred.
- Studio-wide administration lives at `/admin`; detailed SeenInSeven administration lives at `/admin/seeninseven`.
- AI Boardroom has a reserved admin slot but is not connected or grantable yet.

Do not add paid gating, email automation, more Studio apps, or cross-app history without explicit direction. See `SEENINSEVEN_ROADMAP.md` for full phase definitions and current status detail.

---

## Audience & Voice Rules

- Target user: first-time entrepreneur, often 45–60, non-technical, camera-shy
- Refer to the owner as **David Bee** in public-facing copy
- No em dashes in customer-facing copy
- No banned/overused LLM phrasing (see style guide in handoff docs)
- The 777 Challenge is the product. SeenInSeven is the bonus.

---

## Verification Checklist (after any code change)

- All `.screen` elements are still direct children of `<body>`
- `prompts/blueprints.js` was not changed
- Dashboard restore works (localStorage + magic link)
- Admin panel still loads data
- Mobile layout still readable
- No `await` inside `onAuthStateChange` callback body
- If a points rule changed: client (`js/points.js`) and server (`compute_user_points`) totals still agree on a real account — check via the admin panel's Points column vs. the dashboard strip
