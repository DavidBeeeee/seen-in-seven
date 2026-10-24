-- Certainty Sessions: history paging, a reminder-run heartbeat, and an hourly
-- tick so the 1h reminder window can actually land.
-- WO-20261023-evening / WBR-458 (Momentum 300 UX 71, 72; Developer 80, 84).
--
-- 1. certainty_state's history stops at 50 rows (and its historyCount counts
--    the capped page). certainty_state is left exactly as it is so the current
--    page keeps working; certainty_history pages the same rows by offset and
--    returns the true total.
-- 2. Every reminder run records a heartbeat row. The RPC that records it returns
--    the previous run's time in the same statement, so the job can tell that a
--    run was missed (more than 26 hours since the last one) and alert David.
-- 3. Vercel Hobby crons run at most once a day (vercel.json 0 12 * * *), so a
--    '1h' reminder could only land if a session happened to start between 12:00
--    and 13:00 UTC. pg_cron plus pg_net call the job hourly instead. The call is
--    authenticated by a single-use nonce minted inside the database and
--    consumed by the job with the service key, so no shared secret is copied
--    out of Vercel into the database, and only the database (or service_role)
--    can mint a tick.
--
-- Load-bearing rules honored: member reads resolve the member from auth.uid();
-- operational tables are RPC-only with an explicit deny policy; the heartbeat
-- carries counts only, never member content.

