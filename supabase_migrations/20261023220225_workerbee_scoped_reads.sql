-- WBR-444 follow-up: retain history in the database, not in every response.
-- Existing callers keep the bootstrap shape and existing authorization.
do $migration$
declare
  definition text := pg_get_functiondef('public.workerbee_bootstrap(text)'::regprocedure);
  original text := 'jsonb_agg(to_jsonb(h) order by h.id desc)';
  replacement text := 'jsonb_agg((to_jsonb(h) - ''before_state'' - ''after_state'') || jsonb_build_object(''after_state'', jsonb_build_object(''title'', h.after_state->''title'', ''status'', h.after_state->''status'')) order by h.id desc)';
begin
  if position(original in definition) > 0 then
    execute replace(definition, original, replacement);
  elsif position(replacement in definition) = 0 then
    raise exception 'Unknown bootstrap history shape; preserve it and inspect';
  end if;
end;
$migration$;

create or replace function public.workerbee_read(p_profile text, p_server_secret text default null)
-- The bridge's anon role cannot read private tables directly. Like bootstrap,
-- this narrowly scoped definer must authorize before touching any private row.
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare data jsonb;
begin
  if not public.workerbee_authorized(p_server_secret) then
    raise exception 'WorkerBee access denied' using errcode = '42501';
  end if;
  if p_profile in ('notes', 'revisions', 'captures', 'tasks') then
    -- These checks never need report bodies, scoring artifacts or history.
    -- Read the note tables directly so notes on older updates are not lost.
    data := jsonb_build_object(
      'generatedAt', now(),
      'sections', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order, s.created_at) from public.workerbee_sections s where s.archived_at is null), '[]'::jsonb),
      'tasks', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at) from public.workerbee_task_notes n where n.task_id=t.id), '[]'::jsonb)) order by t.sort_order, t.created_at) from public.workerbee_tasks t where t.deleted_at is null), '[]'::jsonb)
    );
    if p_profile in ('notes', 'revisions') then
      data := data || jsonb_build_object('updates', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'title', u.title, 'kind', u.kind,
        'metadata', jsonb_build_object('source',u.metadata->'source','initiative_title',u.metadata->'initiative_title','work_order_id',u.metadata->'work_order_id','lane',u.metadata->'lane','date',u.metadata->'date'),
        'notes', (select jsonb_agg(to_jsonb(n) order by n.created_at) from public.workerbee_task_notes n where n.update_id=u.id and n.author='david' and n.acknowledged_at is null)
      )) from public.workerbee_updates u where exists(select 1 from public.workerbee_task_notes n where n.update_id=u.id and n.author='david' and n.acknowledged_at is null)), '[]'::jsonb));
    end if;
    return data;
  elsif p_profile = 'hub-scores' then
    select metadata->'momentum_hub_artifact'->'apps' into data from public.workerbee_updates where metadata ? 'momentum_hub_artifact' order by created_at desc limit 1;
    select coalesce(jsonb_agg(jsonb_build_object('key', app->'key', 'lastScore', app->'lastScore', 'lastScoredAt', app->'lastScoredAt')), '[]'::jsonb) into data from jsonb_array_elements(coalesce(data, '[]'::jsonb)) app;
    return jsonb_build_object('updates', jsonb_build_array(jsonb_build_object('metadata',jsonb_build_object('momentum_hub_artifact',jsonb_build_object('apps',data)))));
  elsif p_profile in ('full', 'updates', 'operations') then
    data := public.workerbee_bootstrap(p_server_secret);
    if p_profile = 'full' then return data; end if;
    return (select jsonb_object_agg(key,value) from jsonb_each(data) where key = any(case when p_profile='updates' then array['updates','generatedAt'] else array['clients','events','products','generatedAt'] end));
  end if;
  raise exception 'Unknown WorkerBee read profile' using errcode='22023';
end;
$function$;

-- Match the existing bridge: anon still needs the protected server secret;
-- authenticated access still needs workerbee_authorized's admin check.
revoke all on function public.workerbee_read(text,text) from public;
grant execute on function public.workerbee_read(text,text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
