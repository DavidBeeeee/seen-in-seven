-- Certainty Sessions: attendance. WBR-373, evening order WO-20261015-evening.
--
-- Momentum 300 Developer 4, 5 and 38: a session had no completed, attended or
-- no-show state. A past booking just dropped out of upcoming, so history and
-- the lapse logic counted bookings, not sessions that really happened.
--
-- This adds an outcome David sets after a session ends:
--   held     : it happened.
--   no_show  : the member did not come.
--   null     : not marked yet. Counted as held, exactly as before, so nothing
--              changes for a session David has not looked at.
--
-- certainty_engagement() and its 8 and 21 day thresholds are untouched. The only
-- change to the held derivation is that a no_show is no longer counted as held:
-- not in the member's history, not as their last held session, and not in
-- David's held count or lapse list.
--
-- Load-bearing rules honored: RLS and table grants untouched; the only writer of
-- outcome is certainty_mark_outcome, is_admin gated, SECURITY DEFINER with an
-- empty search_path, revoked from public and anon. The certainty_outcome event
-- carries the session id and outcome, never the topic.

-- ── 1. The columns ───────────────────────────────────────────────────────────
alter table public.certainty_sessions
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'certainty_sessions_outcome_check'
      and conrelid = 'public.certainty_sessions'::regclass
  ) then
    alter table public.certainty_sessions
      add constraint certainty_sessions_outcome_check
      check (outcome is null or outcome in ('held', 'no_show'));
  end if;
end;
$$;

