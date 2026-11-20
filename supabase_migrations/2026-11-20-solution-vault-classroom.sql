-- Solution Vault: Classroom (short courses, grants, and lesson progress).
-- WBR-491, 2026-11-20.
--
-- Additive migration beside Book Shelf (solution_vault_books) and Video Room
-- (solution_vault_items). Shows only what the person has via gifted-lifetime or
-- product grants; no storefront and no locked tiles.

-- ── 1. Courses catalog ───────────────────────────────────────────────────
create table if not exists public.solution_vault_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  title text not null,
  subtitle text,
  description text,
  cover_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'retired')),
  sort_order integer not null default 10,
  lessons jsonb not null default '[]'::jsonb check (jsonb_typeof(lessons) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. Course grants ─────────────────────────────────────────────────────
create table if not exists public.solution_vault_course_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.solution_vault_courses(id) on delete restrict,
  grant_kind text not null default 'gift' check (grant_kind in ('gift', 'conditional')),
  source_kind text not null check (source_kind in ('optin', 'admin', 'product', 'test')),
  source_ref text not null check (length(source_ref) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id, source_kind, source_ref)
);

create index if not exists solution_vault_course_grants_effective_idx
  on public.solution_vault_course_grants (user_id, course_id) where status = 'active';

-- ── 3. Course lesson progress ────────────────────────────────────────────
create table if not exists public.solution_vault_course_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.solution_vault_courses(id) on delete cascade,
  last_lesson_id text check (last_lesson_id is null or length(last_lesson_id) <= 80),
  completed_lesson_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_lesson_ids) = 'array'),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

-- ── 4. Row level security and table grants ───────────────────────────────
alter table public.solution_vault_courses enable row level security;
alter table public.solution_vault_course_grants enable row level security;
alter table public.solution_vault_course_progress enable row level security;

revoke all on table public.solution_vault_courses from public, anon, authenticated;
revoke all on table public.solution_vault_course_grants from public, anon, authenticated;
revoke all on table public.solution_vault_course_progress from public, anon, authenticated;

grant select on public.solution_vault_courses to authenticated;
grant select on public.solution_vault_course_grants to authenticated;
grant select on public.solution_vault_course_progress to authenticated;

create or replace function public.member_has_course(target_user_id uuid, target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solution_vault_course_grants g
    join public.solution_vault_courses c on c.id = g.course_id
    where g.user_id = target_user_id
      and g.course_id = target_course_id
      and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
      and c.status in ('published', 'unpublished')
  );
$$;

create or replace function public.member_has_any_course(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.solution_vault_course_grants g
    join public.solution_vault_courses c on c.id = g.course_id
    where g.user_id = target_user_id
      and g.status = 'active'
      and (g.expires_at is null or g.expires_at > now())
      and c.status in ('published', 'unpublished')
  );
$$;

revoke all on function public.member_has_course(uuid, uuid) from public, anon, authenticated;
revoke all on function public.member_has_any_course(uuid) from public, anon, authenticated;

create or replace function public.has_classroom_access(target_course_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.vault_caller_is_admin()
    or exists (
      select 1 from public.solution_vault_courses c
      where c.slug = target_course_slug
        and public.member_has_course(public.vault_caller_user_id(), c.id)
    ),
    false
  );
$$;

create or replace function public.has_any_classroom_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.member_has_any_course(public.vault_caller_user_id()), false);
$$;

-- The Vault entrance: video access OR at least one book OR at least one course.
create or replace function public.has_vault_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.member_has_app(public.vault_caller_user_id(), 'vault')
    or public.member_has_any_book(public.vault_caller_user_id())
    or public.member_has_any_course(public.vault_caller_user_id()),
    false
  );
$$;

revoke all on function public.has_classroom_access(text) from public, anon;
revoke all on function public.has_any_classroom_access() from public, anon;
revoke all on function public.has_vault_access() from public, anon;
grant execute on function public.has_classroom_access(text) to authenticated;
grant execute on function public.has_any_classroom_access() to authenticated;
grant execute on function public.has_vault_access() to authenticated;

drop policy if exists vault_courses_read on public.solution_vault_courses;
create policy vault_courses_read on public.solution_vault_courses
  for select to authenticated
  using (public.has_classroom_access(slug));

drop policy if exists vault_course_grants_read on public.solution_vault_course_grants;
create policy vault_course_grants_read on public.solution_vault_course_grants
  for select to authenticated
  using (user_id = public.vault_caller_user_id() or public.vault_caller_is_admin());

