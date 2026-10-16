-- Solution Vault: Book Shelf, Books, Grants, and Progress.
-- WBR-445, 2026-10-16.
--
-- Extends the Solution Vault into a personal digital library:
-- 1. Stable book catalog (solution_vault_books).
-- 2. Source-preserving grants (solution_vault_book_grants) that distinguish
--    gifted lifetime from product/conditional grants. Multiple sources can coexist;
--    ending a conditional grant leaves an independent lifetime gift readable.
-- 3. In-Studio reading progress (solution_vault_book_progress), clamped per person.
-- 4. Safe gift delivery tracking (solution_vault_deliveries).
-- 5. Existing video records (solution_vault_items) and progress remain untouched.
--    Book-only recipients never receive video access.

-- 1. Catalog table
create table if not exists public.solution_vault_books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_-]+$'),
  title text not null,
  subtitle text,
  description text,
  format text not null default 'pdf' check (format in ('pdf', 'web')),
  cover_url text,
  content_path text,
  content_version integer not null default 1 check (content_version >= 1),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  sha256 text,
  download_enabled boolean not null default false,
  download_path text,
  published boolean not null default false,
  sort_order integer not null default 10,
  chapters jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists solution_vault_books_sort_idx
  on public.solution_vault_books (published, sort_order, created_at desc);

-- 2. Grants table
create table if not exists public.solution_vault_book_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid not null references public.solution_vault_books(id) on delete cascade,
  grant_kind text not null default 'gift' check (grant_kind in ('gift', 'product')),
  source_kind text not null check (source_kind in ('gift', 'optin', 'admin', 'systeme', 'purchase', 'manual', 'test')),
  source_ref text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id, source_kind, source_ref)
);

create index if not exists solution_vault_book_grants_effective_idx
  on public.solution_vault_book_grants (user_id, book_id, status);

-- 3. Reading progress table
create table if not exists public.solution_vault_book_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  book_id uuid not null references public.solution_vault_books(id) on delete cascade,
  content_version integer not null default 1 check (content_version >= 1),
  last_page integer check (last_page is null or last_page >= 1),
  last_chapter_id text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

-- 4. Deliveries ledger
create table if not exists public.solution_vault_deliveries (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  book_slug text not null,
  source_kind text not null,
  source_ref text not null,
  status text not null default 'processed' check (status in ('received', 'processed', 'ignored', 'failed')),
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sent', 'failed', 'retryable')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email, book_slug, source_kind, source_ref)
);

-- Row Level Security
alter table public.solution_vault_books enable row level security;
alter table public.solution_vault_book_grants enable row level security;
alter table public.solution_vault_book_progress enable row level security;
alter table public.solution_vault_deliveries enable row level security;

-- Revoke default public/anon access
revoke all on table public.solution_vault_books from public, anon;
revoke all on table public.solution_vault_book_grants from public, anon;
revoke all on table public.solution_vault_book_progress from public, anon;
revoke all on table public.solution_vault_deliveries from public, anon;

grant select on public.solution_vault_books to authenticated;
grant select on public.solution_vault_book_grants to authenticated;
grant select, insert, update on public.solution_vault_book_progress to authenticated;

-- Effective access pure function
create or replace function public.member_has_book(target_user_id uuid, target_book_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.solution_vault_book_grants g
    where g.user_id = target_user_id
      and g.book_id = target_book_id
      and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
  );
$function$;

revoke all on function public.member_has_book(uuid, uuid) from public, anon;
grant execute on function public.member_has_book(uuid, uuid) to authenticated, service_role;

-- Caller has book access check
create or replace function public.has_book_access(target_book_slug text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select u.is_admin from public.users u where u.auth_id = (select auth.uid()))
    or exists (
      select 1
      from public.solution_vault_books b
      join public.solution_vault_book_grants g on g.book_id = b.id
      join public.users u on u.id = g.user_id
      where b.slug = target_book_slug
        and u.auth_id = (select auth.uid())
        and g.status = 'active'
        and (g.expires_at is null or g.expires_at > now())
    ),
    false
  );
$function$;

revoke all on function public.has_book_access(text) from public, anon;
grant execute on function public.has_book_access(text) to authenticated, service_role;

-- Has any book access check
create or replace function public.member_has_any_book(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.solution_vault_book_grants g
    join public.solution_vault_books b on b.id = g.book_id
    where g.user_id = target_user_id
      and b.published = true
      and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
  );
$function$;

revoke all on function public.member_has_any_book(uuid) from public, anon;
grant execute on function public.member_has_any_book(uuid) to authenticated, service_role;

