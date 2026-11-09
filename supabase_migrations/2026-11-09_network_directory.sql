-- Colorado Mastermind Networking Directory (WBR-477, 2026-11-09)
-- Unapplied migration for decision-ready preview on branch wbr-477-agnight-20261109.
-- Stores directory submissions from Mastermind attendees. Entries remain hidden
-- from the public directory until approved by an administrator.

create table if not exists public.network_directory (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  what_you_do text not null check (char_length(btrim(what_you_do)) between 1 and 500),
  link_url text not null check (char_length(btrim(link_url)) between 1 and 300 and btrim(link_url) ~* '^https?://'),
  open_to_collaborating boolean not null default true,
  consent_given boolean not null check (consent_given = true),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists network_directory_status_created_idx
  on public.network_directory (status, created_at desc);

alter table public.network_directory enable row level security;

revoke all on table public.network_directory from public, anon, authenticated;
grant select on table public.network_directory to anon, authenticated;
grant insert (name, what_you_do, link_url, open_to_collaborating, consent_given) on table public.network_directory to anon, authenticated;

drop policy if exists network_directory_public_approved_read on public.network_directory;
create policy network_directory_public_approved_read on public.network_directory
  for select to anon, authenticated
  using (status = 'approved');

drop policy if exists network_directory_public_submit on public.network_directory;
create policy network_directory_public_submit on public.network_directory
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and consent_given = true
    and char_length(btrim(name)) between 1 and 120
    and char_length(btrim(what_you_do)) between 1 and 500
    and btrim(link_url) ~* '^https?://'
  );

create or replace function public.admin_get_network_directory()
returns setof public.network_directory
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
    select *
    from public.network_directory
    order by
      case when status = 'pending' then 0 when status = 'approved' then 1 else 2 end,
      created_at desc;
end;
$$;

revoke all on function public.admin_get_network_directory() from public, anon;
grant execute on function public.admin_get_network_directory() to authenticated;

create or replace function public.admin_set_network_directory_status(
  p_entry_id uuid,
  p_status text
)
returns public.network_directory
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_row public.network_directory;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if v_status not in ('pending', 'approved', 'hidden') then
    raise exception 'Invalid directory status' using errcode = '22023';
  end if;

  update public.network_directory
  set
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

revoke all on function public.admin_set_network_directory_status(uuid, text) from public, anon;
grant execute on function public.admin_set_network_directory_status(uuid, text) to authenticated;