drop policy if exists vault_course_progress_read on public.solution_vault_course_progress;
create policy vault_course_progress_read on public.solution_vault_course_progress
  for select to authenticated
  using (user_id = public.vault_caller_user_id() or public.vault_caller_is_admin());

-- ── 5. Member Classroom RPCs ─────────────────────────────────────────────
create or replace function public.my_classroom_courses()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.vault_caller_user_id();
  v_admin boolean := public.vault_caller_is_admin();
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', c.slug,
      'title', c.title,
      'subtitle', c.subtitle,
      'description', c.description,
      'cover_url', c.cover_url,
      'status', c.status,
      'lessons', c.lessons,
      'admin_preview', not public.member_has_course(v_user, c.id),
      'progress', case when p.user_id is null then null
        else jsonb_build_object(
          'last_lesson_id', p.last_lesson_id,
          'completed_lesson_ids', p.completed_lesson_ids,
          'completed', p.completed,
          'updated_at', p.updated_at
        ) end
    ) order by c.sort_order, c.created_at)
    from public.solution_vault_courses c
    left join public.solution_vault_course_progress p on p.course_id = c.id and p.user_id = v_user
    where public.member_has_course(v_user, c.id)
       or (v_admin and c.status <> 'retired')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_classroom_progress(
  target_course_slug text,
  target_lesson_id text default null,
  target_completed_lesson_ids jsonb default null,
  target_completed boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.vault_caller_user_id();
  v_course public.solution_vault_courses;
  v_row public.solution_vault_course_progress;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_course from public.solution_vault_courses c where c.slug = target_course_slug;
  if v_course.id is null or not public.member_has_course(v_user, v_course.id) then
    raise exception 'This course is not in your classroom' using errcode = '42501';
  end if;

  if target_lesson_id is not null and not exists (
    select 1 from jsonb_array_elements(v_course.lessons) l where l ->> 'id' = target_lesson_id
  ) then
    raise exception 'Unknown lesson' using errcode = '22023';
  end if;

  if target_completed_lesson_ids is not null and jsonb_typeof(target_completed_lesson_ids) <> 'array' then
    raise exception 'Completed lessons must be an array' using errcode = '22023';
  end if;

  insert into public.solution_vault_course_progress as p
    (user_id, course_id, last_lesson_id, completed_lesson_ids, completed, updated_at)
  values (
    v_user,
    v_course.id,
    target_lesson_id,
    coalesce(target_completed_lesson_ids, '[]'::jsonb),
    coalesce(target_completed, false),
    now()
  )
  on conflict (user_id, course_id) do update
  set last_lesson_id = coalesce(excluded.last_lesson_id, p.last_lesson_id),
      completed_lesson_ids = coalesce(target_completed_lesson_ids, p.completed_lesson_ids),
      completed = coalesce(target_completed, p.completed),
      updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'last_lesson_id', v_row.last_lesson_id,
    'completed_lesson_ids', v_row.completed_lesson_ids,
    'completed', v_row.completed,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.my_classroom_courses() from public, anon;
revoke all on function public.save_classroom_progress(text, text, jsonb, boolean) from public, anon;
grant execute on function public.my_classroom_courses() to authenticated;
grant execute on function public.save_classroom_progress(text, text, jsonb, boolean) to authenticated;

-- ── 6. Admin RPCs ────────────────────────────────────────────────────────
create or replace function public.admin_grant_classroom_course(
  p_email text,
  p_course_slug text,
  p_grant_kind text default 'gift',
  p_source_ref text default 'admin:manual',
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_course public.solution_vault_courses;
  v_user public.users;
  v_grant public.solution_vault_course_grants;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if p_grant_kind not in ('gift', 'conditional') then
    raise exception 'Grant kind must be gift or conditional' using errcode = '22023';
  end if;
  if p_grant_kind = 'conditional' and p_expires_at is null then
    raise exception 'A conditional grant needs its end date' using errcode = '22023';
  end if;

  select * into v_course from public.solution_vault_courses c where c.slug = p_course_slug;
  if v_course.id is null or v_course.status = 'retired' then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;

  insert into public.users (email) values (v_email)
  on conflict (email) do update set email = excluded.email
  returning * into v_user;

  insert into public.solution_vault_course_grants as g
    (user_id, course_id, grant_kind, source_kind, source_ref, status, expires_at)
  values (v_user.id, v_course.id, p_grant_kind, 'admin', coalesce(nullif(btrim(p_source_ref), ''), 'admin:manual'), 'active', p_expires_at)
  on conflict (user_id, course_id, source_kind, source_ref) do update
  set status = 'active', revoked_at = null, expires_at = excluded.expires_at,
      grant_kind = excluded.grant_kind, updated_at = now()
  returning * into v_grant;

  return jsonb_build_object('ok', true, 'grant_id', v_grant.id, 'user_id', v_user.id,
    'email', v_user.email, 'course_slug', v_course.slug, 'linked', v_user.auth_id is not null);
end;
$$;

create or replace function public.admin_revoke_classroom_grant(p_grant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.solution_vault_course_grants;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.solution_vault_course_grants
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_grant_id and status = 'active'
  returning * into v_grant;

  if v_grant.id is null then
    raise exception 'No active grant with that id' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'grant_id', v_grant.id,
    'still_has_course', public.member_has_course(v_grant.user_id, v_grant.course_id));
end;
$$;

create or replace function public.admin_set_classroom_status(p_course_slug text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.solution_vault_courses;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'published', 'unpublished', 'retired') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;

  update public.solution_vault_courses
  set status = p_status, updated_at = now()
  where slug = p_course_slug
  returning * into v_course;

  if v_course.id is null then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'slug', v_course.slug, 'status', v_course.status);
end;
$$;

revoke all on function public.admin_grant_classroom_course(text, text, text, text, timestamptz) from public, anon;
revoke all on function public.admin_revoke_classroom_grant(uuid) from public, anon;
revoke all on function public.admin_set_classroom_status(text, text) from public, anon;
grant execute on function public.admin_grant_classroom_course(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_revoke_classroom_grant(uuid) to authenticated;
grant execute on function public.admin_set_classroom_status(text, text) to authenticated;

-- ── 7. Seed free Classroom courses & free Book Shelf titles ──────────────
insert into public.solution_vault_courses (slug, title, subtitle, description, status, sort_order, lessons)
values
  (
    'welcome-package',
    'Welcome Package!',
    'Digital Guide, Course, and Action Steps',
    'Your starting walkthrough from Colorado Mastermind: clarify what you are building, pick one concrete next step, and get moving.',
    'published',
    10,
    '[
      {"id": "lesson-1", "module": "Getting Started", "title": "Welcome and How to Use This Course", "format": "text", "body": "Welcome to your Classroom. Each lesson here builds on the one before it, and your place is saved automatically whenever you move forward.\n\nStart by naming the single project or business goal you want traction on this month. Keep it small enough to finish."},
      {"id": "lesson-2", "module": "Getting Started", "title": "Pick One Clear Problem to Solve", "format": "text", "body": "Most people stall because they try to fix five things at once. Write down the one bottleneck in front of your business right now.\n\nAsk yourself: if this single thing worked smoothly by Friday, what else would become easier?"},
      {"id": "lesson-3", "module": "Action Steps", "title": "Map Your First Offer or Next Step", "format": "text", "body": "Do not build a complicated funnel before someone says yes to the simple version. Write one plain sentence describing who you help and what changes for them."},
      {"id": "lesson-4", "module": "Action Steps", "title": "Ship One Imperfect Piece Today", "format": "text", "body": "Momentum comes from publishing, not polishing. Share one post, send one invite, or record one short video today."},
      {"id": "lesson-5", "module": "Next", "title": "Where to Go Next in the Studio", "format": "text", "body": "You now have the baseline rhythm. Open Book Shelf for your guides, Video Room for speaker sessions, or StorySculpt when you are ready to draft your next video."}
    ]'::jsonb
  ),
  (
    'ez-8-steps',
    'The EZ 8 Steps to Start Your Company',
    'Complete with links and shortcuts',
    'A practical 8-step checklist for getting a new company off the ground without overcomplicating the setup.',
    'published',
    20,
    '[
      {"id": "lesson-1", "module": "Digital Guide", "title": "The 8 Steps Checklist", "format": "text", "body": "1. Validate the core problem before registering extras.\n2. Pick a clean business name and domain.\n3. Register your entity with your state.\n4. Get your free federal EIN from IRS.gov.\n5. Open a dedicated business bank account.\n6. Set up simple bookkeeping from day one.\n7. Build one clear offer and a way to collect payment.\n8. Talk to real prospects before buying complex software."}
    ]'::jsonb
  ),
  (
    'idkwtf-media-kit',
    'IDKWTF Media Kit',
    'Podcast guest and speaking overview',
    'Background, topics, and booking overview for podcast appearances and speaking events.',
    'published',
    30,
    '[
      {"id": "lesson-1", "module": "Media Kit", "title": "Speaker Bio and Topics", "format": "text", "body": "David Bee helps creators, coaches, and solopreneurs turn scattered ideas into clear offers, consistent content, and working systems.\n\nCore topics: overcoming perfectionism, building momentum in small steps, and using practical AI tools without losing your voice."}
    ]'::jsonb
  )
