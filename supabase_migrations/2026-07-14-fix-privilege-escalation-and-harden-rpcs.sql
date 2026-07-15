-- Fixes a live privilege-escalation hole: the users_own_row RLS policy
-- (ALL commands, WITH CHECK (auth.uid() = auth_id)) does not restrict which
-- columns a user can change on their own row. Any authenticated user could
-- run supabase.from('users').update({ is_admin: true }) on themselves and
-- pass the check, since it only verifies row ownership, not column values.
-- Once is_admin = true, every admin_get_* RPC opens up to them.
--
-- This also closes the gap that made admin.html's client-side auto-
-- provisioning (sb.from('users').update({ is_admin: true })) "work" —
-- it worked because nothing was stopping it, not because it was gated.

-- ── 1. Trigger: block self-granted is_admin / is_paid ──────────────────
-- Reverts is_admin/is_paid changes back to their old value unless the
-- caller is already an admin or the request comes from the service role.
-- Silent revert (not an error) so it never breaks a legitimate update
-- that happens to touch other columns on the same row — the app never
-- sets these two columns itself outside of the admin RPCs below.
create or replace function public.prevent_privilege_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.is_admin is distinct from old.is_admin and not public.is_admin() then
      new.is_admin := old.is_admin;
    end if;
    if new.is_paid is distinct from old.is_paid and not public.is_admin() then
      new.is_paid := old.is_paid;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_privilege_self_escalation on public.users;
create trigger trg_prevent_privilege_self_escalation
before update on public.users
for each row
execute function public.prevent_privilege_self_escalation();

-- ── 2. provision_admin_account(): the only legitimate self-provisioning path ──
-- Server-side allowlist mirrors ADMIN_EMAILS in admin.html. Upserts a
-- users row with is_admin = true for the calling auth user, but only if
-- their JWT email is on the list. This is what admin.html should call on
-- first login instead of updating the row directly from the client.
create or replace function public.provision_admin_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_user_id uuid;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email not in ('email@davidbee.me', 'davidkamau@live.com') then
    raise exception 'not an authorized admin email';
  end if;

  select id into v_user_id from public.users where auth_id = auth.uid() limit 1;

  if v_user_id is null then
    insert into public.users (auth_id, email, is_admin, is_paid)
    values (auth.uid(), v_email, true, false);
  else
    update public.users set is_admin = true where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.provision_admin_account() to authenticated;
revoke execute on function public.provision_admin_account() from anon, public;

-- ── 3. search_path hardening on pre-existing functions ──────────────────
-- These predate the pattern already used by the newer preauth/admin_delete
-- functions. Pinning search_path prevents a caller from shadowing public
-- schema objects via search_path manipulation. Pure hardening, no
-- behavior change.
alter function public.admin_get_users() set search_path = public;
alter function public.admin_get_scripts() set search_path = public;
alter function public.admin_get_progress() set search_path = public;
alter function public.admin_get_onboarding() set search_path = public;
alter function public.admin_get_logs() set search_path = public;
alter function public.admin_set_paid(uuid, boolean) set search_path = public;
alter function public.set_script_version() set search_path = public;
alter function public.update_updated_at() set search_path = public;
alter function public.is_admin() set search_path = public;

-- ── 4. Tighten admin RPC grants to authenticated only ───────────────────
-- These were granted to PUBLIC (which implicitly includes anon) with no
-- functional reason for anon to hold execute rights — each function's own
-- internal is_admin check already protects it, this is defense in depth.
revoke execute on function public.admin_get_users() from public, anon;
revoke execute on function public.admin_get_scripts() from public, anon;
revoke execute on function public.admin_get_progress() from public, anon;
revoke execute on function public.admin_get_onboarding() from public, anon;
revoke execute on function public.admin_get_logs() from public, anon;
revoke execute on function public.admin_get_preauth_events() from public, anon;
revoke execute on function public.admin_set_paid(uuid, boolean) from public, anon;
revoke execute on function public.admin_delete_subjects(uuid[], text[]) from public, anon;

grant execute on function public.admin_get_users() to authenticated;
grant execute on function public.admin_get_scripts() to authenticated;
grant execute on function public.admin_get_progress() to authenticated;
grant execute on function public.admin_get_onboarding() to authenticated;
grant execute on function public.admin_get_logs() to authenticated;
grant execute on function public.admin_get_preauth_events() to authenticated;
grant execute on function public.admin_set_paid(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_subjects(uuid[], text[]) to authenticated;
