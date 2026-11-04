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
| js/app.js:664, 740 | RPC `check_email_exists` | sign-up and sign-in email step | Light. Added by the evening review. |
| js/vault.js:128 | Storage, public `solution-vault-covers` image for 5e-framework | each Vault shelf render, first fetch per browser | **Measured 2,681,644 bytes.** Added by the evening review. |
| js/vault.js:168 | Storage, signed URL into `solution-vault-books` | opening or downloading a book | Measured, largest file 505,492 bytes. Added by the evening review. |
| js/admin-studio.js:1026, 1185 | Storage download from `solution-vault-books` | replacing or creating a book in the admin | Measured, up to 505,492 bytes. David only. Added by the evening review. |

Not in this list: the Boardroom app (repository `boardroom2`). It runs on this same Supabase project with about 49 table and RPC calls of its own, including a browser client at `lib/supabase/client.ts` and reads from the private `boardroom-documents` bucket, and none of it reports to this ledger. Its call sites still need their own rows here. Also not in this list: `js/workerbee.js` (the Dashboard and Todo go through `/api/workerbee`, so the server already sees those responses) and every write-only call (insert, update, upsert, writer RPCs).

## Measured sizes (evening review, 2026-11-04)

Read from production with an aggregate-only query at 17:20Z. Storage sizes are object metadata. Table sizes are `pg_column_size` per row, which is close to but not the same as JSON bytes on the wire.

| What | Rows or files | Total | Largest single |
|---|---|---|---|
| Storage `solution-vault-covers` | 1 | 2,681,644 | 2,681,644 |
| Storage `solution-vault-books` | 2 | 1,010,984 | 505,492 |
| Storage `boardroom-documents` | 2 | 86,585 | 73,345 |
| Table `logs` | 3,032 | 517,837 | 704 |
| Table `scripts` | 47 | 156,278 | 6,136 |
| Table `storysculpt_projects` | 42 | 152,834 | 9,177 |
| Table `onboarding` | 14 | 49,089 | 20,470 |
| Table `solution_vault_items` | 13 | 4,368 | 360 |

The public cover answers `cache-control: private, no-cache` and `cf-cache-status: DYNAMIC`, so the CDN never serves it from cache. A repeat with its ETag answers 304 and zero bytes, so the cost is one full download per browser that has not kept it. That is about 2,000 first fetches to the 5 GB quota, so 1,000 members who are each shown it once take half the quota. The load model puts Certainty and StorySculpt together at 13.5%.

The month-to-date ledger holds 4 `studio_egress_response` rows totalling 1,221 bytes, so one view of this cover is over 2,000 times everything the warning has counted this month.

Reachable today: the project is small, so this is a cost at member scale and not a problem at current traffic. The cover can be replaced with a smaller file through the existing book editor, which keeps the previous one. `js/admin-studio.js` accepts covers up to 5 MB with no resize, so a new upload can bring it back.

## What the read suggested for part 2

**Superseded by the measurements above.** The first item below is wrong for today's data: both admin RPCs together are about a quarter of one cover. They do grow with the data, and the cover does not. Kept as written so the correction is visible.


1. The two admin pages are the likeliest dominant readers: uncapped `admin_get_scripts` and `admin_get_logs` repeated on every load, once per admin page. They are cheap to meter because they are single RPCs.
2. Among member readers, `storysculpt_projects` select * is the biggest, then the SeenInSeven `scripts` select * at js/supabase.js:746.
3. The Hub pages' small guard reads in `eee-common.js` are tiny each, but multiply by every page load.

This needs real byte counts before anyone picks a winner. The ranking above is a guess from the code, not a measurement.

## Cover follow-up, Afternoon November 4

The inventory above was imported, without the branch's unrelated code, from
6246b1e33d35ec654e875059770b5b9be9cbc711. At 20:02:55Z the same public PNG
still measured 2,681,644 bytes, but its headers now read `public, max-age=3600`
and `cf-cache-status: HIT`. The earlier no-cache measurement is historical,
not the current state. No claim is made that caching was absent all day.

The byte-identical source PNG (SHA-256 dbdb465cae0c6256d522491f3b12e0729e99a2d688e1d180fbe68ee7e8187646)
was resampled proportionally from 1024 x 1536 to 768 x 1152 and JPEG-encoded
at quality 75. The derived public asset is 171,518 bytes, 93.60 percent smaller:
`/assets/vault/the-5e-framework-cover-751ce4e2.jpg`. Its full SHA-256 is
751ce4e2b98f15d83b71a8bfe3dde69c0fe21ab81d73388630b927e2faa08483.
Both images were visually inspected: same title, subtitle, colors, shapes and
icons, with no crop. The original PNG and Storage object remain untouched.

The content-addressed static path has `Cache-Control: public, max-age=31536000, immutable`.
Only after deployment is READY and the live asset's bytes and cache header
are verified may the existing 5e-framework book's cover_url switch to it.
This is a data change to an existing book, not a migration or entitlement change.
Future artwork changes must use a new content-addressed filename. Rollback is
the previous cover_url; keep the old object so rollback does not need a reupload.
This removes this shelf image from Supabase egress, not the remaining direct
database readers or the project-wide warning gap assigned to Evening.
