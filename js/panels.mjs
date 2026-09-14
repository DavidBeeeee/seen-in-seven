// What each Dashboard panel contains. One place, imported by the page and read
// back by WorkerBee's own gate.
//
// WBR-337. This file exists because the panels have gone dark three times and
// each time the way it was found was David opening the page and telling me.
//
//   WBR-333  "Since your last visit" and "Needs David" filtered on card kinds
//            the publisher has never written. Both rendered an empty state
//            every day since 11 August.
//   WBR-335  A card's `updated_at` is the moment the publisher last touched
//            the row, not the moment the work finished, so ordering and any
//            "newer than" test was measuring the publish.
//   WBR-336  Every load of the page fires `mark_viewed`, so "since your last
//            visit" was consumed by the act of looking at it. Open the page
//            twice and the second is empty. A run verifying the page spent it
//            too, which is how it stayed invisible to me and not to him.
//
// Those three compound: a panel whose contents depend on a marker any load
// moves, filtered on a timestamp any publish moves, is not a panel. So the
// rule here is that **a panel's contents never depend on who has looked at
// it.** Recency is a fact about the work. "New since your last visit" is an
// emphasis on top of that, and it is allowed to be empty; the panel is not.

export const COMPLETED_WINDOW_DAYS = 14;

const CLOSED = ['rejected', 'completed', 'deferred', 'approved', 'acknowledged'];
const meta = (item) => item.metadata || {};

// When the work actually finished. `completed_at` is stamped by the publisher
// at the transition and is the only honest answer; `updated_at` is the
// fallback for rows closed before that stamp existed, and is named here rather
// than silently substituted.
export function completedAt(item) {
  return meta(item).completed_at || item.updated_at || null;
}

export function isNewSince(item, lastViewed) {
  if (!lastViewed) return true;
  return String(completedAt(item) || '') > String(lastViewed);
}

export function dashboardPanels(state, now = Date.now()) {
  const updates = state.updates || [];
  const active = updates.filter((item) => !CLOSED.includes(item.status));
  const lastViewed = state.readState && state.readState.last_dashboard_viewed_at;
  const floor = new Date(now - COMPLETED_WINDOW_DAYS * 86400000).toISOString();

  const completed = updates
    .filter((item) => item.status === 'completed' && String(completedAt(item) || '') >= floor)
    .sort((a, b) => String(completedAt(b)).localeCompare(String(completedAt(a))))
    .slice(0, 8);

  return {
    // Board work that is David's. Transcript commitments are excluded because
    // they have their own panel and would otherwise be counted twice.
    needs: active.filter((item) => item.kind === 'needs_david'
      || (meta(item).owner === 'david' && meta(item).source !== 'commitment')),
    completed,
    newCount: completed.filter((item) => isNewSince(item, lastViewed)).length,
    commitments: active.filter((item) => ['commitment', 'blocker'].includes(item.kind)
      && meta(item).source === 'commitment').slice(0, 10),
    diagnostics: active.filter((item) => item.kind === 'diagnostic').slice(0, 10),
  };
}

// The panels that must never be empty while the Board holds work, and what an
// empty one would mean. `check-board-visible.mjs` fetches this file and the
// payload from production and fails on any of them, so the next time one goes
// dark a gate goes red rather than David opening the page and finding it.
// The whole board: every active roadmap and execution-queue card. This is what
// the /todo page renders, exported here so the page and the gate that checks it
// read one definition and cannot drift (WBR-337's rule, WBR-338's near miss).
export function boardCards(state) {
  return (state.updates || []).filter((item) => item.kind === 'commitment'
    && item.status === 'active'
    && ['execution-queue', 'roadmap'].includes((item.metadata || {}).source));
}

export const MUST_NOT_BE_EMPTY = [
  ['boardCards', 'the whole-board todo page would render nothing, though the Board holds active roadmap and queue items'],

  ['completed', 'no work has been recorded as finished in the last fortnight, on a board that closes items most nights'],
  ['commitments', 'no dated commitment or blocker is published, though the commitment record holds active rows'],
  ['diagnostics', 'no defect or friction is published, though the Board holds open diagnostics'],
];
