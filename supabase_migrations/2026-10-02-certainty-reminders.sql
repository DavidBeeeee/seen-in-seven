-- Certainty Sessions: scheduled reminders and confirmations.
-- WO-20261001-evening / WBR-098, the Momentum 300 FAIL cluster (Developer 14,
-- 84, 93). The booking engine holds a session and writes it to David's calendar,
-- but nothing reached the member or David before the session itself: a booked
-- hour could be forgotten with no notice on either side. This migration gives a
-- scheduled job the two things it needs — a way to find sessions that are due a
-- reminder, and an idempotent record of what has already been sent — and keeps
-- the same load-bearing rules the rest of Certainty follows.
--
-- Load-bearing rules honored:
--   * Every write stays RPC-only and SECURITY DEFINER; the table grants members
--     nothing direct, so a reminder cannot be forged or replayed from a browser.
--   * The reminder RPCs are callable only by service_role: the reminder runs
--     from a scheduled server job that holds no member session (auth.uid() is
--     null in cron), so unlike the booking RPCs these cannot resolve a member
--     from the token and must be driven by the service key instead.
--   * A reminder event carries no member content: only the lead window, the
--     channel, and the send outcomes. The member's own session details are sent
--     to the member in the reminder itself, never written to an event.
--   * Idempotency is a unique (session, window) row, so a job that runs every
--     few minutes sends each reminder exactly once and a re-run is a no-op.

-- ── 1. The sent-ledger: one row per (session, lead window) ───────────────────
-- The row is the idempotency key. It is claimed (inserted 'pending') before a
-- send is attempted and finalized with the outcome after, so a crash mid-send
-- leaves a stale 'pending' row that the due function re-offers after an hour
-- rather than a silently-lost reminder or a duplicate one.
create table if not exists public.certainty_reminders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.certainty_sessions(id) on delete cascade,
  lead_window text not null check (lead_window in ('24h', '1h')),
  channel text,
  member_outcome text not null default 'pending'
    check (member_outcome in ('pending', 'sent', 'held', 'failed')),
  operator_outcome text
    check (operator_outcome is null or operator_outcome in ('sent', 'held', 'failed')),
  claimed_at timestamptz not null default now(),
  finalized_at timestamptz
);

create unique index if not exists certainty_reminders_session_window
  on public.certainty_reminders (session_id, lead_window);

alter table public.certainty_reminders enable row level security;

-- A private operational table: members and the browser never touch it directly.
-- Writes are RPC-only (SECURITY DEFINER); reads happen through the admin path or
-- the service key. An explicit deny policy matches the other private tables.
revoke all on table public.certainty_reminders from anon, authenticated;
drop policy if exists certainty_reminders_no_direct on public.certainty_reminders;
create policy certainty_reminders_no_direct on public.certainty_reminders
  for all to anon, authenticated using (false) with check (false);

-- ── 2. The due list: which (session, window) reminders are owed right now ─────
-- Returns one row per session+window that is inside its lead window, has not yet
-- started, and has no finalized (or fresh pending) reminder. The member's own
-- session details ride along so the job can compose the message; none of it is
-- ever written to an event. A window is offered again only if an earlier claim
-- went stale ('pending' older than one hour), which means a crashed run.
--
-- Windows, with lower bounds so each fires once and the copy stays honest:
--   '24h' is owed from 24h out until the 1h window opens (starts_at - 1h).
--   '1h'  is owed from 1h out until the session starts.
-- A session booked fewer than 24h ahead therefore never gets a stale "tomorrow"
-- reminder; it simply gets the 1h one when its time comes.
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

-- ── 3. Claim one (session, window) before sending ────────────────────────────
-- Inserts a 'pending' row, or re-claims one left 'pending' for over an hour by a
-- crashed run. Returns true only to the caller that won the claim, so two
-- overlapping job runs never both send the same reminder.
create or replace function public.certainty_claim_reminder(
  p_session_id uuid,
  p_lead_window text,
  p_channel text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claimed boolean := false;
begin
  if p_lead_window is null or p_lead_window not in ('24h', '1h') then
    raise exception 'BAD_WINDOW';
  end if;

  insert into public.certainty_reminders (session_id, lead_window, channel, member_outcome)
  values (p_session_id, p_lead_window, p_channel, 'pending')
  on conflict (session_id, lead_window) do update
    set channel = excluded.channel,
        member_outcome = 'pending',
        operator_outcome = null,
        claimed_at = now(),
        finalized_at = null
    where public.certainty_reminders.member_outcome = 'pending'
      and public.certainty_reminders.claimed_at < now() - interval '1 hour'
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

-- ── 4. Finalize the outcome and record one event ─────────────────────────────
-- Writes the send outcomes onto the claimed row and records a single
-- certainty_reminder event, attributed to the member the reminder was for, so a
-- missed or failed reminder is diagnosable in the same log stream as every other
-- Certainty event. The event carries only the window, channel, and outcomes.
create or replace function public.certainty_finalize_reminder(
  p_session_id uuid,
  p_lead_window text,
  p_channel text,
  p_member_outcome text,
  p_operator_outcome text
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
  if p_member_outcome is null or p_member_outcome not in ('sent', 'held', 'failed') then
    raise exception 'BAD_OUTCOME';
  end if;

  update public.certainty_reminders r
    set member_outcome = p_member_outcome,
        operator_outcome = p_operator_outcome,
        channel = coalesce(p_channel, r.channel),
        finalized_at = now()
  where r.session_id = p_session_id and r.lead_window = p_lead_window;

  select s.user_id into v_user_id
  from public.certainty_sessions s
  where s.id = p_session_id;

  if v_user_id is not null then
    insert into public.logs (user_id, event_type, detail)
    values (
      v_user_id,
      'certainty_reminder',
      jsonb_build_object(
        'schema', 1,
        'leadWindow', p_lead_window,
        'channel', coalesce(p_channel, 'none'),
        'memberOutcome', p_member_outcome,
        'operatorOutcome', coalesce(p_operator_outcome, 'none')
      )
    );
  end if;
end;
$$;

revoke all on function public.certainty_due_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.certainty_claim_reminder(uuid, text, text) from public, anon, authenticated;
revoke all on function public.certainty_finalize_reminder(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.certainty_due_reminders(timestamptz) to service_role;
grant execute on function public.certainty_claim_reminder(uuid, text, text) to service_role;
grant execute on function public.certainty_finalize_reminder(uuid, text, text, text, text) to service_role;
