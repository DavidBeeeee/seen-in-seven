-- Community Business Cards show the moment they are sent (David 2026-11-14):
-- pending cards are public and render gray as "Unverified" until David
-- approves them. Hidden cards stay hidden. David deletes spam from Admin.

drop policy if exists network_directory_public_approved_read on public.network_directory;
create policy network_directory_public_approved_read on public.network_directory
  for select to anon, authenticated
  using (status in ('pending', 'approved'));

create or replace function public.network_directory_contacts()
returns table (id uuid, email text, phone text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to see contact details' using errcode = '42501';
  end if;
  return query
    select d.id, d.email, d.phone
    from public.network_directory d
    where d.status in ('pending', 'approved') and d.show_contact = true;
end;
$$;

revoke all on function public.network_directory_contacts() from public, anon;
grant execute on function public.network_directory_contacts() to authenticated;

create or replace function public.admin_delete_network_directory_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  delete from public.network_directory where id = p_entry_id;
  if not found then
    raise exception 'Directory entry not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_delete_network_directory_entry(uuid) from public, anon;
grant execute on function public.admin_delete_network_directory_entry(uuid) to authenticated;
