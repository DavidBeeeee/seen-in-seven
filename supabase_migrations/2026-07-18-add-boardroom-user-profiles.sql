-- Each Boardroom workspace has one private CEO profile. The advisors receive
-- this profile as verified context before documents, memory, and chat history.

create table public.boardroom_profiles (
  workspace_id uuid primary key references public.boardroom_workspaces(id) on delete cascade,
  preferred_name text not null default '',
  role_title text not null default '',
  business_name text not null default '',
  business_description text not null default '',
  ideal_customer text not null default '',
  offers text not null default '',
  current_goals text not null default '',
  constraints text not null default '',
  additional_context text not null default '',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger boardroom_touch_profiles
before update on public.boardroom_profiles
for each row execute function public.boardroom_touch_updated_at();

alter table public.boardroom_profiles enable row level security;

create policy boardroom_members_read_profiles on public.boardroom_profiles
for select to authenticated using (public.boardroom_is_workspace_member(workspace_id));

create policy boardroom_owners_insert_profiles on public.boardroom_profiles
for insert to authenticated with check (
  public.boardroom_is_workspace_member(workspace_id)
  and exists (
    select 1 from public.boardroom_workspace_members wm
    where wm.workspace_id = boardroom_profiles.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  )
);

create policy boardroom_owners_update_profiles on public.boardroom_profiles
for update to authenticated
using (
  public.boardroom_is_workspace_member(workspace_id)
  and exists (
    select 1 from public.boardroom_workspace_members wm
    where wm.workspace_id = boardroom_profiles.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  )
)
with check (
  public.boardroom_is_workspace_member(workspace_id)
  and exists (
    select 1 from public.boardroom_workspace_members wm
    where wm.workspace_id = boardroom_profiles.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  )
);

grant select, insert, update on public.boardroom_profiles to authenticated;
revoke all on public.boardroom_profiles from anon;

-- Create a starter profile for every existing workspace from its owner account.
insert into public.boardroom_profiles (workspace_id, preferred_name)
select
  w.id,
  coalesce(nullif(trim(u.name), ''), split_part(u.email, '@', 1), '')
from public.boardroom_workspaces w
left join public.users u on u.auth_id = w.owner_user_id
on conflict (workspace_id) do nothing;

-- Preserve David's current behavior while making every prompt profile-driven.
update public.boardroom_profiles p
set
  preferred_name = 'David',
  role_title = 'Founder',
  business_name = 'Colorado Mastermind',
  business_description = 'David Bee is building Colorado Mastermind and its connected offers, including SeenInSeven, the 777 Challenge, and AI-powered business tools.',
  ideal_customer = 'First-time entrepreneurs and business owners who need practical help with content, visibility, technology, and implementation.',
  current_goals = 'Grow recurring revenue, launch the 777 Challenge, improve the Studio apps, and build a sustainable business.',
  constraints = 'Solo operator. Plans should account for available time, cash flow, and delivery capacity.',
  onboarding_complete = true,
  updated_at = now()
from public.boardroom_workspaces w
join public.users u on u.auth_id = w.owner_user_id
where p.workspace_id = w.id
  and lower(u.email) = 'email@davidbee.me';

-- New entitled users receive a private workspace and starter profile together.
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

-- Add profile completion to the existing activity summary without exposing the
-- full private profile to the Studio-wide overview.
drop function public.admin_get_boardroom_activity();

create function public.admin_get_boardroom_activity()
returns table (
  user_id uuid,
  workspace_id uuid,
  workspace_name text,
  conversations bigint,
  messages bigint,
  documents bigint,
  active_cards bigint,
  completed_cards bigint,
  last_active timestamptz,
  profile_name text,
  profile_complete boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = auth.uid() and coalesce(u.is_admin, false)
  ) then
    raise exception 'Admin access required';
  end if;

  return query
  select
    u.id,
    w.id,
    w.name,
    (select count(*) from public.boardroom_conversations c where c.workspace_id = w.id),
    (select count(*) from public.boardroom_messages m where m.workspace_id = w.id),
    (select count(*) from public.boardroom_documents d where d.workspace_id = w.id),
    (select count(*) from public.boardroom_advisor_cards ac where ac.workspace_id = w.id and ac.status in ('suggested', 'active')),
    (select count(*) from public.boardroom_advisor_cards ac where ac.workspace_id = w.id and ac.status = 'done'),
    greatest(
      w.updated_at,
      coalesce((select max(c.updated_at) from public.boardroom_conversations c where c.workspace_id = w.id), w.updated_at),
      coalesce((select max(m.created_at) from public.boardroom_messages m where m.workspace_id = w.id), w.updated_at)
    ),
    p.preferred_name,
    coalesce(p.onboarding_complete, false)
  from public.users u
  left join public.boardroom_workspace_members wm on wm.user_id = u.auth_id
  left join public.boardroom_workspaces w on w.id = wm.workspace_id
  left join public.boardroom_profiles p on p.workspace_id = w.id
  where w.id is not null
     or exists (
       select 1 from public.studio_entitlements e
       where e.user_id = u.id and e.app_key = 'boardroom'
     )
  order by 9 desc nulls last;
end;
$$;

revoke all on function public.boardroom_ensure_workspace() from public, anon;
revoke all on function public.admin_get_boardroom_activity() from public, anon;
grant execute on function public.boardroom_ensure_workspace() to authenticated;
grant execute on function public.admin_get_boardroom_activity() to authenticated;
