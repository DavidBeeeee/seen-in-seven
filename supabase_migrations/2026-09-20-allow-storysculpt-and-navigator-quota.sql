-- WBR-373. StorySculpt and Navigator could never generate, and the reason was
-- not the model name the scoring suspected. It was one line in here.
--
-- `consume_api_quota` validates its arguments before it counts anything, and
-- that validation includes an allowlist of endpoint names:
--
--     or p_endpoint not in ('generate', 'prompt-test')
--
-- An endpoint outside that list is not rate limited, it is refused. The
-- function returns false, and every caller reads false as "over quota".
-- `api/storysculpt.js` passes `storysculpt` and `api/navigator.js` passes
-- `navigator`, so both apps answered 429 "needs a short pause" on the very
-- first request of the hour, from a fresh account, forever. Verified live on
-- 2026-09-20 against studio.coloradomastermind.com with the dedicated
-- non-admin test member: both returned 429 in about half a second, which is
-- far too fast to have reached DeepSeek.
--
-- The allowlist stays an allowlist rather than becoming "any string". The
-- server secret is the only thing standing between this function and
-- arbitrary rows in api_usage, and a named set is what makes a leaked secret
-- bounded. The two real endpoints are added by name; nothing else changes.

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
set search_path to 'public', 'pg_temp'
as $function$
declare
  subject_count integer;
  ip_count integer;
begin
  if encode(extensions.digest(convert_to(coalesce(p_server_secret, ''), 'UTF8'), 'sha256'), 'hex') <> 'd0c64a9a815c22d0cc92ef74b4d8b7f268508e3ad8b0adfae03c6bc29e6623f4'
     or p_subject_key is null
     or length(p_subject_key) > 120
     or p_ip_hash is null
     or length(p_ip_hash) <> 64
     or p_endpoint not in ('generate', 'prompt-test', 'storysculpt', 'navigator')
     or p_hourly_limit < 1
     or p_hourly_limit > 500
     or p_ip_hourly_limit < 1
     or p_ip_hourly_limit > 1500 then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext(p_subject_key || ':' || p_endpoint));
  perform pg_advisory_xact_lock(hashtext(p_ip_hash || ':' || p_endpoint));
  select count(*) into subject_count from public.api_usage where subject_key = p_subject_key and endpoint = p_endpoint and created_at >= now() - interval '1 hour';
  select count(*) into ip_count from public.api_usage where ip_hash = p_ip_hash and endpoint = p_endpoint and created_at >= now() - interval '1 hour';
  if subject_count >= p_hourly_limit or ip_count >= p_ip_hourly_limit then return false; end if;
  insert into public.api_usage (subject_key, user_id, ip_hash, endpoint) values (p_subject_key, p_user_id, p_ip_hash, p_endpoint);
  return true;
end;
$function$;
