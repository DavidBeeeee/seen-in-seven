-- WBR-339: one instruction thread for every item rendered on /todo.
--
-- The original note table only referenced workerbee_tasks. Once /todo began
-- rendering roadmap and execution-queue rows from workerbee_updates, most of
-- the page looked like a task list but could not accept an instruction. Keep
-- the existing table and history, and allow each note to belong to exactly one
-- of the two item stores.

alter table public.workerbee_task_notes
  alter column task_id drop not null;

alter table public.workerbee_task_notes
  add column if not exists update_id uuid references public.workerbee_updates (id) on delete cascade;

alter table public.workerbee_task_notes
  drop constraint if exists workerbee_task_notes_one_target;

alter table public.workerbee_task_notes
  add constraint workerbee_task_notes_one_target
  check (num_nonnulls(task_id, update_id) = 1);

create index if not exists workerbee_task_notes_update_id_idx
  on public.workerbee_task_notes (update_id, created_at);

-- Keep direct access denied. Notes only travel through the narrow authorized
-- functions below.
alter table public.workerbee_task_notes enable row level security;
revoke all on table public.workerbee_task_notes from anon, authenticated;

create or replace function public.workerbee_note_mutate(
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
  v_id uuid;
  v_task_id uuid := nullif(p_payload->>'task_id', '')::uuid;
  v_update_id uuid := nullif(p_payload->>'update_id', '')::uuid;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := now();
begin
  if not public.workerbee_authorized(p_server_secret) then
    raise exception 'WorkerBee access denied' using errcode = '42501';
  end if;

  if p_action in ('create_item_note', 'create_task_note') then
    if (v_task_id is null) = (v_update_id is null) then
      raise exception 'A note must name exactly one task or board item' using errcode = '22023';
    end if;

    insert into public.workerbee_task_notes (task_id, update_id, author, body, acknowledged_at)
    values (
      v_task_id,
      v_update_id,
      v_actor,
      btrim(p_payload->>'body'),
      case when v_actor = 'workerbee' then v_now else null end
    )
    returning id, to_jsonb(public.workerbee_task_notes.*) into v_id, v_after;

  elsif p_action = 'acknowledge_task_note' then
    v_id := (p_payload->>'id')::uuid;
    select to_jsonb(n) into v_before
    from public.workerbee_task_notes n
    where n.id = v_id;

    update public.workerbee_task_notes n
    set acknowledged_at = coalesce(n.acknowledged_at, v_now),
        updated_at = v_now
    where n.id = v_id
    returning to_jsonb(n.*) into v_after;
  else
    raise exception 'Unknown WorkerBee note action' using errcode = '22023';
  end if;

  if v_after is null then
    raise exception 'WorkerBee note target not found' using errcode = 'P0002';
  end if;

  insert into public.workerbee_change_history
    (entity_type, entity_id, action, actor, before_state, after_state)
  values ('note', v_id::text, p_action, v_actor, v_before, v_after);

  return v_after;
end;
$$;

revoke all on function public.workerbee_note_mutate(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.workerbee_note_mutate(text, jsonb, text) to anon, authenticated;

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
    'sections', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.sort_order, s.created_at)
      from public.workerbee_sections s
      where s.archived_at is null
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(
        to_jsonb(t) || jsonb_build_object(
          'notes', coalesce((
            select jsonb_agg(to_jsonb(n) order by n.created_at)
            from public.workerbee_task_notes n
            where n.task_id = t.id
          ), '[]'::jsonb)
        )
        order by t.sort_order, t.created_at
      )
      from public.workerbee_tasks t
      where t.deleted_at is null
    ), '[]'::jsonb),
    'updates', coalesce((
      select jsonb_agg(
        to_jsonb(u) || jsonb_build_object(
          'notes', coalesce((
            select jsonb_agg(to_jsonb(n) order by n.created_at)
            from public.workerbee_task_notes n
            where n.update_id = u.id
          ), '[]'::jsonb)
        )
        order by u.created_at desc
      )
      from (
        select * from public.workerbee_updates where status = 'active'
        union
        select * from (
          select * from public.workerbee_updates
          where status <> 'active'
          order by created_at desc
          limit 100
        ) recent
      ) u
    ), '[]'::jsonb),
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

revoke all on function public.workerbee_bootstrap(text) from public, anon, authenticated;
grant execute on function public.workerbee_bootstrap(text) to anon, authenticated;
