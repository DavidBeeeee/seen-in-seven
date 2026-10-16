-- Solution Vault: admin editing of book details, covers and files. WBR-445,
-- David 2026-10-16 ("add edit access so I can change the covers or files in
-- my admin panel").
--
-- Covers are meant to be seen, so they live in a public bucket. Book files
-- stay in the private solution-vault-books bucket. A replaced file becomes a
-- new content version at <slug>/v<n>/..., the old object is kept and its path
-- recorded so it can be restored, and saved reading positions from the old
-- version are reported as reset rather than landing on the wrong page.
-- Every write is admin-only and checks that the uploaded object really exists.

alter table public.solution_vault_books
  add column if not exists previous_content_path text,
  add column if not exists previous_sha256 text,
  add column if not exists previous_file_size_bytes bigint,
  add column if not exists previous_page_count integer;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('solution-vault-covers', 'solution-vault-covers', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vault_cover_files_admin_insert on storage.objects;
create policy vault_cover_files_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'solution-vault-covers' and public.vault_caller_is_admin());

drop policy if exists vault_cover_files_admin_update on storage.objects;
create policy vault_cover_files_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'solution-vault-covers' and public.vault_caller_is_admin())
  with check (bucket_id = 'solution-vault-covers' and public.vault_caller_is_admin());

-- Admins can read the private book objects they manage (for the upload
-- read-back check). Members still go through has_book_access.
drop policy if exists vault_book_files_admin_read on storage.objects;
create policy vault_book_files_admin_read on storage.objects
  for select to authenticated
  using (bucket_id in ('solution-vault-books', 'solution-vault-covers') and public.vault_caller_is_admin());

create or replace function public.admin_update_book_details(
  p_book_slug text,
  p_title text,
  p_subtitle text,
  p_description text,
  p_download_enabled boolean,
  p_cover_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.solution_vault_books;
  v_title text := btrim(coalesce(p_title, ''));
  v_cover text := nullif(btrim(coalesce(p_cover_url, '')), '');
  v_cover_prefix text := 'https://zdtkwpzdwnzzmdwrvmka.supabase.co/storage/v1/object/public/solution-vault-covers/';
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_book from public.solution_vault_books b where b.slug = p_book_slug;
  if v_book.id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;
  if length(v_title) not between 1 and 200 then
    raise exception 'A title of 1 to 200 characters is required' using errcode = '22023';
  end if;
  if length(coalesce(p_subtitle, '')) > 300 or length(coalesce(p_description, '')) > 1200 then
    raise exception 'Subtitle is limited to 300 characters and description to 1200' using errcode = '22023';
  end if;

  if v_cover is not null then
    if v_cover ~ '^/assets/[A-Za-z0-9/_.-]+\.(png|jpe?g|webp)$' then
      null;
    elsif left(v_cover, length(v_cover_prefix)) = v_cover_prefix then
      if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'solution-vault-covers'
          and o.name = substr(v_cover, length(v_cover_prefix) + 1)
          and split_part(o.name, '/', 1) = v_book.slug
      ) then
        raise exception 'That cover has not been uploaded for this book' using errcode = '22023';
      end if;
    else
      raise exception 'Covers must come from the Studio cover library' using errcode = '22023';
    end if;
  end if;

  update public.solution_vault_books
  set title = v_title,
      subtitle = nullif(btrim(coalesce(p_subtitle, '')), ''),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      download_enabled = coalesce(p_download_enabled, download_enabled),
      cover_url = coalesce(v_cover, cover_url),
      updated_at = now()
  where id = v_book.id
  returning * into v_book;

  return jsonb_build_object('ok', true, 'slug', v_book.slug, 'title', v_book.title, 'cover_url', v_book.cover_url);
end;
$$;

