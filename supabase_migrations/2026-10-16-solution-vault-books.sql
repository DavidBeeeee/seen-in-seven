-- Solution Vault: Book Shelf, grants, reading progress and gift delivery.
-- WBR-445, 2026-10-16. Rewritten by the review pass before its first
-- production application (the late-morning version was committed but never
-- applied, and its admin, gift and storage paths could not have worked).
--
-- What this holds:
-- 1. A stable catalog keyed by slug. status separates draft (never shown to
--    members), published (distributed), unpublished (no new gifts, existing
--    readers keep it) and retired (genuinely unavailable).
-- 2. Source-preserving grants. Effective access is the union of active,
--    unexpired grants; revoking one source never touches another.
-- 3. One small progress row per person and book, written only through
--    save_solution_vault_progress.
-- 4. A private storage bucket for book files. Readers fetch short-lived
--    signed URLs; the storage policy rechecks the exact book grant.
-- 5. Gift delivery: receive_book_gift is the one public entry, checked against
--    the existing Systeme webhook credential hash (no service-role key leaves
--    Supabase), driven by a source table whose /yeees row is inactive.
--
-- Video access is untouched: member_has_app('vault') still means videos, and
-- nothing here writes studio_entitlements.

-- ── 1. Catalog ────────────────────────────────────────────────────────────
create table if not exists public.solution_vault_books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  title text not null,
  subtitle text,
  description text,
  format text not null default 'pdf' check (format in ('pdf', 'web')),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'retired')),
  cover_url text,
  content_path text,
  content_version integer not null default 1 check (content_version >= 1),
  page_count integer check (page_count is null or page_count >= 1),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  sha256 text,
  download_enabled boolean not null default false,
  download_filename text,
  sort_order integer not null default 10,
  chapters jsonb not null default '[]'::jsonb check (jsonb_typeof(chapters) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. Grants ─────────────────────────────────────────────────────────────
create table if not exists public.solution_vault_book_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid not null references public.solution_vault_books(id) on delete restrict,
  grant_kind text not null default 'gift' check (grant_kind in ('gift', 'conditional')),
  source_kind text not null check (source_kind in ('optin', 'admin', 'product', 'test')),
  source_ref text not null check (length(source_ref) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id, source_kind, source_ref)
);

create index if not exists solution_vault_book_grants_effective_idx
  on public.solution_vault_book_grants (user_id, book_id) where status = 'active';

-- ── 3. Progress ───────────────────────────────────────────────────────────
create table if not exists public.solution_vault_book_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid not null references public.solution_vault_books(id) on delete cascade,
  content_version integer not null default 1,
  last_page integer check (last_page is null or last_page >= 1),
  last_chapter_id text check (last_chapter_id is null or length(last_chapter_id) <= 80),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- ── 4. Gift sources and delivery receipts ─────────────────────────────────
create table if not exists public.solution_vault_gift_sources (
  source_key text primary key check (source_key ~ '^[a-z0-9_]+$'),
  book_id uuid not null references public.solution_vault_books(id) on delete restrict,
  active boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.solution_vault_deliveries (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.solution_vault_gift_sources(source_key),
  event_id text not null check (length(event_id) between 1 and 200),
  user_id uuid references public.users(id) on delete set null,
  book_id uuid not null references public.solution_vault_books(id) on delete restrict,
  grant_state text not null check (grant_state in ('granted', 'already_active', 'revoked_kept')),
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sent', 'failed')),
  notification_attempts integer not null default 0,
  notification_error text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_key, event_id)
);

-- ── 5. Row level security and table grants ────────────────────────────────
alter table public.solution_vault_books enable row level security;
alter table public.solution_vault_book_grants enable row level security;
alter table public.solution_vault_book_progress enable row level security;
alter table public.solution_vault_gift_sources enable row level security;
alter table public.solution_vault_deliveries enable row level security;

