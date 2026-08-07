insert into public.studio_access_grants (
  user_id, app_key, source_kind, source_ref, status, granted_at, updated_at
)
select u.id, 'eee', 'admin', 'admin:eee', 'active', now(), now()
from public.users u
where coalesce(u.is_admin, false) = true
on conflict on constraint studio_access_grants_user_id_app_key_source_kind_source_ref_key do update
set status = 'active', revoked_at = null, updated_at = now();

do $$
declare
  admin_user record;
begin
  for admin_user in select id from public.users where coalesce(is_admin, false) = true loop
    perform public.refresh_studio_entitlement(admin_user.id, 'eee');
  end loop;
end;
$$;
