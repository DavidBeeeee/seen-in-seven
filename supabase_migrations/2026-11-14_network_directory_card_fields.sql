-- Community Business Cards: email, phone, more links, a social, and who they'd
-- like to meet (WBR-477, David 2026-11-14). Email and phone are never readable
-- by the public: anon and authenticated may select only the public columns, and
-- signed-in members read contact details through network_directory_contacts(),
-- only for approved cards whose owner chose show_contact.

create or replace function public.network_links_ok(p_links text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_links), 0) <= 2
    and not exists (
      select 1 from unnest(coalesce(p_links, '{}'::text[])) as u(link)
      where char_length(btrim(link)) not between 1 and 300 or btrim(link) !~* '^https?://'
    );
$$;

alter table public.network_directory
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists extra_links text[] not null default '{}',
  add column if not exists social_url text,
  add column if not exists looking_for text,
  add column if not exists show_contact boolean not null default false;

alter table public.network_directory
  drop constraint if exists network_directory_email_check,
  add constraint network_directory_email_check check (email is null or (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  drop constraint if exists network_directory_phone_check,
  add constraint network_directory_phone_check check (phone is null or (char_length(phone) between 7 and 40 and phone ~ '^[0-9+(). -]+$')),
  drop constraint if exists network_directory_extra_links_check,
  add constraint network_directory_extra_links_check check (public.network_links_ok(extra_links)),
  drop constraint if exists network_directory_social_check,
  add constraint network_directory_social_check check (social_url is null or (char_length(social_url) <= 300 and btrim(social_url) ~* '^https?://')),
  drop constraint if exists network_directory_looking_for_check,
  add constraint network_directory_looking_for_check check (looking_for is null or char_length(btrim(looking_for)) between 1 and 280);

revoke select on table public.network_directory from anon, authenticated;
grant select (id, name, what_you_do, link_url, extra_links, social_url, looking_for, open_to_collaborating, status, created_at, approved_at)
  on table public.network_directory to anon, authenticated;
revoke insert on table public.network_directory from anon, authenticated;
grant insert (name, what_you_do, link_url, extra_links, social_url, looking_for, email, phone, show_contact, open_to_collaborating, consent_given)
  on table public.network_directory to anon, authenticated;

drop policy if exists network_directory_public_submit on public.network_directory;
create policy network_directory_public_submit on public.network_directory
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and consent_given = true
    and email is not null
    and char_length(btrim(name)) between 1 and 120
    and char_length(btrim(what_you_do)) between 1 and 500
    and btrim(link_url) ~* '^https?://'
  );

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
    where d.status = 'approved' and d.show_contact = true;
end;
$$;

revoke all on function public.network_directory_contacts() from public, anon;
grant execute on function public.network_directory_contacts() to authenticated;

drop function if exists public.admin_update_network_directory_entry(uuid, text, text, text, boolean, text);

create or replace function public.admin_update_network_directory_entry(
  p_entry_id uuid,
  p_name text,
  p_what_you_do text,
  p_link_url text,
  p_open_to_collaborating boolean,
  p_status text,
  p_email text default null,
  p_phone text default null,
  p_extra_links text[] default '{}',
  p_social_url text default null,
  p_looking_for text default null,
  p_show_contact boolean default false
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
    raise exception 'Website must start with http:// or https://' using errcode = '22023';
  end if;

  update public.network_directory
  set
    name = v_name,
    what_you_do = v_what,
    link_url = v_link,
    open_to_collaborating = coalesce(p_open_to_collaborating, open_to_collaborating),
    status = v_status,
    email = nullif(btrim(coalesce(p_email, '')), ''),
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    extra_links = coalesce(array(select btrim(l) from unnest(coalesce(p_extra_links, '{}'::text[])) as u(l) where btrim(l) <> ''), '{}'),
    social_url = nullif(btrim(coalesce(p_social_url, '')), ''),
    looking_for = nullif(btrim(coalesce(p_looking_for, '')), ''),
    show_contact = coalesce(p_show_contact, false),
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

revoke all on function public.admin_update_network_directory_entry(uuid, text, text, text, boolean, text, text, text, text[], text, text, boolean) from public, anon;
grant execute on function public.admin_update_network_directory_entry(uuid, text, text, text, boolean, text, text, text, text[], text, text, boolean) to authenticated;