revoke all on table public.solution_vault_books from public, anon, authenticated;
revoke all on table public.solution_vault_book_grants from public, anon, authenticated;
revoke all on table public.solution_vault_book_progress from public, anon, authenticated;
revoke all on table public.solution_vault_gift_sources from public, anon, authenticated;
revoke all on table public.solution_vault_deliveries from public, anon, authenticated;

-- Reads only. Every write goes through a SECURITY DEFINER function below.
grant select on public.solution_vault_books to authenticated;
grant select on public.solution_vault_book_grants to authenticated;
grant select on public.solution_vault_book_progress to authenticated;
grant select on public.solution_vault_gift_sources to authenticated;
grant select on public.solution_vault_deliveries to authenticated;

create or replace function public.vault_caller_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from public.users u where u.auth_id = (select auth.uid());
$$;

create or replace function public.vault_caller_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.is_admin from public.users u where u.auth_id = (select auth.uid())), false);
$$;

revoke all on function public.vault_caller_user_id() from public, anon;
revoke all on function public.vault_caller_is_admin() from public, anon;
grant execute on function public.vault_caller_user_id() to authenticated;
grant execute on function public.vault_caller_is_admin() to authenticated;

-- A member holds a book when any source grant is active and unexpired and the
-- book is not a draft or retired.
create or replace function public.member_has_book(target_user_id uuid, target_book_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solution_vault_book_grants g
    join public.solution_vault_books b on b.id = g.book_id
    where g.user_id = target_user_id
      and g.book_id = target_book_id
      and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
      and b.status in ('published', 'unpublished')
  );
$$;

create or replace function public.member_has_any_book(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solution_vault_book_grants g
    join public.solution_vault_books b on b.id = g.book_id
    where g.user_id = target_user_id
      and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
      and b.status in ('published', 'unpublished')
  );
$$;

revoke all on function public.member_has_book(uuid, uuid) from public, anon, authenticated;
revoke all on function public.member_has_any_book(uuid) from public, anon, authenticated;

create or replace function public.has_book_access(target_book_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.vault_caller_is_admin()
    or exists (
      select 1 from public.solution_vault_books b
      where b.slug = target_book_slug
        and public.member_has_book(public.vault_caller_user_id(), b.id)
    ),
    false
  );
$$;

create or replace function public.has_any_book_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.member_has_any_book(public.vault_caller_user_id()), false);
$$;

-- The Vault entrance: video access OR at least one book.
create or replace function public.has_vault_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.member_has_app(public.vault_caller_user_id(), 'vault')
    or public.member_has_any_book(public.vault_caller_user_id()),
    false
  );
$$;

revoke all on function public.has_book_access(text) from public, anon;
revoke all on function public.has_any_book_access() from public, anon;
revoke all on function public.has_vault_access() from public, anon;
grant execute on function public.has_book_access(text) to authenticated;
grant execute on function public.has_any_book_access() to authenticated;
grant execute on function public.has_vault_access() to authenticated;

drop policy if exists vault_books_read on public.solution_vault_books;
create policy vault_books_read on public.solution_vault_books
  for select to authenticated
  using (public.has_book_access(slug));

drop policy if exists vault_book_grants_read on public.solution_vault_book_grants;
create policy vault_book_grants_read on public.solution_vault_book_grants
  for select to authenticated
  using (user_id = public.vault_caller_user_id() or public.vault_caller_is_admin());

drop policy if exists vault_book_progress_read on public.solution_vault_book_progress;
create policy vault_book_progress_read on public.solution_vault_book_progress
  for select to authenticated
  using (user_id = public.vault_caller_user_id() or public.vault_caller_is_admin());

drop policy if exists vault_gift_sources_admin_read on public.solution_vault_gift_sources;
create policy vault_gift_sources_admin_read on public.solution_vault_gift_sources
  for select to authenticated using (public.vault_caller_is_admin());

drop policy if exists vault_deliveries_admin_read on public.solution_vault_deliveries;
create policy vault_deliveries_admin_read on public.solution_vault_deliveries
  for select to authenticated using (public.vault_caller_is_admin());

