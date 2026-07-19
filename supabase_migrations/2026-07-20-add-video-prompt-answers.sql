alter table public.onboarding
  add column if not exists video_answers jsonb not null default '{}'::jsonb;

comment on column public.onboarding.video_answers is
  'Level-keyed SeenInSeven prompt answers used for cross-device restore and admin read-only testing.';
