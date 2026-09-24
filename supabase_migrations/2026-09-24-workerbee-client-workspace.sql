-- WBR-393. The private Todo page now has a client workspace. Client plans,
-- notes, ordering, archive state and client-linked tasks belong in the same
-- private operating store as the Board, never in a browser-only Google Doc.

alter table public.workerbee_clients
  add column if not exists living_plan jsonb not null default '{}'::jsonb,
  add column if not exists display_order integer,
  add column if not exists archived_by text;

alter table public.workerbee_tasks
  add column if not exists client_key text references public.workerbee_clients(stable_key) on delete set null;

create index if not exists workerbee_tasks_client_key_idx
  on public.workerbee_tasks (client_key, status, created_at)
  where deleted_at is null;

create table if not exists public.workerbee_client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.workerbee_clients(id) on delete cascade,
  author text not null check (author in ('david', 'workerbee')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workerbee_client_notes_client_id_idx
  on public.workerbee_client_notes (client_id, created_at);

alter table public.workerbee_client_notes enable row level security;
revoke all on table public.workerbee_client_notes from anon, authenticated;
drop policy if exists workerbee_client_notes_deny_direct_access on public.workerbee_client_notes;
create policy workerbee_client_notes_deny_direct_access on public.workerbee_client_notes
  for all to anon, authenticated using (false) with check (false);

create or replace function public.workerbee_client_mutate(
  p_action text,
  p_payload jsonb,
  p_server_secret text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := case when (select auth.uid()) is null then 'workerbee' else 'david' end;
  v_client public.workerbee_clients%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_note_id uuid;
  v_now timestamptz := now();
begin
  if not public.workerbee_authorized(p_server_secret) then
    raise exception 'WorkerBee access denied' using errcode = '42501';
  end if;

  if p_action = 'update_client_plan' then
    select * into v_client from public.workerbee_clients where stable_key = btrim(p_payload->>'stable_key');
    if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;
    v_before := to_jsonb(v_client);
    update public.workerbee_clients
      set living_plan = coalesce(p_payload->'living_plan', '{}'::jsonb),
          updated_at = v_now
      where id = v_client.id
      returning to_jsonb(public.workerbee_clients.*) into v_after;

  elsif p_action = 'create_client_note' then
    select * into v_client from public.workerbee_clients where stable_key = btrim(p_payload->>'stable_key');
    if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;
    insert into public.workerbee_client_notes (client_id, author, body, acknowledged_at)
      values (v_client.id, v_actor, btrim(p_payload->>'body'), case when v_actor = 'workerbee' then v_now else null end)
      returning id, to_jsonb(public.workerbee_client_notes.*) into v_note_id, v_after;

  elsif p_action = 'acknowledge_client_note' then
    v_note_id := nullif(p_payload->>'id', '')::uuid;
    select to_jsonb(n) into v_before from public.workerbee_client_notes n where n.id = v_note_id;
    update public.workerbee_client_notes
      set acknowledged_at = coalesce(acknowledged_at, v_now), updated_at = v_now
      where id = v_note_id
      returning to_jsonb(public.workerbee_client_notes.*) into v_after;

  elsif p_action = 'set_client_archive' then
    select * into v_client from public.workerbee_clients where stable_key = btrim(p_payload->>'stable_key');
    if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;
    v_before := to_jsonb(v_client);
    update public.workerbee_clients
      set archived_at = case when coalesce((p_payload->>'archived')::boolean, false) then v_now else null end,
          archived_by = case when coalesce((p_payload->>'archived')::boolean, false) then v_actor else null end,
          updated_at = v_now
      where id = v_client.id
      returning to_jsonb(public.workerbee_clients.*) into v_after;

  elsif p_action = 'set_client_order' then
    select * into v_client from public.workerbee_clients where stable_key = btrim(p_payload->>'stable_key');
    if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;
    v_before := to_jsonb(v_client);
    update public.workerbee_clients
      set display_order = (p_payload->>'display_order')::integer, updated_at = v_now
      where id = v_client.id
      returning to_jsonb(public.workerbee_clients.*) into v_after;

  elsif p_action = 'link_task_client' then
    v_before := (select to_jsonb(t) from public.workerbee_tasks t where t.id = nullif(p_payload->>'task_id', '')::uuid);
    update public.workerbee_tasks
      set client_key = nullif(btrim(p_payload->>'client_key'), ''),
          -- A client link is more specific than the existing broad work-area
          -- grouping. Keep an intentional non-client work area intact, but
          -- give newly linked loose tasks their correct broad home as well.
          work_area = case
            when nullif(btrim(p_payload->>'client_key'), '') is not null
              and coalesce(nullif(btrim(work_area), ''), '') = '' then 'Clients and Coaching'
            else work_area
          end,
          updated_at = v_now
      where id = nullif(p_payload->>'task_id', '')::uuid
      returning to_jsonb(public.workerbee_tasks.*) into v_after;
  else
    raise exception 'Unknown WorkerBee client action' using errcode = '22023';
  end if;

  if v_after is null then raise exception 'WorkerBee client target not found' using errcode = 'P0002'; end if;
  insert into public.workerbee_change_history (entity_type, entity_id, action, actor, before_state, after_state)
    values ('client', coalesce((v_after->>'id'), v_note_id::text), p_action, v_actor, v_before, v_after);
  return v_after;
end;
$$;

revoke all on function public.workerbee_client_mutate(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.workerbee_client_mutate(text, jsonb, text) to anon, authenticated;

-- The page needs its archived group and its notes in the same private response.
-- The existing bootstrap is replaced as a whole because its JSON contract is
-- the sole private read boundary and a partial second read would drift.
create or replace function public.workerbee_bootstrap(p_server_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := (select auth.uid());
begin
  if not public.workerbee_authorized(p_server_secret) then raise exception 'WorkerBee access denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'sections', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order, s.created_at) from public.workerbee_sections s where s.archived_at is null), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.workerbee_task_notes n where n.task_id = t.id), '[]'::jsonb)) order by t.sort_order, t.created_at) from public.workerbee_tasks t where t.deleted_at is null), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(to_jsonb(u) || jsonb_build_object('notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.workerbee_task_notes n where n.update_id = u.id), '[]'::jsonb)) order by u.created_at desc) from (select * from public.workerbee_updates where status = 'active' union select * from public.workerbee_updates where status <> 'active' and coalesce(nullif(metadata->>'completed_at', '')::timestamptz, updated_at) >= now() - interval '90 days') u), '[]'::jsonb),
    'journal', coalesce((select jsonb_agg(to_jsonb(j) order by j.entry_date desc, j.created_at desc) from (select * from public.workerbee_journal order by entry_date desc, created_at desc limit 60) j), '[]'::jsonb),
    'clients', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.workerbee_client_notes n where n.client_id = c.id), '[]'::jsonb)) order by c.archived_at is not null, c.display_order nulls last, c.name) from public.workerbee_clients c), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.starts_at nulls last, e.title) from public.workerbee_events e where e.archived_at is null), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(p) order by case p.priority when 'high' then 0 when 'normal' then 1 else 2 end, p.name) from public.workerbee_products p where p.archived_at is null), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(to_jsonb(h) order by h.id desc) from (select * from public.workerbee_change_history order by id desc limit 100) h), '[]'::jsonb),
    'readState', (select to_jsonb(r) from public.workerbee_read_state r where r.viewer_id = v_user_id),
    'generatedAt', to_jsonb(now())
  );
end;
$$;

revoke all on function public.workerbee_bootstrap(text) from public, anon, authenticated;
grant execute on function public.workerbee_bootstrap(text) to anon, authenticated;