-- ── 6. Member shelf ───────────────────────────────────────────────────────
-- The caller's own books with progress. Admins also see drafts, marked so the
-- shelf can label them. progress_reset is true when saved progress belongs to
-- an older content version, so the reader can say why it starts over.
create or replace function public.my_solution_vault_books()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.vault_caller_user_id();
  v_admin boolean := public.vault_caller_is_admin();
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', b.slug,
      'title', b.title,
      'subtitle', b.subtitle,
      'description', b.description,
      'format', b.format,
      'status', b.status,
      'cover_url', b.cover_url,
      'content_path', b.content_path,
      'content_version', b.content_version,
      'page_count', b.page_count,
      'download_enabled', b.download_enabled and b.content_path is not null,
      'download_filename', b.download_filename,
      'chapters', b.chapters,
      'admin_preview', not public.member_has_book(v_user, b.id),
      'progress', case when p.user_id is null or p.content_version <> b.content_version then null
        else jsonb_build_object('last_page', p.last_page, 'last_chapter_id', p.last_chapter_id,
          'completed', p.completed, 'updated_at', p.updated_at) end,
      'progress_reset', p.user_id is not null and p.content_version <> b.content_version
    ) order by b.sort_order, b.created_at)
    from public.solution_vault_books b
    left join public.solution_vault_book_progress p on p.book_id = b.id and p.user_id = v_user
    where public.member_has_book(v_user, b.id)
       or (v_admin and b.status <> 'retired')
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_solution_vault_books() from public, anon;
grant execute on function public.my_solution_vault_books() to authenticated;

