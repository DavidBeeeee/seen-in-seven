# WBR-477 front door review (evening, WO-20261113-evening)

Reviewed 2026-11-14 by the 2026-11-13 evening run, branch
`wbr-477-latemorning-20261113` (late morning head cefe9b3).

## Verdict: ACCEPT, after one label fix made on this branch

## Signed out (walked)
- The branch served locally (the Vercel preview sits behind Vercel login).
  Header shows only the brand, the theme toggle and **Sign in**. The tab list
  is exactly **SeenInSeven**, **The Library**, **Business Cards**, in that order.
- SeenInSeven is selected first. "Start SeenInSeven" goes to `/seeninseven`,
  which opens on the guest landing ("Get Started", "Sign In"), not a sign-in wall.
- The Library lists the two books and gates reading with "Sign in to read".
- Business Cards shows the card form with consent, plus approved cards only.
  The migration lets anon and authenticated users insert only `name`,
  `what_you_do`, `link_url`, `open_to_collaborating` and `consent_given`.
  `status` defaults to `pending`, the insert policy requires `pending`,
  public select is `status = 'approved'` only, and approval is the
  `admin_set_network_directory_status` RPC gated by `vault_caller_is_admin()`.
  So a join lands as pending and stays hidden.

## Signed in (test member)
- Not walked by hand on the preview: it needs the test member's password
  typed into a non-local sign-in, which this unattended run does not do.
  `check-studio-front-door` asserts signed-in Studio parity (green below).
  The production read after merge is in the evening receipt.

## Defect found and fixed on this branch
- David, 2026-11-13: the tab's member-facing name is Business Cards. The
  front door already said Business Cards, but the standalone `/network` page
  still said "Networking Directory", "Approved directory", "networking
  directory" and "public directory". All of these now say Business Cards.
- `/network`'s "Decision-ready preview ... migration ... held unapplied"
  banner was stale once the table exists. The banner now hides when the live
  table answers, and its copy no longer talks about migrations.

## Tests
- `npm test` green on the branch after the fix, including
  `check-network-directory` and `check-studio-front-door`.
