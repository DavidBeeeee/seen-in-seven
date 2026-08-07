-- Controls whether non-members see promotional app cards inside Studio.
-- Entitled members always retain access regardless of this catalog setting.

create table if not exists public.studio_catalog_settings (
  app_key text primary key check (app_key ~ '^[a-z0-9_]+$'),
  catalog_mode text not null default 'automatic' check (catalog_mode in ('automatic', 'visible', 'hidden')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create index if not exists studio_catalog_settings_updated_by_idx
  on public.studio_catalog_settings (updated_by);

alter table public.studio_catalog_settings enable row level security;

revoke all on table public.studio_catalog_settings from anon, authenticated;
grant select on table public.studio_catalog_settings to anon, authenticated;

drop policy if exists studio_catalog_settings_public_read on public.studio_catalog_settings;
create policy studio_catalog_settings_public_read
on public.studio_catalog_settings
for select
to anon, authenticated
using (true);

insert into public.studio_catalog_settings (app_key, catalog_mode)
values ('eee', 'automatic')
on conflict (app_key) do nothing;

create or replace function public.admin_set_studio_catalog_visibility(target_mode text)
returns public.studio_catalog_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_user public.users;
  saved_setting public.studio_catalog_settings;
begin
  select u.* into admin_user
  from public.users u
  where u.auth_id = (select auth.uid())
    and coalesce(u.is_admin, false) = true;

  if admin_user.id is null then
    raise exception 'Admin access required';
  end if;

  if target_mode not in ('automatic', 'visible', 'hidden') then
    raise exception 'Invalid Studio catalog mode';
  end if;

  insert into public.studio_catalog_settings (app_key, catalog_mode, updated_at, updated_by)
  values ('eee', target_mode, now(), admin_user.id)
  on conflict (app_key) do update
  set catalog_mode = excluded.catalog_mode,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  returning * into saved_setting;

  return saved_setting;
end;
$$;

revoke all on function public.admin_set_studio_catalog_visibility(text) from public, anon;
grant execute on function public.admin_set_studio_catalog_visibility(text) to authenticated;
