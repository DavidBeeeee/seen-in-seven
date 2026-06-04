drop function if exists public.admin_get_onboarding();

create or replace function public.admin_get_onboarding()
returns setof public.onboarding
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.users u
    where u.auth_id = auth.uid()
      and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'admin access required';
  end if;

  return query
  select o.*
  from public.onboarding o
  order by o.updated_at desc nulls last, o.created_at desc nulls last;
end;
$$;

grant execute on function public.admin_get_onboarding() to authenticated;
