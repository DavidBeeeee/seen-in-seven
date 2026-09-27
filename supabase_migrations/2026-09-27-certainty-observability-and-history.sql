-- Certainty Sessions: observability, an operator view, and member history.
-- WBR-061 / WBR-066 evening order (WO-20260923-evening), built 2026-09-27 from
-- the Momentum 300 Certainty score. The booking engine is real and safe; its two
-- holes were that nothing watched it and nobody could see it. This migration
-- gives it eyes (a server-side log path that actually lands rows), an admin view
-- of who booked, and a member-facing history of past sessions.
--
-- Load-bearing rules honored: every write stays RPC-only and SECURITY DEFINER,
-- the is_admin boundary gates the operator view, and no member content leaves
-- the member's own rows.

-- ── 1. A server-side log path that survives RLS ──────────────────────────────
-- The logs table's INSERT policy requires user_id to be the INTERNAL
-- public.users.id (user_id IN (select id from users where auth_id = auth.uid())),
-- not the auth uid. The client logEvent writes the internal id and lands rows;
-- but a serverless function only holds the auth user (GET /auth/v1/user returns
-- auth.users.id). StorySculpt's WBR-384 observability wrote the auth uid straight
-- to /rest/v1/logs and every insert was silently rejected by RLS: 0 rows in
-- weeks of use. This RPC closes that gap once, for every server logger. It runs
-- as the definer, resolves the caller's internal users.id from auth.uid()
-- itself, and inserts. Called with the member's own token, so the event is
-- attributed to the member who caused it. Content never enters an event; the
-- caller passes only counts, classes, outcomes, and timings.
create or replace function public.record_log_event(
  p_event_type text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_event_type is null or length(btrim(p_event_type)) = 0 then
    return;
  end if;

  select u.id into v_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  -- No resolvable member (anonymous or unknown token): drop the event rather
  -- than write an orphan row. Telemetry must never raise.
  if v_user_id is null then
    return;
  end if;

  insert into public.logs (user_id, event_type, detail)
  values (v_user_id, left(btrim(p_event_type), 100), coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke all on function public.record_log_event(text, jsonb) from public, anon;
grant execute on function public.record_log_event(text, jsonb) to authenticated;

-- ── 2. Member state, now with a history of past sessions ─────────────────────
-- Identical to the shipped certainty_state in every field it already returned;
-- this adds `history` (the caller's own past HELD sessions, most recent first)
-- and `historyCount` (how many sessions the membership has actually delivered).
-- Decision, recorded because David was not present to choose: the member
-- history shows only attended/held past sessions, not cancellations, because it
-- exists to make the membership's accruing value visible and a cancelled slot is
-- not value received. The operator view (admin_get_certainty_sessions) shows
-- cancellations too, so nothing is hidden from David.
create or replace function public.certainty_state(p_days int default 21)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_week text := to_char(now() at time zone 'America/New_York', 'IYYY-"W"IW');
  v_upcoming jsonb;
  v_taken jsonb;
  v_history jsonb;
  v_history_count int;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  if v_user_id is null then
    return jsonb_build_object('signedIn', false);
  end if;

  select to_jsonb(t) into v_upcoming
  from (
    select s.id, s.starts_at, s.ends_at, s.mode, s.phone, s.topic, s.calendar_status,
      to_char(s.starts_at at time zone 'America/New_York', 'YYYY-MM-DD') as local_date,
      extract(hour from (s.starts_at at time zone 'America/New_York'))::int as local_hour,
      to_char(s.starts_at at time zone 'America/New_York', 'FMDay, FMMonth FMDD') as label_day,
      to_char(s.starts_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_start,
      to_char(s.ends_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_end
    from public.certainty_sessions s
    where s.user_id = v_user_id and s.status = 'booked' and s.ends_at > now()
    order by s.starts_at asc
    limit 1
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('date', d.local_date, 'hour', d.local_hour)), '[]'::jsonb)
    into v_taken
  from (
    select distinct
      to_char(s.starts_at at time zone 'America/New_York', 'YYYY-MM-DD') as local_date,
      extract(hour from (s.starts_at at time zone 'America/New_York'))::int as local_hour
    from public.certainty_sessions s
    where s.status = 'booked'
      and s.starts_at >= (now() - interval '1 hour')
      and s.starts_at < (now() + make_interval(days => greatest(p_days, 1)))
  ) d;

  -- The caller's own past held sessions: the value the membership has delivered.
  select coalesce(jsonb_agg(to_jsonb(h) order by h.starts_at desc), '[]'::jsonb), count(*)::int
    into v_history, v_history_count
  from (
    select s.id, s.starts_at, s.ends_at, s.mode, s.topic,
      to_char(s.starts_at at time zone 'America/New_York', 'FMDay, FMMonth FMDD, YYYY') as label_day,
      to_char(s.starts_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_start,
      to_char(s.ends_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_end
    from public.certainty_sessions s
    where s.user_id = v_user_id and s.status = 'booked' and s.ends_at <= now()
    order by s.starts_at desc
    limit 50
  ) h;

  return jsonb_build_object(
    'signedIn', true,
    'currentWeek', v_week,
    'bookedThisWeek', exists (
      select 1 from public.certainty_sessions s
      where s.user_id = v_user_id and s.status = 'booked' and s.iso_week = v_week
    ),
    'upcoming', v_upcoming,
    'taken', v_taken,
    'history', v_history,
    'historyCount', v_history_count,
    'window', jsonb_build_object('startHour', 10, 'endHour', 22, 'durationHours', 2, 'tz', 'America/New_York')
  );
end;
$$;

revoke all on function public.certainty_state(int) from public, anon;
grant execute on function public.certainty_state(int) to authenticated;

-- ── 3. The operator view: who booked, upcoming and past ──────────────────────
-- David has had no way to see Certainty bookings except the raw table. This is
-- the admin surface's data source, behind the same is_admin boundary the other
-- admin_get_* functions use. A non-admin caller gets an empty structure rather
-- than an error, matching admin_get_scripts's "no rows for non-admins" shape.
create or replace function public.admin_get_certainty_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_upcoming jsonb;
  v_past jsonb;
  v_upcoming_count int;
  v_past_count int;
  v_cancelled_count int;
begin
  select coalesce(u.is_admin, false) into v_is_admin
  from public.users u
  where u.auth_id = (select auth.uid());

  if not coalesce(v_is_admin, false) then
    return jsonb_build_object(
      'isAdmin', false, 'upcoming', '[]'::jsonb, 'past', '[]'::jsonb,
      'counts', jsonb_build_object('upcoming', 0, 'past', 0, 'cancelled', 0)
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(u) order by u.starts_at asc), '[]'::jsonb), count(*)::int
    into v_upcoming, v_upcoming_count
  from (
    select s.id, s.member_name, s.member_email, s.starts_at, s.ends_at, s.mode,
      s.phone, s.topic, s.status, s.calendar_status, s.calendar_event_id, s.created_at,
      to_char(s.starts_at at time zone 'America/New_York', 'FMDay, FMMonth FMDD, YYYY') as label_day,
      to_char(s.starts_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_start,
      to_char(s.ends_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_end
    from public.certainty_sessions s
    where s.status = 'booked' and s.ends_at > now()
    order by s.starts_at asc
  ) u;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.starts_at desc), '[]'::jsonb), count(*)::int
    into v_past, v_past_count
  from (
    select s.id, s.member_name, s.member_email, s.starts_at, s.ends_at, s.mode,
      s.phone, s.topic, s.status, s.calendar_status, s.calendar_event_id, s.created_at, s.cancelled_at,
      to_char(s.starts_at at time zone 'America/New_York', 'FMDay, FMMonth FMDD, YYYY') as label_day,
      to_char(s.starts_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_start,
      to_char(s.ends_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_end
    from public.certainty_sessions s
    where s.status = 'cancelled' or s.ends_at <= now()
    order by s.starts_at desc
    limit 300
  ) p;

  select count(*)::int into v_cancelled_count
  from public.certainty_sessions s where s.status = 'cancelled';

  return jsonb_build_object(
    'isAdmin', true,
    'upcoming', v_upcoming,
    'past', v_past,
    'counts', jsonb_build_object(
      'upcoming', v_upcoming_count,
      'past', v_past_count,
      'cancelled', v_cancelled_count
    )
  );
end;
$$;

revoke all on function public.admin_get_certainty_sessions() from public, anon;
grant execute on function public.admin_get_certainty_sessions() to authenticated;
