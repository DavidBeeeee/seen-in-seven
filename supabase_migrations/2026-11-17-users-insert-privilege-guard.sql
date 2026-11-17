-- Studio self sign-up: close the insert path to admin.
--
-- trg_prevent_privilege_self_escalation ran BEFORE UPDATE only, while the
-- authenticated role holds INSERT on is_admin and is_paid and users_own_row
-- lets a signed-in person insert their own row. Anyone who could create an
-- account (the email-link sign-in already does, shouldCreateUser: true) could
-- insert { auth_id: self, is_admin: true } before their profile row existed,
-- and is_admin() reads that column. No such row exists (2026-11-17: the four
-- admins are all David's own addresses). Every client insert already sends
-- is_paid false, so forcing both flags on insert changes no legitimate path.
--
-- Rollback: recreate the trigger as BEFORE UPDATE only.

create or replace function public.prevent_privilege_self_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.role() <> 'service_role'
     and coalesce(current_setting('app.bypass_privilege_guard', true), '') <> 'true'
     and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_admin := false;
      new.is_paid := false;
    else
      if new.is_admin is distinct from old.is_admin then
        new.is_admin := old.is_admin;
      end if;
      if new.is_paid is distinct from old.is_paid then
        new.is_paid := old.is_paid;
      end if;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_prevent_privilege_self_escalation on public.users;
create trigger trg_prevent_privilege_self_escalation
  before insert or update on public.users
  for each row execute function public.prevent_privilege_self_escalation();
