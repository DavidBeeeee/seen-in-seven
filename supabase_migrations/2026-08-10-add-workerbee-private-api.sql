-- Narrow provider-neutral API for the private WorkerBee tables.
-- The browser path is authorized by David's Supabase admin session.
-- The bridge path is authorized by a server-only secret whose SHA-256 digest is stored here.

create table if not exists public.workerbee_config (
  id integer primary key check (id = 1),
  bridge_secret_sha256 text not null check (bridge_secret_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

alter table public.workerbee_config enable row level security;
revoke all on table public.workerbee_config from anon, authenticated;
grant select, insert, update on table public.workerbee_config to service_role;
drop policy if exists workerbee_config_deny_direct_access on public.workerbee_config;
create policy workerbee_config_deny_direct_access on public.workerbee_config for all to anon, authenticated using (false) with check (false);

insert into public.workerbee_config (id, bridge_secret_sha256)
values (1, 'ace4a57a563fc0be61bd5a4648a3badef393c7d507eb15a7b65cfb3673866b1b')
on conflict (id) do update set bridge_secret_sha256 = excluded.bridge_secret_sha256, updated_at = now();

create or replace function public.workerbee_authorized(p_server_secret text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.users u
      where u.auth_id = (select auth.uid())
        and u.is_admin is true
    )
    or exists (
      select 1
      from public.workerbee_config c
      where c.id = 1
        and c.bridge_secret_sha256 = encode(extensions.digest(coalesce(p_server_secret, ''), 'sha256'), 'hex')
    );
$$;

create or replace function public.workerbee_bootstrap(p_server_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if not public.workerbee_authorized(p_server_secret) then
    raise exception 'WorkerBee access denied' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'sections', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order, s.created_at) from public.workerbee_sections s where s.archived_at is null), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order, t.created_at) from public.workerbee_tasks t where t.deleted_at is null), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(to_jsonb(u) order by u.created_at desc) from (select * from public.workerbee_updates order by created_at desc limit 100) u), '[]'::jsonb),
    'journal', coalesce((select jsonb_agg(to_jsonb(j) order by j.entry_date desc, j.created_at desc) from (select * from public.workerbee_journal order by entry_date desc, created_at desc limit 60) j), '[]'::jsonb),
    'readState', (select to_jsonb(r) from public.workerbee_read_state r where r.viewer_id = v_user_id),
    'generatedAt', to_jsonb(now())
  );
end;
$$;

