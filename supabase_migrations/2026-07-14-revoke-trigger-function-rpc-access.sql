-- prevent_privilege_self_escalation and set_script_version are trigger-only
-- functions (invoked by Postgres via BEFORE triggers on users/scripts).
-- PostgREST exposes every public-schema function as a callable RPC by
-- default; neither of these needs to be, or should be, callable directly.
-- Revoking EXECUTE has zero effect on trigger firing, which happens
-- through a separate internal path, not the grant-checked RPC path.
revoke execute on function public.prevent_privilege_self_escalation() from public, anon, authenticated;
revoke execute on function public.set_script_version() from public, anon, authenticated;
