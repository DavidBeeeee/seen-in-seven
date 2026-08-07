-- Source-aware Studio access, Systeme webhook processing, and EEE storage.
-- Existing studio_entitlements remains the client-facing effective-access table.

create table if not exists public.studio_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  app_key text not null check (app_key ~ '^[a-z0-9_]+$'),
  source_kind text not null check (source_kind in ('beta', 'manual', 'admin', 'systeme')),
  source_ref text not null,
  product_key text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, app_key, source_kind, source_ref)
);

create index if not exists studio_access_grants_effective_idx
  on public.studio_access_grants (user_id, app_key, status);

alter table public.studio_access_grants enable row level security;
revoke all on table public.studio_access_grants from public, anon, authenticated;

create table if not exists public.systeme_product_routes (
  price_plan_id bigint primary key,
  product_key text not null unique,
  app_keys text[] not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.systeme_product_routes enable row level security;
revoke all on table public.systeme_product_routes from public, anon, authenticated;

insert into public.systeme_product_routes (price_plan_id, product_key, app_keys)
values
  (3122070, '777_challenge_usd', array['seeninseven']),
  (3134754, 'eee_founders', array['eee', 'boardroom'])
on conflict (price_plan_id) do update
set product_key = excluded.product_key,
    app_keys = excluded.app_keys,
    active = true,
    updated_at = now();

create table if not exists public.systeme_webhook_events (
  message_id text primary key,
  delivery_attempt_id text,
  event_type text not null,
  event_timestamp timestamptz,
  price_plan_id bigint,
  product_key text,
  order_id bigint,
  customer_id bigint,
  customer_email text,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  result jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists systeme_webhook_events_received_idx
  on public.systeme_webhook_events (received_at desc);

alter table public.systeme_webhook_events enable row level security;
revoke all on table public.systeme_webhook_events from public, anon, authenticated;

create or replace function public.refresh_studio_entitlement(
  target_user_id uuid,
  target_app_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  winning_grant public.studio_access_grants;
begin
  select g.* into winning_grant
  from public.studio_access_grants g
  where g.user_id = target_user_id
    and g.app_key = target_app_key
    and g.status = 'active'
  order by
    case g.source_kind when 'admin' then 1 when 'manual' then 2 when 'beta' then 3 else 4 end,
    g.granted_at desc
  limit 1;

  if found then
    insert into public.studio_entitlements (
      user_id, app_key, status, access_source, granted_at, updated_at, expires_at
    ) values (
      target_user_id,
      target_app_key,
      'active',
      winning_grant.source_kind,
      winning_grant.granted_at,
      now(),
      null
    )
    on conflict (user_id, app_key) do update
    set status = 'active',
        access_source = excluded.access_source,
        granted_at = excluded.granted_at,
        updated_at = now(),
        expires_at = null;
  else
    update public.studio_entitlements
    set status = 'revoked', updated_at = now()
    where user_id = target_user_id and app_key = target_app_key;
  end if;
end;
$$;

revoke all on function public.refresh_studio_entitlement(uuid, text) from public, anon, authenticated;

-- Preserve every existing entitlement as an independent baseline grant.
insert into public.studio_access_grants (
  user_id, app_key, source_kind, source_ref, product_key, status, granted_at, revoked_at, metadata
)
select
  e.user_id,
  e.app_key,
  case when e.access_source in ('beta', 'manual', 'admin', 'systeme') then e.access_source else 'manual' end,
  'legacy:' || e.id::text,
  null,
  e.status,
  e.granted_at,
  case when e.status = 'revoked' then e.updated_at else null end,
  jsonb_build_object('migrated_from', 'studio_entitlements')
from public.studio_entitlements e
on conflict on constraint studio_access_grants_user_id_app_key_source_kind_source_ref_key do nothing;

create or replace function public.admin_set_studio_access(
  target_user_id uuid,
  target_app_key text,
  enabled boolean,
  target_access_source text default 'admin'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_source text := case
    when target_access_source in ('beta', 'manual', 'admin') then target_access_source
    else 'admin'
  end;
  grant_ref text := 'admin:' || target_app_key;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;

  if target_app_key not in ('seeninseven', 'boardroom', 'eee') then
    raise exception 'Invalid app key';
  end if;

  insert into public.studio_access_grants (
    user_id, app_key, source_kind, source_ref, status, granted_at, revoked_at, updated_at
  ) values (
    target_user_id,
    target_app_key,
    normalized_source,
    grant_ref,
    case when enabled then 'active' else 'revoked' end,
    now(),
    case when enabled then null else now() end,
    now()
  )
  on conflict on constraint studio_access_grants_user_id_app_key_source_kind_source_ref_key do update
  set status = excluded.status,
      granted_at = case when excluded.status = 'active' then now() else public.studio_access_grants.granted_at end,
      revoked_at = excluded.revoked_at,
      updated_at = now();

  perform public.refresh_studio_entitlement(target_user_id, target_app_key);
end;
$$;

revoke all on function public.admin_set_studio_access(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_set_studio_access(uuid, text, boolean, text) to authenticated;

create or replace function public.admin_get_studio_access_grants()
returns setof public.studio_access_grants
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;
  return query select g.* from public.studio_access_grants g order by g.updated_at desc;
end;
$$;

create or replace function public.admin_get_systeme_webhook_events()
returns setof public.systeme_webhook_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;
  return query
    select e.* from public.systeme_webhook_events e
    order by e.received_at desc limit 250;
end;
$$;

revoke all on function public.admin_get_studio_access_grants() from public, anon;
revoke all on function public.admin_get_systeme_webhook_events() from public, anon;
grant execute on function public.admin_get_studio_access_grants() to authenticated;
grant execute on function public.admin_get_systeme_webhook_events() to authenticated;

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
    order_id, customer_id, customer_email, payload
  ) values (
    p_message_id, p_delivery_attempt_id, normalized_event, p_event_timestamp, plan_id,
    order_id, customer_id, customer_email_value, p_payload
  ) on conflict (message_id) do nothing;

  if not found then
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

  update public.systeme_webhook_events
  set product_key = route.product_key
  where message_id = p_message_id;

  if customer_email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    update public.systeme_webhook_events
    set status = 'failed', processed_at = now(), result = jsonb_build_object('reason', 'invalid_email')
    where message_id = p_message_id;
    raise exception 'Valid customer email required';
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
      customer_user.id,
      target_app,
      'systeme',
      source_ref,
      route.product_key,
      new_status,
      now(),
      case when new_status = 'revoked' then now() else null end,
      now(),
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
exception when others then
  update public.systeme_webhook_events
  set status = 'failed', processed_at = now(), result = jsonb_build_object('error', sqlerrm)
  where message_id = p_message_id;
  raise;
end;
$$;

revoke all on function public.process_systeme_webhook_event(text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.process_systeme_webhook_event(text, text, text, timestamptz, jsonb) to service_role;

create or replace function public.admin_enroll_studio_customer(
  target_email text,
  target_name text default null,
  target_app_keys text[] default array[]::text[]
)
returns public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(target_email, '')));
  normalized_name text := nullif(trim(coalesce(target_name, '')), '');
  enrolled_user public.users;
  app_key text;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;

  if coalesce(array_length(target_app_keys, 1), 0) = 0
    or exists (
      select 1 from unnest(target_app_keys) as requested(app_key)
      where requested.app_key not in ('seeninseven', 'boardroom', 'eee')
    ) then
    raise exception 'Choose at least one valid Studio app';
  end if;

  insert into public.users (email, name)
  values (normalized_email, normalized_name)
  on conflict (email) do update
  set name = coalesce(nullif(trim(public.users.name), ''), excluded.name)
  returning * into enrolled_user;

  foreach app_key in array target_app_keys loop
    insert into public.studio_access_grants (
      user_id, app_key, source_kind, source_ref, status, granted_at, updated_at
    ) values (
      enrolled_user.id, app_key, 'admin', 'admin:' || app_key, 'active', now(), now()
    )
    on conflict on constraint studio_access_grants_user_id_app_key_source_kind_source_ref_key do update
    set status = 'active', granted_at = now(), revoked_at = null, updated_at = now();
    perform public.refresh_studio_entitlement(enrolled_user.id, app_key);
  end loop;

  return enrolled_user;
end;
$$;

revoke all on function public.admin_enroll_studio_customer(text, text, text[]) from public, anon;
grant execute on function public.admin_enroll_studio_customer(text, text, text[]) to authenticated;

-- EEE member content and progress.
create table if not exists public.storysculpt_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default 'Untitled script',
  content_type text,
  intake jsonb not null default '{}'::jsonb,
  conversation jsonb not null default '[]'::jsonb,
  output text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.navigator_states (
  user_id uuid primary key references public.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.solution_vault_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  speaker text,
  topic text,
  description text,
  video_url text not null,
  thumbnail_url text,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.solution_vault_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid not null references public.solution_vault_items(id) on delete cascade,
  completed boolean not null default false,
  watched_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.storysculpt_projects enable row level security;
alter table public.navigator_states enable row level security;
alter table public.solution_vault_items enable row level security;
alter table public.solution_vault_progress enable row level security;

grant select, insert, update, delete on public.storysculpt_projects to authenticated;
grant select, insert, update on public.navigator_states to authenticated;
grant select on public.solution_vault_items to authenticated;
grant select, insert, update, delete on public.solution_vault_progress to authenticated;

create policy storysculpt_member_rows on public.storysculpt_projects
for all to authenticated
using (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = storysculpt_projects.user_id and e.app_key = 'eee' and e.status = 'active'
  )
)
with check (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = storysculpt_projects.user_id and e.app_key = 'eee' and e.status = 'active'
  )
);

create policy navigator_member_row on public.navigator_states
for all to authenticated
using (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = navigator_states.user_id and e.app_key = 'eee' and e.status = 'active'
  )
)
with check (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = navigator_states.user_id and e.app_key = 'eee' and e.status = 'active'
  )
);

create policy vault_members_can_read on public.solution_vault_items
for select to authenticated
using (
  published = true and exists (
    select 1
    from public.users u
    join public.studio_entitlements e on e.user_id = u.id
    where u.auth_id = (select auth.uid()) and e.app_key = 'eee' and e.status = 'active'
  )
);

create policy vault_progress_member_rows on public.solution_vault_progress
for all to authenticated
using (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = solution_vault_progress.user_id and e.app_key = 'eee' and e.status = 'active'
  )
)
with check (
  user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
  and exists (
    select 1 from public.studio_entitlements e
    where e.user_id = solution_vault_progress.user_id and e.app_key = 'eee' and e.status = 'active'
  )
);
