-- WBR-384: admin-guarded usage read across all four Momentum Hub tools.
-- Applied to the shared Studio Supabase (project zdtkwpzdwnzzmdwrvmka) on 2026-09-28.
-- StorySculpt, Navigator, and Certainty log to public.logs via record_log_event;
-- AI Boardroom logs to public.boardroom_logs. This function joins both into one
-- operator-facing read so Navigator and Boardroom usage are visible in the admin
-- view the same way StorySculpt and Certainty already are.
create or replace function public.admin_get_hub_usage()
returns table (
  storysculpt_generations bigint,
  storysculpt_last timestamptz,
  navigator_generations bigint,
  navigator_last timestamptz,
  certainty_events bigint,
  certainty_last timestamptz,
  boardroom_deepseek_calls bigint,
  boardroom_turns bigint,
  boardroom_last timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = auth.uid() and coalesce(u.is_admin, false)
  ) then
    raise exception 'Admin access required';
  end if;

  return query
  select
    (select count(*) from public.logs where event_type = 'storysculpt_generation'),
    (select max(created_at) from public.logs where event_type like 'storysculpt\_%'),
    (select count(*) from public.logs where event_type = 'navigator_generation'),
    (select max(created_at) from public.logs where event_type like 'navigator\_%'),
    (select count(*) from public.logs where event_type like 'certainty\_%'),
    (select max(created_at) from public.logs where event_type like 'certainty\_%'),
    (select count(*) from public.boardroom_logs where event_type = 'deepseek_call'),
    (select count(*) from public.boardroom_logs where event_type = 'turn'),
    (select max(created_at) from public.boardroom_logs);
end;
$$;

grant execute on function public.admin_get_hub_usage() to authenticated;
