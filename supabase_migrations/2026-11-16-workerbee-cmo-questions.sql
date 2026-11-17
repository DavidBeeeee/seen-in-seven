-- WBR-464: Add a narrow 'cmo-questions' profile to workerbee_read that returns
-- only the published Momentum 300 question rows and scores (no Journal,
-- updates, tasks, notes, captures, clients, living plans, events, or products).

create or replace function public.workerbee_read(p_profile text, p_server_secret text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare data jsonb;
begin
  if not public.workerbee_authorized(p_server_secret) then
    raise exception 'WorkerBee access denied' using errcode = '42501';
  end if;
  if p_profile in ('notes', 'revisions', 'captures', 'tasks') then
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
  elsif p_profile = 'cmo-questions' then
    select metadata->'momentum_hub_artifact' into data from public.workerbee_updates where metadata ? 'momentum_hub_artifact' order by created_at desc limit 1;
    if data is null then
      return jsonb_build_object('generatedAt', null, 'updatedAt', null, 'cadence', null, 'scoredAgainst', null, 'lists', '[]'::jsonb, 'apps', '[]'::jsonb, 'scored', '{}'::jsonb);
    end if;
    return jsonb_build_object(
      'generatedAt', data->'generatedAt',
      'updatedAt', data->'updatedAt',
      'cadence', data->'cadence',
      'scoredAgainst', data->'scoredAgainst',
      'lists', coalesce(data->'lists', '[]'::jsonb),
      'apps', coalesce((
        select jsonb_agg(jsonb_build_object(
          'key', app->'key',
          'name', app->'name',
          'questionSet', app->'questionSet',
          'questionCount', app->'questionCount',
          'scoredOn', app->'scoredOn',
          'status', app->'status'
        ))
        from jsonb_array_elements(coalesce(data->'apps', '[]'::jsonb)) app
      ), '[]'::jsonb),
      'scored', coalesce(data->'scored', '{}'::jsonb)
    );
  elsif p_profile in ('full', 'updates', 'operations') then
    data := public.workerbee_bootstrap(p_server_secret);
    if p_profile = 'full' then return data; end if;
    return (select jsonb_object_agg(key,value) from jsonb_each(data) where key = any(case when p_profile='updates' then array['updates','generatedAt'] else array['clients','events','products','generatedAt'] end));
  end if;
  raise exception 'Unknown WorkerBee read profile' using errcode='22023';
end;
$function$;

revoke all on function public.workerbee_read(text,text) from public;
grant execute on function public.workerbee_read(text,text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
