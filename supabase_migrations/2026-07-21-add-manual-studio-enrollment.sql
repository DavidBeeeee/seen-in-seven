-- Admins can prepare a Studio profile and app access before the person has
-- ever used a magic link. The first successful sign-in securely claims the
-- email-matched profile and its existing entitlements.

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
  app_key text;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid())
      and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;

  if coalesce(array_length(target_app_keys, 1), 0) = 0
    or exists (
      select 1 from unnest(target_app_keys) as requested(app_key)
      where requested.app_key not in ('seeninseven', 'boardroom')
    ) then
    raise exception 'Choose at least one valid Studio app';
  end if;

  insert into public.users (email, name)
  values (normalized_email, normalized_name)
  on conflict (email) do update
  set name = coalesce(nullif(trim(public.users.name), ''), excluded.name)
  returning * into enrolled_user;

  foreach app_key in array target_app_keys loop
    insert into public.studio_entitlements (user_id, app_key, status, access_source, granted_at, updated_at)
    values (enrolled_user.id, app_key, 'active', 'admin', now(), now())
    on conflict (user_id, app_key) do update
    set status = 'active', access_source = 'admin', granted_at = now(), updated_at = now();
  end loop;

  return enrolled_user;
end;
$$;

create or replace function public.claim_studio_profile()
returns public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_auth_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  claimed_user public.users;
begin
  if current_auth_id is null or current_email = '' then
    raise exception 'Signed-in email required';
  end if;

  select * into claimed_user
  from public.users u
  where u.auth_id = current_auth_id
  limit 1;

  if found then
    update public.users
    set email = current_email, last_active = now()
    where id = claimed_user.id
    returning * into claimed_user;
    return claimed_user;
  end if;

  update public.users
  set auth_id = current_auth_id, last_active = now()
  where email = current_email and auth_id is null
  returning * into claimed_user;

  if found then
    return claimed_user;
  end if;

  insert into public.users (auth_id, email)
  values (current_auth_id, current_email)
  returning * into claimed_user;
  return claimed_user;
end;
$$;

revoke all on function public.admin_enroll_studio_customer(text, text, text[]) from public, anon;
revoke all on function public.claim_studio_profile() from public, anon;
grant execute on function public.admin_enroll_studio_customer(text, text, text[]) to authenticated;
grant execute on function public.claim_studio_profile() to authenticated;
