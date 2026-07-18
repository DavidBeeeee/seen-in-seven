-- AI Boardroom data lives in the Studio project so every app can share one
-- Supabase session. Boardroom access is enforced on every row, not only in UI.

create table public.boardroom_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.boardroom_workspace_members (
  workspace_id uuid not null references public.boardroom_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.boardroom_workspace_settings (
  workspace_id uuid primary key references public.boardroom_workspaces(id) on delete cascade,
  guardrails text not null default '',
  advisor_settings jsonb not null default '{}'::jsonb,
  fresh_start_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.boardroom_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.boardroom_workspaces(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  name text not null,
  mime_type text not null default 'text/plain',
  storage_path text not null,
  extracted_text text not null default '',
  byte_size bigint not null default 0,
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  error text not null default '',
  created_at timestamptz not null default now()
);

create table public.boardroom_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.boardroom_workspaces(id) on delete cascade,
  title text not null default 'Boardroom',
  channel text not null default 'brainstorming',
  mode jsonb not null default '{"depth":"normal","lane":"business"}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.boardroom_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.boardroom_workspaces(id) on delete cascade,
  conversation_id uuid not null references public.boardroom_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  speaker text not null default 'System',
  content text not null,
  stage text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.boardroom_advisor_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.boardroom_workspaces(id) on delete cascade,
  conversation_id uuid references public.boardroom_conversations(id) on delete set null,
  source_message_id uuid references public.boardroom_messages(id) on delete set null,
  type text not null default 'local_doc',
  work_type text not null default 'manual',
  title text not null,
  advisor text not null default 'Tony',
  priority integer not null default 3,
  status text not null default 'suggested' check (status in ('suggested', 'active', 'done', 'trash')),
  context text not null default '',
  desired_output text not null default '',
  label text not null default '',
  source_decision text not null default '',
  inputs jsonb not null default '{}'::jsonb,
  external_target text not null default '',
  artifact text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.boardroom_memory_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.boardroom_workspaces(id) on delete cascade,
  kind text not null default 'summary',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index boardroom_members_user_idx on public.boardroom_workspace_members (user_id, workspace_id);
create index boardroom_documents_workspace_idx on public.boardroom_documents (workspace_id, created_at desc);
create index boardroom_conversations_workspace_idx on public.boardroom_conversations (workspace_id, updated_at desc);
create index boardroom_messages_conversation_idx on public.boardroom_messages (workspace_id, conversation_id, created_at);
create index boardroom_cards_workspace_idx on public.boardroom_advisor_cards (workspace_id, updated_at desc);
create index boardroom_memory_workspace_idx on public.boardroom_memory_entries (workspace_id, created_at desc);

create or replace function public.boardroom_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger boardroom_touch_workspaces
before update on public.boardroom_workspaces
for each row execute function public.boardroom_touch_updated_at();

create trigger boardroom_touch_settings
before update on public.boardroom_workspace_settings
for each row execute function public.boardroom_touch_updated_at();

create trigger boardroom_touch_conversations
before update on public.boardroom_conversations
for each row execute function public.boardroom_touch_updated_at();

create trigger boardroom_touch_cards
before update on public.boardroom_advisor_cards
for each row execute function public.boardroom_touch_updated_at();

create or replace function public.boardroom_has_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    join public.studio_entitlements e on e.user_id = u.id
    where u.auth_id = (select auth.uid())
      and e.app_key = 'boardroom'
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

create or replace function public.boardroom_is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.boardroom_has_access()
    and exists (
      select 1
      from public.boardroom_workspace_members wm
      where wm.workspace_id = target_workspace
        and wm.user_id = (select auth.uid())
    );
$$;

alter table public.boardroom_workspaces enable row level security;
alter table public.boardroom_workspace_members enable row level security;
alter table public.boardroom_workspace_settings enable row level security;
alter table public.boardroom_documents enable row level security;
alter table public.boardroom_conversations enable row level security;
alter table public.boardroom_messages enable row level security;
alter table public.boardroom_advisor_cards enable row level security;
alter table public.boardroom_memory_entries enable row level security;

create policy boardroom_members_read_workspaces on public.boardroom_workspaces
for select to authenticated using (public.boardroom_is_workspace_member(id));

create policy boardroom_members_read_memberships on public.boardroom_workspace_members
for select to authenticated using (public.boardroom_is_workspace_member(workspace_id));

create policy boardroom_members_read_settings on public.boardroom_workspace_settings
for select to authenticated using (public.boardroom_is_workspace_member(workspace_id));

create policy boardroom_admins_update_settings on public.boardroom_workspace_settings
for update to authenticated
using (
  public.boardroom_is_workspace_member(workspace_id)
  and exists (
    select 1 from public.boardroom_workspace_members wm
    where wm.workspace_id = boardroom_workspace_settings.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  )
)
with check (
  public.boardroom_is_workspace_member(workspace_id)
  and exists (
    select 1 from public.boardroom_workspace_members wm
    where wm.workspace_id = boardroom_workspace_settings.workspace_id
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  )
);

create policy boardroom_members_read_documents on public.boardroom_documents
for select to authenticated using (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_insert_documents on public.boardroom_documents
for insert to authenticated with check (
  public.boardroom_is_workspace_member(workspace_id) and uploaded_by = (select auth.uid())
);
create policy boardroom_members_delete_documents on public.boardroom_documents
for delete to authenticated using (public.boardroom_is_workspace_member(workspace_id));

create policy boardroom_members_read_conversations on public.boardroom_conversations
for select to authenticated using (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_insert_conversations on public.boardroom_conversations
for insert to authenticated with check (
  public.boardroom_is_workspace_member(workspace_id) and created_by = (select auth.uid())
);
create policy boardroom_members_update_conversations on public.boardroom_conversations
for update to authenticated
using (public.boardroom_is_workspace_member(workspace_id))
with check (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_delete_conversations on public.boardroom_conversations
for delete to authenticated using (public.boardroom_is_workspace_member(workspace_id));

create policy boardroom_members_read_messages on public.boardroom_messages
for select to authenticated using (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_insert_messages on public.boardroom_messages
for insert to authenticated with check (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_delete_messages on public.boardroom_messages
for delete to authenticated using (public.boardroom_is_workspace_member(workspace_id));

create policy boardroom_members_read_cards on public.boardroom_advisor_cards
for select to authenticated using (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_insert_cards on public.boardroom_advisor_cards
for insert to authenticated with check (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_update_cards on public.boardroom_advisor_cards
for update to authenticated
using (public.boardroom_is_workspace_member(workspace_id))
with check (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_delete_cards on public.boardroom_advisor_cards
for delete to authenticated using (public.boardroom_is_workspace_member(workspace_id));

create policy boardroom_members_read_memory on public.boardroom_memory_entries
for select to authenticated using (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_insert_memory on public.boardroom_memory_entries
for insert to authenticated with check (public.boardroom_is_workspace_member(workspace_id));
create policy boardroom_members_delete_memory on public.boardroom_memory_entries
for delete to authenticated using (public.boardroom_is_workspace_member(workspace_id));

grant select on public.boardroom_workspaces, public.boardroom_workspace_members,
  public.boardroom_workspace_settings, public.boardroom_documents,
  public.boardroom_conversations, public.boardroom_messages,
  public.boardroom_advisor_cards, public.boardroom_memory_entries to authenticated;
grant insert on public.boardroom_documents, public.boardroom_conversations,
  public.boardroom_messages, public.boardroom_advisor_cards,
  public.boardroom_memory_entries to authenticated;
grant update on public.boardroom_workspace_settings, public.boardroom_conversations,
  public.boardroom_advisor_cards to authenticated;
grant delete on public.boardroom_documents, public.boardroom_conversations,
  public.boardroom_messages, public.boardroom_advisor_cards,
  public.boardroom_memory_entries to authenticated;
revoke all on public.boardroom_workspaces, public.boardroom_workspace_members,
  public.boardroom_workspace_settings, public.boardroom_documents,
  public.boardroom_conversations, public.boardroom_messages,
  public.boardroom_advisor_cards, public.boardroom_memory_entries from anon;

create or replace function public.boardroom_ensure_workspace()
returns setof public.boardroom_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  workspace_id uuid;
  workspace_name text;
begin
  if current_user_id is null or not public.boardroom_has_access() then
    raise exception 'AI Boardroom access required';
  end if;

  if not exists (
    select 1 from public.boardroom_workspace_members wm where wm.user_id = current_user_id
  ) then
    select coalesce(nullif(trim(u.name), ''), split_part(u.email, '@', 1), 'My') || ' Boardroom'
      into workspace_name
    from public.users u
    where u.auth_id = current_user_id;

    insert into public.boardroom_workspaces (name, slug, owner_user_id)
    values (
      coalesce(workspace_name, 'My Boardroom'),
      'boardroom-' || replace(current_user_id::text, '-', ''),
      current_user_id
    ) returning id into workspace_id;

    insert into public.boardroom_workspace_members (workspace_id, user_id, role)
    values (workspace_id, current_user_id, 'owner');

    insert into public.boardroom_workspace_settings (workspace_id)
    values (workspace_id);
  end if;

  return query
  select w.*
  from public.boardroom_workspaces w
  join public.boardroom_workspace_members wm on wm.workspace_id = w.id
  where wm.user_id = current_user_id
  order by w.created_at;
end;
$$;

create or replace function public.admin_get_boardroom_activity()
returns table (
  user_id uuid,
  workspace_id uuid,
  workspace_name text,
  conversations bigint,
  messages bigint,
  documents bigint,
  active_cards bigint,
  completed_cards bigint,
  last_active timestamptz
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
    )
  from public.users u
  left join public.boardroom_workspace_members wm on wm.user_id = u.auth_id
  left join public.boardroom_workspaces w on w.id = wm.workspace_id
  where w.id is not null
     or exists (
       select 1 from public.studio_entitlements e
       where e.user_id = u.id and e.app_key = 'boardroom'
     )
  order by last_active desc nulls last;
end;
$$;

revoke all on function public.boardroom_touch_updated_at() from public, anon, authenticated;
revoke all on function public.boardroom_has_access() from public, anon;
revoke all on function public.boardroom_is_workspace_member(uuid) from public, anon;
revoke all on function public.boardroom_ensure_workspace() from public, anon;
revoke all on function public.admin_get_boardroom_activity() from public, anon;
grant execute on function public.boardroom_has_access() to authenticated;
grant execute on function public.boardroom_is_workspace_member(uuid) to authenticated;
grant execute on function public.boardroom_ensure_workspace() to authenticated;
grant execute on function public.admin_get_boardroom_activity() to authenticated;

insert into storage.buckets (id, name, public)
values ('boardroom-documents', 'boardroom-documents', false)
on conflict (id) do update set public = false;

create policy boardroom_members_read_files on storage.objects
for select to authenticated using (
  bucket_id = 'boardroom-documents'
  and public.boardroom_is_workspace_member((storage.foldername(name))[1]::uuid)
);
create policy boardroom_members_upload_files on storage.objects
for insert to authenticated with check (
  bucket_id = 'boardroom-documents'
  and public.boardroom_is_workspace_member((storage.foldername(name))[1]::uuid)
);
create policy boardroom_members_update_files on storage.objects
for update to authenticated
using (
  bucket_id = 'boardroom-documents'
  and public.boardroom_is_workspace_member((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'boardroom-documents'
  and public.boardroom_is_workspace_member((storage.foldername(name))[1]::uuid)
);
create policy boardroom_members_delete_files on storage.objects
for delete to authenticated using (
  bucket_id = 'boardroom-documents'
  and public.boardroom_is_workspace_member((storage.foldername(name))[1]::uuid)
);

insert into public.studio_entitlements (user_id, app_key, status, access_source)
select u.id, 'boardroom', 'active', 'beta'
from public.users u
where lower(u.email) = 'email@davidbee.me'
on conflict (user_id, app_key) do update
set status = 'active', access_source = 'beta', updated_at = now();
