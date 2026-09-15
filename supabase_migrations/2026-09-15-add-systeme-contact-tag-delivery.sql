-- Route purchase and cancellation tags by immutable price plan, then expose a
-- narrow claim/record pair to the signed webhook. No campaign is activated.

alter table public.systeme_product_routes
  add column if not exists purchase_tag_id bigint,
  add column if not exists cancellation_tag_id bigint;

-- Route-specific tags verified in Systeme on 2026-09-15. Keeping them on the
-- route prevents a standalone SeenInSeven buyer from being mislabeled as a
-- 777 participant, which the previous manual repair accidentally did.
update public.systeme_product_routes
set purchase_tag_id = case price_plan_id
      when 3122070 then 2179614
      when 3376492 then 2179616
      when 3424955 then 2122029
    end,
    cancellation_tag_id = case price_plan_id
      when 3122070 then 2179615
      when 3376492 then 2179617
      when 3424955 then 2122030
    end,
    updated_at = now()
where price_plan_id in (3122070, 3376492, 3424955);

create or replace function public.prepare_systeme_contact_tag(
  p_secret text,
  p_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_hash text;
  event_row public.systeme_webhook_events;
  route_row public.systeme_product_routes;
  selected_tag_id bigint;
  normalized_event text;
  prior_tag_status text;
begin
  select c.secret_sha256 into configured_hash
  from public.systeme_webhook_config c
  where c.singleton = true;

  if configured_hash is null
     or encode(extensions.digest(convert_to(coalesce(p_secret, ''), 'UTF8'), 'sha256'), 'hex') <> configured_hash then
    raise exception 'Invalid webhook credential';
  end if;

  select e.* into event_row
  from public.systeme_webhook_events e
  where e.message_id = p_message_id
  for update;

  if not found then
    return jsonb_build_object('configured', false, 'reason', 'event_not_found');
  end if;

  if event_row.status <> 'processed' then
    return jsonb_build_object('configured', false, 'reason', 'event_not_processed');
  end if;

  normalized_event := upper(trim(coalesce(event_row.event_type, '')));
  if normalized_event not in ('SALE_NEW', 'CUSTOMER_SALE_NEW', 'SALE_CANCELED', 'CUSTOMER_SALE_CANCELED') then
    return jsonb_build_object('configured', false, 'reason', 'event_does_not_change_purchase_state');
  end if;

  select r.* into route_row
  from public.systeme_product_routes r
  where r.price_plan_id = event_row.price_plan_id and r.active = true;

  if not found then
    return jsonb_build_object('configured', false, 'reason', 'active_route_not_found');
  end if;

  selected_tag_id := case
    when normalized_event in ('SALE_CANCELED', 'CUSTOMER_SALE_CANCELED') then route_row.cancellation_tag_id
    else route_row.purchase_tag_id
  end;

  if selected_tag_id is null then
    return jsonb_build_object(
      'configured', false,
      'reason', 'tag_not_configured',
      'event', normalized_event,
      'product_key', route_row.product_key
    );
  end if;

  prior_tag_status := event_row.result #>> '{systeme_tag,status}';
  if prior_tag_status = 'applied' then
    return jsonb_build_object(
      'duplicate', true,
      'event', normalized_event,
      'product_key', route_row.product_key
    );
  end if;

  update public.systeme_webhook_events
  set result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
    'systeme_tag', jsonb_build_object(
      'status', 'prepared',
      'event', normalized_event,
      'tag_id', selected_tag_id,
      'prepared_at', now()
    )
  )
  where message_id = p_message_id;

  return jsonb_build_object(
    'configured', true,
    'contact_id', nullif(event_row.payload #>> '{contact,id}', '')::bigint,
    'contact_email', event_row.customer_email,
    'tag_id', selected_tag_id,
    'event', normalized_event,
    'product_key', route_row.product_key
  );
end;
$$;

create or replace function public.record_systeme_contact_tag_outcome(
  p_secret text,
  p_message_id text,
  p_status text,
  p_detail jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_hash text;
  normalized_status text := lower(trim(coalesce(p_status, '')));
begin
  select c.secret_sha256 into configured_hash
  from public.systeme_webhook_config c
  where c.singleton = true;

  if configured_hash is null
     or encode(extensions.digest(convert_to(coalesce(p_secret, ''), 'UTF8'), 'sha256'), 'hex') <> configured_hash then
    raise exception 'Invalid webhook credential';
  end if;

  if normalized_status not in ('applied', 'failed', 'skipped', 'dry_run') then
    raise exception 'Invalid Systeme tag outcome';
  end if;

  update public.systeme_webhook_events
  set result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
    'systeme_tag', coalesce(p_detail, '{}'::jsonb) || jsonb_build_object(
      'status', normalized_status,
      'recorded_at', now()
    )
  )
  where message_id = p_message_id;

  if not found then
    raise exception 'Webhook event not found';
  end if;

  return jsonb_build_object('recorded', true, 'status', normalized_status);
end;
$$;

revoke all on function public.prepare_systeme_contact_tag(text, text) from public, authenticated;
revoke all on function public.record_systeme_contact_tag_outcome(text, text, text, jsonb) from public, authenticated;
grant execute on function public.prepare_systeme_contact_tag(text, text) to anon, service_role;
grant execute on function public.record_systeme_contact_tag_outcome(text, text, text, jsonb) to anon, service_role;