-- Caller convenience wrapper for member_has_any_book
create or replace function public.has_any_book_access()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    public.member_has_any_book(
      (select u.id from public.users u where u.auth_id = (select auth.uid()))
    ),
    false
  );
$function$;

revoke all on function public.has_any_book_access() from public, anon;
grant execute on function public.has_any_book_access() to authenticated, service_role;

-- Vault entrance access: Video entitlement OR at least one accessible book
create or replace function public.has_vault_access()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    public.member_has_app(
      (select u.id from public.users u where u.auth_id = (select auth.uid())),
      'vault'
    )
    or public.member_has_any_book(
      (select u.id from public.users u where u.auth_id = (select auth.uid()))
    ),
    false
  );
$function$;

revoke all on function public.has_vault_access() from public, anon;
grant execute on function public.has_vault_access() to authenticated, service_role;

-- RLS policies on solution_vault_books
drop policy if exists vault_books_member_read on public.solution_vault_books;
create policy vault_books_member_read on public.solution_vault_books
  for select to authenticated
  using (
    (published = true and public.member_has_book(
      (select u.id from public.users u where u.auth_id = (select auth.uid())),
      solution_vault_books.id
    ))
    or coalesce((select u.is_admin from public.users u where u.auth_id = (select auth.uid())), false) = true
  );

drop policy if exists vault_books_admin_all on public.solution_vault_books;
create policy vault_books_admin_all on public.solution_vault_books
  for all to authenticated
  using (coalesce((select u.is_admin from public.users u where u.auth_id = (select auth.uid())), false) = true)
  with check (coalesce((select u.is_admin from public.users u where u.auth_id = (select auth.uid())), false) = true);

-- RLS policies on solution_vault_book_grants
drop policy if exists vault_book_grants_member_read on public.solution_vault_book_grants;
create policy vault_book_grants_member_read on public.solution_vault_book_grants
  for select to authenticated
  using (
    user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
    or coalesce((select u.is_admin from public.users u where u.auth_id = (select auth.uid())), false) = true
  );

drop policy if exists vault_book_grants_admin_all on public.solution_vault_book_grants;
create policy vault_book_grants_admin_all on public.solution_vault_book_grants
  for all to authenticated
  using (coalesce((select u.is_admin from public.users u where u.auth_id = (select auth.uid())), false) = true)
  with check (coalesce((select u.is_admin from public.users u where u.auth_id = (select auth.uid())), false) = true);

-- RLS policies on solution_vault_book_progress
drop policy if exists vault_book_progress_member_all on public.solution_vault_book_progress;
create policy vault_book_progress_member_all on public.solution_vault_book_progress
  for all to authenticated
  using (
    user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
    and public.member_has_book(user_id, book_id)
  )
  with check (
    user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
    and public.member_has_book(user_id, book_id)
  );

-- RLS on deliveries
drop policy if exists vault_deliveries_admin_all on public.solution_vault_deliveries;
create policy vault_deliveries_admin_all on public.solution_vault_deliveries
  for all to authenticated
  using (coalesce((select u.is_admin from public.users u where u.auth_id = (select auth.uid())), false) = true)
  with check (coalesce((select u.is_admin from public.users u where u.auth_id = (select auth.uid())), false) = true);

-- Member catalog retrieval with progress joined
create or replace function public.my_solution_vault_books()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  caller_auth_id uuid := (select auth.uid());
  caller_user_id uuid;
  caller_is_admin boolean;
  result jsonb;
begin
  if caller_auth_id is null then
    return '[]'::jsonb;
  end if;

  select u.id, coalesce(u.is_admin, false) into caller_user_id, caller_is_admin
  from public.users u
  where u.auth_id = caller_auth_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'slug', b.slug,
      'title', b.title,
      'subtitle', b.subtitle,
      'description', b.description,
      'format', b.format,
      'cover_url', b.cover_url,
      'content_version', b.content_version,
      'file_size_bytes', b.file_size_bytes,
      'sha256', b.sha256,
      'download_enabled', b.download_enabled,
      'download_path', b.download_path,
      'published', b.published,
      'sort_order', b.sort_order,
      'chapters', case when caller_is_admin then b.chapters else '[]'::jsonb end,
      'progress', case when p.id is not null then jsonb_build_object(
        'last_page', p.last_page,
        'last_chapter_id', p.last_chapter_id,
        'completed', p.completed,
        'updated_at', p.updated_at
      ) else null end
    ) order by b.sort_order asc, b.created_at desc
  ), '[]'::jsonb)
  into result
  from public.solution_vault_books b
  left join public.solution_vault_book_progress p
    on p.book_id = b.id and p.user_id = caller_user_id
  where (
    caller_is_admin = true
    or (
      b.published = true
      and public.member_has_book(caller_user_id, b.id)
    )
  );

  return result;