create or replace function public.workerbee_mutate(p_action text, p_payload jsonb, p_server_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := case when (select auth.uid()) is null then 'workerbee' else 'david' end;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := now();
begin
  if not public.workerbee_authorized(p_server_secret) then
    raise exception 'WorkerBee access denied' using errcode = '42501';
  end if;

  if p_action = 'create_section' then
    insert into public.workerbee_sections (title, sort_order)
    values (btrim(p_payload->>'title'), coalesce((p_payload->>'sort_order')::integer, 0))
    returning id, to_jsonb(public.workerbee_sections.*) into v_id, v_after;

  elsif p_action = 'update_section' then
    v_id := (p_payload->>'id')::uuid;
    select to_jsonb(s) into v_before from public.workerbee_sections s where s.id = v_id;
    update public.workerbee_sections s set
      title = case when p_payload ? 'title' then btrim(p_payload->>'title') else s.title end,
      sort_order = case when p_payload ? 'sort_order' then (p_payload->>'sort_order')::integer else s.sort_order end,
      archived_at = case when p_payload ? 'archived_at' then nullif(p_payload->>'archived_at', '')::timestamptz else s.archived_at end,
      updated_at = v_now
    where s.id = v_id returning to_jsonb(s.*) into v_after;

  elsif p_action = 'create_task' then
    insert into public.workerbee_tasks (section_id, title, sort_order, owner, due_date, follow_up_date, work_area, source_url)
    values (
      (p_payload->>'section_id')::uuid,
      btrim(p_payload->>'title'),
      coalesce((p_payload->>'sort_order')::integer, 0),
      nullif(btrim(p_payload->>'owner'), ''),
      nullif(p_payload->>'due_date', '')::date,
      nullif(p_payload->>'follow_up_date', '')::date,
      nullif(btrim(p_payload->>'work_area'), ''),
      nullif(btrim(p_payload->>'source_url'), '')
    ) returning id, to_jsonb(public.workerbee_tasks.*) into v_id, v_after;

  elsif p_action in ('update_task', 'delete_task', 'restore_task') then
    v_id := (p_payload->>'id')::uuid;
    select to_jsonb(t) into v_before from public.workerbee_tasks t where t.id = v_id;
    update public.workerbee_tasks t set
      title = case when p_payload ? 'title' then btrim(p_payload->>'title') else t.title end,
      section_id = case when p_payload ? 'section_id' then (p_payload->>'section_id')::uuid else t.section_id end,
      sort_order = case when p_payload ? 'sort_order' then (p_payload->>'sort_order')::integer else t.sort_order end,
      status = case when p_payload ? 'status' then p_payload->>'status' else t.status end,
      owner = case when p_payload ? 'owner' then nullif(btrim(p_payload->>'owner'), '') else t.owner end,
      due_date = case when p_payload ? 'due_date' then nullif(p_payload->>'due_date', '')::date else t.due_date end,
      follow_up_date = case when p_payload ? 'follow_up_date' then nullif(p_payload->>'follow_up_date', '')::date else t.follow_up_date end,
      work_area = case when p_payload ? 'work_area' then nullif(btrim(p_payload->>'work_area'), '') else t.work_area end,
      source_url = case when p_payload ? 'source_url' then nullif(btrim(p_payload->>'source_url'), '') else t.source_url end,
      completed_at = case
        when p_payload->>'status' = 'done' and t.completed_at is null then v_now
        when p_payload ? 'status' and p_payload->>'status' <> 'done' then null
        else t.completed_at
      end,
      deleted_at = case when p_action = 'delete_task' then v_now when p_action = 'restore_task' then null else t.deleted_at end,
      updated_at = v_now
    where t.id = v_id returning to_jsonb(t.*) into v_after;

  elsif p_action = 'create_update' then
    insert into public.workerbee_updates (kind, title, body, status, action_id, due_at, metadata)
    values (
      p_payload->>'kind', btrim(p_payload->>'title'), coalesce(p_payload->>'body', ''),
      coalesce(nullif(p_payload->>'status', ''), 'active'), nullif(p_payload->>'action_id', ''),
      nullif(p_payload->>'due_at', '')::timestamptz, coalesce(p_payload->'metadata', '{}'::jsonb)
    ) returning id, to_jsonb(public.workerbee_updates.*) into v_id, v_after;

  elsif p_action = 'update_update' then
    v_id := (p_payload->>'id')::uuid;
    select to_jsonb(u) into v_before from public.workerbee_updates u where u.id = v_id;
    update public.workerbee_updates u set
      title = case when p_payload ? 'title' then btrim(p_payload->>'title') else u.title end,
      body = case when p_payload ? 'body' then coalesce(p_payload->>'body', '') else u.body end,
      status = case when p_payload ? 'status' then p_payload->>'status' else u.status end,
      due_at = case when p_payload ? 'due_at' then nullif(p_payload->>'due_at', '')::timestamptz else u.due_at end,
      metadata = case when p_payload ? 'metadata' then p_payload->'metadata' else u.metadata end,
      updated_at = v_now
    where u.id = v_id returning to_jsonb(u.*) into v_after;

  elsif p_action = 'create_journal' then
    insert into public.workerbee_journal (entry_date, category, title, body, fingerprint, status, evidence, reopening_condition, metadata)
    values (
      coalesce(nullif(p_payload->>'entry_date', '')::date, current_date),
      coalesce(nullif(p_payload->>'category', ''), 'reflection'), btrim(p_payload->>'title'), p_payload->>'body',
      nullif(p_payload->>'fingerprint', ''), coalesce(nullif(p_payload->>'status', ''), 'current'),
      nullif(p_payload->>'evidence', ''), nullif(p_payload->>'reopening_condition', ''), coalesce(p_payload->'metadata', '{}'::jsonb)
    ) on conflict (fingerprint) do update set
      entry_date = excluded.entry_date, category = excluded.category, title = excluded.title, body = excluded.body,
      status = excluded.status, evidence = excluded.evidence, reopening_condition = excluded.reopening_condition,
      metadata = excluded.metadata, updated_at = v_now
    returning id, to_jsonb(public.workerbee_journal.*) into v_id, v_after;

  elsif p_action = 'update_journal' then
    v_id := (p_payload->>'id')::uuid;
    select to_jsonb(j) into v_before from public.workerbee_journal j where j.id = v_id;
    update public.workerbee_journal j set
      entry_date = case when p_payload ? 'entry_date' then (p_payload->>'entry_date')::date else j.entry_date end,
      category = case when p_payload ? 'category' then p_payload->>'category' else j.category end,
      title = case when p_payload ? 'title' then btrim(p_payload->>'title') else j.title end,
      body = case when p_payload ? 'body' then p_payload->>'body' else j.body end,
      fingerprint = case when p_payload ? 'fingerprint' then nullif(p_payload->>'fingerprint', '') else j.fingerprint end,
      status = case when p_payload ? 'status' then p_payload->>'status' else j.status end,
      evidence = case when p_payload ? 'evidence' then nullif(p_payload->>'evidence', '') else j.evidence end,
      reopening_condition = case when p_payload ? 'reopening_condition' then nullif(p_payload->>'reopening_condition', '') else j.reopening_condition end,
      metadata = case when p_payload ? 'metadata' then p_payload->'metadata' else j.metadata end,
      updated_at = v_now
    where j.id = v_id returning to_jsonb(j.*) into v_after;

  elsif p_action = 'mark_viewed' then
    if (select auth.uid()) is null then return jsonb_build_object('skipped', true); end if;
    insert into public.workerbee_read_state (viewer_id, last_dashboard_viewed_at, last_todo_viewed_at)
    values (
      (select auth.uid()),
      case when p_payload->>'surface' = 'dashboard' then v_now else null end,
      case when p_payload->>'surface' = 'todo' then v_now else null end
    ) on conflict (viewer_id) do update set
      last_dashboard_viewed_at = case when p_payload->>'surface' = 'dashboard' then v_now else public.workerbee_read_state.last_dashboard_viewed_at end,
      last_todo_viewed_at = case when p_payload->>'surface' = 'todo' then v_now else public.workerbee_read_state.last_todo_viewed_at end,
      updated_at = v_now
    returning viewer_id, to_jsonb(public.workerbee_read_state.*) into v_id, v_after;

  else
    raise exception 'Unknown WorkerBee action' using errcode = '22023';
  end if;

  if v_after is null then raise exception 'WorkerBee record not found' using errcode = 'P0002'; end if;
  insert into public.workerbee_change_history (entity_type, entity_id, action, actor, before_state, after_state)
  values (split_part(p_action, '_', 2), coalesce(v_id::text, v_after->>'viewer_id'), p_action, v_actor, v_before, v_after);
  return v_after;
end;
$$;

revoke all on function public.workerbee_authorized(text) from public;
revoke all on function public.workerbee_bootstrap(text) from public;
revoke all on function public.workerbee_mutate(text, jsonb, text) from public;
grant execute on function public.workerbee_authorized(text) to anon, authenticated;
grant execute on function public.workerbee_bootstrap(text) to anon, authenticated;
grant execute on function public.workerbee_mutate(text, jsonb, text) to anon, authenticated;
