-- Certainty Sessions: member safety on topic and member settings.
-- WBR-373, late morning order WO-20261015-latemorning (Momentum 300 UX 94, Dev 96, Stranger 30).
--
-- 1. Member settings: time zone (default browser's, slots in UTC / ET alongside),
--    remembered phone number, and default meeting mode (Zoom or phone).
--    Keyed by public.users.id, RLS own-row only, SECURITY DEFINER RPCs with
--    empty search_path, revoked from anon.
-- 2. Member safety: RPC to flag a booked session when crisis language is detected
--    in the topic. (The safety_flag and safety_flagged_at columns already exist
--    on certainty_sessions from 2026-10-10-certainty-reminder-safety.sql).

-- ── 1. Settings Table ────────────────────────────────────────────────────────
create table if not exists public.certainty_member_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  time_zone text not null default 'America/New_York',
  phone text,
  default_mode text not null default 'zoom' check (default_mode in ('zoom', 'phone')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.certainty_member_settings enable row level security;

drop policy if exists certainty_member_settings_own on public.certainty_member_settings;
create policy certainty_member_settings_own on public.certainty_member_settings
  for all to authenticated
  using (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())))
  with check (user_id in (select u.id from public.users u where u.auth_id = (select auth.uid())));

-- ── 2. Member Safety Flag RPC ────────────────────────────────────────────────
create or replace function public.certainty_flag_safety(p_id uuid)
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
    set safety_flag = true, safety_flagged_at = now()
  where s.id = p_id and s.user_id = v_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'NOT_FOUND';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.certainty_flag_safety(uuid) from public, anon;
grant execute on function public.certainty_flag_safety(uuid) to authenticated;

-- ── 3. Get Settings RPC ──────────────────────────────────────────────────────
create or replace function public.certainty_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_settings public.certainty_member_settings;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED';
  end if;

  select * into v_settings
  from public.certainty_member_settings
  where user_id = v_user_id;

  if v_settings.user_id is null then
    return jsonb_build_object(
      'time_zone', null,
      'phone', null,
      'default_mode', 'zoom'
    );
  end if;

  return jsonb_build_object(
    'time_zone', v_settings.time_zone,
    'phone', v_settings.phone,
    'default_mode', v_settings.default_mode,
    'updated_at', v_settings.updated_at
  );
end;
$$;

revoke all on function public.certainty_get_settings() from public, anon;
grant execute on function public.certainty_get_settings() to authenticated;

-- ── 4. Save Settings RPC ─────────────────────────────────────────────────────
create or replace function public.certainty_save_settings(
  p_time_zone text default null,
  p_phone text default null,
  p_default_mode text default 'zoom'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_mode text := coalesce(p_default_mode, 'zoom');
  v_tz text := nullif(btrim(p_time_zone), '');
  v_phone text := nullif(btrim(p_phone), '');
  v_row public.certainty_member_settings;
begin
  select u.id into v_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  if v_user_id is null then
    raise exception 'SIGN_IN_REQUIRED';
  end if;

  if v_mode not in ('zoom', 'phone') then
    raise exception 'BAD_MODE';
  end if;

  insert into public.certainty_member_settings (user_id, time_zone, phone, default_mode, updated_at)
  values (v_user_id, coalesce(v_tz, 'America/New_York'), v_phone, v_mode, now())
  on conflict (user_id) do update set
    time_zone = coalesce(excluded.time_zone, public.certainty_member_settings.time_zone),
    phone = excluded.phone,
    default_mode = excluded.default_mode,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'time_zone', v_row.time_zone,
    'phone', v_row.phone,
    'default_mode', v_row.default_mode,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.certainty_save_settings(text, text, text) from public, anon;
grant execute on function public.certainty_save_settings(text, text, text) to authenticated;