-- Deliberate policy: the last meaningful position change wins. The reader only
-- saves when the person moves to a new page or chapter, so an idle tab never
-- writes. Pages are clamped to the book; unknown chapters are refused.
create or replace function public.save_solution_vault_progress(
  target_book_slug text,
  target_page integer default null,
  target_chapter_id text default null,
  target_completed boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.vault_caller_user_id();
  v_book public.solution_vault_books;
  v_page integer := target_page;
  v_row public.solution_vault_book_progress;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_book from public.solution_vault_books b where b.slug = target_book_slug;
  if v_book.id is null or not public.member_has_book(v_user, v_book.id) then
    raise exception 'This book is not in your library' using errcode = '42501';
  end if;

  if v_page is not null then
    v_page := greatest(1, v_page);
    if v_book.page_count is not null then v_page := least(v_page, v_book.page_count); end if;
  end if;

  if target_chapter_id is not null and not exists (
    select 1 from jsonb_array_elements(v_book.chapters) c where c ->> 'id' = target_chapter_id
  ) then
    raise exception 'Unknown chapter' using errcode = '22023';
  end if;

  insert into public.solution_vault_book_progress as p
    (user_id, book_id, content_version, last_page, last_chapter_id, completed, updated_at)
  values (v_user, v_book.id, v_book.content_version, v_page, target_chapter_id, coalesce(target_completed, false), now())
  on conflict (user_id, book_id) do update
  set last_page = case when p.content_version = excluded.content_version
        then coalesce(excluded.last_page, p.last_page) else excluded.last_page end,
      last_chapter_id = case when p.content_version = excluded.content_version
        then coalesce(excluded.last_chapter_id, p.last_chapter_id) else excluded.last_chapter_id end,
      completed = coalesce(target_completed, case when p.content_version = excluded.content_version then p.completed else false end),
      content_version = excluded.content_version,
      updated_at = now()
  returning * into v_row;

  return jsonb_build_object('ok', true, 'last_page', v_row.last_page,
    'last_chapter_id', v_row.last_chapter_id, 'completed', v_row.completed, 'updated_at', v_row.updated_at);
end;
$$;

revoke all on function public.save_solution_vault_progress(text, integer, text, boolean) from public, anon;
grant execute on function public.save_solution_vault_progress(text, integer, text, boolean) to authenticated;

-- ── 7. Admin ──────────────────────────────────────────────────────────────
-- Grant by email, before or after the person's first login. The users row is
-- claimed by claim_studio_profile() when they sign in with that verified email.
create or replace function public.admin_grant_book(
  p_email text,
  p_book_slug text,
  p_grant_kind text default 'gift',
  p_source_ref text default 'admin:manual',
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_book public.solution_vault_books;
  v_user public.users;
  v_grant public.solution_vault_book_grants;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if p_grant_kind not in ('gift', 'conditional') then
    raise exception 'Grant kind must be gift or conditional' using errcode = '22023';
  end if;
  if p_grant_kind = 'conditional' and p_expires_at is null then
    raise exception 'A conditional grant needs its end date' using errcode = '22023';
  end if;

  select * into v_book from public.solution_vault_books b where b.slug = p_book_slug;
  if v_book.id is null or v_book.status = 'retired' then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;

  insert into public.users (email) values (v_email)
  on conflict (email) do update set email = excluded.email
  returning * into v_user;

  insert into public.solution_vault_book_grants as g
    (user_id, book_id, grant_kind, source_kind, source_ref, status, expires_at)
  values (v_user.id, v_book.id, p_grant_kind, 'admin', coalesce(nullif(btrim(p_source_ref), ''), 'admin:manual'), 'active', p_expires_at)
  on conflict (user_id, book_id, source_kind, source_ref) do update
  set status = 'active', revoked_at = null, expires_at = excluded.expires_at,
      grant_kind = excluded.grant_kind, updated_at = now()
  returning * into v_grant;

  return jsonb_build_object('ok', true, 'grant_id', v_grant.id, 'user_id', v_user.id,
    'email', v_user.email, 'book_slug', v_book.slug, 'linked', v_user.auth_id is not null);
end;
$$;

create or replace function public.admin_revoke_book_grant(p_grant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.solution_vault_book_grants;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.solution_vault_book_grants
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_grant_id and status = 'active'
  returning * into v_grant;

  if v_grant.id is null then
    raise exception 'No active grant with that id' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'grant_id', v_grant.id,
    'still_has_book', public.member_has_book(v_grant.user_id, v_grant.book_id));
end;
$$;

create or replace function public.admin_set_book_status(p_book_slug text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.solution_vault_books;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'published', 'unpublished', 'retired') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;

  update public.solution_vault_books
  set status = p_status, updated_at = now()
  where slug = p_book_slug
  returning * into v_book;

  if v_book.id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'slug', v_book.slug, 'status', v_book.status);
end;
$$;

revoke all on function public.admin_grant_book(text, text, text, text, timestamptz) from public, anon;
revoke all on function public.admin_revoke_book_grant(uuid) from public, anon;
revoke all on function public.admin_set_book_status(text, text) from public, anon;
grant execute on function public.admin_grant_book(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_revoke_book_grant(uuid) to authenticated;
grant execute on function public.admin_set_book_status(text, text) to authenticated;

-- ── 8. Gift delivery ──────────────────────────────────────────────────────
-- The single public entry. The caller proves it holds the Systeme webhook
-- credential (checked against the stored hash, as receive_systeme_webhook_event
-- does). The caller names only a source key, an event id and an email: the book,
-- grant kind and source come from the source table. One grant per person per
-- source, so repeated opt-ins give one gift; a revoked opt-in grant is never
-- reactivated by a replayed or repeated event. Each event id yields one receipt.
create or replace function public.vault_gift_credential_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.systeme_webhook_config c
    where c.singleton = true
      and c.secret_sha256 = encode(extensions.digest(convert_to(coalesce(p_secret, ''), 'UTF8'), 'sha256'), 'hex')
  );
$$;

revoke all on function public.vault_gift_credential_ok(text) from public, anon, authenticated;

create or replace function public.receive_book_gift(
  p_secret text,
  p_source_key text,
  p_event_id text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_event text := btrim(coalesce(p_event_id, ''));
  v_source public.solution_vault_gift_sources;
  v_book public.solution_vault_books;
  v_delivery public.solution_vault_deliveries;
  v_user public.users;
  v_grant public.solution_vault_book_grants;
  v_state text;
begin
  if not public.vault_gift_credential_ok(p_secret) then
    raise exception 'Invalid delivery credential' using errcode = '42501';
  end if;

  select * into v_source from public.solution_vault_gift_sources s where s.source_key = p_source_key;
  if v_source.source_key is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_source');
  end if;
  if not v_source.active then
    return jsonb_build_object('ok', false, 'error', 'source_inactive', 'note', v_source.note);
  end if;
  if v_event = '' or length(v_event) > 200 then
    return jsonb_build_object('ok', false, 'error', 'event_id_required');
  end if;
  if length(v_email) > 320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  select * into v_delivery from public.solution_vault_deliveries d
  where d.source_key = v_source.source_key and d.event_id = v_event;
  if v_delivery.id is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'delivery_id', v_delivery.id,
      'grant_state', v_delivery.grant_state, 'notification_status', v_delivery.notification_status,
      'book_slug', (select b.slug from public.solution_vault_books b where b.id = v_delivery.book_id),
      'book_title', (select b.title from public.solution_vault_books b where b.id = v_delivery.book_id));
  end if;

  select * into v_book from public.solution_vault_books b where b.id = v_source.book_id;
  if v_book.status <> 'published' then
    return jsonb_build_object('ok', false, 'error', 'book_not_published');
  end if;

  insert into public.users (email) values (v_email)
  on conflict (email) do update set email = excluded.email
  returning * into v_user;

  select * into v_grant from public.solution_vault_book_grants g
  where g.user_id = v_user.id and g.book_id = v_book.id
    and g.source_kind = 'optin' and g.source_ref = 'source:' || v_source.source_key;

  if v_grant.id is null then
    insert into public.solution_vault_book_grants (user_id, book_id, grant_kind, source_kind, source_ref)
    values (v_user.id, v_book.id, 'gift', 'optin', 'source:' || v_source.source_key)
    returning * into v_grant;
    v_state := 'granted';
  elsif v_grant.status = 'revoked' then
    v_state := 'revoked_kept';
  else
    v_state := 'already_active';
  end if;

  insert into public.solution_vault_deliveries (source_key, event_id, user_id, book_id, grant_state,
    notification_status)
  values (v_source.source_key, v_event, v_user.id, v_book.id, v_state,
    case when v_state = 'granted' then 'pending' else 'sent' end)
  on conflict (source_key, event_id) do nothing
  returning * into v_delivery;

  if v_delivery.id is null then
    select * into v_delivery from public.solution_vault_deliveries d
    where d.source_key = v_source.source_key and d.event_id = v_event;
    return jsonb_build_object('ok', true, 'duplicate', true, 'delivery_id', v_delivery.id,
      'grant_state', v_delivery.grant_state, 'notification_status', v_delivery.notification_status,
      'book_slug', (select b.slug from public.solution_vault_books b where b.id = v_delivery.book_id),
      'book_title', (select b.title from public.solution_vault_books b where b.id = v_delivery.book_id));
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'delivery_id', v_delivery.id,
    'grant_state', v_state, 'notification_status', v_delivery.notification_status,
    'book_slug', v_book.slug, 'book_title', v_book.title);
