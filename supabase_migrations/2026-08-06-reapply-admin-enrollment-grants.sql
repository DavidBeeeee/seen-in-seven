create or replace function public.admin_enroll_studio_customer(
  target_email text,
  target_name text default null,
  target_app_keys text[] default array[]::text[]
)
returns public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(target_email, '')));
  normalized_name text := nullif(trim(coalesce(target_name, '')), '');
  enrolled_user public.users;
  requested_app text;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;

  if coalesce(array_length(target_app_keys, 1), 0) = 0
    or exists (
      select 1 from unnest(target_app_keys) as requested(app_key)
      where requested.app_key not in ('seeninseven', 'boardroom', 'eee')
    ) then
    raise exception 'Choose at least one valid Studio app';
  end if;

  insert into public.users (email, name)
  values (normalized_email, normalized_name)
  on conflict (email) do update
  set name = coalesce(nullif(trim(public.users.name), ''), excluded.name)
  returning * into enrolled_user;

  foreach requested_app in array target_app_keys loop
    insert into public.studio_access_grants (
      user_id, app_key, source_kind, source_ref, status, granted_at, updated_at
    ) values (
      enrolled_user.id,
      requested_app,
      'admin',
      'admin:' || requested_app,
      'active',
      now(),
      now()
    )
    on conflict on constraint studio_access_grants_user_id_app_key_source_kind_source_ref_key do update
    set status = 'active', granted_at = now(), revoked_at = null, updated_at = now();

    perform public.refresh_studio_entitlement(enrolled_user.id, requested_app);
  end loop;

  return enrolled_user;
end;
$$;

revoke all on function public.admin_enroll_studio_customer(text, text, text[]) from public, anon;
grant execute on function public.admin_enroll_studio_customer(text, text, text[]) to authenticated;
