-- WBR-459: Next Step Navigator roadmap integrity, lifecycle trail and erasure.
-- The database owns state and version checks so an older screen cannot win.
-- RPCs resolve the caller from auth.uid(); member text never enters the trail.

alter table public.navigator_roadmaps
  add column if not exists status text not null default 'in_progress',
  add column if not exists version integer not null default 1,
  add column if not exists expected_version integer;

update public.navigator_roadmaps
set status = case when is_current then 'in_progress' else 'archived' end,
    archived_at = case when is_current then archived_at else coalesce(archived_at, updated_at) end;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'navigator_roadmaps_status_check') then
    alter table public.navigator_roadmaps add constraint navigator_roadmaps_status_check
      check (status in ('in_progress', 'complete', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'navigator_roadmaps_current_status_check') then
    alter table public.navigator_roadmaps add constraint navigator_roadmaps_current_status_check
      check ((status = 'archived' and not is_current) or (status <> 'archived' and is_current));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'navigator_roadmaps_profile_shape_check') then
    alter table public.navigator_roadmaps add constraint navigator_roadmaps_profile_shape_check
      check (
        jsonb_typeof(profile) = 'object'
        and (not profile ? 'name' or jsonb_typeof(profile->'name') = 'string')
        and (not profile ? 'niche' or jsonb_typeof(profile->'niche') = 'string')
        and (not profile ? 'answers' or jsonb_typeof(profile->'answers') = 'object')
        and (not profile ? 'progress' or jsonb_typeof(profile->'progress') = 'object')
        and (not profile ? 'todos' or jsonb_typeof(profile->'todos') = 'array')
        and (not profile ? 'assets' or jsonb_typeof(profile->'assets') = 'object')
      );
  end if;
end $$;

create table if not exists public.navigator_roadmap_status_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);
alter table public.navigator_roadmap_status_transitions enable row level security;
revoke all on public.navigator_roadmap_status_transitions from anon;
grant select on public.navigator_roadmap_status_transitions to authenticated;
drop policy if exists navigator_roadmap_status_transitions_read on public.navigator_roadmap_status_transitions;
create policy navigator_roadmap_status_transitions_read on public.navigator_roadmap_status_transitions
  for select to authenticated using (true);
insert into public.navigator_roadmap_status_transitions (from_status, to_status) values
  ('in_progress', 'complete'),
  ('complete', 'in_progress'),
  ('in_progress', 'archived'),
  ('complete', 'archived')
on conflict do nothing;

-- One receipt per logical save. Retrying a key returns the saved row without
-- changing its content, version or trail, even when the retry arrives late.
create table if not exists public.navigator_roadmap_save_receipts (
  user_id uuid not null references public.users(id) on delete cascade,
  idempotency_key uuid not null,
  roadmap_id uuid not null references public.navigator_roadmaps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);
alter table public.navigator_roadmap_save_receipts enable row level security;
revoke all on public.navigator_roadmap_save_receipts from public, anon, authenticated;

