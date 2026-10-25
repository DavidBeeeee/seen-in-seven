-- WBR-458/WBR-444: publishers read only their own rows. Existing read RPC
-- performs the unchanged admin/server-secret authorization before filtering.
create or replace function public.workerbee_publication_read(p_profile text, p_server_secret text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare data jsonb; sources text[];
begin
  sources := case p_profile
    when 'publication-health' then array['runtime-health-gate']
    when 'publication-grade' then array['evolution-grade']
    -- Daily publication also maintains retention, health and This week.
    when 'publication-reports' then array['daily-report','runtime-health-gate','this-week']
    else null end;
  if sources is null then raise exception 'Unknown publication profile' using errcode='22023'; end if;
  data := public.workerbee_read('updates',p_server_secret);
  return jsonb_build_object('_partialUpdates',true,'generatedAt',data->'generatedAt',
    'updates',coalesce((select jsonb_agg(row) from jsonb_array_elements(data->'updates') row
      where row->'metadata'->>'source' = any(sources)), '[]'::jsonb));
end; $$;
revoke all on function public.workerbee_publication_read(text,text) from public;
grant execute on function public.workerbee_publication_read(text,text) to anon,authenticated;
