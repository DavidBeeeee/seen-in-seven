-- Bug found during live verification testing (see test transaction run
-- against a real, then-rolled-back user row): prevent_privilege_self_escalation()
-- checks is_admin() to decide whether to allow an is_admin change. For a
-- caller who is on the allowlist but does not yet have is_admin = true on
-- their row (e.g. a returning admin whose row was created before their
-- first admin login), is_admin() correctly returns false at the moment
-- provision_admin_account()'s UPDATE runs -- which means the trigger would
-- silently revert the very change provision_admin_account() is trying to
-- make, defeating its purpose for anyone except a brand-new row (INSERT
-- is untouched by this trigger, only UPDATE is affected).
--
-- Fix: provision_admin_account() sets a transaction-local flag immediately
-- before its UPDATE, and the trigger treats that flag as an explicit
-- bypass. The flag is transaction-scoped (set_config's third argument),
-- so it cannot leak into any other query and only covers the one UPDATE
-- provision_admin_account() itself issues after its own allowlist check
-- has already passed.
--
-- Verified via a live BEGIN/ROLLBACK test against a real non-admin user
-- row: direct self-escalation UPDATE blocked, non-allowlisted RPC call
-- raises an exception, allowlisted existing-row provisioning succeeds,
-- and a resulting admin can still update is_paid normally. All real data
-- confirmed unchanged after ROLLBACK.

create or replace function public.prevent_privilege_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and coalesce(current_setting('app.bypass_privilege_guard', true), '') <> 'true' then
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
    perform set_config('app.bypass_privilege_guard', 'true', true);
    update public.users set is_admin = true where id = v_user_id;
  end if;
end;
$$;
