// One answer to "is this Board row open work", for every surface in this
// repository that counts it.
//
// WBR-350. On 2026-09-15 David had one list and four denominators. The audit
// said 148, the analytics snapshot said 169 because its filter only removed
// `completed` and `failed`, the publish receipt said something else again
// because its filter only removed `completed` and `already-completed`, and his
// own tab said 23, which matched none of them. His words were that the
// dashboard says one number and the audit says another and neither matches
// what he sees.
//
// The audit half was fixed that morning in WorkerBee's runtime/todo-board.mjs
// and the page half was not, which is the whole reason this file exists. The
// rule is written twice, once per repository, because a browser module cannot
// import from WorkerBee's runtime. The two copies are kept honest by
// CLOSED_STATUSES being identical in both and by check-board-counts.mjs, which
// fetches this file from production and compares it against the runtime.
//
// A surface that writes its own filter is the bug this exists to make obvious.

// Finished in the only sense that matters: nobody is going to do them.
export const CLOSED_STATUSES = ['completed', 'closed', 'dropped', 'cancelled', 'done'];

const statusOf = (item) => String((item?.metadata || {}).roadmap_status ?? item?.status ?? '');

export function isClosedWork(item) {
  return CLOSED_STATUSES.includes(statusOf(item));
}

export function isOpenWork(item) {
  return !isClosedWork(item);
}

// A practice rather than a task. It has no finish line on purpose, so it is
// read on a cadence instead of checked off.
export function isStandingWork(item) {
  return statusOf(item) === 'standing';
}

// Waiting on something or someone. Still open work, still David's to see.
export function isBlockedWork(item) {
  return statusOf(item) === 'blocked';
}

// Intentionally inactive with a named reopening condition. Added 2026-09-17
// when the WBR-371 baseline reset abolished the blocked state: nothing is
// ever blocked, so work that cannot advance now is held with its condition
// written down. Held stays open and visible — hidden is how it becomes
// never — but it is not "to do", because a thing waiting on its condition
// cannot be done as soon as possible by definition.
export function isHeldWork(item) {
  return statusOf(item) === 'held';
}

// The bands, which is the part the order asked for. Standing, blocked and
// held stay inside `open` because they are open work and hiding them is the
// undercount this board exists to stop, but they are named separately so the
// total is never an opaque number somebody has to guess the composition of.
//
// `active` is what is left: work with a finish line that nothing is holding up.
export function openWorkBands(items) {
  const all = Array.isArray(items) ? items : [];
  const open = all.filter(isOpenWork);
  const standing = open.filter(isStandingWork).length;
  const blocked = open.filter(isBlockedWork).length;
  const held = open.filter(isHeldWork).length;
  return {
    open: open.length,
    active: open.length - standing - blocked - held,
    standing,
    blocked,
    held,
    closed: all.length - open.length,
    total: all.length,
  };
}

// What a tab that shows a number owes the person reading it: the sentence that
// says which question the number answers. David's tab said 23 against 48, 14
// and 27 elsewhere and nothing on the page said what any of them counted.
export function bandLabel(bands) {
  const parts = [`${bands.active} to do`];
  if (bands.blocked) parts.push(`${bands.blocked} waiting on something`);
  if (bands.held) parts.push(`${bands.held} held`);
  if (bands.standing) parts.push(`${bands.standing} standing`);
  return `${bands.open} open: ${parts.join(', ')}.`;
}
