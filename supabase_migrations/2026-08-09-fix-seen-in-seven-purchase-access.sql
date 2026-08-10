-- Allow a newly entitled SeenInSeven buyer to request a sign-in link before
-- they have completed onboarding and chosen a challenge level.

create or replace function public.check_email_exists(lookup_email text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  result json;
begin
  select json_build_object(
    'exists', true,
    'has_level', (u.level is not null),
    'has_access', exists (
      select 1
      from public.studio_entitlements e
      where e.user_id = u.id
        and e.app_key = 'seeninseven'
        and e.status = 'active'
        and (e.expires_at is null or e.expires_at > now())
    ),
    'name', u.name
  )
  into result
  from public.users u
  where lower(u.email) = lower(trim(lookup_email))
  limit 1;

  if result is null then
    return json_build_object(
      'exists', false,
      'has_level', false,
      'has_access', false
    );
  end if;

  return result;
end;
$$;

revoke all on function public.check_email_exists(text) from public;
grant execute on function public.check_email_exists(text) to anon, authenticated, service_role;
