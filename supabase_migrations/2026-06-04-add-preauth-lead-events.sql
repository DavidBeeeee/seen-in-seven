create table if not exists public.preauth_events (
  id bigserial primary key,
  anon_session_id text not null,
  user_id uuid references public.users(id) on delete set null,
  email text,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  page_path text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists preauth_events_session_idx
  on public.preauth_events (anon_session_id, created_at desc);

create index if not exists preauth_events_user_idx
  on public.preauth_events (user_id, created_at desc);

create index if not exists preauth_events_email_idx
  on public.preauth_events (lower(email), created_at desc)
  where email is not null;

alter table public.preauth_events enable row level security;

create or replace function public.record_preauth_event(
  p_anon_session_id text,
  p_event_type text,
  p_detail jsonb default '{}'::jsonb,
  p_email text default null,
  p_page_path text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if nullif(trim(p_anon_session_id), '') is null or nullif(trim(p_event_type), '') is null then
    return;
  end if;

  if auth.uid() is not null then
    select id into v_user_id
    from public.users
    where auth_id = auth.uid()
    limit 1;
  end if;

  insert into public.preauth_events (
    anon_session_id,
    user_id,
    event_type,
    detail,
    email,
    page_path,
    user_agent
  )
  values (
    left(trim(p_anon_session_id), 96),
    v_user_id,
    left(trim(p_event_type), 80),
    coalesce(p_detail, '{}'::jsonb),
    nullif(left(trim(coalesce(p_email, p_detail->>'email', '')), 320), ''),
    left(coalesce(p_page_path, ''), 500),
    left(coalesce(p_user_agent, ''), 500)
  );
end;
$$;

create or replace function public.attach_preauth_session(
  p_anon_session_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is null or nullif(trim(p_anon_session_id), '') is null then
    return;
  end if;

  select id into v_user_id
  from public.users
  where auth_id = auth.uid()
  limit 1;

  if v_user_id is null then
    return;
  end if;

  update public.preauth_events
  set user_id = v_user_id
  where anon_session_id = left(trim(p_anon_session_id), 96)
    and user_id is null;
end;
$$;

create or replace function public.admin_get_preauth_events()
returns table (
  id bigint,
  anon_session_id text,
  user_id uuid,
  email text,
  event_type text,
  detail jsonb,
  page_path text,
  user_agent text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.users u
    where u.auth_id = auth.uid()
      and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'admin access required';
  end if;

  return query
  select
    p.id,
    p.anon_session_id,
    p.user_id,
    p.email,
    p.event_type,
    p.detail,
    p.page_path,
    p.user_agent,
    p.created_at
  from public.preauth_events p
  order by p.created_at desc
  limit 1000;
end;
$$;

grant execute on function public.record_preauth_event(text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.attach_preauth_session(text) to authenticated;
grant execute on function public.admin_get_preauth_events() to authenticated;
