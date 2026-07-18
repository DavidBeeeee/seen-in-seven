-- Studio app access is separate from authentication and from legacy is_paid.
-- Systeme can later automate the same rows that admins grant during beta.

create table if not exists public.studio_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  app_key text not null check (app_key ~ '^[a-z0-9_]+$'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  access_source text not null default 'manual' check (access_source in ('beta', 'manual', 'systeme', 'admin')),
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, app_key)
);

alter table public.studio_entitlements enable row level security;

grant select on table public.studio_entitlements to authenticated;
revoke insert, update, delete on table public.studio_entitlements from anon, authenticated;

drop policy if exists studio_entitlements_own_rows on public.studio_entitlements;
create policy studio_entitlements_own_rows
on public.studio_entitlements
for select
to authenticated
using (
  user_id in (
    select u.id
    from public.users u
    where u.auth_id = (select auth.uid())
  )
);

create or replace function public.admin_get_studio_entitlements()
returns setof public.studio_entitlements
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.users u
    where u.auth_id = auth.uid()
      and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;

  return query
  select e.*
  from public.studio_entitlements e
  order by e.granted_at desc;
end;
$$;

create or replace function public.admin_set_studio_access(
  target_user_id uuid,
  target_app_key text,
  enabled boolean,
  target_access_source text default 'admin'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.users u
    where u.auth_id = auth.uid()
      and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;

  if target_app_key !~ '^[a-z0-9_]+$' then
    raise exception 'Invalid app key';
  end if;

  if target_access_source not in ('beta', 'manual', 'systeme', 'admin') then
    raise exception 'Invalid access source';
  end if;

  insert into public.studio_entitlements (
    user_id, app_key, status, access_source, granted_at, updated_at
  ) values (
    target_user_id,
    target_app_key,
    case when enabled then 'active' else 'revoked' end,
    target_access_source,
    now(),
    now()
  )
  on conflict (user_id, app_key) do update
  set status = excluded.status,
      access_source = excluded.access_source,
      updated_at = now(),
      granted_at = case
        when excluded.status = 'active' then now()
        else public.studio_entitlements.granted_at
      end;
end;
$$;

revoke all on function public.admin_get_studio_entitlements() from public, anon;
revoke all on function public.admin_set_studio_access(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_get_studio_entitlements() to authenticated;
grant execute on function public.admin_set_studio_access(uuid, text, boolean, text) to authenticated;

-- Everyone who already has a SeenInSeven profile is part of the beta group.
insert into public.studio_entitlements (user_id, app_key, status, access_source)
select u.id, 'seeninseven', 'active', 'beta'
from public.users u
on conflict (user_id, app_key) do nothing;
