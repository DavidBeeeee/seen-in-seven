-- WBR-347 and WBR-348. Two things David asked for on 2026-09-15.
--
-- 1. A place to enter a new todo at the top of the Todo page, one input for
--    each side, and a real process behind it rather than a box that fills up.
--    A capture arrives unrouted: it has no quadrant yet, because urgency and
--    importance are a judgement somebody has to make. `urgent` and `important`
--    are therefore nullable and null means nobody has decided, which is a state
--    the page can show and a morning can be held to. They are not defaulted to
--    false, because a default is a decision nobody made. WBR-115 is the same
--    lesson one table over.
--
--    There is no "deferred" and no "blocked" here on purpose. David's rule,
--    2026-09-15: nothing is ever deferred or blocked, there may just be other
--    things ahead of it. So the only outcomes of routing are a quadrant and a
--    position, and what is ahead of an item is written back to him on the item
--    itself through the note thread that already exists.
--
-- 2. Browsing what got done. The Dashboard payload returned every active row
--    plus the hundred most recently created closed ones, and there are 233
--    closed rows, so a browser built on it would have silently shown a
--    fraction. The window becomes time-based and matches the page's own
--    ninety days.

alter table public.workerbee_tasks
  add column if not exists urgent boolean,
  add column if not exists important boolean,
  add column if not exists routed_at timestamptz;

comment on column public.workerbee_tasks.urgent is
  'Null means unrouted: nobody has decided yet. Set together with important to place the task in a quadrant.';
comment on column public.workerbee_tasks.important is
  'Null means unrouted. Urgent and important together are the quadrant; neither is defaulted, because a default is a decision nobody made.';
comment on column public.workerbee_tasks.routed_at is
  'When a person or a run decided this capture''s quadrant and its position. Null while it is still waiting to be routed.';

-- Unrouted captures are what the morning is answerable for, so they get an
-- index rather than a scan that grows with the table.
create index if not exists workerbee_tasks_unrouted
  on public.workerbee_tasks (created_at)
  where deleted_at is null and status <> 'done' and routed_at is null;

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
    -- WBR-348. Every active row, plus every closed row that closed inside the
    -- last ninety days. This used to be the hundred most recently *created*
    -- closed rows, which is a different set twice over: creation order is not
    -- completion order, and a hundred is fewer than the two hundred and
    -- thirty-three that exist. The Analytics done browser reads exactly this
    -- window, and the roadmap publisher relies on the same ninety days to know
    -- that an absent prior row means the row does not exist rather than that it
    -- fell out of the payload. Change one and change all three.
    'updates', coalesce((select jsonb_agg(to_jsonb(u) || jsonb_build_object('notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.workerbee_task_notes n where n.update_id = u.id), '[]'::jsonb)) order by u.created_at desc) from (
        select * from public.workerbee_updates where status = 'active'
        union
        select * from public.workerbee_updates
          where status <> 'active'
            and coalesce(nullif(metadata->>'completed_at', '')::timestamptz, updated_at) >= now() - interval '90 days'
      ) u), '[]'::jsonb),
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

-- workerbee_mutate is one 175-line function and only the two task branches
-- change. Retyping the other 170 lines into this file is how a migration
-- silently reverts something it was never meant to touch, so the three new
-- columns are spliced into the live definition instead, and every splice is
-- asserted. If any anchor has moved, this raises rather than half-applying.
do $splice$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'workerbee_mutate';
  if v_def is null then raise exception 'public.workerbee_mutate does not exist'; end if;

  if v_def like '%urgent = case when p_payload%' then
    raise notice 'workerbee_mutate already carries the routing columns; nothing to splice.';
    return;
  end if;

  v_new := v_def;

  v_new := replace(v_new,
    'insert into public.workerbee_tasks (section_id, title, sort_order, owner, due_date, follow_up_date, work_area, source_url)',
    'insert into public.workerbee_tasks (section_id, title, sort_order, owner, due_date, follow_up_date, work_area, source_url, urgent, important, routed_at)');

  v_new := replace(v_new,
    '      nullif(btrim(p_payload->>''source_url''), '''')' || E'\n' || '    ) returning id, to_jsonb(public.workerbee_tasks.*) into v_id, v_after;',
    '      nullif(btrim(p_payload->>''source_url''), ''''),' || E'\n'
    || '      case when p_payload ? ''urgent'' then (p_payload->>''urgent'')::boolean else null end,' || E'\n'
    || '      case when p_payload ? ''important'' then (p_payload->>''important'')::boolean else null end,' || E'\n'
    -- Unrouted is opt-in. Only the capture strip asks for it, by sending both
    -- flags explicitly as null. A task added under a heading the old way is a
    -- placement decision already made, so it stays routed and keeps the
    -- quadrant its project has always derived.
    || '      case when (p_payload ? ''urgent'') and (p_payload ? ''important'')' || E'\n'
    || '             and (p_payload->>''urgent'') is null and (p_payload->>''important'') is null' || E'\n'
    || '        then null else v_now end' || E'\n'
    || '    ) returning id, to_jsonb(public.workerbee_tasks.*) into v_id, v_after;');

  v_new := replace(v_new,
    '      source_url = case when p_payload ? ''source_url'' then nullif(btrim(p_payload->>''source_url''), '''') else t.source_url end,',
    '      source_url = case when p_payload ? ''source_url'' then nullif(btrim(p_payload->>''source_url''), '''') else t.source_url end,' || E'\n'
    || '      urgent = case when p_payload ? ''urgent'' then (p_payload->>''urgent'')::boolean else t.urgent end,' || E'\n'
    || '      important = case when p_payload ? ''important'' then (p_payload->>''important'')::boolean else t.important end,' || E'\n'
    -- Routing is stamped by the act of deciding, never supplied by a caller. A
    -- run cannot claim an item was routed without saying which quadrant it is
    -- in, and clearing either half returns it to the unrouted strip where David
    -- can see it is waiting again.
    || '      routed_at = case' || E'\n'
    || '        when (p_payload ? ''urgent'') or (p_payload ? ''important'') then' || E'\n'
    || '          case when coalesce(case when p_payload ? ''urgent'' then (p_payload->>''urgent'')::boolean else t.urgent end, null) is not null' || E'\n'
    || '                and coalesce(case when p_payload ? ''important'' then (p_payload->>''important'')::boolean else t.important end, null) is not null' || E'\n'
    || '            then coalesce(t.routed_at, v_now) else null end' || E'\n'
    || '        else t.routed_at end,');

  if v_new = v_def then raise exception 'workerbee_mutate splice matched nothing; the anchors have moved and this migration must be rewritten'; end if;
  if v_new not like '%urgent = case when p_payload%' then raise exception 'workerbee_mutate update_task splice failed'; end if;
  if v_new not like '%work_area, source_url, urgent, important, routed_at)%' then raise exception 'workerbee_mutate create_task column splice failed'; end if;
  if v_new not like '%then null else v_now end%' then raise exception 'workerbee_mutate create_task values splice failed'; end if;

  execute v_new;
end
$splice$;

revoke all on function public.workerbee_mutate(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.workerbee_mutate(text, jsonb, text) to anon, authenticated;

-- Every task that existed before the capture strip was already sitting in a
-- quadrant the page derived for it, so it is routed. Stamping routed_at without
-- inventing urgent or important keeps that derivation in charge and makes
-- "unrouted" mean exactly one thing: nobody has looked at this capture yet.
update public.workerbee_tasks set routed_at = created_at where routed_at is null;
