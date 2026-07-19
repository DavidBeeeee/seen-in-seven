alter table public.scripts
  add column if not exists final_content text,
  add column if not exists prompt_version text;

comment on column public.scripts.final_content is
  'Canonical user-facing script, including the fixed Video 1 declaration when applicable.';

comment on column public.scripts.prompt_version is
  'Short SHA-256 fingerprint of the focused system prompt used to generate this script.';
