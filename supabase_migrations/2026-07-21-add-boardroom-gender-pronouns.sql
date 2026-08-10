-- Personal profile fields collected during AI Boardroom onboarding. They stay
-- inside the private workspace profile and are used only to address the CEO
-- correctly in that workspace's advisor context.

alter table public.boardroom_profiles
  add column if not exists gender_identity text not null default '',
  add column if not exists pronouns text not null default '';
