-- WBR-458: pressure only, never purchase/booking eligibility.
-- 10:00 first start, 22:00 last start, two-hour sessions end at midnight:
-- floor(14 hours / 2 hours) * 7 days = 49 weekly sessions.
create or replace function public.certainty_seat_totals()
returns jsonb language sql stable security definer set search_path = '' as $$
  with members as (
    -- Match book_certainty_session: bundled Hub grants also consume a seat.
    select count(distinct user_id)::int n,
      count(distinct user_id) filter (where app_key = 'certainty')::int direct_members
    from public.studio_entitlements
    where app_key in ('certainty','eee') and status = 'active'
      and (expires_at is null or expires_at > now())
  ), bookable_window as (select 10 first_hour, 22 last_hour, 2 duration_hours, 7 days)
  select jsonb_build_object('activeMembers', m.n, 'directCertaintyMembers', m.direct_members,
    'weeklyCapacity', ((w.last_hour + w.duration_hours - w.first_hour) / w.duration_hours) * w.days,
    'seatsLeft', greatest(0, ((w.last_hour + w.duration_hours - w.first_hour) / w.duration_hours) * w.days - m.n))
  from members m cross join bookable_window w;
$$;
revoke all on function public.certainty_seat_totals() from public, anon, authenticated;
grant execute on function public.certainty_seat_totals() to service_role;

create or replace function public.certainty_seat_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return public.certainty_seat_totals();
end; $$;
revoke all on function public.certainty_seat_status() from public, anon;
grant execute on function public.certainty_seat_status() to authenticated;

-- One durable milestone receipt per threshold. Claims and retries are atomic.
-- The same Resend idempotency key is reused; an ambiguous receipt older than
-- the provider's 24h retention is held for a human, never blindly resent.
create table if not exists public.certainty_seat_alerts (
  threshold int primary key check (threshold in (35,42,47)),
  first_claimed_at timestamptz not null default now(),
  claimed_at timestamptz not null default now(),
  outcome text not null default 'claimed' check (outcome in ('claimed','sent','failed')),
  members int not null, capacity int not null,
  provider_id text
);
alter table public.certainty_seat_alerts enable row level security;
revoke all on public.certainty_seat_alerts from public, anon, authenticated;
grant select, insert, update on public.certainty_seat_alerts to service_role;

create or replace function public.certainty_claim_seat_alerts()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb := public.certainty_seat_totals(); t int; claimed int; result jsonb := '[]'::jsonb;
begin
  foreach t in array array[35,42,47] loop
    if (v->>'activeMembers')::int >= t then
      insert into public.certainty_seat_alerts(threshold,members,capacity)
      values(t,(v->>'activeMembers')::int,(v->>'weeklyCapacity')::int)
      on conflict (threshold) do update set claimed_at = now(), outcome = 'claimed'
      where certainty_seat_alerts.outcome <> 'sent'
        and certainty_seat_alerts.claimed_at < now() - interval '5 minutes'
        and certainty_seat_alerts.first_claimed_at > now() - interval '23 hours'
      returning threshold into claimed;
      if found then result := result || jsonb_build_array(v || jsonb_build_object('threshold',claimed)); end if;
    end if;
  end loop;
  return result;
end; $$;
revoke all on function public.certainty_claim_seat_alerts() from public, anon, authenticated;
grant execute on function public.certainty_claim_seat_alerts() to service_role;

create or replace function public.certainty_finish_seat_alert(p_threshold int, p_outcome text, p_provider_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_outcome not in ('sent','failed') then raise exception 'BAD_OUTCOME'; end if;
  update public.certainty_seat_alerts set outcome=p_outcome, provider_id=p_provider_id
    where threshold=p_threshold and outcome <> 'sent';
end; $$;
revoke all on function public.certainty_finish_seat_alert(int,text,text) from public, anon, authenticated;
grant execute on function public.certainty_finish_seat_alert(int,text,text) to service_role;
