-- Compact WorkerBee operating modules for clients, launches, and product freshness.
-- All records stay private behind the same narrow, explicitly authorized RPC boundary.

create table if not exists public.workerbee_clients (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  relationship_status text not null check (relationship_status in ('active', 'occasional', 'possible', 'paused')),
  current_focus text,
  next_meeting_at timestamptz,
  follow_up_date date,
  nearest_deadline date,
  transcript_status text not null default 'unknown' check (transcript_status in ('current', 'needs_review', 'none', 'unknown')),
  commitments jsonb not null default '[]'::jsonb,
  drive_url text,
  client_thread_url text,
  living_plan_url text,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workerbee_events (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  event_type text not null check (event_type in ('meetup', 'launch', 'milestone')),
  status text not null check (status in ('planned', 'active', 'waiting', 'complete', 'parked')),
  starts_at timestamptz,
  ends_at timestamptz,
  current_milestone text,
  next_action text,
  registration_url text,
  meeting_url text,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workerbee_products (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  family text not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  status text not null check (status in ('active', 'maintenance', 'early', 'parked')),
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  current_objective text,
  last_meaningful_change_at timestamptz,
  next_review_date date,
  next_improvement text,
  important_risk text,
  route_url text,
  repository_url text,
  roadmap_url text,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workerbee_clients_follow_up_idx on public.workerbee_clients (archived_at, follow_up_date, name);
create index if not exists workerbee_events_starts_idx on public.workerbee_events (archived_at, starts_at, title);
create index if not exists workerbee_products_review_idx on public.workerbee_products (archived_at, next_review_date, name);

alter table public.workerbee_clients enable row level security;
alter table public.workerbee_events enable row level security;
alter table public.workerbee_products enable row level security;

revoke all on table public.workerbee_clients from anon, authenticated;
revoke all on table public.workerbee_events from anon, authenticated;
revoke all on table public.workerbee_products from anon, authenticated;
grant select, insert, update, delete on table public.workerbee_clients to service_role;
grant select, insert, update, delete on table public.workerbee_events to service_role;
grant select, insert, update, delete on table public.workerbee_products to service_role;

drop policy if exists workerbee_clients_deny_direct_access on public.workerbee_clients;
create policy workerbee_clients_deny_direct_access on public.workerbee_clients for all to anon, authenticated using (false) with check (false);
drop policy if exists workerbee_events_deny_direct_access on public.workerbee_events;
create policy workerbee_events_deny_direct_access on public.workerbee_events for all to anon, authenticated using (false) with check (false);
drop policy if exists workerbee_products_deny_direct_access on public.workerbee_products;
create policy workerbee_products_deny_direct_access on public.workerbee_products for all to anon, authenticated using (false) with check (false);

insert into public.workerbee_clients (stable_key, name, relationship_status, current_focus, follow_up_date, transcript_status, commitments, drive_url, client_thread_url, living_plan_url, metadata)
values
  ('scott', 'Scott', 'active', 'Details have not yet been reconciled into WorkerBee.', null, 'unknown', '[]'::jsonb, null, null, null, '{"source":"David declared active client on 2026-08-10"}'::jsonb),
  ('magdalena-dubaj', 'Magda', 'active', 'Recover control of the GetSpace account and domain before choosing the smallest email-capture page.', null, 'current', '[{"id":"CL-20260810-001","owner":"Magda","title":"Recover or confirm GetSpace/domain access.","status":"active"},{"id":"CL-20260810-002","owner":"Magda","title":"Choose the smallest email-capture landing page using the existing e-book.","status":"blocked"}]'::jsonb, 'https://drive.google.com/file/d/1MKkZ7bKWmdQW3ddbRMXqzF_QA3-UVOzR/view', 'state/CLIENT_THREADS/Magdalena_Dubaj.md', 'https://docs.google.com/document/d/12-u2_7joZ5uzm6in3ScpBiLLQNLwn4mXt6lO34QSMx4/edit', '{"source":"state/CLIENT_THREADS/Magdalena_Dubaj.md","nextCheck":"Before next coaching session; exact date unconfirmed."}'::jsonb),
  ('naya', 'Naya', 'occasional', 'Choose one specific Tiny Challenge problem and test David''s seven-day framework at the next session.', '2026-08-17', 'current', '[{"id":"CL-20260810-003","owner":"Naya","title":"Choose one specific problem for her Tiny Challenge.","status":"active"},{"id":"CL-20260810-004","owner":"David","title":"Finish the seven-day framework and run Naya through it.","status":"active"}]'::jsonb, 'https://drive.google.com/file/d/1xwCUXXR7SifL9dTj4UQ4g2ZP53V-whsb/view', 'state/CLIENT_THREADS/Naya.md', 'https://docs.google.com/document/d/1yt4FVXYz2YvzT5yIsek1MJHL8GEv6rt394Ph-qEvA-E/edit', '{"source":"state/CLIENT_THREADS/Naya.md","relationship":"skill swap"}'::jsonb)
on conflict (stable_key) do update set
  name = excluded.name,
  relationship_status = excluded.relationship_status,
  current_focus = excluded.current_focus,
  follow_up_date = excluded.follow_up_date,
  transcript_status = excluded.transcript_status,
  commitments = excluded.commitments,
  drive_url = excluded.drive_url,
  client_thread_url = excluded.client_thread_url,
  living_plan_url = excluded.living_plan_url,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.workerbee_events (stable_key, title, event_type, status, starts_at, ends_at, current_milestone, next_action, registration_url, source_url, metadata)
values
  ('777-2026-09', 'September 777 Challenge', 'launch', 'planned', '2026-09-07 11:00:00-06', '2026-09-19 23:59:00-06', 'Preparation', 'Confirm the missing live-room URLs and finish the operator checklist before September 7.', 'https://content.coloradomastermind.com', 'https://github.com/DavidBeeeee/seen-in-seven/tree/main/launch', '{"source":"launch/README.md","dateRange":"2026-09-07 through 2026-09-19"}'::jsonb),
  ('777-2026-09-kickoff', '777 Kickoff', 'milestone', 'planned', '2026-09-07 11:00:00-06', null, 'Room details still need confirmation', 'Confirm the Kickoff Zoom room URL.', 'https://content.coloradomastermind.com/kickoff', 'https://github.com/DavidBeeeee/seen-in-seven/blob/main/launch/operator-checklist.md', '{}'::jsonb),
  ('777-2026-09-graduation', '777 Graduation', 'milestone', 'planned', '2026-09-15 11:00:00-06', null, 'Room details still need confirmation', 'Confirm the Graduation Zoom room URL.', 'https://content.coloradomastermind.com/graduation', 'https://github.com/DavidBeeeee/seen-in-seven/blob/main/launch/operator-checklist.md', '{}'::jsonb)
on conflict (stable_key) do update set
  title = excluded.title,
  event_type = excluded.event_type,
  status = excluded.status,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  current_milestone = excluded.current_milestone,
  next_action = excluded.next_action,
  registration_url = excluded.registration_url,
  source_url = excluded.source_url,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.workerbee_products (stable_key, family, name, status, priority, current_objective, last_meaningful_change_at, next_review_date, next_improvement, important_risk, route_url, repository_url, roadmap_url, metadata)
values
  ('seen-in-seven', 'SeenInSeven', 'SeenInSeven', 'maintenance', 'normal', 'Keep the live app stable while WorkerBee Studio is the active build.', '2026-08-09 21:33:54-04', '2026-08-17', 'Resume the roadmap only after David reactivates product work.', null, 'https://studio.coloradomastermind.com/seeninseven', 'https://github.com/DavidBeeeee/seen-in-seven', 'https://github.com/DavidBeeeee/seen-in-seven/blob/main/SEENINSEVEN_ROADMAP.md', '{"source":"git history and SEENINSEVEN_ROADMAP.md"}'::jsonb),
  ('eee', 'EEE', 'EEE', 'early', 'normal', 'Prepare the September founders experience without letting it overtake current WorkerBee work.', '2026-08-06 20:47:11-04', '2026-08-17', 'Review readiness against the September launch checklist.', 'The live-room URLs remain unconfirmed.', 'https://studio.coloradomastermind.com/eee', 'https://github.com/DavidBeeeee/seen-in-seven', 'https://github.com/DavidBeeeee/seen-in-seven/blob/main/SEENINSEVEN_ROADMAP.md', '{"source":"git history and launch/README.md"}'::jsonb),
  ('storysculpt', 'EEE', 'StorySculpt', 'early', 'low', null, '2026-08-06 20:47:11-04', '2026-08-24', null, null, 'https://studio.coloradomastermind.com/storysculpt', 'https://github.com/DavidBeeeee/seen-in-seven', null, '{"source":"verified Studio route and git history"}'::jsonb),
  ('navigator', 'EEE', 'Next Step Navigator', 'early', 'low', null, '2026-08-06 20:47:11-04', '2026-08-24', null, null, 'https://studio.coloradomastermind.com/navigator', 'https://github.com/DavidBeeeee/seen-in-seven', null, '{"source":"verified Studio route and git history"}'::jsonb)
on conflict (stable_key) do update set
  family = excluded.family,
  name = excluded.name,
  status = excluded.status,
  priority = excluded.priority,
  current_objective = excluded.current_objective,
  last_meaningful_change_at = excluded.last_meaningful_change_at,
  next_review_date = excluded.next_review_date,
  next_improvement = excluded.next_improvement,
  important_risk = excluded.important_risk,
  route_url = excluded.route_url,
  repository_url = excluded.repository_url,
  roadmap_url = excluded.roadmap_url,
  metadata = excluded.metadata,
  updated_at = now();

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
    'clients', coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.workerbee_clients c where c.archived_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.starts_at nulls last, e.title) from public.workerbee_events e where e.archived_at is null), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(p) order by case p.priority when 'high' then 0 when 'normal' then 1 else 2 end, p.name) from public.workerbee_products p where p.archived_at is null), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(to_jsonb(h) order by h.id desc) from (select * from public.workerbee_change_history order by id desc limit 100) h), '[]'::jsonb),
    'readState', (select to_jsonb(r) from public.workerbee_read_state r where r.viewer_id = v_user_id),
    'generatedAt', to_jsonb(now())
  );
