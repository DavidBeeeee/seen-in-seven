-- Private WorkerBee Studio state. Browser clients never access these tables directly.
-- The Vercel API verifies David's admin session or the server-only WorkerBee secret.

create table if not exists public.workerbee_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workerbee_tasks (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.workerbee_sections(id),
  title text not null check (char_length(btrim(title)) between 1 and 500),
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'waiting', 'parked', 'done')),
  owner text,
  due_date date,
  follow_up_date date,
  work_area text,
  source_url text,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workerbee_updates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('outcome', 'needs_david', 'completed', 'commitment', 'blocker', 'summary')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  body text not null default '',
  status text not null default 'active' check (status in ('active', 'acknowledged', 'approved', 'rejected', 'deferred', 'completed', 'blocked')),
  action_id text,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workerbee_journal (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  category text not null default 'reflection' check (category in ('reflection', 'question', 'opinion', 'correction', 'like', 'dislike', 'taste', 'humor', 'interest', 'aversion', 'style', 'evolution')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  body text not null,
  fingerprint text,
  status text not null default 'current' check (status in ('current', 'resolved', 'revised', 'parked', 'superseded')),
  evidence text,
  reopening_condition text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fingerprint)
);

create table if not exists public.workerbee_read_state (
  viewer_id uuid primary key references auth.users(id) on delete cascade,
  last_dashboard_viewed_at timestamptz,
  last_todo_viewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.workerbee_change_history (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workerbee_sections_order_idx on public.workerbee_sections (archived_at, sort_order, created_at);
create index if not exists workerbee_tasks_section_order_idx on public.workerbee_tasks (section_id, deleted_at, sort_order, created_at);
create index if not exists workerbee_updates_kind_status_idx on public.workerbee_updates (kind, status, created_at desc);
create index if not exists workerbee_journal_date_idx on public.workerbee_journal (entry_date desc, created_at desc);
create index if not exists workerbee_history_entity_idx on public.workerbee_change_history (entity_type, entity_id, created_at desc);

alter table public.workerbee_sections enable row level security;
alter table public.workerbee_tasks enable row level security;
alter table public.workerbee_updates enable row level security;
alter table public.workerbee_journal enable row level security;
alter table public.workerbee_read_state enable row level security;
alter table public.workerbee_change_history enable row level security;

revoke all on table public.workerbee_sections from anon, authenticated;
revoke all on table public.workerbee_tasks from anon, authenticated;
revoke all on table public.workerbee_updates from anon, authenticated;
revoke all on table public.workerbee_journal from anon, authenticated;
revoke all on table public.workerbee_read_state from anon, authenticated;
revoke all on table public.workerbee_change_history from anon, authenticated;
revoke all on sequence public.workerbee_change_history_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.workerbee_sections to service_role;
grant select, insert, update, delete on table public.workerbee_tasks to service_role;
grant select, insert, update, delete on table public.workerbee_updates to service_role;
grant select, insert, update, delete on table public.workerbee_journal to service_role;
grant select, insert, update, delete on table public.workerbee_read_state to service_role;
grant select, insert on table public.workerbee_change_history to service_role;
grant usage, select on sequence public.workerbee_change_history_id_seq to service_role;

drop policy if exists workerbee_sections_deny_direct_access on public.workerbee_sections;
create policy workerbee_sections_deny_direct_access on public.workerbee_sections for all to anon, authenticated using (false) with check (false);
drop policy if exists workerbee_tasks_deny_direct_access on public.workerbee_tasks;
create policy workerbee_tasks_deny_direct_access on public.workerbee_tasks for all to anon, authenticated using (false) with check (false);
drop policy if exists workerbee_updates_deny_direct_access on public.workerbee_updates;
create policy workerbee_updates_deny_direct_access on public.workerbee_updates for all to anon, authenticated using (false) with check (false);
drop policy if exists workerbee_journal_deny_direct_access on public.workerbee_journal;
create policy workerbee_journal_deny_direct_access on public.workerbee_journal for all to anon, authenticated using (false) with check (false);
drop policy if exists workerbee_read_state_deny_direct_access on public.workerbee_read_state;
create policy workerbee_read_state_deny_direct_access on public.workerbee_read_state for all to anon, authenticated using (false) with check (false);
drop policy if exists workerbee_history_deny_direct_access on public.workerbee_change_history;
create policy workerbee_history_deny_direct_access on public.workerbee_change_history for all to anon, authenticated using (false) with check (false);

insert into public.workerbee_sections (title, sort_order)
select seed.title, seed.sort_order
from (values ('Inbox', 0), ('WorkerBee Evolution', 100), ('Clients and Coaching', 200), ('Launches and Events', 300), ('Content', 400), ('Apps', 500)) as seed(title, sort_order)
where not exists (select 1 from public.workerbee_sections);
