alter table public.systeme_webhook_events
  add column if not exists delivery_count integer not null default 1,
  add column if not exists last_received_at timestamptz not null default now();

create or replace function public.process_systeme_webhook_event(
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
  normalized_event text := upper(trim(coalesce(p_event_type, '')));
  plan_id bigint := nullif(coalesce(p_payload #>> '{pricePlan,id}', p_payload #>> '{offer_price_plan,id}'), '')::bigint;
  order_id bigint := nullif(coalesce(p_payload #>> '{order,id}', ''), '')::bigint;
  customer_id bigint := nullif(coalesce(p_payload #>> '{customer,id}', ''), '')::bigint;
  customer_email_value text := lower(trim(coalesce(p_payload #>> '{customer,email}', p_payload #>> '{contact,email}', '')));
  first_name text := nullif(trim(coalesce(p_payload #>> '{customer,fields,first_name}', '')), '');
  surname text := nullif(trim(coalesce(p_payload #>> '{customer,fields,surname}', '')), '');
  display_name text := nullif(trim(concat_ws(' ', first_name, surname)), '');
  plan_type text := coalesce(p_payload #>> '{pricePlan,type}', p_payload #>> '{offer_price_plan,type}', 'one_shot');
  route public.systeme_product_routes;
  customer_user public.users;
  target_app text;
  source_ref text;
  new_status text;
  affected integer := 0;
begin
  insert into public.systeme_webhook_events (
    message_id, delivery_attempt_id, event_type, event_timestamp, price_plan_id,
    order_id, customer_id, customer_email, payload, last_received_at
  ) values (
    p_message_id, p_delivery_attempt_id, normalized_event, p_event_timestamp, plan_id,
    order_id, customer_id, customer_email_value, p_payload, now()
  ) on conflict (message_id) do nothing;

  if not found then
    update public.systeme_webhook_events
    set delivery_attempt_id = p_delivery_attempt_id,
        delivery_count = delivery_count + 1,
        last_received_at = now()
    where message_id = p_message_id;
    return jsonb_build_object('duplicate', true, 'message_id', p_message_id);
  end if;

  select * into route
  from public.systeme_product_routes r
  where r.price_plan_id = plan_id and r.active = true;

  if not found then
    update public.systeme_webhook_events
    set status = 'ignored', processed_at = now(), result = jsonb_build_object('reason', 'unmapped_price_plan')
    where message_id = p_message_id;
    return jsonb_build_object('ignored', true, 'reason', 'unmapped_price_plan');
  end if;

  update public.systeme_webhook_events set product_key = route.product_key where message_id = p_message_id;

  if customer_email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    update public.systeme_webhook_events
    set status = 'failed', processed_at = now(), result = jsonb_build_object('reason', 'invalid_email')
    where message_id = p_message_id;
    return jsonb_build_object('failed', true, 'reason', 'invalid_email');
  end if;

  insert into public.users (email, name, last_active)
  values (customer_email_value, display_name, now())
  on conflict (email) do update
  set name = coalesce(nullif(trim(public.users.name), ''), excluded.name)
  returning * into customer_user;

  source_ref := case
    when plan_type = 'subscription' then 'systeme:subscription:' || plan_id::text || ':' || customer_id::text
    else 'systeme:order:' || order_id::text
  end;
  new_status := case when normalized_event in ('SALE_CANCELED', 'CUSTOMER_SALE_CANCELED') then 'revoked' else 'active' end;

  foreach target_app in array route.app_keys loop
    insert into public.studio_access_grants (
      user_id, app_key, source_kind, source_ref, product_key, status,
      granted_at, revoked_at, updated_at, metadata
    ) values (
      customer_user.id, target_app, 'systeme', source_ref, route.product_key, new_status,
      now(), case when new_status = 'revoked' then now() else null end, now(),
      jsonb_build_object('price_plan_id', plan_id, 'order_id', order_id, 'customer_id', customer_id)
    )
    on conflict on constraint studio_access_grants_user_id_app_key_source_kind_source_ref_key do update
    set status = excluded.status,
        revoked_at = excluded.revoked_at,
        updated_at = now(),
        metadata = excluded.metadata;

    perform public.refresh_studio_entitlement(customer_user.id, target_app);
    affected := affected + 1;
  end loop;

  update public.systeme_webhook_events
  set status = 'processed', processed_at = now(),
      result = jsonb_build_object('user_id', customer_user.id, 'grant_status', new_status, 'apps', route.app_keys)
  where message_id = p_message_id;

  return jsonb_build_object(
    'processed', true,
    'product_key', route.product_key,
    'grant_status', new_status,
    'apps_affected', affected
  );
end;
$$;

revoke all on function public.process_systeme_webhook_event(text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.process_systeme_webhook_event(text, text, text, timestamptz, jsonb) to service_role;