end;
$$;

-- The endpoint reports the welcome outcome. A sent welcome is final; pending
-- and failed stay retryable on the next delivery of the same event.
create or replace function public.record_book_gift_notification(
  p_secret text,
  p_delivery_id uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.solution_vault_deliveries;
begin
  if not public.vault_gift_credential_ok(p_secret) then
    raise exception 'Invalid delivery credential' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'failed') then
    raise exception 'Status must be sent or failed' using errcode = '22023';
  end if;

  update public.solution_vault_deliveries
  set notification_status = p_status,
      notification_attempts = notification_attempts + 1,
      notification_error = case when p_status = 'failed' then left(coalesce(p_error, 'failed'), 300) else null end,
      notified_at = case when p_status = 'sent' then now() else notified_at end
  where id = p_delivery_id and notification_status <> 'sent'
  returning * into v_row;

  return jsonb_build_object('ok', v_row.id is not null, 'notification_status',
    coalesce(v_row.notification_status, 'sent'));
end;
$$;

revoke all on function public.receive_book_gift(text, text, text, text) from public, authenticated;
revoke all on function public.record_book_gift_notification(text, uuid, text, text) from public, authenticated;
grant execute on function public.receive_book_gift(text, text, text, text) to anon, service_role;
grant execute on function public.record_book_gift_notification(text, uuid, text, text) to anon, service_role;

