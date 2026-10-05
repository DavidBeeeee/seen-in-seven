// The Navigator move write, as one small testable unit. WBR-005
// (300 Developer B#20, C#22, D#33).
//
// js/navigator.js is a classic browser script and cannot be imported under
// node, so the part that actually needs proving - that a resubmit cannot write a
// duplicate navigator_moves row - lives here as a pure ES module. The browser
// loads it as a module that hangs these helpers on window.NavigatorMovesStore;
// the double-submit harness (scripts/check-navigator-idempotency.mjs) imports the
// same functions directly and runs them against a mock Supabase client that
// enforces the (user_id, idempotency_key) unique index the migration adds.
//
// Nothing here touches the DOM. The only environment assumption is an optional
// window to attach to, guarded so the module imports cleanly off the browser.

// A fresh key per submission attempt. crypto.randomUUID is in every browser the
// Hub supports and in node; the fallback is only for an exotic runtime without
// it and is still collision-safe enough for a per-member idempotency key.
export function newIdempotencyKey() {
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Build the durable row from the member's input, the endpoint's result, and the
// key for this submission. Kept beside saveMove so the row shape and the key are
// defined in one place rather than assembled inline in the page.
export function buildMoveRow({ profileId, input, result, idempotencyKey }) {
  return {
    user_id: profileId,
    objective: input.objective,
    current_reality: input.current_reality,
    blocker: input.blocker,
    available_time: input.available_time,
    deadline: input.deadline,
    next_action: result.next_action || '',
    first_15_minutes: result.first_15_minutes || '',
    done_when: result.done_when || '',
    why_this_now: result.why_this_now || '',
    source: result.source === 'fallback' ? 'fallback' : 'generated',
    status: 'active',
    idempotency_key: idempotencyKey
  };
}

// Save a move idempotently. Upsert on (user_id, idempotency_key) with
// ignoreDuplicates, so a resubmit of the same key is ON CONFLICT DO NOTHING at
// the database and writes nothing the second time. Returns { error } the same
// shape the caller already handles; a surfaced error is a real failure, never a
// duplicate. A row without a key (should not happen on this path) still inserts
// plainly, because NULL keys never conflict.
export async function saveMove(sb, row) {
  if (!row.idempotency_key) {
    return sb.from('navigator_moves').insert(row);
  }
  return sb.from('navigator_moves').upsert(row, {
    onConflict: 'user_id,idempotency_key',
    ignoreDuplicates: true
  });
}

if (typeof window !== 'undefined') {
  window.NavigatorMovesStore = { newIdempotencyKey, buildMoveRow, saveMove };
}
