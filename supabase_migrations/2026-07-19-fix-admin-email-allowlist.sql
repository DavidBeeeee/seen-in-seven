-- Keep the server-side admin allowlist aligned with every admin client.
-- The Live address remains approved until David chooses a replacement test account.
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
  if v_email not in (
    'contact@davidbee.me',
    'davidkamau.t@gmail.com',
    'davidkamau@live.com'
  ) then
    raise exception 'not an authorized admin email';
  end if;

  select id into v_user_id from public.users where auth_id = auth.uid() limit 1;

  if v_user_id is null then
    insert into public.users (auth_id, email, is_admin, is_paid)
    values (auth.uid(), v_email, true, false);
  else
    perform set_config('app.bypass_privilege_guard', 'true', true);
    update public.users
    set email = v_email, is_admin = true
    where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.provision_admin_account() to authenticated;
revoke execute on function public.provision_admin_account() from anon, public;
