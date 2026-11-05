-- WBR-458, Certainty Developer 100. WorkerBee's own scripts are the biggest reader
-- on this project and hold no member token, so record_log_event drops their events
-- and the bandwidth warnings cannot see them. This appends one ledger row for a
-- holder of the server secret, and can do nothing else. Sizes and a command name
-- only. Rollback: drop function public.workerbee_record_egress(text, bigint, text);
create or replace function public.workerbee_record_egress(
  p_server_secret text,
  p_bytes bigint,
  p_reader text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.workerbee_authorized(p_server_secret) then
    raise exception 'WorkerBee access denied' using errcode = '42501';
  end if;
  if p_bytes is null or p_bytes < 0 then
    return;
  end if;
  insert into public.logs (user_id, event_type, detail)
  values (null, 'studio_egress_response', jsonb_build_object(
    'schema', 1,
    'route', 'workerbee-tooling',
    'reader', left(coalesce(p_reader, 'unnamed'), 80),
    'bytes', least(p_bytes, 67108864)
  ));
end;
$$;

revoke all on function public.workerbee_record_egress(text, bigint, text) from public;
grant execute on function public.workerbee_record_egress(text, bigint, text) to anon, authenticated;
