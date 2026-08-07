create or replace function public.has_studio_app_access(target_app_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    join public.studio_entitlements e on e.user_id = u.id
    where u.auth_id = (select auth.uid())
      and e.app_key = target_app_key
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

revoke all on function public.has_studio_app_access(text) from public, anon;
grant execute on function public.has_studio_app_access(text) to authenticated;

grant insert, update, delete on public.solution_vault_items to authenticated;

create policy vault_admins_can_insert on public.solution_vault_items
for insert to authenticated
with check (
  exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  )
);

create policy vault_admins_can_update on public.solution_vault_items
for update to authenticated
using (
  exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  )
);

create policy vault_admins_can_delete on public.solution_vault_items
for delete to authenticated
using (
  exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  )
);
