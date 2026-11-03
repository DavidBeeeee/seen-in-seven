# Browser-direct Supabase reads (WBR-458, part 1)

Source: a read of the code on origin/main 88eeb77 on 2026-11-03, written by the cloud backstop. Nothing here was measured against production. Cadence and payload columns are estimates from the call sites and are marked as such. Part 2 onward (reporting bytes, the load model, the ledger margin) is not done.

The Studio ledger (`api/_lib/egress-budget.js`, event `studio_egress_response`) only sees responses served through `/api` functions. Every read below goes from the browser straight to Supabase, so none of it reaches the 60/80/95 warning today.

| Page / file | Table or RPC | When it runs | Payload (estimate) |
|---|---|---|---|
| js/supabase.js:746 | `scripts` select * for the user, current, one level | each dashboard load and level switch | Heavy. Full script text, 7 rows per level, tens of KB. |
| js/supabase.js:747 | `video_progress` select * for the level | same moment as above | Light. 7 rows. |
| js/supabase.js:872 | `scripts` history for one video (content, final_content) | opening a script's version history | Medium. Every version of one video. |
| js/supabase.js:804, 807 | `users` select *, `onboarding` select * | each restore after sign-in | Medium. Onboarding holds freewrites and `phase2_context` jsonb. |
| js/supabase.js:428, 446 | `users` select * by auth_id | every sign-in and token refresh | Light. 1 row. |
| js/supabase.js:703 | `points_config` | each dashboard load | Light. 1 row. |
| js/supabase.js:231, 664, 894 | `scripts` video_number, `video_progress` locked_at, `scripts` is_current | on lock, save and thumbs actions | Light. Single rows. |
| js/supabase.js:418, 292, 121 | RPC `claim_studio_profile`, `attach_preauth_session`, `record_preauth_event` | sign-in; anonymous events | Light. |
| js/studio.js:184-202 | `users` select * | every Studio dashboard load | Light. 1 row. |
| js/studio.js:211, 226 | `studio_entitlements`, `studio_catalog_settings` | every Studio dashboard load | Light. A handful of rows. |
| js/studio.js:77-88 | `solution_vault_book_grants` (joined to books), `solution_vault_book_progress` | Studio dashboard load | Light to medium. |
| js/studio.js:286 | RPC `has_any_book_access` | Studio dashboard load | Light. |
| js/eee-common.js:20, 36, 46 | `users` select *, RPC `has_studio_app_access`, `my_hub_apps` | every Hub app page load (EEE, Navigator, StorySculpt, Vault) | Light, but runs on every page of every Hub app. |
| js/eee.js:36 | `navigator_states` state | EEE home load | Medium. jsonb state. |
| js/navigator.js:82 | `navigator_moves` select * | Navigator load | Medium. Grows with use. |
| js/storysculpt.js:1959 | `storysculpt_projects` select * for the user | StorySculpt load and refresh | Heavy. Whole projects including saved drafts. Likely the largest member-side reader. |
| js/storysculpt.js:2942 | `storysculpt_member_context` profile | StorySculpt load | Medium. |
| js/vault.js:153 | RPC `my_solution_vault_books` | Vault load | Medium. |
| js/vault.js:819-820 | `solution_vault_items` select * (published), `solution_vault_progress` | Vault load | Medium. Select * on items. |
| js/admin-studio.js:197-205 | RPCs `admin_get_users`, `admin_get_studio_entitlements`, `admin_get_studio_access_grants`, `admin_get_systeme_webhook_events`, `admin_get_scripts`, `admin_get_progress`, `admin_get_logs`, `admin_get_boardroom_activity`, `admin_get_hub_usage` | every Studio admin load and Refresh | Heaviest single event. `admin_get_scripts` and `admin_get_logs` return every row for every user, uncapped. David only, but each Refresh repeats it. |
| admin-seeninseven.html:418-427, 557 | RPCs `admin_get_users`, `admin_get_scripts`, `admin_get_progress`, `admin_get_onboarding`, `admin_get_logs`, `admin_get_preauth_events`, `admin_get_points`, `admin_get_studio_entitlements`, `admin_get_certainty_sessions`, `admin_get_certainty_engagement` | every SeenInSeven admin load | Heavy, the same uncapped pattern, and it re-downloads scripts and logs already pulled by the Studio admin. |
| js/admin-boardroom.js:64 | RPCs `admin_get_users`, `admin_get_studio_entitlements`, `admin_get_boardroom_activity` | Boardroom admin load | Medium. |
| js/admin-studio.js:1439, 1467 | `solution_vault_claim_links`, RPC `admin_book_answer_stats` | opening a book editor | Light. |

Not in this list: `js/workerbee.js` (the Dashboard and Todo go through `/api/workerbee`, so the server already sees those responses) and every write-only call (insert, update, upsert, writer RPCs).

## What the read suggests for part 2

1. The two admin pages are the likeliest dominant readers: uncapped `admin_get_scripts` and `admin_get_logs` repeated on every load, once per admin page. They are cheap to meter because they are single RPCs.
2. Among member readers, `storysculpt_projects` select * is the biggest, then the SeenInSeven `scripts` select * at js/supabase.js:746.
3. The Hub pages' small guard reads in `eee-common.js` are tiny each, but multiply by every page load.

This needs real byte counts before anyone picks a winner. The ranking above is a guess from the code, not a measurement.
