-- Certainty Sessions: the reminder job stands down for a safety-flagged session.
-- WBR-373, evening order WO-20261010-evening (Momentum 300 Developer 96).
--
-- The booking side (api/certainty.js) flags a session whose free-text topic
-- reads as a crisis. This migration is the job side: a flagged session gets no
-- automated member reminder, David still sees it in his upcoming list, and the
-- skip is recorded as a held reminder with reason 'safety-flag' so it is visible
-- rather than silently dropped. David's admin view returns flagged sessions first.
--
-- The two safety columns are added here with `if not exists` because the reminder
-- job and admin view must honour the flag whether or not the booking-side
-- migration has landed yet. They are additive and nullable-safe; the booking
-- side owns when they are set.
--
-- Load-bearing rules honored: every function SECURITY DEFINER with an empty
-- search_path; reminder RPCs stay service_role only; the admin RPC keeps its
-- is_admin gate and empty shape for non-admins; no event carries topic text.

-- ── 1. The flag, on the session ──────────────────────────────────────────────
alter table public.certainty_sessions
  add column if not exists safety_flag boolean not null default false,
  add column if not exists safety_flagged_at timestamptz;

-- ── 2. Why a reminder was held ───────────────────────────────────────────────
-- null for an ordinary send or channel hold; 'safety-flag' when the job stood
-- down on purpose. Kept as text with a check so a new reason is a migration.
alter table public.certainty_reminders
  add column if not exists hold_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'certainty_reminders_hold_reason_check'
  ) then
    alter table public.certainty_reminders
      add constraint certainty_reminders_hold_reason_check
      check (hold_reason is null or hold_reason in ('safety-flag'));
  end if;
end;
$$;

-- ── 3. The due list now carries the flag ─────────────────────────────────────
-- Identical to the 2026-10-02 function except that each candidate includes
-- safety_flag, so the job can decide before it sends anything.
create or replace function public.certainty_due_reminders(p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_due jsonb;
begin
  with windows as (
    select * from (values ('24h'), ('1h')) as w(lead_window)
  ),
  candidates as (
    select
      s.id as session_id,
      s.user_id,
      s.member_email,
      s.member_name,
      s.starts_at,
      s.ends_at,
      s.mode,
      s.phone,
      s.topic,
      coalesce(s.safety_flag, false) as safety_flag,
      w.lead_window,
      to_char(s.starts_at at time zone 'America/New_York', 'FMDay, FMMonth FMDD') as label_day,
      to_char(s.starts_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_start,
      to_char(s.ends_at   at time zone 'America/New_York', 'FMHH12:MI AM') as label_end,
      round(extract(epoch from (s.starts_at - p_now)) / 60.0)::int as minutes_until
    from public.certainty_sessions s
    cross join windows w
    where s.status = 'booked'
      and s.starts_at > p_now
      and (
        (w.lead_window = '24h'
          and p_now >= s.starts_at - interval '24 hours'
          and p_now <  s.starts_at - interval '1 hour')
        or
        (w.lead_window = '1h'
          and p_now >= s.starts_at - interval '1 hour'
          and p_now <  s.starts_at)
      )
      and not exists (
        select 1 from public.certainty_reminders r
        where r.session_id = s.id
          and r.lead_window = w.lead_window
          and (r.member_outcome <> 'pending' or r.claimed_at >= p_now - interval '1 hour')
      )
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.starts_at asc, c.lead_window asc), '[]'::jsonb)
    into v_due
  from candidates c;

  return v_due;
end;
$$;

-- ── 4. Finalize, now with a hold reason ──────────────────────────────────────
-- Replaces the five-argument version. A 'safety-flag' reason is only accepted
-- with a 'held' member outcome, and the database refuses to record a 'sent'
-- member outcome for a flagged session, so a job bug cannot quietly log a send
-- to someone the booking side flagged.
drop function if exists public.certainty_finalize_reminder(uuid, text, text, text, text);

create or replace function public.certainty_finalize_reminder(
  p_session_id uuid,
  p_lead_window text,
  p_channel text,
  p_member_outcome text,
  p_operator_outcome text,
  p_hold_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_flagged boolean;
begin
  if p_member_outcome is null or p_member_outcome not in ('sent', 'held', 'failed') then
    raise exception 'BAD_OUTCOME';
  end if;
  if p_hold_reason is not null and (p_hold_reason <> 'safety-flag' or p_member_outcome <> 'held') then
    raise exception 'BAD_HOLD_REASON';
  end if;

  select s.user_id, coalesce(s.safety_flag, false) into v_user_id, v_flagged
  from public.certainty_sessions s
  where s.id = p_session_id;

  if v_flagged and p_member_outcome = 'sent' then
    raise exception 'SAFETY_FLAGGED_SESSION_SEND';
  end if;

  update public.certainty_reminders r
    set member_outcome = p_member_outcome,
        operator_outcome = p_operator_outcome,
        channel = coalesce(p_channel, r.channel),
        hold_reason = p_hold_reason,
        finalized_at = now()
  where r.session_id = p_session_id and r.lead_window = p_lead_window;

  if v_user_id is not null then
    insert into public.logs (user_id, event_type, detail)
    values (
      v_user_id,
      'certainty_reminder',
      jsonb_build_object(
        'schema', 2,
        'leadWindow', p_lead_window,
        'channel', coalesce(p_channel, 'none'),
        'memberOutcome', p_member_outcome,
        'operatorOutcome', coalesce(p_operator_outcome, 'none'),
        'holdReason', coalesce(p_hold_reason, 'none')
      )
    );
  end if;
end;
$$;

revoke all on function public.certainty_due_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.certainty_finalize_reminder(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.certainty_due_reminders(timestamptz) to service_role;
grant execute on function public.certainty_finalize_reminder(uuid, text, text, text, text, text) to service_role;

-- ── 5. David's view: flagged sessions first ──────────────────────────────────
-- Same shape and is_admin gate as before. Adds safety_flag and
-- safety_flagged_at to each row, a `flagged` count, and orders upcoming so every
-- flagged session comes before the rest.
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
begin
  select coalesce(u.is_admin, false) into v_is_admin
  from public.users u
  where u.auth_id = (select auth.uid());

  if not coalesce(v_is_admin, false) then
    return jsonb_build_object(
      'isAdmin', false, 'upcoming', '[]'::jsonb, 'past', '[]'::jsonb,
      'counts', jsonb_build_object('upcoming', 0, 'past', 0, 'cancelled', 0, 'flagged', 0)
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

  select coalesce(jsonb_agg(to_jsonb(p) order by p.starts_at desc), '[]'::jsonb), count(*)::int
    into v_past, v_past_count
  from (
    select s.id, s.member_name, s.member_email, s.starts_at, s.ends_at, s.mode,
      s.phone, s.topic, s.status, s.calendar_status, s.calendar_event_id, s.created_at, s.cancelled_at,
      coalesce(s.safety_flag, false) as safety_flag, s.safety_flagged_at,
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
      'cancelled', v_cancelled_count,
      'flagged', v_flagged_count
    )
  );
end;
$$;

revoke all on function public.admin_get_certainty_sessions() from public, anon;
grant execute on function public.admin_get_certainty_sessions() to authenticated;
