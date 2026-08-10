-- Make the existing deny-by-default boundary explicit for operational tables.
-- Server-side SECURITY DEFINER functions remain the only intended access path.

revoke all on table public.preauth_events from anon, authenticated;

drop policy if exists api_usage_deny_direct_access on public.api_usage;
create policy api_usage_deny_direct_access
on public.api_usage for all to anon, authenticated
using (false) with check (false);

drop policy if exists preauth_events_deny_direct_access on public.preauth_events;
create policy preauth_events_deny_direct_access
on public.preauth_events for all to anon, authenticated
using (false) with check (false);

drop policy if exists studio_access_grants_deny_direct_access on public.studio_access_grants;
create policy studio_access_grants_deny_direct_access
on public.studio_access_grants for all to anon, authenticated
using (false) with check (false);

drop policy if exists systeme_product_routes_deny_direct_access on public.systeme_product_routes;
create policy systeme_product_routes_deny_direct_access
on public.systeme_product_routes for all to anon, authenticated
using (false) with check (false);

drop policy if exists systeme_webhook_config_deny_direct_access on public.systeme_webhook_config;
create policy systeme_webhook_config_deny_direct_access
on public.systeme_webhook_config for all to anon, authenticated
using (false) with check (false);

drop policy if exists systeme_webhook_events_deny_direct_access on public.systeme_webhook_events;
create policy systeme_webhook_events_deny_direct_access
on public.systeme_webhook_events for all to anon, authenticated
using (false) with check (false);
