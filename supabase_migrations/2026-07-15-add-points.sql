-- Gamification points engine — schema + server-side computation.
--
-- Design: "derive, don't ledger." Points are a pure function over data that
-- already persists (users, onboarding, scripts, video_progress, logs,
-- preauth_events), computed identically client-side (js/points.js, instant +
-- works anonymous/offline) and here (authoritative, powers admin, tamper-
-- evident). Every rule is a boolean per subject (per video_number), so
-- delete-and-regenerate gambits earn nothing extra. Existing users get
-- retroactive points automatically the first time this runs.
--
-- Additive-only: main's production code ignores every column added here.

-- ── 1. Schema additions ─────────────────────────────────────────────────

-- Lock state previously lived only in localStorage (state.videos.locked_v*);
-- posted state is brand new. Both become video_progress columns. A video can
-- be locked before it is filmed, so status must allow null.
alter table public.video_progress alter column status drop not null;
alter table public.video_progress add column if not exists locked_at timestamptz;
alter table public.video_progress add column if not exists posted boolean not null default false;
alter table public.video_progress add column if not exists posted_at timestamptz;
alter table public.video_progress add column if not exists post_url text;

-- ── 2. Tunable rules config ─────────────────────────────────────────────
-- Single authoritative row. David tunes point values here without code
-- changes; js/points.js carries the same values baked in as the anonymous/
-- offline fallback, keyed by the same names, with a version stamp so a
-- mismatch is visible in the admin breakdown.

