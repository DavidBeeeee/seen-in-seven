# SeenInSeven — Claude Code Brief

## What This Is

SeenInSeven is the delivery tool for the **777 Challenge** (Colorado Mastermind / David Bee). Users answer onboarding questions, the app generates 7 personalized video scripts via the DeepSeek API, and users film and track their progress. The app is the bonus that makes the challenge easier to complete — it is not the main offer.

**Owner:** David Bee (David Kamau)
**Stack:** Vanilla HTML + CSS + JS — no framework, no build step, no bundler. Supabase for auth and database. Vercel for hosting. DeepSeek for script and mission-statement generation.
**Repo:** github.com/DavidBeeeee/seen-in-seven

---

## File Structure

```
index.html          Main single-page app (all screens live here)
js/app.js           All application logic (~5500 lines)
js/supabase.js      Supabase client, auth, DB read/write, event logging
css/app.css         All styles
admin.html          Standalone admin panel (separate auth, no framework)
prompts/blueprints.js  AI system prompts — DO NOT MODIFY without explicit instruction
```

---

## Critical Rules

### Do Not Touch
- **`prompts/blueprints.js`** — proprietary Hero's Journey script logic. Never modify without explicit instruction from David Bee.
- **Screen DOM structure** — all `.screen` elements must remain direct children of `<body>`. If a screen renders blank, check structure before changing JS. Verify with: `[...document.querySelectorAll('.screen')].filter(s => s.parentElement !== document.body).map(s => s.id)`

### Supabase Auth Rule (load-bearing)
Never `await` Supabase database calls inside `onAuthStateChange` callback body. Defer with `setTimeout(0)`. This prevents a navigator lock bug that caused a hard-to-debug blank screen. See `js/supabase.js` — the pattern is already correct.

### No Frameworks
Do not introduce React, Vue, build steps, bundlers, or major abstractions. This is intentional. The app is vanilla and should stay that way unless David Bee explicitly asks to change it.

---

## Supabase Schema (key tables)

| Table | Key columns |
|---|---|
| `users` | id, auth_id, email, name, level, blocker, is_paid, is_admin, last_active |
| `onboarding` | user_id, posted, business, mvo_q2/q3/q4, topic_freewrite, phase2_context (jsonb), mission_statement, commitment_declaration, commitment_reasons |
| `scripts` | user_id, video_number, level, content, version, is_current, thumbs_up, generated_at, edited_at |
| `video_progress` | user_id, video_index, level, status (filmed/skipped), filmed_at |
| `logs` | user_id, event_type, detail (jsonb), created_at |

Scripts use `generated_at` / `edited_at` (not `created_at` / `updated_at`).

Admin RPCs: `admin_get_users`, `admin_get_scripts`, `admin_get_progress`, `admin_get_onboarding`, `admin_get_logs`, `admin_set_paid` — all gated by `is_admin = true` on the users row.

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

## Roadmap Position (as of June 2026)

**Phase 1 (Admin Command Center) — Complete**
**Phase 2 (Onboarding Update) — ~60% done**
- Remaining: "say my own words" option on content intent grid
- Commit-moment UX redesign pending David Bee's direction

**Phases 3–8 — Not started**

First test users are about to be onboarded. Do not add paid gating, email automation, gamification, or superapp features. See `SEENINSEVEN_ROADMAP.md` for full phase definitions.

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