-- ── 1. Paged member history ──────────────────────────────────────────────────
create or replace function public.certainty_history(p_offset integer default 0, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_history jsonb;
  v_total int;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  if v_user_id is null then
    return jsonb_build_object('signedIn', false);
  end if;

  select count(*)::int into v_total
  from public.certainty_sessions s
  where s.user_id = v_user_id and s.status = 'booked' and s.ends_at <= now()
    and s.outcome is distinct from 'no_show';

  -- Same columns, filter and order as certainty_state's history, so page one
  -- here is row-for-row the history the state read already returns.
  select coalesce(jsonb_agg(to_jsonb(h) order by h.starts_at desc, h.id desc), '[]'::jsonb)
    into v_history
  from (
    select s.id, s.starts_at, s.ends_at, s.mode, s.topic, s.outcome,
      to_char(s.starts_at at time zone 'America/New_York', 'FMDay, FMMonth FMDD, YYYY') as label_day,
      to_char(s.starts_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_start,
      to_char(s.ends_at at time zone 'America/New_York', 'FMHH12:MI AM') as label_end
    from public.certainty_sessions s
    where s.user_id = v_user_id and s.status = 'booked' and s.ends_at <= now()
      and s.outcome is distinct from 'no_show'
    order by s.starts_at desc, s.id desc
    offset v_offset
    limit v_limit
  ) h;

  return jsonb_build_object(
    'signedIn', true,
    'history', v_history,
    'total', v_total,
    'offset', v_offset,
    'limit', v_limit,
    'nextOffset', case when v_offset + v_limit < v_total then v_offset + v_limit else null end,
    'hasMore', v_offset + v_limit < v_total
  );
end;
$$;

revoke all on function public.certainty_history(integer, integer) from public, anon;
grant execute on function public.certainty_history(integer, integer) to authenticated;

-- ── 2. Reminder-run heartbeat ────────────────────────────────────────────────
create table if not exists public.certainty_reminder_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  trigger text not null check (trigger in ('vercel-cron', 'hourly-tick', 'manual')),
  previous_ran_at timestamptz,
  gap_hours numeric,
  missed boolean not null default false,
  alert_outcome text check (alert_outcome is null or alert_outcome in ('sent', 'held', 'failed')),
  detail jsonb not null default '{}'::jsonb
);

create index if not exists certainty_reminder_runs_ran_at on public.certainty_reminder_runs (ran_at desc);

alter table public.certainty_reminder_runs enable row level security;
revoke all on table public.certainty_reminder_runs from anon, authenticated;
drop policy if exists certainty_reminder_runs_no_direct on public.certainty_reminder_runs;
create policy certainty_reminder_runs_no_direct on public.certainty_reminder_runs
  for all to anon, authenticated using (false) with check (false);

-- Records this run and returns it with the previous run's time and the gap,
-- plus the last hourly tick, so the daily run can tell that pg_cron stopped
-- even though its own daily heartbeat keeps the overall gap under 26 hours.
-- p_missed_after_hours is the alert threshold (26 by default: a daily job that
-- slipped by more than two hours, or any hourly gap past a full day).
create or replace function public.certainty_record_reminder_run(
  p_trigger text,
  p_detail jsonb default '{}'::jsonb,
  p_missed_after_hours numeric default 26
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous timestamptz;
  v_previous_hourly timestamptz;
  v_gap numeric;
  v_missed boolean;
  v_id uuid;
begin
  if p_trigger is null or p_trigger not in ('vercel-cron', 'hourly-tick', 'manual') then
    raise exception 'BAD_TRIGGER';
  end if;

  perform pg_advisory_xact_lock(hashtext('certainty_reminder_runs'));

  select r.ran_at into v_previous
  from public.certainty_reminder_runs r
  order by r.ran_at desc
  limit 1;

  select max(r.ran_at) into v_previous_hourly
  from public.certainty_reminder_runs r
  where r.trigger = 'hourly-tick';

  v_gap := case when v_previous is null then null
    else round((extract(epoch from (now() - v_previous)) / 3600.0)::numeric, 2) end;
  v_missed := v_gap is not null and v_gap > coalesce(p_missed_after_hours, 26);

  insert into public.certainty_reminder_runs (trigger, previous_ran_at, gap_hours, missed, detail)
  values (p_trigger, v_previous, v_gap, v_missed, coalesce(p_detail, '{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'previousRanAt', v_previous,
    'previousHourlyAt', v_previous_hourly,
    'gapHours', v_gap,
    'missed', v_missed,
    'thresholdHours', coalesce(p_missed_after_hours, 26)
  );
end;
$$;

-- Fills in the run's counts and alert outcome once the job has finished.
create or replace function public.certainty_finish_reminder_run(p_id uuid, p_detail jsonb, p_alert_outcome text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.certainty_reminder_runs
     set detail = detail || coalesce(p_detail, '{}'::jsonb),
         alert_outcome = coalesce(p_alert_outcome, alert_outcome)
   where id = p_id;
end;
$$;

-- For a check or the admin path: the last heartbeat and whether it is overdue
-- right now, independently of any run happening.
create or replace function public.certainty_reminder_heartbeat(p_missed_after_hours numeric default 26)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lastRanAt', max(r.ran_at),
    'hoursSince', round((extract(epoch from (now() - max(r.ran_at))) / 3600.0)::numeric, 2),
    'overdue', coalesce(max(r.ran_at) < now() - make_interval(secs => (coalesce(p_missed_after_hours, 26) * 3600)::double precision), true),
    'runsLast24h', count(*) filter (where r.ran_at >= now() - interval '24 hours')
  )
  from public.certainty_reminder_runs r;
$$;

revoke all on function public.certainty_record_reminder_run(text, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.certainty_finish_reminder_run(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.certainty_reminder_heartbeat(numeric) from public, anon, authenticated;
grant execute on function public.certainty_record_reminder_run(text, jsonb, numeric) to service_role;
grant execute on function public.certainty_finish_reminder_run(uuid, jsonb, text) to service_role;
grant execute on function public.certainty_reminder_heartbeat(numeric) to service_role;

-- ── 3. Hourly tick: single-use nonces minted by the database ─────────────────
create table if not exists public.certainty_reminder_ticks (
  nonce uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table public.certainty_reminder_ticks enable row level security;
revoke all on table public.certainty_reminder_ticks from anon, authenticated;
drop policy if exists certainty_reminder_ticks_no_direct on public.certainty_reminder_ticks;
create policy certainty_reminder_ticks_no_direct on public.certainty_reminder_ticks
  for all to anon, authenticated using (false) with check (false);

create or replace function public.certainty_mint_tick()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nonce uuid;
begin
  delete from public.certainty_reminder_ticks where created_at < now() - interval '2 days';
  insert into public.certainty_reminder_ticks default values returning nonce into v_nonce;
  return v_nonce;
end;
$$;

-- True exactly once per nonce, and only within ten minutes of minting.
create or replace function public.certainty_consume_tick(p_nonce uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean := false;
begin
  update public.certainty_reminder_ticks
     set consumed_at = now()
   where nonce = p_nonce
     and consumed_at is null
     and created_at >= now() - interval '10 minutes'
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.certainty_mint_tick() from public, anon, authenticated;
revoke all on function public.certainty_consume_tick(uuid) from public, anon, authenticated;
grant execute on function public.certainty_consume_tick(uuid) to service_role;
-- certainty_mint_tick stays with its owner (postgres), which is who pg_cron runs as.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Five past each hour: a session on the hour gets its '1h' reminder about 55
-- minutes ahead, and never at :59:59 of the window before.
select cron.unschedule(jobid) from cron.job where jobname = 'certainty-reminders-hourly';
select cron.schedule(
  'certainty-reminders-hourly',
  '5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://seen-in-seven.vercel.app/api/certainty-reminders?trigger=hourly-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-certainty-tick', public.certainty_mint_tick()::text
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
