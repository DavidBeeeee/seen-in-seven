-- StorySculpt lifecycle as server events (StorySculpt Developer 23, 25, 72).
--
-- Finishing, filming, un-filming, archiving, restoring a version and every new
-- script version used to be visible only as whatever the browser chose to log,
-- which was nothing. Since 2026-10-22 status is owned by the database
-- (2026-10-22-storysculpt-state-and-idempotency.sql), so the database can record
-- the trail itself: one public.logs row per lifecycle change, written by an
-- AFTER trigger that no client can skip or forge.
--
-- An event carries ids, states, version numbers and the version's kind from a
-- fixed vocabulary (initial, regenerated, revision, restored, promoted, hook,
-- points), never member content.

create or replace function public.storysculpt_log_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_versions integer := coalesce(jsonb_array_length(case when jsonb_typeof(old.intake->'versions') = 'array' then old.intake->'versions' end), 0);
  v_new_versions integer := coalesce(jsonb_array_length(case when jsonb_typeof(new.intake->'versions') = 'array' then new.intake->'versions' end), 0);
  v_last jsonb;
  v_note text;
  v_event text;
  v_base jsonb := jsonb_build_object(
    'schema', 1, 'side', 'server', 'projectId', new.id,
    'mode', coalesce(new.content_type, ''), 'version', new.version
  );
begin
  if new.status is distinct from old.status then
    v_event := case
      when new.status = 'finished' and old.status = 'drafting' then 'finished'
      when new.status = 'filmed' then 'filmed'
      when new.status = 'finished' and old.status = 'filmed' then 'unfilmed'
      when new.status = 'archived' then 'archived'
      when old.status = 'archived' then 'unarchived'
      when new.status = 'drafting' then 'reopened'
      else 'status_changed'
    end;
    insert into public.logs (user_id, event_type, detail)
    values (new.user_id, 'storysculpt_lifecycle',
      v_base || jsonb_build_object('event', v_event, 'from', old.status, 'to', new.status));
  end if;

  if v_new_versions > v_old_versions then
    v_last := new.intake->'versions'->(v_new_versions - 1);
    v_note := coalesce(v_last->>'note', '');
    insert into public.logs (user_id, event_type, detail)
    values (new.user_id, 'storysculpt_lifecycle',
      v_base || jsonb_build_object(
        'event', case when v_note like 'Restored from v%' then 'restored' else 'version_added' end,
        'versionNumber', v_new_versions,
        -- A fixed vocabulary, never the note itself: a revision note can be the
        -- member's own words.
        'kind', case
          when v_note like 'Initial%' then 'initial'
          when v_note like 'Regenerated%' then 'regenerated'
          when v_note like 'Restored from v%' then 'restored'
          when v_note = 'Promoted from chat' then 'promoted'
          when v_note like 'Hook updated%' then 'hook'
          when v_note = 'Bullet points' then 'points'
          else 'revision'
        end,
        'restoredFrom', case when v_note ~ '^Restored from v[0-9]+$' then substring(v_note from '[0-9]+$')::integer end
      ));
  end if;

  return null;
end;
$$;

revoke all on function public.storysculpt_log_lifecycle() from public, anon, authenticated;

drop trigger if exists storysculpt_log_lifecycle on public.storysculpt_projects;
create trigger storysculpt_log_lifecycle
  after update on public.storysculpt_projects
  for each row execute function public.storysculpt_log_lifecycle();