create table if not exists public.points_config (
  id int primary key default 1 check (id = 1),
  version int not null,
  rules jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.points_config enable row level security;

drop policy if exists points_config_public_read on public.points_config;
create policy points_config_public_read on public.points_config
  for select using (true);  -- intentionally world-readable; values are cosmetic config

insert into public.points_config (id, version, rules) values (1, 1, '{
  "onboarding_complete": 50,
  "context_tier_1": 10,
  "context_tier_2": 25,
  "context_tier_3": 50,
  "context_tier_2_at": 200,
  "context_tier_3_at": 1000,
  "audience_context": 15,
  "message_context": 15,
  "mvo_q4_answered": 20,
  "first_script_notes": 20,
  "script_generated": 25,
  "script_locked": 30,
  "video_filmed": 50,
  "video_posted": 75,
  "post_url_bonus": 25,
  "all_seven_scripts": 100,
  "sponsor_click": 15,
  "graduation_watched": 100,
  "call_scheduled": 100,
  "milestones": [50, 150, 400, 650, 950, 1250, 1600, 1935]
}'::jsonb)
on conflict (id) do nothing;

-- ── 3. Authoritative computation ────────────────────────────────────────

create or replace function public.compute_user_points(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
  b jsonb := '{}'::jsonb;
  total int := 0;
  v_level int;
  v_ctx_len int := 0;
  v_ob record;
  n int;
  pts int;
begin
  select rules into r from public.points_config where id = 1;
  if r is null then return jsonb_build_object('total', 0, 'breakdown', '{}'::jsonb, 'rules_version', 0); end if;

  -- Onboarding complete
  select level into v_level from public.users where id = p_user_id;
  if v_level is not null then
    pts := (r->>'onboarding_complete')::int;
    total := total + pts; b := b || jsonb_build_object('onboarding_complete', pts);
  end if;

  select * into v_ob from public.onboarding where user_id = p_user_id limit 1;
  if found then
    -- Starter context tiers (longest of freewrite / pasted knowledge context)
    v_ctx_len := greatest(
      coalesce(length(v_ob.topic_freewrite), 0),
      coalesce(length(v_ob.phase2_context->>'knowledgeContext'), 0)
    );
    if v_ctx_len >= (r->>'context_tier_3_at')::int then pts := (r->>'context_tier_3')::int;
    elsif v_ctx_len >= (r->>'context_tier_2_at')::int then pts := (r->>'context_tier_2')::int;
    elsif v_ctx_len > 0 then pts := (r->>'context_tier_1')::int;
    else pts := 0;
    end if;
    if pts > 0 then total := total + pts; b := b || jsonb_build_object('starter_context', pts); end if;

    -- Extended-mode fields (each persists only when genuinely answered)
    if coalesce(v_ob.phase2_context->>'audienceContext', '') <> '' then
      pts := (r->>'audience_context')::int; total := total + pts;
      b := b || jsonb_build_object('audience_context', pts);
    end if;
    if coalesce(v_ob.phase2_context->>'messageContext', '') <> '' then
      pts := (r->>'message_context')::int; total := total + pts;
      b := b || jsonb_build_object('message_context', pts);
    end if;
    -- Explicit OR (not coalesce chaining): coalesce returns the first
    -- NON-NULL value, so village_full = '' would mask a real crack_full.
    -- Must match js/points.js: _filled(village_full) || _filled(crack_full).
    if coalesce(v_ob.mvo_q4->>'village_full', '') <> ''
       or coalesce(v_ob.mvo_q4->>'crack_full', '') <> '' then
      pts := (r->>'mvo_q4_answered')::int; total := total + pts;
      b := b || jsonb_build_object('mvo_q4_answered', pts);
    end if;
    if coalesce(v_ob.phase2_context->>'firstScriptNotes', '') <> '' then
      pts := (r->>'first_script_notes')::int; total := total + pts;
      b := b || jsonb_build_object('first_script_notes', pts);
    end if;
  end if;

  -- Scripts generated (distinct videos, across levels)
  select count(distinct video_number) into n from public.scripts where user_id = p_user_id;
  if n > 0 then
    pts := n * (r->>'script_generated')::int; total := total + pts;
    b := b || jsonb_build_object('scripts_generated', jsonb_build_object('count', n, 'points', pts));
  end if;
  if n >= 7 then
    pts := (r->>'all_seven_scripts')::int; total := total + pts;
    b := b || jsonb_build_object('all_seven_scripts', pts);
  end if;

  -- First lock per video (distinct video_index with locked_at, across levels)
  select count(distinct video_index) into n from public.video_progress
    where user_id = p_user_id and locked_at is not null;
  if n > 0 then
    pts := n * (r->>'script_locked')::int; total := total + pts;
    b := b || jsonb_build_object('scripts_locked', jsonb_build_object('count', n, 'points', pts));
  end if;

  -- Filmed
  select count(distinct video_index) into n from public.video_progress
    where user_id = p_user_id and status = 'filmed';
  if n > 0 then
    pts := n * (r->>'video_filmed')::int; total := total + pts;
    b := b || jsonb_build_object('videos_filmed', jsonb_build_object('count', n, 'points', pts));
  end if;

  -- Posted (+ URL bonus)
  select count(distinct video_index) into n from public.video_progress
    where user_id = p_user_id and posted = true;
  if n > 0 then
    pts := n * (r->>'video_posted')::int; total := total + pts;
    b := b || jsonb_build_object('videos_posted', jsonb_build_object('count', n, 'points', pts));
  end if;
  select count(distinct video_index) into n from public.video_progress
    where user_id = p_user_id and coalesce(post_url, '') <> '';
  if n > 0 then
    pts := n * (r->>'post_url_bonus')::int; total := total + pts;
    b := b || jsonb_build_object('post_url_bonus', jsonb_build_object('count', n, 'points', pts));
  end if;

  -- Engagement (from logs; preauth events are attached to the user post-auth
  -- and also land in logs via the app once authenticated)
  select count(distinct detail->>'partner') into n from public.logs
    where user_id = p_user_id and event_type = 'sponsor_clicked';
  n := least(coalesce(n, 0), 2);
  if n > 0 then
    pts := n * (r->>'sponsor_click')::int; total := total + pts;
    b := b || jsonb_build_object('sponsor_clicks', jsonb_build_object('count', n, 'points', pts));
  end if;
  if exists (select 1 from public.logs where user_id = p_user_id and event_type = 'graduation_watched') then
    pts := (r->>'graduation_watched')::int; total := total + pts;
    b := b || jsonb_build_object('graduation_watched', pts);
  end if;
  if exists (select 1 from public.logs where user_id = p_user_id and event_type = 'call_scheduled') then
    pts := (r->>'call_scheduled')::int; total := total + pts;
    b := b || jsonb_build_object('call_scheduled', pts);
  end if;

  return jsonb_build_object(
    'total', total,
    'breakdown', b,
    'rules_version', (select version from public.points_config where id = 1)
  );
end;
$$;

-- Not directly callable: no grants. Reached only through the two wrappers below.
revoke execute on function public.compute_user_points(uuid) from public, anon, authenticated;

-- Signed-in self-check (client reconciles engage flags + authoritative total)
create or replace function public.get_my_points()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from public.users where auth_id = auth.uid() limit 1;
  if v_user_id is null then return jsonb_build_object('total', 0, 'breakdown', '{}'::jsonb); end if;
  return public.compute_user_points(v_user_id);
end;
$$;

revoke execute on function public.get_my_points() from public, anon;
grant execute on function public.get_my_points() to authenticated;

-- Admin: per-user totals for the workbench
create or replace function public.admin_get_points()
returns table (user_id uuid, points jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = auth.uid() and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'admin access required';
  end if;

  return query
  select u.id, public.compute_user_points(u.id)
  from public.users u;
end;
$$;

revoke execute on function public.admin_get_points() from public, anon;
grant execute on function public.admin_get_points() to authenticated;