on conflict (slug) do nothing;

-- Seed free Book Shelf titles from /tools and Drive as web books (safe, zero-PII, no unuploaded storage path required)
insert into public.solution_vault_books (slug, title, subtitle, description, format, status, sort_order, chapters)
values
  (
    'mastermind-action-document',
    'Mastermind Action Document',
    'Round Table Action Sheet',
    'The one-page Colorado Mastermind worksheet for clarifying what you are working on, what is going well, and your top three actionable steps.',
    'web',
    'published',
    30,
    '[
      {"id": "round-table", "title": "Round Table Mastermind", "body": "What are you working on?\n1. List item #1\n2. List item #2\n3. List item #3\n\nWhat is going well for you?\n1. List item #1\n2. List item #2\n3. List item #3\n\nWhat do you need help with?\n1. List item #1\n2. List item #2\n3. List item #3"},
      {"id": "action-steps", "title": "Actionable Steps", "body": "1. Most Important: Write the single step that moves the needle most this week.\n2. Easiest To Accomplish: Write the quick win you can finish today.\n3. Optional or Test Action: Write one experiment worth trying.\n\nNew Resources and Follow-ups:\nTrack any introductions, tools, or next conversations from the table."}
    ]'::jsonb
  ),
  (
    'idk-wtf-im-doing',
    'IDK WTF I''m Doing... And It''s Okay!',
    '4 Steps Taking You From Overwhelm Into Action',
    'A practical 4-step guide to admitting you do not have it all figured out, dropping perfectionism, asking better questions, and finding a supportive community.',
    'web',
    'published',
    40,
    '[
      {"id": "step-1", "title": "Step 1: Admit IDK WTF I''m Doing", "body": "The only real issue is pretending we know what we are doing when we do not. Admitting you are figuring it out removes denial and gives you space to grow.\n\nAction Items:\n1. Tell yourself: okay, I have no idea what I am doing.\n2. Mentally prepare for mistakes.\n3. Commit to not giving up."},
      {"id": "step-2", "title": "Step 2: Forgiveness and Self Love", "body": "Negative self-talk fuels perfectionism and anxiety. Treat yourself with the same patience you would offer a close friend.\n\nAction Items:\n1. Write down one win, one struggle, and one thing you are grateful for today.\n2. Make reflection a daily habit."},
      {"id": "step-3", "title": "Step 3: Ask Yourself Questions", "body": "When you hit a roadblock, write down what you are working on, what is going well, and what you need help with. Then check what tools, trainings, or people you already have around you."},
      {"id": "step-4", "title": "Step 4: Find a Supportive Community", "body": "Entrepreneurship is isolating when you try to do it alone. Put yourself out there, expect to be bad at first, and surround yourself with people building alongside you."}
    ]'::jsonb
  )
on conflict (slug) do nothing;

-- Grant the test member the free Welcome Package course and free books so end-to-end verification works immediately after apply
insert into public.solution_vault_course_grants (user_id, course_id, grant_kind, source_kind, source_ref, status)
select u.id, c.id, 'gift', 'test', 'test:classroom-seed', 'active'
from public.users u
join public.solution_vault_courses c on c.slug = 'welcome-package'
where u.email = 'momentum-hub-test@ancientcosmic.com'
on conflict (user_id, course_id, source_kind, source_ref) do nothing;

insert into public.solution_vault_book_grants (user_id, book_id, grant_kind, source_kind, source_ref, status)
select u.id, b.id, 'gift', 'test', 'test:library-free-seed', 'active'
from public.users u
join public.solution_vault_books b on b.slug in ('mastermind-action-document', 'idk-wtf-im-doing')
where u.email = 'momentum-hub-test@ancientcosmic.com'
on conflict (user_id, book_id, source_kind, source_ref) do nothing;
