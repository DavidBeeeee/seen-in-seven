-- Keep WorkerBee's own operational diagnostics separate from business-facing updates.
-- Applied to production as migration allow_diagnostic_update_kind (20260811141026).

alter table public.workerbee_updates
  drop constraint if exists workerbee_updates_kind_check;

alter table public.workerbee_updates
  add constraint workerbee_updates_kind_check
  check (kind in ('outcome', 'needs_david', 'completed', 'commitment', 'blocker', 'summary', 'diagnostic'));