create or replace function public.navigator_guard_roadmap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.expected_version := null;
    if new.status = 'archived' then
      new.is_current := false;
      new.archived_at := coalesce(new.archived_at, now());
    else
      new.is_current := true;
      new.archived_at := null;
    end if;
    return new;
  end if;

  if new.expected_version is not null and new.expected_version <> old.version then
    raise exception 'STALE_VERSION' using errcode = 'P0001',
      detail = 'current version ' || old.version || ', expected ' || new.expected_version;
  end if;

  -- Compatibility with the pre-status Start Fresh write: not current means archived.
  if not new.is_current and new.status <> 'archived' then new.status := 'archived'; end if;
  if new.status = 'archived' then
    new.is_current := false;
    new.archived_at := coalesce(new.archived_at, now());
  else
    new.is_current := true;
    new.archived_at := null;
  end if;

  if new.status <> old.status and not exists (
    select 1 from public.navigator_roadmap_status_transitions t
    where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception 'ILLEGAL_TRANSITION' using errcode = 'P0001',
      detail = old.status || ' to ' || new.status;
  end if;

  v_changed := new.profile is distinct from old.profile
    or new.status is distinct from old.status
    or new.is_current is distinct from old.is_current;
  new.version := case when new.expected_version is not null or v_changed then old.version + 1 else old.version end;
  new.expected_version := null;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists navigator_guard_roadmap on public.navigator_roadmaps;
create trigger navigator_guard_roadmap
  before insert or update on public.navigator_roadmaps
  for each row execute function public.navigator_guard_roadmap();

create or replace function public.navigator_log_roadmap_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.logs (user_id, event_type, detail)
    values (new.user_id, 'navigator_roadmap_lifecycle', jsonb_build_object(
      'schema', 1, 'side', 'server', 'roadmapId', new.id,
      'from', old.status, 'to', new.status, 'version', new.version));
  end if;
  return null;
end;
$$;
revoke all on function public.navigator_log_roadmap_lifecycle() from public, anon, authenticated;
drop trigger if exists navigator_log_roadmap_lifecycle on public.navigator_roadmaps;
create trigger navigator_log_roadmap_lifecycle
  after update of status on public.navigator_roadmaps
  for each row execute function public.navigator_log_roadmap_lifecycle();

alter table public.navigator_moves
  add column if not exists completion_idempotency_key uuid;
create unique index if not exists navigator_moves_completion_key_idx
  on public.navigator_moves (user_id, completion_idempotency_key)
  where completion_idempotency_key is not null;

create or replace function public.navigator_log_move_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.logs (user_id, event_type, detail)
    values (new.user_id, 'navigator_move_lifecycle', jsonb_build_object(
      'schema', 1, 'side', 'server', 'moveId', new.id,
      'from', old.status, 'to', new.status));
  end if;
  return null;
end;
$$;
revoke all on function public.navigator_log_move_lifecycle() from public, anon, authenticated;
drop trigger if exists navigator_log_move_lifecycle on public.navigator_moves;
create trigger navigator_log_move_lifecycle
  after update of status on public.navigator_moves
  for each row execute function public.navigator_log_move_lifecycle();

create or replace function public.save_navigator_roadmap(
  p_profile jsonb,
  p_profile_updated_at timestamptz,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_status text
)
returns public.navigator_roadmaps
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_row public.navigator_roadmaps;
begin
  select id into v_user_id from public.users where auth_id = (select auth.uid());
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.studio_entitlements e
    where e.user_id = v_user_id and e.app_key = 'eee' and e.status = 'active'
  ) then raise exception 'ACCESS_DENIED' using errcode = 'P0001'; end if;
  if p_idempotency_key is null then raise exception 'BAD_IDEMPOTENCY_KEY' using errcode = 'P0001'; end if;

  -- Serialize a member's logical saves before the receipt check. Without this,
  -- two simultaneous first copies could both pass the check before either commits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 459));

  select r.* into v_row
  from public.navigator_roadmap_save_receipts s
  join public.navigator_roadmaps r on r.id = s.roadmap_id
  where s.user_id = v_user_id and s.idempotency_key = p_idempotency_key;
  if found then return v_row; end if;

  select * into v_row from public.navigator_roadmaps
  where user_id = v_user_id and is_current for update;
  if found then
    update public.navigator_roadmaps
    set profile = p_profile,
        profile_updated_at = p_profile_updated_at,
        expected_version = p_expected_version,
        status = p_status,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;
  else
    insert into public.navigator_roadmaps (
      user_id, profile, profile_updated_at, status, is_current
    ) values (
      v_user_id, p_profile, p_profile_updated_at, p_status, true
    ) returning * into v_row;
  end if;

  insert into public.navigator_roadmap_save_receipts (user_id, idempotency_key, roadmap_id)
  values (v_user_id, p_idempotency_key, v_row.id);
  return v_row;
end;
$$;
revoke all on function public.save_navigator_roadmap(jsonb, timestamptz, integer, uuid, text) from public, anon;
grant execute on function public.save_navigator_roadmap(jsonb, timestamptz, integer, uuid, text) to authenticated;

create or replace function public.complete_navigator_move(p_move_id uuid, p_idempotency_key uuid)
returns public.navigator_moves
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_row public.navigator_moves;
begin
  select id into v_user_id from public.users where auth_id = (select auth.uid());
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  if p_idempotency_key is null then raise exception 'BAD_IDEMPOTENCY_KEY' using errcode = 'P0001'; end if;

  select * into v_row from public.navigator_moves
  where id = p_move_id and user_id = v_user_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  -- Completion is naturally idempotent; the key also makes the retry contract explicit.
  if v_row.status = 'completed' then return v_row; end if;

  update public.navigator_moves
  set status = 'completed', completed_at = now(), updated_at = now(),
      completion_idempotency_key = p_idempotency_key
  where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.complete_navigator_move(uuid, uuid) from public, anon;
grant execute on function public.complete_navigator_move(uuid, uuid) to authenticated;

create or replace function public.erase_navigator_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_roadmaps integer;
  v_moves integer;
  v_states integer;
begin
  select id into v_user_id from public.users where auth_id = (select auth.uid());
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;

  delete from public.navigator_roadmaps where user_id = v_user_id;
  get diagnostics v_roadmaps = row_count;
  delete from public.navigator_moves where user_id = v_user_id;
  get diagnostics v_moves = row_count;
  delete from public.navigator_states where user_id = v_user_id;
  get diagnostics v_states = row_count;
  return jsonb_build_object('roadmaps', v_roadmaps, 'moves', v_moves, 'states', v_states);
end;
$$;
revoke all on function public.erase_navigator_data() from public, anon;
grant execute on function public.erase_navigator_data() to authenticated;
