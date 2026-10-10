-- WBR-373. The Next Step Navigator roadmap stops living in one browser.
--
-- Until now the member's whole roadmap (name, niche, diagnostic answers, task
-- progress, todos, assets) lived only in localStorage under
-- bees_ai_v33_persistence. A new phone or a cleared cache wiped it, and Start
-- Fresh overwrote it with nothing to go back to (300: UX 8, 88; Stranger 95;
-- Developer A and E).
--
-- navigator_roadmaps holds it in the member's account. One row per user is the
-- current roadmap (is_current); Start Fresh flips that row to a prior version and
-- the next save creates a new current row, so old roadmaps stay retrievable.
-- localStorage stays as the offline fallback, and on load the page prefers the
-- newer of the two by profile_updated_at.
--
-- Same ownership policy as navigator_moves: the member owns the row AND holds an
-- active eee entitlement. No delete grant: versions are kept.
create table if not exists public.navigator_roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  profile_updated_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.navigator_roadmaps enable row level security;

grant select, insert, update on public.navigator_roadmaps to authenticated;

create unique index if not exists navigator_roadmaps_one_current_idx
  on public.navigator_roadmaps (user_id) where is_current;

create index if not exists navigator_roadmaps_user_created_idx
  on public.navigator_roadmaps (user_id, created_at desc);

create policy navigator_roadmaps_member_rows on public.navigator_roadmaps
for all to authenticated
using (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = navigator_roadmaps.user_id and e.app_key = 'eee' and e.status = 'active'
  )
)
with check (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = navigator_roadmaps.user_id and e.app_key = 'eee' and e.status = 'active'
  )
);
