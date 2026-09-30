-- WBR-415. StorySculpt member memory (the member's "story profile").
--
-- One editable row per member. StorySculpt reads it into the existing
-- MEMBER CONTEXT block on every generation, so a member enters their voice,
-- facts, and recurring offers once instead of re-explaining themselves on every
-- project. It is modeled on navigator_states: a single row keyed by the internal
-- public.users.id, guarded by the same "member owns the row AND has an active
-- eee entitlement" policy the other StorySculpt data uses.
--
-- The StorySculpt system prompt and interview flow are untouched by this. The
-- memory is supplied through context the member already controls; it does not
-- change how the model is instructed. WBR-415.
create table if not exists public.storysculpt_member_context (
  user_id uuid primary key references public.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.storysculpt_member_context enable row level security;

grant select, insert, update on public.storysculpt_member_context to authenticated;

create policy storysculpt_member_context_row on public.storysculpt_member_context
for all to authenticated
using (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = storysculpt_member_context.user_id and e.app_key = 'eee' and e.status = 'active'
  )
)
with check (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = storysculpt_member_context.user_id and e.app_key = 'eee' and e.status = 'active'
  )
);
