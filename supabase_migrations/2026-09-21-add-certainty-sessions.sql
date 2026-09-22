-- Certainty Sessions: one private 2-hour 1:1 with David per member per week.
--
-- The member picks an open hour, chooses Zoom or phone, and the session is held
-- on David's calendar for two hours. Availability is 10:00 to 22:00
-- America/New_York (last start 22:00 ends at midnight). One held session per
-- member per ISO week; David can only run one session in any given slot.
--
-- All writes go through the SECURITY DEFINER functions below. The table itself
-- grants no direct insert/update to members, so the weekly limit and the
-- single-slot rule cannot be worked around from the client.

create table if not exists public.certainty_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  member_email text not null,
  member_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode text not null check (mode in ('zoom', 'phone')),
  phone text,
  topic text,
  status text not null default 'booked' check (status in ('booked', 'cancelled')),
  iso_week text not null,
  calendar_event_id text,
  calendar_status text not null default 'pending'
    check (calendar_status in ('pending', 'created', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

-- One held session per slot: David runs one at a time.
create unique index if not exists certainty_one_per_slot
  on public.certainty_sessions (starts_at)
  where status = 'booked';

-- One held session per member per ET week.
create unique index if not exists certainty_one_per_member_week
  on public.certainty_sessions (user_id, iso_week)
  where status = 'booked';

create index if not exists certainty_sessions_user_time
  on public.certainty_sessions (user_id, starts_at);

alter table public.certainty_sessions enable row level security;

-- Members read their own rows; admins read all. Writes are RPC-only.
drop policy if exists certainty_select_own on public.certainty_sessions;
create policy certainty_select_own on public.certainty_sessions
for select to authenticated
using (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  or exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  )
);

-- The member's current state: their next held session, whether they have used
-- this week, and the slots already taken in the coming window so the client can
-- grey them out. No other member's identity is exposed, only the taken hours.
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

  return jsonb_build_object(
    'signedIn', true,
    'currentWeek', v_week,
    'bookedThisWeek', exists (
      select 1 from public.certainty_sessions s
      where s.user_id = v_user_id and s.status = 'booked' and s.iso_week = v_week
    ),
    'upcoming', v_upcoming,
    'taken', v_taken,
    'window', jsonb_build_object('startHour', 10, 'endHour', 22, 'durationHours', 2, 'tz', 'America/New_York')
  );
end;
$$;

-- Book a session. Validates membership, the availability window, the once-a-week
-- rule and the single-slot rule, then holds two hours. Times are given as an ET
-- wall-clock date and hour so daylight saving is resolved by the database, not
-- by the browser.
create or replace function public.book_certainty_session(
  p_local_date date,
  p_hour int,
  p_mode text,
  p_phone text default null,
  p_topic text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
  v_name text;
  v_starts timestamptz;
  v_ends timestamptz;
  v_week text;
  v_row public.certainty_sessions;
begin
  select u.id, u.name into v_user_id, v_name
  from public.users u
  where u.auth_id = (select auth.uid());

  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED';
  end if;

  if not exists (
    select 1 from public.users u
    join public.studio_entitlements e on e.user_id = u.id
    where u.auth_id = (select auth.uid())
      and e.app_key = 'eee' and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
  ) then
    raise exception 'MEMBERSHIP_REQUIRED';
  end if;

  select au.email into v_email from auth.users au where au.id = (select auth.uid());

  if p_mode is null or p_mode not in ('zoom', 'phone') then
    raise exception 'BAD_MODE';
  end if;
  if p_hour is null or p_hour < 10 or p_hour > 22 then
    raise exception 'OUTSIDE_HOURS';
  end if;
  if p_mode = 'phone' and (p_phone is null or length(btrim(p_phone)) < 7) then
    raise exception 'PHONE_REQUIRED';
  end if;

  v_starts := (p_local_date::timestamp + make_interval(hours => p_hour)) at time zone 'America/New_York';
  v_ends := v_starts + interval '2 hours';
  v_week := to_char(v_starts at time zone 'America/New_York', 'IYYY-"W"IW');

  if v_starts <= now() then
    raise exception 'IN_PAST';
  end if;

  if exists (
    select 1 from public.certainty_sessions s
    where s.user_id = v_user_id and s.iso_week = v_week and s.status = 'booked'
  ) then
    raise exception 'ALREADY_BOOKED_THIS_WEEK';
  end if;

  if exists (
    select 1 from public.certainty_sessions s
    where s.starts_at = v_starts and s.status = 'booked'
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  insert into public.certainty_sessions
    (user_id, member_email, member_name, starts_at, ends_at, mode, phone, topic, iso_week)
  values (
    v_user_id, v_email, v_name, v_starts, v_ends, p_mode,
    case when p_mode = 'phone' then left(btrim(p_phone), 40) else null end,
    case when p_topic is null then null else left(btrim(p_topic), 500) end,
    v_week
  )
  returning * into v_row;

  return to_jsonb(v_row);
exception
  when unique_violation then
    -- The index caught a race the checks above did not.
    if exists (
      select 1 from public.certainty_sessions s
      where s.user_id = v_user_id and s.iso_week = v_week and s.status = 'booked'
    ) then
      raise exception 'ALREADY_BOOKED_THIS_WEEK';
    else
      raise exception 'SLOT_TAKEN';
    end if;
end;
$$;

-- Cancel one of the caller's own upcoming sessions. Frees the week and the slot.
create or replace function public.cancel_certainty_session(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_row public.certainty_sessions;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED';
  end if;

  update public.certainty_sessions s
    set status = 'cancelled', cancelled_at = now()
  where s.id = p_id and s.user_id = v_user_id and s.status = 'booked'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'NOT_FOUND';
  end if;

  return to_jsonb(v_row);
end;
$$;

-- Record the result of the calendar write for one of the caller's own sessions.
-- Called by the server after it creates (or fails to create) the calendar event,
-- so the session row remembers whether it made it onto David's calendar.
create or replace function public.certainty_set_calendar(
  p_id uuid,
  p_event_id text,
  p_status text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_row public.certainty_sessions;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED';
  end if;
  if p_status is null or p_status not in ('pending', 'created', 'failed', 'skipped') then
    raise exception 'BAD_STATUS';
  end if;

  update public.certainty_sessions s
    set calendar_event_id = p_event_id, calendar_status = p_status
  where s.id = p_id and s.user_id = v_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'NOT_FOUND';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.certainty_state(int) from public, anon;
revoke all on function public.book_certainty_session(date, int, text, text, text) from public, anon;
revoke all on function public.cancel_certainty_session(uuid) from public, anon;
revoke all on function public.certainty_set_calendar(uuid, text, text) from public, anon;
grant execute on function public.certainty_state(int) to authenticated;
grant execute on function public.book_certainty_session(date, int, text, text, text) to authenticated;
grant execute on function public.cancel_certainty_session(uuid) to authenticated;
grant execute on function public.certainty_set_calendar(uuid, text, text) to authenticated;
