-- WBR-462. Generated with `supabase migration new storysculpt_archive`,
-- moved to this repository's established dated migration directory.
-- Additive only. Existing ownership + app-entitlement RLS is unchanged.
alter table public.storysculpt_projects
  add column if not exists archived boolean not null default false;
-- Rollback: revert the client first. Keep this inert column to preserve
-- members' archive choices; restoring chats uses archived=false, not deletion.
