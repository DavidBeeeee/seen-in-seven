-- WBR-462: every StorySculpt background/profile edit is a dated version.
-- Generation reads the newest member-owned version, never browser-posted context.
create table if not exists public.storysculpt_context_versions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.storysculpt_projects(id) on delete cascade,
  scope text not null check (scope in ('project', 'profile')),
  context jsonb not null,
  created_at timestamptz not null default now(),
  constraint storysculpt_context_versions_scope_project check (
    (scope = 'project' and project_id is not null)
    or (scope = 'profile' and project_id is null)
  )
);

create index if not exists storysculpt_context_versions_latest_project
  on public.storysculpt_context_versions (project_id, scope, created_at desc, id desc);
create index if not exists storysculpt_context_versions_latest_profile
  on public.storysculpt_context_versions (user_id, scope, created_at desc, id desc)
  where project_id is null;

-- Existing rows get one initial version. This runs before the triggers exist,
-- so applying the migration does not double-write these backfilled versions.
insert into public.storysculpt_context_versions (user_id, project_id, scope, context, created_at)
select p.user_id, p.id, 'project', coalesce(to_jsonb(p.intake->>'context'), 'null'::jsonb), p.updated_at
from public.storysculpt_projects p
where not exists (
  select 1 from public.storysculpt_context_versions v
  where v.scope = 'project' and v.project_id = p.id
);

insert into public.storysculpt_context_versions (user_id, project_id, scope, context, created_at)
select m.user_id, null, 'profile', m.profile, m.updated_at
from public.storysculpt_member_context m
where not exists (
  select 1 from public.storysculpt_context_versions v
  where v.scope = 'profile' and v.user_id = m.user_id
);

create or replace function public.storysculpt_version_project_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.intake->>'context' is distinct from old.intake->>'context' then
    insert into public.storysculpt_context_versions (user_id, project_id, scope, context)
    values (new.user_id, new.id, 'project', coalesce(to_jsonb(new.intake->>'context'), 'null'::jsonb));
  end if;
  return new;
end;
$$;

create or replace function public.storysculpt_version_profile_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.profile is distinct from old.profile then
    insert into public.storysculpt_context_versions (user_id, project_id, scope, context)
    values (new.user_id, null, 'profile', new.profile);
  end if;
  return new;
end;
$$;

revoke all on function public.storysculpt_version_project_context() from public, anon;
revoke all on function public.storysculpt_version_profile_context() from public, anon;
grant execute on function public.storysculpt_version_project_context() to authenticated, service_role;
grant execute on function public.storysculpt_version_profile_context() to authenticated, service_role;

drop trigger if exists storysculpt_version_project_context on public.storysculpt_projects;
create trigger storysculpt_version_project_context
  after insert or update of intake on public.storysculpt_projects
  for each row execute function public.storysculpt_version_project_context();

drop trigger if exists storysculpt_version_profile_context on public.storysculpt_member_context;
create trigger storysculpt_version_profile_context
  after insert or update of profile on public.storysculpt_member_context
  for each row execute function public.storysculpt_version_profile_context();

alter table public.storysculpt_context_versions enable row level security;
grant select on public.storysculpt_context_versions to authenticated;
revoke insert, update, delete on public.storysculpt_context_versions from authenticated, anon;

drop policy if exists storysculpt_context_versions_member_rows on public.storysculpt_context_versions;
create policy storysculpt_context_versions_member_rows on public.storysculpt_context_versions
  for select to authenticated
  using (
    user_id in (select u.id from public.users u where u.auth_id = (select auth.uid()))
    and public.member_has_app(user_id, 'storysculpt')
  );

-- Integration read-back: run the migration through the Supabase ledger, then
-- confirm the table, both triggers and this policy exist, and confirm a member
-- can read only their own newest project/profile rows ordered created_at,id desc.
