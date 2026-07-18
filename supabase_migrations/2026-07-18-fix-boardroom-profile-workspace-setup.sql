-- Avoid a PL/pgSQL name collision when attaching profiles to Boardroom workspaces.

create or replace function public.boardroom_ensure_workspace()
returns setof public.boardroom_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_workspace_id uuid;
  workspace_name text;
  profile_name text;
begin
  if current_user_id is null or not public.boardroom_has_access() then
    raise exception 'AI Boardroom access required';
  end if;

  select coalesce(nullif(trim(u.name), ''), split_part(u.email, '@', 1), '')
    into profile_name
  from public.users u
  where u.auth_id = current_user_id;

  if not exists (
    select 1 from public.boardroom_workspace_members wm where wm.user_id = current_user_id
  ) then
    workspace_name := coalesce(nullif(profile_name, ''), 'My') || ' Boardroom';

    insert into public.boardroom_workspaces (name, slug, owner_user_id)
    values (
      workspace_name,
      'boardroom-' || replace(current_user_id::text, '-', ''),
      current_user_id
    ) returning id into created_workspace_id;

    insert into public.boardroom_workspace_members (workspace_id, user_id, role)
    values (created_workspace_id, current_user_id, 'owner');

    insert into public.boardroom_workspace_settings (workspace_id)
    values (created_workspace_id);
  end if;

  insert into public.boardroom_profiles (workspace_id, preferred_name)
  select wm.workspace_id, coalesce(profile_name, '')
  from public.boardroom_workspace_members wm
  where wm.user_id = current_user_id
  on conflict (workspace_id) do nothing;

  return query
  select w.*
  from public.boardroom_workspaces w
  join public.boardroom_workspace_members wm on wm.workspace_id = w.id
  where wm.user_id = current_user_id
  order by w.created_at;
end;
$$;

revoke all on function public.boardroom_ensure_workspace() from public, anon;
grant execute on function public.boardroom_ensure_workspace() to authenticated;
