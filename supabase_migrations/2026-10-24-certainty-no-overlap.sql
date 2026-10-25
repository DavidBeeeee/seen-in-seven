-- Certainty: David cannot be in two sessions at once (WBR-458, evening walk
-- 2026-10-24). Sessions last two hours and start on any hour from 10 to 22
-- Eastern, but book_certainty_session and the update path refused only an
-- identical start time (certainty_one_per_slot), so one member at 10:00 and
-- another at 11:00 both landed. This guard refuses any booked session that
-- overlaps another booked session, with the same SLOT_TAKEN the page already
-- explains. A transaction advisory lock serialises the check so two members
-- racing for neighbouring hours cannot both pass it. Read back before this
-- shipped: production held 1 booked session and 0 overlapping pairs.

create or replace function public.certainty_refuse_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from 'booked' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'booked'
     and new.starts_at = old.starts_at and new.ends_at = old.ends_at then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('certainty_sessions_slots'));
  if exists (
    select 1 from public.certainty_sessions s
    where s.status = 'booked' and s.id <> new.id
      and s.starts_at < new.ends_at and s.ends_at > new.starts_at
  ) then
    raise exception 'SLOT_TAKEN';
  end if;
  return new;
end;
$$;

revoke all on function public.certainty_refuse_overlap() from public, anon, authenticated;

drop trigger if exists certainty_refuse_overlap on public.certainty_sessions;
create trigger certainty_refuse_overlap
  before insert or update of starts_at, ends_at, status on public.certainty_sessions
  for each row execute function public.certainty_refuse_overlap();