-- Point a PDF book at a newly uploaded file. The object must already exist in
-- the private bucket under <slug>/v<next version>/ with the declared size.
create or replace function public.admin_replace_book_file(
  p_book_slug text,
  p_content_path text,
  p_sha256 text,
  p_file_size_bytes bigint,
  p_page_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.solution_vault_books;
  v_object_size bigint;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_book from public.solution_vault_books b where b.slug = p_book_slug for update;
  if v_book.id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;
  if v_book.format <> 'pdf' then
    raise exception 'Only PDF books take a file' using errcode = '22023';
  end if;
  if p_content_path is null or split_part(p_content_path, '/', 1) <> v_book.slug
     or split_part(p_content_path, '/', 2) <> 'v' || (v_book.content_version + 1)
     or p_content_path !~ '^[a-z0-9_-]+/v[0-9]+/[A-Za-z0-9._-]+\.pdf$' then
    raise exception 'The file must be uploaded to %/v%/', v_book.slug, v_book.content_version + 1 using errcode = '22023';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' or p_file_size_bytes is null or p_file_size_bytes < 1
     or p_page_count is null or p_page_count < 1 then
    raise exception 'Checksum, size and page count are required' using errcode = '22023';
  end if;

  select (o.metadata ->> 'size')::bigint into v_object_size
  from storage.objects o
  where o.bucket_id = 'solution-vault-books' and o.name = p_content_path;
  if v_object_size is null then
    raise exception 'That file has not been uploaded' using errcode = '22023';
  end if;
  if v_object_size <> p_file_size_bytes then
    raise exception 'Uploaded size % does not match %', v_object_size, p_file_size_bytes using errcode = '22023';
  end if;

  update public.solution_vault_books
  set previous_content_path = content_path,
      previous_sha256 = sha256,
      previous_file_size_bytes = file_size_bytes,
      previous_page_count = page_count,
      content_path = p_content_path,
      content_version = content_version + 1,
      sha256 = p_sha256,
      file_size_bytes = p_file_size_bytes,
      page_count = p_page_count,
      updated_at = now()
  where id = v_book.id
  returning * into v_book;

  return jsonb_build_object('ok', true, 'slug', v_book.slug, 'content_version', v_book.content_version,
    'content_path', v_book.content_path, 'previous_content_path', v_book.previous_content_path);
end;
$$;

-- Put the previous file back (as a new version, so positions saved on the
-- replacement are reported reset too). The current file becomes the previous.
create or replace function public.admin_restore_previous_book_file(p_book_slug text)
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

  select * into v_book from public.solution_vault_books b where b.slug = p_book_slug for update;
  if v_book.id is null or v_book.previous_content_path is null then
    raise exception 'There is no previous file to restore' using errcode = 'P0002';
  end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'solution-vault-books' and o.name = v_book.previous_content_path) then
    raise exception 'The previous file is no longer stored' using errcode = 'P0002';
  end if;

  update public.solution_vault_books
  set content_path = v_book.previous_content_path,
      sha256 = v_book.previous_sha256,
      file_size_bytes = v_book.previous_file_size_bytes,
      page_count = v_book.previous_page_count,
      previous_content_path = v_book.content_path,
      previous_sha256 = v_book.sha256,
      previous_file_size_bytes = v_book.file_size_bytes,
      previous_page_count = v_book.page_count,
      content_version = v_book.content_version + 1,
      updated_at = now()
  where id = v_book.id
  returning * into v_book;

  return jsonb_build_object('ok', true, 'slug', v_book.slug, 'content_version', v_book.content_version,
    'content_path', v_book.content_path);
end;
$$;

revoke all on function public.admin_update_book_details(text, text, text, text, boolean, text) from public, anon;
revoke all on function public.admin_replace_book_file(text, text, text, bigint, integer) from public, anon;
revoke all on function public.admin_restore_previous_book_file(text) from public, anon;
grant execute on function public.admin_update_book_details(text, text, text, text, boolean, text) to authenticated;
grant execute on function public.admin_replace_book_file(text, text, text, bigint, integer) to authenticated;
grant execute on function public.admin_restore_previous_book_file(text) to authenticated;
