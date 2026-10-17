-- Solution Vault: admin creating and deleting books. WBR-445, 2026-10-17.
--
-- Enables creating brand-new books from Admin > Solution Vault Books without SQL:
-- * Format can be pdf, web, or interactive.
-- * Cover is uploaded to solution-vault-covers (public bucket).
-- * For PDF books, the file is uploaded to the private bucket at <slug>/v1/
--   with SHA-256 and size verified server-side.
-- * Books are created with status = 'unpublished' so they are not immediately
--   distributed before review.
-- * Admin delete allows deleting disposable test books and cleans up storage.
-- * Every operation is admin-only (vault_caller_is_admin).

create or replace function public.admin_create_book(
  p_slug text,
  p_title text,
  p_subtitle text default null,
  p_description text default null,
  p_format text default 'pdf',
  p_cover_url text default null,
  p_content_path text default null,
  p_sha256 text default null,
  p_file_size_bytes bigint default null,
  p_page_count integer default null,
  p_download_enabled boolean default false,
  p_download_filename text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_title text := btrim(coalesce(p_title, ''));
  v_subtitle text := nullif(btrim(coalesce(p_subtitle, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_format text := lower(btrim(coalesce(p_format, 'pdf')));
  v_cover text := nullif(btrim(coalesce(p_cover_url, '')), '');
  v_cover_prefix text := 'https://zdtkwpzdwnzzmdwrvmka.supabase.co/storage/v1/object/public/solution-vault-covers/';
  v_book public.solution_vault_books;
  v_object_size bigint;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if v_slug !~ '^[a-z0-9][a-z0-9_-]*$' or length(v_slug) not between 2 and 60 then
    raise exception 'A slug of 2 to 60 lowercase letters, numbers, dashes or underscores is required' using errcode = '22023';
  end if;

  if exists (select 1 from public.solution_vault_books where slug = v_slug) then
    raise exception 'A book with slug "%" already exists', v_slug using errcode = '23505';
  end if;

  if length(v_title) not between 1 and 200 then
    raise exception 'A title of 1 to 200 characters is required' using errcode = '22023';
  end if;

  if length(coalesce(v_subtitle, '')) > 300 or length(coalesce(v_description, '')) > 1200 then
    raise exception 'Subtitle is limited to 300 characters and description to 1200' using errcode = '22023';
  end if;

  if v_format not in ('pdf', 'web', 'interactive') then
    raise exception 'Format must be pdf, web, or interactive' using errcode = '22023';
  end if;

  if v_cover is not null then
    if v_cover ~ '^/assets/[A-Za-z0-9/_.-]+\.(png|jpe?g|webp)$' then
      null;
    elsif left(v_cover, length(v_cover_prefix)) = v_cover_prefix then
      if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'solution-vault-covers'
          and o.name = substr(v_cover, length(v_cover_prefix) + 1)
          and split_part(o.name, '/', 1) = v_slug
      ) then
        raise exception 'That cover has not been uploaded for this book' using errcode = '22023';
      end if;
    else
      raise exception 'Covers must come from the Studio cover library' using errcode = '22023';
    end if;
  else
    v_cover := '/assets/eee/vault.png';
  end if;

  if v_format = 'pdf' then
    if p_content_path is null
       or split_part(p_content_path, '/', 1) <> v_slug
       or split_part(p_content_path, '/', 2) <> 'v1'
       or p_content_path !~ '^[a-z0-9_-]+/v1/[A-Za-z0-9._-]+\.pdf$' then
      raise exception 'The file must be uploaded to %/v1/', v_slug using errcode = '22023';
    end if;

    if p_sha256 !~ '^[0-9a-f]{64}$' or p_file_size_bytes is null or p_file_size_bytes < 1
       or p_page_count is null or p_page_count < 1 then
      raise exception 'Checksum, size and page count are required for PDF books' using errcode = '22023';
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
  end if;

  insert into public.solution_vault_books (
    slug, title, subtitle, description, format, status,
    cover_url, content_path, content_version, page_count, file_size_bytes, sha256,
    download_enabled, download_filename, sort_order, chapters, interactive
  )
  values (
    v_slug, v_title, v_subtitle, v_description, v_format, 'unpublished',
    v_cover,
    case when v_format = 'pdf' then p_content_path else null end,
    1,
    case when v_format = 'pdf' then p_page_count else null end,
    case when v_format = 'pdf' then p_file_size_bytes else null end,
    case when v_format = 'pdf' then p_sha256 else null end,
    coalesce(p_download_enabled, false),
    case when v_format = 'pdf' then nullif(btrim(coalesce(p_download_filename, '')), '') else null end,
    20,
    case when v_format = 'web' then '[]'::jsonb else '[]'::jsonb end,
    case when v_format = 'interactive' then jsonb_build_object('items', '[]'::jsonb, 'kicker', 'Your Digital Gift', 'heading', v_title) else null end
  )
  returning * into v_book;

  return jsonb_build_object(
    'ok', true,
    'slug', v_book.slug,
    'title', v_book.title,
    'format', v_book.format,
    'status', v_book.status,
    'cover_url', v_book.cover_url
  );
end;
$$;

create or replace function public.admin_delete_book(p_book_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_book_slug, '')));
  v_book public.solution_vault_books;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_book from public.solution_vault_books where slug = v_slug for update;
  if v_book.id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;

  if v_book.slug in ('5e-framework', 'content-lies') then
    raise exception 'Seeded production books cannot be deleted' using errcode = '22023';
  end if;

  delete from storage.objects
  where bucket_id in ('solution-vault-books', 'solution-vault-covers')
    and (name like v_book.slug || '/%' or split_part(name, '/', 1) = v_book.slug);

  delete from public.solution_vault_book_progress where book_id = v_book.id;
  delete from public.solution_vault_claim_links where book_id = v_book.id;
  delete from public.solution_vault_deliveries where book_id = v_book.id;
  delete from public.solution_vault_gift_sources where book_id = v_book.id;
  delete from public.solution_vault_book_grants where book_id = v_book.id;
  delete from public.solution_vault_books where id = v_book.id;

  return jsonb_build_object('ok', true, 'deleted_slug', v_slug);
end;
$$;

revoke all on function public.admin_create_book(text, text, text, text, text, text, text, text, bigint, integer, boolean, text) from public, anon;
revoke all on function public.admin_delete_book(text) from public, anon;
grant execute on function public.admin_create_book(text, text, text, text, text, text, text, text, bigint, integer, boolean, text) to authenticated;
grant execute on function public.admin_delete_book(text) to authenticated;
