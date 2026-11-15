# WBR-477 signed-out front door walk, 2026-11-14 afternoon order (cloud rescue)

Run 2026-11-15 05:20Z (00:20 ET) from the cloud backstop, rescuing the missed
WO-20261114-afternoon. The order named the cefe9b3 preview. That preview is
superseded: the 11-13 evening integrated the front door and it has been live
since 48e7303. So I walked production, which is what a visitor actually gets.
Live index.html sha256 c30c243d... equals origin/main bf73f6d.

Signed out, fresh browser, desktop 1280x900 and phone 390x844 (Playwright Chromium):

- Tabs: exactly SeenInSeven, The Library, Business Cards, plus Sign in. PASS.
- SeenInSeven tab: "Start SeenInSeven" and "Terms & FAQ", no sign-in wall. PASS.
- Network label: no visible "Network" or "Networking" anywhere on /, its tabs,
  or /network (title "Community Business Cards | Colorado Mastermind Studio"). PASS.
- Library covers: both covers load (content-lies 1145x1374, 5E 1024x1536),
  object-fit contain in a 260px-tall frame, nothing cropped or broken; "Sign in
  to read" gate shown. PASS.
- Business Cards: 2 cards shown, "Add your card" present. No horizontal scroll
  at either width. No page errors.

Defects named (not fixed here, per the order):

1. Hold question, not a code defect: both public cards (David Bee, Jenn
   Shepherd) list content.coloradomastermind.com/777limited as an extra link,
   visible to any signed-out visitor. The standing hold keeps that link one
   person at a time, never public. David created and approved his own card
   live (22:18Z-22:27Z), so it may be intended; it is not recorded either way.
   The decision is David's.

npm test exit 0 on this branch (origin/main bf73f6d) with
WALK_NODE_MODULES pointing at the container's global Playwright; without that,
check-storysculpt-surface cannot find playwright-core in the cloud container
(environment, not code).
