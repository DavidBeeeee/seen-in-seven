-- 2026-10-22-certainty-admin-week
-- The Dashboard's This week panel (David, 2026-10-22) reads the next seven days
-- of Certainty bookings live, so it can never show a stale copy. The WorkerBee
-- API may not hold the service key, so this is a SECURITY DEFINER function that
-- refuses anyone but an admin and returns only what the panel shows: when, how,
-- a first name and whether the booking reached David's calendar. No topic, no
-- phone, no email.

create or replace function public.certainty_admin_week()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'startsAt', s.starts_at,
      'endsAt', s.ends_at,
      'mode', s.mode,
      'who', split_part(coalesce(nullif(btrim(s.member_name), ''), split_part(s.member_email, '@', 1), 'Member'), ' ', 1),
      'calendar', s.calendar_status
    ) order by s.starts_at)
    from public.certainty_sessions s
    where s.status = 'booked'
      and s.starts_at >= now()
      and s.starts_at < now() + interval '7 days'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.certainty_admin_week() from public, anon;
grant execute on function public.certainty_admin_week() to authenticated;
