-- Community Business Cards: admin editing (WBR-477, 2026-11-14)
-- David can correct a card's name, what they do, link, collaboration answer
-- and status from Studio Admin. Admin only, through vault_caller_is_admin().

create or replace function public.admin_update_network_directory_entry(
  p_entry_id uuid,
  p_name text,
  p_what_you_do text,
  p_link_url text,
  p_open_to_collaborating boolean,
  p_status text
)
returns public.network_directory
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_what text := btrim(coalesce(p_what_you_do, ''));
  v_link text := btrim(coalesce(p_link_url, ''));
  v_row public.network_directory;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if v_status not in ('pending', 'approved', 'hidden') then
    raise exception 'Invalid directory status' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Name must be 1 to 120 characters' using errcode = '22023';
  end if;
  if char_length(v_what) not between 1 and 500 then
    raise exception 'What they do must be 1 to 500 characters' using errcode = '22023';
  end if;
  if char_length(v_link) not between 1 and 300 or v_link !~* '^https?://' then
    raise exception 'Link must start with http:// or https://' using errcode = '22023';
  end if;

  update public.network_directory
  set
    name = v_name,
    what_you_do = v_what,
    link_url = v_link,
    open_to_collaborating = coalesce(p_open_to_collaborating, open_to_collaborating),
    status = v_status,
    approved_at = case when v_status = 'approved' then coalesce(approved_at, now()) else approved_at end,
    updated_at = now()
  where id = p_entry_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Directory entry not found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_network_directory_entry(uuid, text, text, text, boolean, text) from public, anon;
grant execute on function public.admin_update_network_directory_entry(uuid, text, text, text, boolean, text) to authenticated;
