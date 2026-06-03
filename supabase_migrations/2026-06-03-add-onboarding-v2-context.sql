alter table public.onboarding
  add column if not exists phase2_context jsonb default '{}'::jsonb,
  add column if not exists mission_statement text,
  add column if not exists mission_generated_at timestamptz,
  add column if not exists commitment_declaration text,
  add column if not exists commitment_reasons jsonb default '[]'::jsonb;
