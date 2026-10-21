-- Certainty Sessions: server cluster hardening and observability.
-- WBR-435, late morning order WO-20261021-latemorning.
--
-- 1. Quota allowlist: adds 'certainty' and 'certainty-state' to consume_api_quota
--    so the 'state' action can be rate-limited using the existing api_usage pattern (Dev 99).
-- 2. Member data deletion: certainty_delete_member_data() hard-deletes the caller's
--    own past/cancelled sessions and clears remembered phone, admin-visible in public.logs (Dev 98).
-- 3. Topic cap alignment: book_certainty_session enforces 200-char topic cap (Dev 47).
-- 4. In-place booking update: update_certainty_session() lets a member change day,
--    hour, mode, phone, or topic on their upcoming session without cancelling (Stranger 45, 46, 49; UX 83).

-- ── 1. Quota allowlist for Certainty state action ───────────────────────────
create or replace function public.consume_api_quota(
  p_server_secret text,
  p_subject_key text,
  p_user_id uuid,
  p_ip_hash text,
  p_endpoint text,
  p_hourly_limit integer,
  p_ip_hourly_limit integer
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  subject_count integer;
  ip_count integer;
begin
  if encode(extensions.digest(convert_to(coalesce(p_server_secret, ''), 'UTF8'), 'sha256'), 'hex') <> 'd0c64a9a815c22d0cc92ef74b4d8b7f268508e3ad8b0adfae03c6bc29e6623f4'
     or p_subject_key is null
     or length(p_subject_key) > 120
     or p_ip_hash is null
     or length(p_ip_hash) <> 64
     or p_endpoint not in ('generate', 'prompt-test', 'storysculpt', 'navigator', 'storysculpt-research', 'certainty', 'certainty-state')
     or p_hourly_limit < 1
     or p_hourly_limit > 500
     or p_ip_hourly_limit < 1
     or p_ip_hourly_limit > 1500 then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext(p_subject_key || ':' || p_endpoint));
  perform pg_advisory_xact_lock(hashtext(p_ip_hash || ':' || p_endpoint));
  select count(*) into subject_count from public.api_usage where subject_key = p_subject_key and endpoint = p_endpoint and created_at >= now() - interval '1 hour';
  select count(*) into ip_count from public.api_usage where ip_hash = p_ip_hash and endpoint = p_endpoint and created_at >= now() - interval '1 hour';
  if subject_count >= p_hourly_limit or ip_count >= p_ip_hourly_limit then return false; end if;
  insert into public.api_usage (subject_key, user_id, ip_hash, endpoint) values (p_subject_key, p_user_id, p_ip_hash, p_endpoint);
  return true;
end;
$function$;

-- ── 2. Member data deletion RPC (Developer 98) ──────────────────────────────
create or replace function public.certainty_delete_member_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_deleted_count int;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED';
  end if;

  -- Hard delete only the caller's own past or cancelled sessions.
  delete from public.certainty_sessions
  where user_id = v_user_id and (ends_at <= now() or status = 'cancelled');
  get diagnostics v_deleted_count = row_count;

  -- Clear remembered phone from member settings.
  update public.certainty_member_settings
  set phone = null, updated_at = now()
  where user_id = v_user_id;

  -- Clear phone from any remaining upcoming sessions.
  update public.certainty_sessions
  set phone = null
  where user_id = v_user_id and status = 'booked';

  -- Record admin-visible audit event in public.logs.
  insert into public.logs (user_id, event_type, detail)
  values (
    v_user_id,
    'certainty_member_data_deleted',
    jsonb_build_object(
      'schema', 1,
      'deleted_past_sessions', v_deleted_count,
      'phone_cleared', true,
      'deleted_at', now()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'deleted_sessions', v_deleted_count,
    'phone_cleared', true
  );
end;
$$;

revoke all on function public.certainty_delete_member_data() from public, anon;
grant execute on function public.certainty_delete_member_data() to authenticated;

-- ── 3. Align topic cap in booking RPC (Developer 47) ────────────────────────
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
      and e.app_key in ('eee', 'certainty') and e.status = 'active'
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

  -- 200-character topic cap aligned to client input maxlength (Developer 47)
  if p_topic is not null and length(btrim(p_topic)) > 200 then
    raise exception 'TOPIC_TOO_LONG';
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
    case when p_topic is null then null else left(btrim(p_topic), 200) end,
    v_week
  )
  returning * into v_row;

  return to_jsonb(v_row);