end;
$$;

create or replace function public.workerbee_operating_mutate(p_action text, p_payload jsonb, p_server_secret text default null)
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
  v_key text;
  v_rank integer := 1;
  v_outcome_id uuid;
begin
  if not public.workerbee_authorized(p_server_secret) then
    raise exception 'WorkerBee access denied' using errcode = '42501';
  end if;

  if p_action = 'reorder_outcomes' then
    if jsonb_typeof(p_payload->'ids') <> 'array' or jsonb_array_length(p_payload->'ids') > 3 then
      raise exception 'Outcome order requires an array of up to three IDs' using errcode = '22023';
    end if;
    for v_outcome_id in select value::text::uuid from jsonb_array_elements_text(p_payload->'ids') loop
      update public.workerbee_updates u
      set metadata = jsonb_set(u.metadata, '{rank}', to_jsonb(v_rank), true), updated_at = now()
      where u.id = v_outcome_id and u.kind = 'outcome';
      if not found then raise exception 'Outcome not found' using errcode = 'P0002'; end if;
      v_rank := v_rank + 1;
    end loop;
    v_after := jsonb_build_object('ids', p_payload->'ids', 'count', v_rank - 1);
    insert into public.workerbee_change_history (entity_type, entity_id, action, actor, after_state)
    values ('outcome', 'daily-plan', p_action, v_actor, v_after);
    return v_after;
  end if;

  v_key := btrim(p_payload->>'stable_key');
  if v_key is null or v_key = '' then raise exception 'stable_key is required' using errcode = '22023'; end if;

  if p_action = 'upsert_client' then
    select to_jsonb(c) into v_before from public.workerbee_clients c where c.stable_key = v_key;
    insert into public.workerbee_clients (stable_key, name, relationship_status, current_focus, next_meeting_at, follow_up_date, nearest_deadline, transcript_status, commitments, drive_url, client_thread_url, living_plan_url, metadata)
    values (v_key, btrim(p_payload->>'name'), p_payload->>'relationship_status', nullif(p_payload->>'current_focus',''), nullif(p_payload->>'next_meeting_at','')::timestamptz, nullif(p_payload->>'follow_up_date','')::date, nullif(p_payload->>'nearest_deadline','')::date, coalesce(nullif(p_payload->>'transcript_status',''),'unknown'), coalesce(p_payload->'commitments','[]'::jsonb), nullif(p_payload->>'drive_url',''), nullif(p_payload->>'client_thread_url',''), nullif(p_payload->>'living_plan_url',''), coalesce(p_payload->'metadata','{}'::jsonb))
    on conflict (stable_key) do update set name=excluded.name, relationship_status=excluded.relationship_status, current_focus=excluded.current_focus, next_meeting_at=excluded.next_meeting_at, follow_up_date=excluded.follow_up_date, nearest_deadline=excluded.nearest_deadline, transcript_status=excluded.transcript_status, commitments=excluded.commitments, drive_url=excluded.drive_url, client_thread_url=excluded.client_thread_url, living_plan_url=excluded.living_plan_url, metadata=excluded.metadata, updated_at=now()
    returning id, to_jsonb(public.workerbee_clients.*) into v_id, v_after;
  elsif p_action = 'upsert_event' then
    select to_jsonb(e) into v_before from public.workerbee_events e where e.stable_key = v_key;
    insert into public.workerbee_events (stable_key, title, event_type, status, starts_at, ends_at, current_milestone, next_action, registration_url, meeting_url, source_url, metadata)
    values (v_key, btrim(p_payload->>'title'), p_payload->>'event_type', p_payload->>'status', nullif(p_payload->>'starts_at','')::timestamptz, nullif(p_payload->>'ends_at','')::timestamptz, nullif(p_payload->>'current_milestone',''), nullif(p_payload->>'next_action',''), nullif(p_payload->>'registration_url',''), nullif(p_payload->>'meeting_url',''), nullif(p_payload->>'source_url',''), coalesce(p_payload->'metadata','{}'::jsonb))
    on conflict (stable_key) do update set title=excluded.title, event_type=excluded.event_type, status=excluded.status, starts_at=excluded.starts_at, ends_at=excluded.ends_at, current_milestone=excluded.current_milestone, next_action=excluded.next_action, registration_url=excluded.registration_url, meeting_url=excluded.meeting_url, source_url=excluded.source_url, metadata=excluded.metadata, updated_at=now()
    returning id, to_jsonb(public.workerbee_events.*) into v_id, v_after;
  elsif p_action = 'upsert_product' then
    select to_jsonb(p) into v_before from public.workerbee_products p where p.stable_key = v_key;
    insert into public.workerbee_products (stable_key, family, name, status, priority, current_objective, last_meaningful_change_at, next_review_date, next_improvement, important_risk, route_url, repository_url, roadmap_url, metadata)
    values (v_key, btrim(p_payload->>'family'), btrim(p_payload->>'name'), p_payload->>'status', coalesce(nullif(p_payload->>'priority',''),'normal'), nullif(p_payload->>'current_objective',''), nullif(p_payload->>'last_meaningful_change_at','')::timestamptz, nullif(p_payload->>'next_review_date','')::date, nullif(p_payload->>'next_improvement',''), nullif(p_payload->>'important_risk',''), nullif(p_payload->>'route_url',''), nullif(p_payload->>'repository_url',''), nullif(p_payload->>'roadmap_url',''), coalesce(p_payload->'metadata','{}'::jsonb))
    on conflict (stable_key) do update set family=excluded.family, name=excluded.name, status=excluded.status, priority=excluded.priority, current_objective=excluded.current_objective, last_meaningful_change_at=excluded.last_meaningful_change_at, next_review_date=excluded.next_review_date, next_improvement=excluded.next_improvement, important_risk=excluded.important_risk, route_url=excluded.route_url, repository_url=excluded.repository_url, roadmap_url=excluded.roadmap_url, metadata=excluded.metadata, updated_at=now()
    returning id, to_jsonb(public.workerbee_products.*) into v_id, v_after;
  else
    raise exception 'Unknown WorkerBee operating action' using errcode = '22023';
  end if;

  insert into public.workerbee_change_history (entity_type, entity_id, action, actor, before_state, after_state)
  values (split_part(p_action, '_', 2), v_id::text, p_action, v_actor, v_before, v_after);
  return v_after;
end;
$$;

revoke all on function public.workerbee_bootstrap(text) from public, anon, authenticated;
revoke all on function public.workerbee_operating_mutate(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.workerbee_authorized(text) from public, anon, authenticated;
grant execute on function public.workerbee_bootstrap(text) to anon, authenticated;
grant execute on function public.workerbee_operating_mutate(text, jsonb, text) to anon, authenticated;
