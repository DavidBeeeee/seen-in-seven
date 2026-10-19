// Next Step Navigator: the Earlier moves list and its Show all toggle.
// WO-20261018-evening (UX 71). Pure so the gate can prove one click expands the
// list: the toggle used to be bound twice (onclick and addEventListener), so a
// single click flipped it open and straight back closed.

export const HISTORY_COLLAPSED_COUNT = 10;
export const HISTORY_FETCH_LIMIT = 50;

export function historyView(prior = [], expanded = false) {
  const hasMore = prior.length > HISTORY_COLLAPSED_COUNT;
  const rows = prior.map((move, idx) => ({ move, hidden: !expanded && idx >= HISTORY_COLLAPSED_COUNT }));
  const hiddenCount = rows.filter(r => r.hidden).length;
  const label = hasMore ? (expanded ? 'Show fewer' : `Show all ${prior.length}`) : '';
  const note = `Every move you make is kept in your account. This list shows your newest ${HISTORY_FETCH_LIMIT}; older moves stay saved and are not shown here.`;
  return { rows, hasMore, hiddenCount, label, note };
}

// Binds exactly one click handler, replacing any earlier one, and returns it.
export function bindToggleOnce(button, onToggle) {
  if (!button) return null;
  const handler = () => onToggle();
  button.onclick = handler;
  return handler;
}

if (typeof window !== 'undefined') {
  window.NavigatorHistory = { HISTORY_COLLAPSED_COUNT, HISTORY_FETCH_LIMIT, historyView, bindToggleOnce };
  window.dispatchEvent(new Event('navigator-history-ready'));
}
