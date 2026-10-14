-- Per-app Studio access. WBR-442, 2026-10-14.
--
-- David: "I just need manual access to control the apps people have expanded
-- to each individual app." Until now StorySculpt, Next Step Navigator, Solution
-- Vault and Certainty Sessions all checked the one 'eee' key, so a person could
-- only be given all four or none, and AI Boardroom checked only 'boardroom',
-- so an EEE member did not get the Boardroom the Hub page promised.
--
-- Now each Hub app has its own key. An app opens for a person who holds that
-- app's key OR the 'eee' Momentum Hub bundle; the bundle now includes
-- Boardroom (David approved). Purchases keep granting 'eee', so nobody who has
-- paid loses anything. Every check goes through member_has_app, so the rule
-- lives in one place.

create or replace function public.member_has_app(target_user_id uuid, target_app_key text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.studio_entitlements e
    where e.user_id = target_user_id
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
      and (
        e.app_key = target_app_key
        or (e.app_key = 'eee' and target_app_key in ('storysculpt', 'navigator', 'vault', 'certainty', 'boardroom'))
        -- 'hub' asks whether the person has any Momentum Hub app at all: the
        -- Hub workspace and the Studio home card open for any of them.
        or (target_app_key = 'hub' and e.app_key in ('eee', 'storysculpt', 'navigator', 'vault', 'certainty', 'boardroom'))
      )
  );
$function$;

revoke all on function public.member_has_app(uuid, text) from public, anon;
grant execute on function public.member_has_app(uuid, text) to authenticated, service_role;

-- The caller's own check, used by every app and page gate.
create or replace function public.has_studio_app_access(target_app_key text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(public.member_has_app(
    (select u.id from public.users u where u.auth_id = (select auth.uid())),
    target_app_key
  ), false);
$function$;

-- Which Hub apps the caller can open, so the Hub shows only those.
create or replace function public.my_hub_apps()
returns text[]
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(array_agg(app order by app), array[]::text[])
  from unnest(array['storysculpt', 'navigator', 'vault', 'certainty', 'boardroom']) as app
  where public.member_has_app(
    (select u.id from public.users u where u.auth_id = (select auth.uid())),
    app
  );
$function$;

revoke all on function public.my_hub_apps() from public, anon;
grant execute on function public.my_hub_apps() to authenticated;

create or replace function public.boardroom_has_access()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select public.has_studio_app_access('boardroom');
$function$;

-- Member data rules: each app's rows follow that app's access.
drop policy if exists storysculpt_member_rows on public.storysculpt_projects;
create policy storysculpt_member_rows on public.storysculpt_projects
  for all to authenticated
  using (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'storysculpt'))
  with check (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'storysculpt'));

drop policy if exists storysculpt_member_context_row on public.storysculpt_member_context;
create policy storysculpt_member_context_row on public.storysculpt_member_context
  for all to authenticated
  using (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'storysculpt'))
  with check (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'storysculpt'));

drop policy if exists navigator_member_row on public.navigator_states;
create policy navigator_member_row on public.navigator_states
  for all to authenticated
  using (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'navigator'))
  with check (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'navigator'));

drop policy if exists navigator_moves_member_rows on public.navigator_moves;
create policy navigator_moves_member_rows on public.navigator_moves
  for all to authenticated
  using (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'navigator'))
  with check (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'navigator'));

drop policy if exists navigator_roadmaps_member_rows on public.navigator_roadmaps;
create policy navigator_roadmaps_member_rows on public.navigator_roadmaps
  for all to authenticated
  using (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'navigator'))
  with check (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'navigator'));

drop policy if exists vault_members_can_read on public.solution_vault_items;
create policy vault_members_can_read on public.solution_vault_items
  for select to authenticated
  using (published = true and public.has_studio_app_access('vault'));

drop policy if exists vault_progress_member_rows on public.solution_vault_progress;
create policy vault_progress_member_rows on public.solution_vault_progress
  for all to authenticated
  using (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'vault'))
  with check (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())) and public.member_has_app(user_id, 'vault'));

-- Admin: the four Hub app keys are valid alongside the existing three.
create or replace function public.admin_set_studio_access(target_user_id uuid, target_app_key text, enabled boolean, target_access_source text default 'admin'::text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  normalized_source text := case
    when target_access_source in ('beta', 'manual', 'admin') then target_access_source
    else 'admin'
  end;
  grant_ref text := 'admin:' || target_app_key;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;

  if target_app_key not in ('seeninseven', 'boardroom', 'eee', 'storysculpt', 'navigator', 'vault', 'certainty') then
    raise exception 'Invalid app key';
  end if;

  insert into public.studio_access_grants (
    user_id, app_key, source_kind, source_ref, status, granted_at, revoked_at, updated_at
  ) values (
    target_user_id,
    target_app_key,
    normalized_source,
    grant_ref,
    case when enabled then 'active' else 'revoked' end,
    now(),
    case when enabled then null else now() end,
    now()
  )
  on conflict (user_id, app_key, source_kind, source_ref) do update
  set status = excluded.status,
      granted_at = case when excluded.status = 'active' then now() else public.studio_access_grants.granted_at end,
      revoked_at = excluded.revoked_at,
      updated_at = now();

  perform public.refresh_studio_entitlement(target_user_id, target_app_key);
end;
$function$;

create or replace function public.admin_enroll_studio_customer(target_email text, target_name text default null::text, target_app_keys text[] default array[]::text[])
returns public.users
language plpgsql
security definer
set search_path to ''
as $function$
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
      where requested.app_key not in ('seeninseven', 'boardroom', 'eee', 'storysculpt', 'navigator', 'vault', 'certainty')
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
$function$;

-- Certainty booking and the admin Certainty list follow the Certainty key or
-- the bundle. Patched in place so the rest of each function is untouched; each
-- patch refuses to run if the text it expects has moved.
do $patch$
declare
  d text;
  patched text;
begin
  d := pg_get_functiondef('public.book_certainty_session(date, integer, text, text, text)'::regprocedure);
  patched := replace(d, $x$and e.app_key = 'eee' and e.status = 'active'$x$, $x$and e.app_key in ('eee', 'certainty') and e.status = 'active'$x$);
  if patched = d then raise exception 'book_certainty_session: expected eee check not found'; end if;
  execute patched;

  d := pg_get_functiondef('public.admin_get_certainty_engagement()'::regprocedure);
  patched := replace(d, $x$where e.app_key = 'eee'$x$, $x$where e.app_key in ('eee', 'certainty')$x$);
  if patched = d then raise exception 'admin_get_certainty_engagement: expected eee filter not found'; end if;
  execute patched;
end;
$patch$;