end;
$function$;

revoke all on function public.my_solution_vault_books() from public, anon;
grant execute on function public.my_solution_vault_books() to authenticated, service_role;

-- Save progress function with validation
create or replace function public.save_solution_vault_progress(
  target_book_slug text,
  target_page integer default null,
  target_chapter_id text default null,
  target_completed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  caller_user_id uuid;
  target_book public.solution_vault_books;
  progress_row public.solution_vault_book_progress;
begin
  select u.id into caller_user_id
  from public.users u
  where u.auth_id = (select auth.uid());

  if caller_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into target_book
  from public.solution_vault_books b
  where b.slug = target_book_slug;

  if target_book.id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;

  if not public.member_has_book(caller_user_id, target_book.id) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  if target_page is not null and target_page < 1 then
    target_page := 1;
  end if;

  insert into public.solution_vault_book_progress (
    user_id, book_id, content_version, last_page, last_chapter_id, completed, updated_at
  ) values (
    caller_user_id, target_book.id, target_book.content_version, target_page, target_chapter_id, target_completed, now()
  )
  on conflict (user_id, book_id) do update
  set last_page = coalesce(excluded.last_page, public.solution_vault_book_progress.last_page),
      last_chapter_id = coalesce(excluded.last_chapter_id, public.solution_vault_book_progress.last_chapter_id),
      completed = coalesce(excluded.completed, public.solution_vault_book_progress.completed),
      content_version = excluded.content_version,
      updated_at = now()
  returning * into progress_row;

  return jsonb_build_object(
    'ok', true,
    'last_page', progress_row.last_page,
    'last_chapter_id', progress_row.last_chapter_id,
    'completed', progress_row.completed,
    'updated_at', progress_row.updated_at
  );
end;
$function$;

revoke all on function public.save_solution_vault_progress(text, integer, text, boolean) from public, anon;
grant execute on function public.save_solution_vault_progress(text, integer, text, boolean) to authenticated;

-- Admin grant function
create or replace function public.admin_grant_book(
  target_user_id uuid,
  target_book_slug text,
  target_grant_kind text default 'gift'::text,
  target_source_kind text default 'admin'::text,
  target_source_ref text default 'admin:manual'::text,
  target_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_book_id uuid;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select b.id into target_book_id
  from public.solution_vault_books b
  where b.slug = target_book_slug;

  if target_book_id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;

  insert into public.solution_vault_book_grants (
    user_id, book_id, grant_kind, source_kind, source_ref, status, expires_at, granted_at, updated_at
  ) values (
    target_user_id, target_book_id, target_grant_kind, target_source_kind, target_source_ref, 'active', target_expires_at, now(), now()
  )
  on conflict (user_id, book_id, source_kind, source_ref) do update
  set status = 'active',
      expires_at = excluded.expires_at,
      revoked_at = null,
      updated_at = now();

  return jsonb_build_object('ok', true, 'user_id', target_user_id, 'book_slug', target_book_slug);
end;
$function$;

revoke all on function public.admin_grant_book(uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.admin_grant_book(uuid, text, text, text, text, timestamptz) to authenticated;

-- Admin grant by email (finds or creates user before first login)
create or replace function public.admin_grant_book_by_email(
  target_email text,
  target_name text default null::text,
  target_book_slug text default '5e-framework'::text,
  target_grant_kind text default 'gift'::text,
  target_source_kind text default 'admin'::text,
  target_source_ref text default 'admin:manual'::text,
  target_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  normalized_email text := lower(trim(coalesce(target_email, '')));
  normalized_name text := nullif(trim(coalesce(target_name, '')), '');
  enrolled_user public.users;
  target_book_id uuid;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select b.id into target_book_id
  from public.solution_vault_books b
  where b.slug = target_book_slug;

  if target_book_id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;

  insert into public.users (email, name)
  values (normalized_email, normalized_name)
  on conflict (email) do update
  set name = coalesce(nullif(trim(public.users.name), ''), excluded.name)
  returning * into enrolled_user;

  insert into public.solution_vault_book_grants (
    user_id, book_id, grant_kind, source_kind, source_ref, status, expires_at, granted_at, updated_at
  ) values (
    enrolled_user.id, target_book_id, target_grant_kind, target_source_kind, target_source_ref, 'active', target_expires_at, now(), now()
  )
  on conflict (user_id, book_id, source_kind, source_ref) do update
  set status = 'active',
      expires_at = excluded.expires_at,
      revoked_at = null,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', enrolled_user.id,
    'email', enrolled_user.email,
    'book_slug', target_book_slug
  );
end;
$function$;

revoke all on function public.admin_grant_book_by_email(text, text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.admin_grant_book_by_email(text, text, text, text, text, text, timestamptz) to authenticated;

-- Admin revoke grant
create or replace function public.admin_revoke_book_grant(
  target_user_id uuid,
  target_book_slug text,
  target_source_kind text,
  target_source_ref text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_book_id uuid;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select b.id into target_book_id
  from public.solution_vault_books b
  where b.slug = target_book_slug;

  if target_book_id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;

  update public.solution_vault_book_grants
  set status = 'revoked',
      revoked_at = now(),
      updated_at = now()
  where user_id = target_user_id
    and book_id = target_book_id
    and source_kind = target_source_kind
    and source_ref = target_source_ref;

  return jsonb_build_object('ok', true, 'revoked', true);
end;
$function$;

revoke all on function public.admin_revoke_book_grant(uuid, text, text, text) from public, anon;
grant execute on function public.admin_revoke_book_grant(uuid, text, text, text) to authenticated;

-- Admin unpublish book: stops new distribution but does NOT revoke existing gifts
create or replace function public.admin_unpublish_book(target_book_slug text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = (select auth.uid()) and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.solution_vault_books
  set published = false,
      updated_at = now()
  where slug = target_book_slug;

  return jsonb_build_object('ok', true, 'slug', target_book_slug, 'published', false);
end;
$function$;

revoke all on function public.admin_unpublish_book(text) from public, anon;
grant execute on function public.admin_unpublish_book(text) to authenticated;

-- Seed: The 5E Framework
insert into public.solution_vault_books (
  slug, title, subtitle, description, format, cover_url, content_path,
  content_version, file_size_bytes, sha256, download_enabled, download_path,
  published, sort_order
) values (
  '5e-framework',
  'The 5E Framework',
  'Building Trust Through Human-Centered Content',
  'A guide to building trust, authority, and connection through human-centered content that speaks directly to the client who needs your help.',
  'pdf',
  '/assets/vault/the-5e-framework-cover.png',
  '/assets/vault/books/5e-framework.pdf',
  1,
  505492,
  '7392961c0f492eaa4fe8eab517870efc19a7548cf2ec74619dc82772adf3e386',
  true,
  '/api/vault-book?slug=5e-framework&download=1',
  true,
  10
)
on conflict (slug) do update
set title = excluded.title,
    subtitle = excluded.subtitle,
    description = excluded.description,
    cover_url = excluded.cover_url,
    content_path = excluded.content_path,
    sha256 = excluded.sha256,
    file_size_bytes = excluded.file_size_bytes,
    download_enabled = excluded.download_enabled,
    download_path = excluded.download_path,
    published = excluded.published,
    sort_order = excluded.sort_order,
    updated_at = now();

-- Seed: Admin-only web book test fixture
insert into public.solution_vault_books (
  slug, title, subtitle, description, format, cover_url, content_path,
  content_version, file_size_bytes, sha256, download_enabled, download_path,
  published, sort_order, chapters
) values (
  'sample-web-book',
  'Sample Web Book (Admin Test Fixture)',
  'Testing the web chapter renderer',
  'Internal testing fixture for the in-Studio web reader. Never published as a real gift.',
  'web',
  '/assets/eee/vault.png',
  null,
  1,
  null,
  null,
  false,
  null,
  false,
  99,
  '[
    {"id": "ch1", "title": "Chapter 1: The First Step", "content": "Welcome to the web book reader. This chapter demonstrates clean in-Studio typography, chapter navigation, and automatic position saving without requiring third-party plugins."},
    {"id": "ch2", "title": "Chapter 2: Resuming Where You Left", "content": "When you return on any authenticated device, the reader automatically resumes to the chapter you last visited."},
    {"id": "ch3", "title": "Chapter 3: Safe Sanitized Content", "content": "All content rendered here uses safe DOM text construction to eliminate script injection risks while keeping reading effortless."}
  ]'::jsonb
)
on conflict (slug) do update
set title = excluded.title,
    subtitle = excluded.subtitle,
    description = excluded.description,
    published = false,
    chapters = excluded.chapters,
    updated_at = now();
