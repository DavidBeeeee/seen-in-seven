-- WBR-005. An idempotency key on the Navigator move write.
--
-- 300 Developer B#20, C#22, D#33 scored FAIL for the same gap: the member-facing
-- insert into navigator_moves carried nothing to make a resubmit safe. A double
-- tap, a client-side retry after a flaky response, or two tabs racing the same
-- submission each wrote a second row, so the durable move history the whole
-- WBR-409 record exists to hold could silently fill with phantom duplicates. The
-- quota write was already guarded under advisory locks; the move write was not.
--
-- The fix is a per-submission key the client mints once and reuses on any retry,
-- plus a unique constraint the database enforces no matter how many times the row
-- arrives. The write path upserts on (user_id, idempotency_key) and ignores the
-- duplicate (ON CONFLICT DO NOTHING), so a resubmit lands exactly once.
--
-- The column is nullable and the index is a plain (non-partial) unique index on
-- purpose. Postgres treats NULLs as distinct in a unique index, so every historical
-- row (idempotency_key NULL) coexists freely and nothing collides; only new writes
-- carry a real key and are deduplicated on it. A partial unique index would have
-- read cleaner but cannot serve as the ON CONFLICT arbiter through PostgREST, which
-- cannot attach the matching WHERE predicate to the statement, so the write would
-- fail with "no unique constraint matching the ON CONFLICT specification." The full
-- index is the one that actually works for the upsert this guards.
alter table public.navigator_moves
  add column if not exists idempotency_key uuid;

create unique index if not exists navigator_moves_user_idempotency_idx
  on public.navigator_moves (user_id, idempotency_key);