-- ── 2. The one writer ────────────────────────────────────────────────────────
-- Refuses non-admins, unknown sessions, cancelled sessions and sessions that
-- have not ended. Re-marking is allowed so a misclick can be corrected; the
-- event records the previous outcome.
create or replace function public.certainty_mark_outcome(p_id uuid, p_outcome text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_session public.certainty_sessions%rowtype;
  v_now timestamptz := now();
begin
  select coalesce(u.is_admin, false) into v_is_admin
  from public.users u
  where u.auth_id = (select auth.uid());

  if not coalesce(v_is_admin, false) then
    raise exception 'Only an admin can mark a Certainty session.' using errcode = '42501';
  end if;

  if p_outcome is null or p_outcome not in ('held', 'no_show') then
    raise exception 'Outcome must be held or no_show.' using errcode = '22023';
  end if;

  select * into v_session
  from public.certainty_sessions s
  where s.id = p_id
  for update;

  if not found then
    raise exception 'No Certainty session with that id.' using errcode = 'P0002';
  end if;

  if v_session.status = 'cancelled' then
    raise exception 'A cancelled session cannot be marked held or no-show.' using errcode = '22023';
  end if;

  if v_session.ends_at > v_now then
    raise exception 'This session has not ended yet.' using errcode = '22023';
  end if;

  update public.certainty_sessions
  set outcome = p_outcome, outcome_at = v_now
  where id = p_id;

  insert into public.logs (user_id, event_type, detail)
  values (
    v_session.user_id,
    'certainty_outcome',
    jsonb_build_object(
      'schema', 1,
      'session_id', p_id,
      'outcome', p_outcome,
      'previous', v_session.outcome,
      'ends_at', v_session.ends_at
    )
  );

  return jsonb_build_object('id', p_id, 'outcome', p_outcome, 'outcome_at', v_now);
end;
$$;

revoke all on function public.certainty_mark_outcome(uuid, text) from public, anon;
grant execute on function public.certainty_mark_outcome(uuid, text) to authenticated;

-- ── 3. Member state: a no_show is not a held session ─────────────────────────
-- Identical to the 2026-10-06 certainty_state except the two held reads
-- (history with historyCount, and lastHeld) skip outcome = 'no_show', and each
-- history row carries its outcome.
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
  v_last_held jsonb;
  v_last_held_end timestamptz;
  v_days int;
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

  select coalesce(jsonb_agg(to_jsonb(h) order by h.starts_at desc), '[]'::jsonb), count(*)::int
    into v_history, v_history_count
  from (
    select s.id, s.starts_at, s.ends_at, s.mode, s.topic, s.outcome,
      to_char(s.starts_at at time zone 'America/New_York', 'FMDay, FMMonth FMDD, YYYY') as label_day,
      to_char(s.starts_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_start,
      to_char(s.ends_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_end
    from public.certainty_sessions s
    where s.user_id = v_user_id and s.status = 'booked' and s.ends_at <= now()
      and s.outcome is distinct from 'no_show'
    order by s.starts_at desc
    limit 50
  ) h;

  select s.ends_at,
    jsonb_build_object(
      'ends_at', s.ends_at,
      'topic', s.topic,
      'label_day', to_char(s.starts_at at time zone 'America/New_York', 'FMMonth FMDD')
    )
    into v_last_held_end, v_last_held
  from public.certainty_sessions s
  where s.user_id = v_user_id and s.status = 'booked' and s.ends_at <= now()
    and s.outcome is distinct from 'no_show'
  order by s.ends_at desc
  limit 1;

  v_days := case when v_last_held_end is null then null
    else floor(extract(epoch from (now() - v_last_held_end)) / 86400)::int end;

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
    'engagement', public.certainty_engagement(v_last_held_end, v_upcoming is not null),
    'lastHeld', v_last_held,
    'daysSinceLastHeld', v_days,
    'weeksSinceLastHeld', case when v_days is null then null else v_days / 7 end,
    'lapseThresholdDays', 21,
    'window', jsonb_build_object('startHour', 10, 'endHour', 22, 'durationHours', 2, 'tz', 'America/New_York')
  );
end;
$$;

revoke all on function public.certainty_state(int) from public, anon;
grant execute on function public.certainty_state(int) to authenticated;

-- ── 4. David's lapse list: same rule ─────────────────────────────────────────
-- Identical to the 2026-10-06 admin_get_certainty_engagement except the three
-- held reads skip outcome = 'no_show'.
create or replace function public.admin_get_certainty_engagement()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_members jsonb;
  v_counts jsonb;
begin
  select coalesce(u.is_admin, false) into v_is_admin
  from public.users u
  where u.auth_id = (select auth.uid());

  if not coalesce(v_is_admin, false) then
    return jsonb_build_object(
      'isAdmin', false, 'lapseThresholdDays', 21, 'members', '[]'::jsonb,
      'counts', jsonb_build_object('current', 0, 'skipped', 0, 'lapsed', 0, 'new', 0, 'churned', 0)
    );
  end if;

  with ent as (
    select distinct on (e.user_id) e.user_id, e.granted_at,
      (e.status = 'active' and (e.expires_at is null or e.expires_at > now())) as active
    from public.studio_entitlements e
    where e.app_key in ('eee', 'certainty')
    order by e.user_id,
      (e.status = 'active' and (e.expires_at is null or e.expires_at > now())) desc,
      e.granted_at desc nulls last
  ),
  stats as (
    select ent.user_id, ent.granted_at, ent.active,
      (select max(s.ends_at) from public.certainty_sessions s
        where s.user_id = ent.user_id and s.status = 'booked' and s.ends_at <= now()
          and s.outcome is distinct from 'no_show') as last_held_end,
      (select count(*) from public.certainty_sessions s
        where s.user_id = ent.user_id and s.status = 'booked' and s.ends_at <= now()
          and s.outcome is distinct from 'no_show')::int as held_count,
      (select min(s.starts_at) from public.certainty_sessions s
        where s.user_id = ent.user_id and s.status = 'booked' and s.ends_at > now()) as next_starts
    from ent
  ),
  member_rows as (
    select u.name as member_name, au.email as member_email, st.granted_at, st.held_count,
      st.last_held_end, st.next_starts,
      case when st.last_held_end is null then null
        else floor(extract(epoch from (now() - st.last_held_end)) / 86400)::int end as days_since_last_held,
      to_char(st.last_held_end at time zone 'America/New_York', 'FMMonth FMDD, YYYY') as last_held_label,
      (select s.topic from public.certainty_sessions s
        where s.user_id = st.user_id and s.status = 'booked' and s.ends_at <= now()
          and s.outcome is distinct from 'no_show'
        order by s.ends_at desc limit 1) as last_topic,
      case when not st.active then 'churned'
        else public.certainty_engagement(st.last_held_end, st.next_starts is not null) end as engagement
    from stats st
    join public.users u on u.id = st.user_id
    left join auth.users au on au.id = u.auth_id
    where not coalesce(u.is_admin, false)
  )
  select
    coalesce(jsonb_agg(to_jsonb(r) order by
      case r.engagement when 'lapsed' then 0 when 'new' then 1 when 'skipped' then 2 when 'current' then 3 else 4 end,
      r.days_since_last_held desc nulls last), '[]'::jsonb),
    jsonb_build_object(
      'current', count(*) filter (where r.engagement = 'current'),
      'skipped', count(*) filter (where r.engagement = 'skipped'),
      'lapsed', count(*) filter (where r.engagement = 'lapsed'),
      'new', count(*) filter (where r.engagement = 'new'),
      'churned', count(*) filter (where r.engagement = 'churned')
    )
    into v_members, v_counts
  from member_rows r;

  return jsonb_build_object(
    'isAdmin', true,
    'lapseThresholdDays', 21,
    'members', v_members,
    'counts', v_counts
  );
end;
$$;

revoke all on function public.admin_get_certainty_engagement() from public, anon;
grant execute on function public.admin_get_certainty_engagement() to authenticated;

-- ── 5. David's session list: outcome on every past row ───────────────────────
-- Identical to the 2026-10-10 admin_get_certainty_sessions except past rows
-- carry outcome, outcome_at and ended, past rows sort flagged first, and counts
-- add held, no_show and unmarked (ended, booked, not yet marked).
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
  v_flagged_count int;
  v_held_count int;
  v_no_show_count int;
  v_unmarked_count int;
begin
  select coalesce(u.is_admin, false) into v_is_admin
  from public.users u
  where u.auth_id = (select auth.uid());

  if not coalesce(v_is_admin, false) then
    return jsonb_build_object(
      'isAdmin', false, 'upcoming', '[]'::jsonb, 'past', '[]'::jsonb,
      'counts', jsonb_build_object('upcoming', 0, 'past', 0, 'cancelled', 0, 'flagged', 0,
        'held', 0, 'no_show', 0, 'unmarked', 0)
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(u) order by u.safety_flag desc, u.starts_at asc), '[]'::jsonb), count(*)::int,
    (count(*) filter (where u.safety_flag))::int
    into v_upcoming, v_upcoming_count, v_flagged_count
  from (
    select s.id, s.member_name, s.member_email, s.starts_at, s.ends_at, s.mode,
      s.phone, s.topic, s.status, s.calendar_status, s.calendar_event_id, s.created_at,
      coalesce(s.safety_flag, false) as safety_flag, s.safety_flagged_at,
      to_char(s.starts_at at time zone 'America/New_York', 'FMDay, FMMonth FMDD, YYYY') as label_day,
      to_char(s.starts_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_start,
      to_char(s.ends_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_end
    from public.certainty_sessions s
    where s.status = 'booked' and s.ends_at > now()
  ) u;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.safety_flag desc, p.starts_at desc), '[]'::jsonb), count(*)::int
    into v_past, v_past_count
  from (
    select s.id, s.member_name, s.member_email, s.starts_at, s.ends_at, s.mode,
      s.phone, s.topic, s.status, s.calendar_status, s.calendar_event_id, s.created_at, s.cancelled_at,
      coalesce(s.safety_flag, false) as safety_flag, s.safety_flagged_at,
      s.outcome, s.outcome_at, (s.ends_at <= now()) as ended,
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

  select
    (count(*) filter (where s.outcome = 'held'))::int,
    (count(*) filter (where s.outcome = 'no_show'))::int,
    (count(*) filter (where s.outcome is null))::int
    into v_held_count, v_no_show_count, v_unmarked_count
  from public.certainty_sessions s
  where s.status = 'booked' and s.ends_at <= now();

  return jsonb_build_object(
    'isAdmin', true,
    'upcoming', v_upcoming,
    'past', v_past,
    'counts', jsonb_build_object(
      'upcoming', v_upcoming_count,
      'past', v_past_count,
      'cancelled', v_cancelled_count,
      'flagged', v_flagged_count,
      'held', v_held_count,
      'no_show', v_no_show_count,
      'unmarked', v_unmarked_count
    )
  );
end;
$$;

revoke all on function public.admin_get_certainty_sessions() from public, anon;
grant execute on function public.admin_get_certainty_sessions() to authenticated;
