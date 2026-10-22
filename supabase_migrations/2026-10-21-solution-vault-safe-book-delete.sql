-- Solution Vault: safe book delete. WBR-445, 2026-10-21 (Claude section 11 review).
--
-- Found in review:
-- * Neither Vault bucket had a DELETE policy on storage.objects, so Admin's
--   "Delete book" removed the row while its storage cleanup silently removed
--   nothing (the client API returns no error when RLS matches zero objects).
-- * admin_delete_book protected only 5e-framework and content-lies. Any other
--   book, including the reader fixture and any future real gift, could be
--   hard-deleted together with every reader's grant and saved progress.
--
-- Delete is for disposable books. A book anyone holds or has read is
-- unpublished instead, which the plan already defines as the safe path.

drop policy if exists vault_book_files_admin_delete on storage.objects;
create policy vault_book_files_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'solution-vault-books' and public.vault_caller_is_admin());

drop policy if exists vault_cover_files_admin_delete on storage.objects;
create policy vault_cover_files_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'solution-vault-covers' and public.vault_caller_is_admin());

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

  if v_book.slug in ('5e-framework', 'content-lies', 'sample-web-book') then
    raise exception 'Seeded production books cannot be deleted' using errcode = '22023';
  end if;

  if exists (select 1 from public.solution_vault_book_grants where book_id = v_book.id)
     or exists (select 1 from public.solution_vault_book_progress where book_id = v_book.id)
     or exists (select 1 from public.solution_vault_deliveries where book_id = v_book.id) then
    raise exception 'This book has readers. Unpublish it instead so nobody loses their copy'
      using errcode = '22023';
  end if;

  delete from public.solution_vault_claim_links where book_id = v_book.id;
  delete from public.solution_vault_gift_sources where book_id = v_book.id;
  delete from public.solution_vault_books where id = v_book.id;

  return jsonb_build_object('ok', true, 'deleted_slug', v_slug);
end;
$$;

revoke all on function public.admin_delete_book(text) from public, anon;
grant execute on function public.admin_delete_book(text) to authenticated;
