-- WBR-409. The Next Step Navigator's durable member record.
--
-- Until now the Navigator's next-move tool kept at most ONE thing per member: a
-- single navigator_states row, overwritten on every run, holding the current
-- draft. There was no history, no sense of progress, and no reason to come back:
-- the tool gave a member one move and forgot they existed. The 300 named this the
-- single most actionable gap.
--
-- navigator_moves is that missing record. Every chosen move is its own durable
-- row with its inputs, the four-field result, where the result came from
-- (a real generation or the safe fallback), and a lifecycle status the member
-- drives (active, completed, abandoned). On return the member sees their past
-- moves, how many they have completed, and the one still open, so the tool holds
-- onto people instead of dropping them.
--
-- It is modeled on navigator_states and storysculpt_member_context: keyed on the
-- internal public.users.id and guarded by the same "member owns the row AND holds
-- an active eee entitlement" policy the rest of the member's Hub data uses. No
-- delete grant: a member retires a move by setting status, the history is kept.
create table if not exists public.navigator_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  objective text not null default '',
  current_reality text not null default '',
  blocker text not null default '',
  available_time text not null default '',
  deadline text not null default '',
  next_action text not null default '',
  first_15_minutes text not null default '',
  done_when text not null default '',
  why_this_now text not null default '',
  source text not null default 'generated' check (source in ('generated', 'fallback')),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.navigator_moves enable row level security;

grant select, insert, update on public.navigator_moves to authenticated;

create index if not exists navigator_moves_user_created_idx
  on public.navigator_moves (user_id, created_at desc);

create policy navigator_moves_member_rows on public.navigator_moves
for all to authenticated
using (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = navigator_moves.user_id and e.app_key = 'eee' and e.status = 'active'
  )
)
with check (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = navigator_moves.user_id and e.app_key = 'eee' and e.status = 'active'
  )
);
