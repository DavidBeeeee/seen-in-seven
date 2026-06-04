create or replace function public.admin_delete_subjects(
  target_user_ids uuid[] default '{}'::uuid[],
  target_anon_session_ids text[] default '{}'::text[]
)
returns void
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

  if coalesce(array_length(target_user_ids, 1), 0) > 0 then
    delete from public.logs
    where user_id = any(target_user_ids);

    delete from public.video_progress
    where user_id = any(target_user_ids);

    delete from public.scripts
    where user_id = any(target_user_ids);

    delete from public.onboarding
    where user_id = any(target_user_ids);

    delete from public.preauth_events
    where user_id = any(target_user_ids);

    delete from public.users
    where id = any(target_user_ids)
      and coalesce(is_admin, false) = false;
  end if;

  if coalesce(array_length(target_anon_session_ids, 1), 0) > 0 then
    delete from public.preauth_events
    where anon_session_id = any(target_anon_session_ids)
      and user_id is null;
  end if;
end;
$$;

grant execute on function public.admin_delete_subjects(uuid[], text[]) to authenticated;
