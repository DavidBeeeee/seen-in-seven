begin;

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  subject_key text not null,
  user_id uuid references auth.users(id) on delete cascade,
  ip_hash text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_subject_time_idx
  on public.api_usage (subject_key, endpoint, created_at desc);

create index if not exists api_usage_ip_time_idx
  on public.api_usage (ip_hash, endpoint, created_at desc);

alter table public.api_usage enable row level security;

create or replace function public.consume_api_quota(
  p_server_secret text,
  p_subject_key text,
  p_user_id uuid,
  p_ip_hash text,
  p_endpoint text,
  p_hourly_limit integer,
  p_ip_hourly_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  subject_count integer;
  ip_count integer;
begin
  if encode(extensions.digest(convert_to(coalesce(p_server_secret, ''), 'UTF8'), 'sha256'), 'hex') <> 'd0c64a9a815c22d0cc92ef74b4d8b7f268508e3ad8b0adfae03c6bc29e6623f4'
     or p_subject_key is null
     or length(p_subject_key) > 120
     or p_ip_hash is null
     or length(p_ip_hash) <> 64
     or p_endpoint not in ('generate', 'prompt-test')
     or p_hourly_limit < 1
     or p_hourly_limit > 500
     or p_ip_hourly_limit < 1
     or p_ip_hourly_limit > 1500 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_subject_key || ':' || p_endpoint));
  perform pg_advisory_xact_lock(hashtext(p_ip_hash || ':' || p_endpoint));

  select count(*) into subject_count
  from public.api_usage
  where subject_key = p_subject_key
    and endpoint = p_endpoint
    and created_at >= now() - interval '1 hour';

  select count(*) into ip_count
  from public.api_usage
  where ip_hash = p_ip_hash
    and endpoint = p_endpoint
    and created_at >= now() - interval '1 hour';

  if subject_count >= p_hourly_limit or ip_count >= p_ip_hourly_limit then
    return false;
  end if;

  insert into public.api_usage (subject_key, user_id, ip_hash, endpoint)
  values (p_subject_key, p_user_id, p_ip_hash, p_endpoint);

  return true;
end;
$$;

revoke all on table public.api_usage from anon, authenticated;
revoke all on function public.consume_api_quota(text, text, uuid, text, text, integer, integer) from public;
grant execute on function public.consume_api_quota(text, text, uuid, text, text, integer, integer) to anon, authenticated;

drop policy if exists "anyone can insert" on public.sessions_legacy;

commit;
