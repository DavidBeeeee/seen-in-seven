// Double-submit proof for the Navigator move write. WBR-005
// (300 Developer B#20, C#22, D#33).
//
// The guarantee is: a resubmitted move writes exactly one navigator_moves row.
// It rests on two things that must agree - the client reusing one idempotency
// key across a retry, and the database's (user_id, idempotency_key) unique index
// turning the second write into a no-op. This harness imports the real write
// helper from js/navigator-moves-store.mjs and runs it against a mock Supabase
// client that enforces that index exactly as Postgres does (NULL keys distinct,
// non-NULL keys unique per user, upsert-ignoreDuplicates => ON CONFLICT DO
// NOTHING). If the client's save logic and the migration's index ever drift
// apart, this goes red.

import assert from 'node:assert/strict';
import { newIdempotencyKey, buildMoveRow, saveMove } from '../js/navigator-moves-store.mjs';

// A minimal navigator_moves table with the migration's unique index on
// (user_id, idempotency_key), NULLs distinct. Supports the two calls the store
// makes: .insert(row) and .upsert(row, { onConflict, ignoreDuplicates }).
function mockSupabase() {
  const rows = [];
  const key = (r) => `${r.user_id}::${r.idempotency_key}`;
  const collides = (r) => r.idempotency_key != null && rows.some((x) => key(x) === key(r));
  return {
    rows,
    from(table) {
      assert.equal(table, 'navigator_moves', 'the store writes to navigator_moves');
      return {
        insert(row) {
          if (collides(row)) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
          rows.push({ ...row });
          return Promise.resolve({ data: [row], error: null });
        },
        upsert(row, options = {}) {
          assert.equal(options.onConflict, 'user_id,idempotency_key', 'upsert must target the idempotency index');
          assert.equal(options.ignoreDuplicates, true, 'a resubmit must be ignored, not overwrite');
          if (collides(row)) return Promise.resolve({ data: [], error: null }); // ON CONFLICT DO NOTHING
          rows.push({ ...row });
          return Promise.resolve({ data: [row], error: null });
        }
      };
    }
  };
}

const profileId = '8e020315-fb3a-4415-9bff-c7b168e02646';
const input = { objective: 'Ship the welcome email', current_reality: 'Draft exists', blocker: 'Second-guessing', available_time: '20 minutes', deadline: '' };
const result = { next_action: 'Send the welcome email to the five-person test list.', first_15_minutes: 'Open the draft, fix the subject line, add the five addresses.', done_when: 'The email is sent to the test list.', why_this_now: 'A real send beats another read-through.', source: 'generated' };

// Case 1: the same submission submitted twice (one reused key) writes one row.
{
  const sb = mockSupabase();
  const theKey = newIdempotencyKey();
  const row = buildMoveRow({ profileId, input, result, idempotencyKey: theKey });
  const first = await saveMove(sb, row);
  const second = await saveMove(sb, { ...row });
  assert.equal(first.error, null, 'the first write succeeds');
  assert.equal(second.error, null, 'the resubmit is a clean no-op, not an error');
  assert.equal(sb.rows.length, 1, 'a double submit writes exactly one row');
}

// Case 2: two genuinely different submissions (two keys) write two rows, so the
// guard dedupes resubmits without swallowing real new moves.
{
  const sb = mockSupabase();
  await saveMove(sb, buildMoveRow({ profileId, input, result, idempotencyKey: newIdempotencyKey() }));
  await saveMove(sb, buildMoveRow({ profileId, input, result, idempotencyKey: newIdempotencyKey() }));
  assert.equal(sb.rows.length, 2, 'distinct submissions each write their own row');
}

// Case 3: keys are unique per call, so two submissions never accidentally collide.
{
  const seen = new Set();
  for (let i = 0; i < 1000; i += 1) seen.add(newIdempotencyKey());
  assert.equal(seen.size, 1000, 'idempotency keys do not collide across submissions');
}

console.log('PASS: a double-submitted move writes exactly one row; distinct submissions each write one; keys are unique.');
