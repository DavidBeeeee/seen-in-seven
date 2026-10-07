-- Certainty Sessions: lapse awareness. WBR-373, evening order WO-20261006-evening.
--
-- Certainty's last three Momentum 300 FAILs (UX 14, 15, 47) were one gap: when a
-- member stops booking, nothing notices. A missed month looked exactly like a
-- busy week, to the member and to David. This migration reads the history that
-- already exists (certainty_sessions plus the eee entitlement) and names where
-- each member stands. No new table, no new writes.
--
-- THE THRESHOLD, and why. Certainty is one included session per week, so the
-- unit is a weekly cycle. A "held" session is a booked (not cancelled) session
-- that has ended. Days are counted from the end of the member's last held
-- session.
--
--   current  : a booked session is coming up, or the last one ended under 8
--              days ago. They are inside this week's rhythm.
--   skipped  : 8 to 20 days. One or two weeks went by without a session. That
--              is life, not a lapse, and the member page says nothing about it.
--   lapsed   : 21 days or more with nothing booked. Three weekly cycles have
--              passed since the last session, so at least two consecutive
--              included weeks went unused. That is a pattern, not a busy week.
--   new      : still a member, never had a held session and nothing booked.
--              Not lapsed: they never started. David sees them separately.
--   churned  : the eee membership itself is no longer active. Lapsed members
--              are still paying and can come back with one click; churned
--              members left. The two are never mixed (UX 15).
--
-- certainty_engagement() is the single place the threshold lives, so the member
-- page and David's list can never disagree about who has lapsed.
--
-- Load-bearing rules honored: RLS untouched, every function SECURITY DEFINER
-- with an empty search_path, the operator list is is_admin gated and returns an
-- empty shape to anyone else, and the member state only ever reads the caller's
-- own rows.

-- ── 1. The threshold, in one place ───────────────────────────────────────────
create or replace function public.certainty_engagement(
  p_last_held_end timestamptz,
  p_has_upcoming boolean,
  p_now timestamptz default now()
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_has_upcoming, false) then 'current'
    when p_last_held_end is null then 'new'
    when p_now - p_last_held_end < interval '8 days' then 'current'
    when p_now - p_last_held_end < interval '21 days' then 'skipped'
    else 'lapsed'
  end;
$$;

revoke all on function public.certainty_engagement(timestamptz, boolean, timestamptz) from public, anon;
grant execute on function public.certainty_engagement(timestamptz, boolean, timestamptz) to authenticated;

-- ── 2. Member state, now knowing how long it has been ────────────────────────
-- Identical to the 2026-09-27 certainty_state in every field it already
-- returned. Adds `engagement`, `lastHeld` (the caller's own most recent held
-- session: when, and what they brought), `daysSinceLastHeld`,
-- `weeksSinceLastHeld` and `lapseThresholdDays`, so the page can offer a warm,
-- specific way back instead of the generic "not booked this week" card.
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
    select s.id, s.starts_at, s.ends_at, s.mode, s.topic,
      to_char(s.starts_at at time zone 'America/New_York', 'FMDay, FMMonth FMDD, YYYY') as label_day,
      to_char(s.starts_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_start,
      to_char(s.ends_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_end
    from public.certainty_sessions s
    where s.user_id = v_user_id and s.status = 'booked' and s.ends_at <= now()
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

-- ── 3. David's list: who has gone quiet ──────────────────────────────────────
-- Every non-admin who has ever held an eee entitlement, bucketed by the same
-- certainty_engagement() the member page uses, plus churned for memberships
-- that ended. Admin accounts are David's own and are left out: they are not
-- members who can drift. Same is_admin boundary and empty-shape-for-non-admins
-- convention as admin_get_certainty_sessions.
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
    where e.app_key = 'eee'
    order by e.user_id,
      (e.status = 'active' and (e.expires_at is null or e.expires_at > now())) desc,
      e.granted_at desc nulls last
  ),
  stats as (
    select ent.user_id, ent.granted_at, ent.active,
      (select max(s.ends_at) from public.certainty_sessions s
        where s.user_id = ent.user_id and s.status = 'booked' and s.ends_at <= now()) as last_held_end,
      (select count(*) from public.certainty_sessions s
        where s.user_id = ent.user_id and s.status = 'booked' and s.ends_at <= now())::int as held_count,
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