exception
  when unique_violation then
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

revoke all on function public.book_certainty_session(date, int, text, text, text) from public, anon;
grant execute on function public.book_certainty_session(date, int, text, text, text) to authenticated;

-- ── 4. In-place booking update RPC (Stranger 45, 46, 49; UX 83) ────────────
create or replace function public.update_certainty_session(
  p_id uuid,
  p_local_date date default null,
  p_hour int default null,
  p_mode text default null,
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
  v_row public.certainty_sessions;
  v_starts timestamptz;
  v_ends timestamptz;
  v_week text;
  v_time_changed boolean := false;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED';
  end if;

  select * into v_row
  from public.certainty_sessions
  where id = p_id and user_id = v_user_id
  for update;

  if v_row.id is null then
    raise exception 'NOT_FOUND';
  end if;

  if v_row.status <> 'booked' then
    raise exception 'CANNOT_UPDATE_CANCELLED';
  end if;

  if v_row.ends_at <= now() then
    raise exception 'SESSION_ALREADY_ENDED';
  end if;

  if p_topic is not null and length(btrim(p_topic)) > 200 then
    raise exception 'TOPIC_TOO_LONG';
  end if;

  if p_local_date is not null or p_hour is not null then
    if p_local_date is null or p_hour is null then
      raise exception 'BOTH_DATE_AND_HOUR_REQUIRED';
    end if;
    if p_hour < 10 or p_hour > 22 then
      raise exception 'OUTSIDE_HOURS';
    end if;
    v_starts := (p_local_date::timestamp + make_interval(hours => p_hour)) at time zone 'America/New_York';
    v_ends := v_starts + interval '2 hours';
    v_week := to_char(v_starts at time zone 'America/New_York', 'IYYY-"W"IW');

    if v_starts <= now() then
      raise exception 'IN_PAST';
    end if;

    if exists (
      select 1 from public.certainty_sessions s
      where s.starts_at = v_starts and s.status = 'booked' and s.id <> p_id
    ) then
      raise exception 'SLOT_TAKEN';
    end if;

    if v_week <> v_row.iso_week and exists (
      select 1 from public.certainty_sessions s
      where s.user_id = v_user_id and s.iso_week = v_week and s.status = 'booked' and s.id <> p_id
    ) then
      raise exception 'ALREADY_BOOKED_THIS_WEEK';
    end if;

    v_time_changed := true;
  else
    v_starts := v_row.starts_at;
    v_ends := v_row.ends_at;
    v_week := v_row.iso_week;
  end if;

  if p_mode is not null then
    if p_mode not in ('zoom', 'phone') then
      raise exception 'BAD_MODE';
    end if;
    if p_mode = 'phone' and (coalesce(p_phone, v_row.phone) is null or length(btrim(coalesce(p_phone, v_row.phone))) < 7) then
      raise exception 'PHONE_REQUIRED';
    end if;
  end if;

  update public.certainty_sessions
  set starts_at = v_starts,
      ends_at = v_ends,
      iso_week = v_week,
      mode = coalesce(p_mode, mode),
      phone = case
        when coalesce(p_mode, mode) = 'phone' then
          case when p_phone is not null then left(btrim(p_phone), 40) else phone end
        else null
      end,
      topic = case
        when p_topic is not null then left(btrim(p_topic), 200)
        else topic
      end,
      calendar_status = case when v_time_changed then 'pending' else calendar_status end
  where id = p_id and user_id = v_user_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.update_certainty_session(uuid, date, int, text, text, text) from public, anon;
grant execute on function public.update_certainty_session(uuid, date, int, text, text, text) to authenticated;
