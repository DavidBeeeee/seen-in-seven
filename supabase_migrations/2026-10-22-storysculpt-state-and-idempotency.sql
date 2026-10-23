-- StorySculpt state and idempotency (WBR-435 overflow, StorySculpt Developer 1,
-- 3, 4, 5, 6, 7, 9, 13, 15, 16, 18, 19, 20, 33, 34).
--
-- Until now a project was "finished" only because an output happened to exist,
-- a double send or a retried save could append the same turn twice, and a slow
-- save could land after a newer one and overwrite it. Three rules, all enforced
-- in the database so no client can skip them:
--
-- 1. status is explicit, with declared transitions. A write that does not set
--    status gets the one its content implies (an output means finished, the
--    filmed flag means filmed); any change is checked against the table below
--    and an undeclared one is refused with ILLEGAL_TRANSITION.
-- 2. version is owned by the trigger and counts content saves (conversation,
--    output, title). A writer names the version it read in expected_version;
--    if the row has moved on since, the write is refused with STALE_VERSION, so
--    an older save can never win. A writer that names nothing (intake-only
--    writes, older clients) is bumped automatically when it changes content.
--    (Applied in three steps on 2026-10-22, all before any client used it: the first draft read a claimed
--    version = current + 1, which a stale writer could satisfy by accident; the
--    probe caught it and expected_version replaced it; the probe also caught a
--    filmed project losing its script, now refused outright.)
-- 3. a conversation message carrying a "key" appears at most once. The first
--    copy is kept and later copies are dropped, so a repeated idempotency key
--    appends once however the turn arrives.

alter table public.storysculpt_projects
  add column if not exists status text not null default 'drafting',
  add column if not exists version integer not null default 1,
  add column if not exists expected_version integer;

update public.storysculpt_projects
set status = case
  when coalesce((intake->>'filmed')::boolean, false) and output is not null then 'filmed'
  when output is not null then 'finished'
  else 'drafting'
end
where status = 'drafting';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'storysculpt_projects_status_check') then
    alter table public.storysculpt_projects
      add constraint storysculpt_projects_status_check
      check (status in ('drafting', 'finished', 'filmed', 'archived'));
  end if;
end $$;

create table if not exists public.storysculpt_status_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);
alter table public.storysculpt_status_transitions enable row level security;
drop policy if exists storysculpt_status_transitions_read on public.storysculpt_status_transitions;
create policy storysculpt_status_transitions_read on public.storysculpt_status_transitions
  for select to authenticated using (true);

insert into public.storysculpt_status_transitions (from_status, to_status) values
  ('drafting', 'finished'),
  ('drafting', 'archived'),
  ('finished', 'drafting'),
  ('finished', 'filmed'),
  ('finished', 'archived'),
  ('filmed', 'finished'),
  ('filmed', 'archived'),
  ('archived', 'drafting'),
  ('archived', 'finished')
on conflict do nothing;

-- Keep the first message for each key; messages without a key are untouched.
create or replace function public.storysculpt_dedupe_conversation(p_conversation jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(m.value order by m.ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_conversation, '[]'::jsonb)) with ordinality as m(value, ord)
  where jsonb_typeof(m.value) <> 'object'
     or coalesce(m.value->>'key', '') = ''
     or m.ord = (
       select min(o.ord)
       from jsonb_array_elements(p_conversation) with ordinality as o(value, ord)
       where jsonb_typeof(o.value) = 'object' and o.value->>'key' = m.value->>'key'
     );
$$;

create or replace function public.storysculpt_guard_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_content_changed boolean;
  v_implied text;
begin
  if jsonb_typeof(new.conversation) = 'array' then
    new.conversation := public.storysculpt_dedupe_conversation(new.conversation);
  end if;

  if tg_op = 'INSERT' then
    new.version := 1;
    new.expected_version := null;
    new.status := case when new.output is not null then 'finished' else 'drafting' end;
    return new;
  end if;

  -- version is owned by this trigger. A writer that names the version it read
  -- (expected_version) is refused when the row has moved on since.
  if new.expected_version is not null and new.expected_version <> old.version then
    raise exception 'STALE_VERSION' using errcode = 'P0001',
      detail = 'current version ' || old.version || ', expected ' || new.expected_version;
  end if;

  v_content_changed := new.conversation is distinct from old.conversation
    or new.output is distinct from old.output
    or new.title is distinct from old.title;

  if new.expected_version is not null or v_content_changed then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  new.expected_version := null;

  -- Nothing can be filmed without a script: the filmed flag on a project with
  -- no output is refused however it arrives.
  if coalesce((new.intake->>'filmed')::boolean, false) and new.output is null then
    raise exception 'ILLEGAL_TRANSITION' using errcode = 'P0001',
      detail = 'filmed needs a finished script';
  end if;

  -- A write that leaves status alone gets the status its content implies.
  if new.status = old.status and old.status <> 'archived' then
    v_implied := case
      when coalesce((new.intake->>'filmed')::boolean, false) then 'filmed'
      when new.output is null then 'drafting'
      else 'finished'
    end;
    new.status := v_implied;
  end if;

  if new.status <> old.status and not exists (
    select 1 from public.storysculpt_status_transitions t
    where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception 'ILLEGAL_TRANSITION' using errcode = 'P0001',
      detail = old.status || ' to ' || new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists storysculpt_guard_project on public.storysculpt_projects;
create trigger storysculpt_guard_project
  before insert or update on public.storysculpt_projects
  for each row execute function public.storysculpt_guard_project();

-- Append one turn under an idempotency key. A key already in the conversation
-- returns the project unchanged. Runs as the caller, so the member RLS policy
-- still decides whose project it is.
create or replace function public.storysculpt_append_turn(
  p_id uuid,
  p_key text,
  p_message jsonb,
  p_expected_version integer default null
)
returns public.storysculpt_projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.storysculpt_projects;
begin
  if coalesce(p_key, '') !~ '^[A-Za-z0-9:_-]{8,80}$' then
    raise exception 'BAD_IDEMPOTENCY_KEY' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_message) <> 'object' then
    raise exception 'BAD_MESSAGE' using errcode = 'P0001';
  end if;

  select * into v_row from public.storysculpt_projects where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_row.conversation) m
    where jsonb_typeof(m) = 'object' and m->>'key' = p_key
  ) then
    return v_row;
  end if;

  update public.storysculpt_projects
  set conversation = conversation || jsonb_build_array(p_message || jsonb_build_object('key', p_key)),
      expected_version = p_expected_version,
      updated_at = now()
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.storysculpt_append_turn(uuid, text, jsonb, integer) from public, anon;
grant execute on function public.storysculpt_append_turn(uuid, text, jsonb, integer) to authenticated;
