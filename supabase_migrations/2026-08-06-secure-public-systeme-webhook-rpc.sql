-- Let the public Vercel webhook call exactly one guarded RPC without exposing
-- a Supabase service-role key outside Supabase.

create table if not exists public.systeme_webhook_config (
  singleton boolean primary key default true check (singleton),
  secret_sha256 text not null,
  updated_at timestamptz not null default now()
);

alter table public.systeme_webhook_config enable row level security;
revoke all on table public.systeme_webhook_config from public, anon, authenticated;

insert into public.systeme_webhook_config (singleton, secret_sha256)
values (true, 'f65661392e6c1db8c655d2cd5a4dde02d7db1cd51240a79808751dc1c8c0993a')
on conflict (singleton) do update
set secret_sha256 = excluded.secret_sha256,
    updated_at = now();

create or replace function public.receive_systeme_webhook_event(
  p_secret text,
  p_message_id text,
  p_delivery_attempt_id text,
  p_event_type text,
  p_event_timestamp timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_hash text;
begin
  select c.secret_sha256 into configured_hash
  from public.systeme_webhook_config c
  where c.singleton = true;

  if configured_hash is null
     or encode(extensions.digest(convert_to(coalesce(p_secret, ''), 'UTF8'), 'sha256'), 'hex') <> configured_hash then
    raise exception 'Invalid webhook credential';
  end if;

  return public.process_systeme_webhook_event(
    p_message_id,
    p_delivery_attempt_id,
    p_event_type,
    p_event_timestamp,
    p_payload
  );
end;
$$;

revoke all on function public.receive_systeme_webhook_event(text, text, text, text, timestamptz, jsonb)
  from public, authenticated;
grant execute on function public.receive_systeme_webhook_event(text, text, text, text, timestamptz, jsonb)
  to anon, service_role;