-- ── 9. Private file storage ───────────────────────────────────────────────
-- Objects live at <slug>/v<version>/<file>. Readers may create signed URLs only
-- for books they hold; admins upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('solution-vault-books', 'solution-vault-books', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vault_book_files_read on storage.objects;
create policy vault_book_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'solution-vault-books' and public.has_book_access((storage.foldername(name))[1]));

drop policy if exists vault_book_files_admin_insert on storage.objects;
create policy vault_book_files_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'solution-vault-books' and public.vault_caller_is_admin());

drop policy if exists vault_book_files_admin_update on storage.objects;
create policy vault_book_files_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'solution-vault-books' and public.vault_caller_is_admin())
  with check (bucket_id = 'solution-vault-books' and public.vault_caller_is_admin());

-- ── 10. Seed ──────────────────────────────────────────────────────────────
-- The 5E Framework, the supplied PDF (SHA-256 7392961c...e386, 505,492 bytes,
-- 15 pages). Its file is uploaded to the bucket, not committed to Git.
insert into public.solution_vault_books (slug, title, subtitle, description, format, status,
  cover_url, content_path, content_version, page_count, file_size_bytes, sha256,
  download_enabled, download_filename, sort_order)
values ('5e-framework', 'The 5E Framework', 'Building Trust Through Human-Centered Content',
  'A guide to building trust, authority, and connection through human-centered content that speaks directly to the client who needs your help.',
  'pdf', 'published', '/assets/vault/the-5e-framework-cover.png',
  '5e-framework/v1/the-5e-framework.pdf', 1, 15, 505492,
  '7392961c0f492eaa4fe8eab517870efc19a7548cf2ec74619dc82772adf3e386',
  true, 'The-5E-Framework.pdf', 10)
on conflict (slug) do nothing;

-- Admin-only web fixture for the chapter reader. Draft: never shown to members.
insert into public.solution_vault_books (slug, title, subtitle, description, format, status,
  cover_url, sort_order, chapters)
values ('sample-web-book', 'Sample Web Book (Admin Test Fixture)', 'Testing the web chapter renderer',
  'Internal fixture for the in-Studio web reader. Never a real gift.', 'web', 'draft',
  '/assets/eee/vault.png', 99,
  '[{"id": "ch1", "title": "Chapter 1: The First Step", "content": "Welcome to the web book reader. This chapter checks typography, chapter navigation and saved position."},
    {"id": "ch2", "title": "Chapter 2: Resuming Where You Left", "content": "When you return on any signed-in device, the reader opens the chapter you last visited."},
    {"id": "ch3", "title": "Chapter 3: Plain Text Only", "content": "Chapters render as plain paragraphs built from text nodes, so no markup or script in content can run."}]'::jsonb)
on conflict (slug) do nothing;

-- /yeees does not exist yet. Its row stays inactive until the real form's
-- event source is configured and verified end to end.
insert into public.solution_vault_gift_sources (source_key, book_id, active, note)
select 'yeees_optin', b.id, false, 'Pending: /yeees form does not exist yet. Activate only after its real event source is configured and an end-to-end opt-in is verified.'
from public.solution_vault_books b where b.slug = '5e-framework'
on conflict (source_key) do nothing;
