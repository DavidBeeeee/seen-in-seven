# StorySculpt: deploy, rollback and mixed versions

WBR-458 continuation, Momentum 300 StorySculpt Developer 87, 88, 90. Each rule
below is enforced by `scripts/check-storysculpt-release.mjs`, which is part of
`npm test`. If a rule here stops being true, that check fails.

## What a deploy is

StorySculpt is three pieces that ship separately:

1. **The API**, `api/storysculpt.js` and `api/_lib/storysculpt-*.js`, deployed
   by Vercel on every push to `main`. A Vercel deployment is immutable and the
   switch to it is atomic: a request already running finishes on the deployment
   it started on, and the next request lands on the new one.
2. **The browser client**, `js/storysculpt.js`, loaded by
   `api/_hub/storysculpt.html` with a cache key (`?v=...`). A member's open tab
   keeps the old client until it reloads. **Any change to `js/storysculpt.js`
   bumps that key in the same commit**, or members keep running the old file
   from cache.
3. **The database**, `supabase_migrations/*storysculpt*.sql`, applied by hand
   through the Supabase connector and read back before the code that needs it
   is called finished.

## Interrupted deploy (Developer 87)

A request cut off mid-deploy is a request the browser sees fail. Nothing is
left half-written:

- Every interview turn carries an idempotency key. The reply is appended with
  the key, the database keeps one message per key, and a retried request with
  the same key is served the saved reply instead of generating a second one.
- Saves name the version they read (`expected_version`). A save from a tab
  that fell behind is refused with STALE_VERSION, never applied over newer work.
- A save that fails for any other reason is retried once, then kept on the
  member's device and written when the connection is back or the chat reopens.

## Rolling back a bad release (Developer 88)

1. In Vercel, promote the last good production deployment for `seen-in-seven`
   (Deployments, the deployment, Promote; or `vercel rollback` with the
   project linked). This rolls back the API and the client file together,
   because both are served by the deployment.
2. Do not roll back the database. StorySculpt migrations are additive only: they
   add tables, columns, functions and triggers, and never drop or retype a
   column in the same release, so older code keeps working against the newer
   schema. A migration that must remove something ships in a later release,
   after no deployed code reads it.
3. Stored chats written by the newer release stay readable by the older one:
   every stored field is optional to the reader, and `normalizeStoredProject`
   repairs a shape it does not expect rather than failing on it.

## Old and new side by side (Developer 90)

During a rollout an old client can talk to a new API, and after a rollback a
new client can talk to an old one. Both directions are safe because:

- The API accepts a request without any field added since launch
  (`idempotencyKey`, `target`, `regenerateNote`, `previous`, `ugc`) and ignores
  fields it does not know.
- Saves without `expected_version` still succeed; the database only refuses a
  version that is named and stale.
- Responses only ever gain fields. The client reads `content`, `final`, `title`
  and `trace` and ignores the rest, and every response names its
  `promptVersion` and `model`, so a reply can be traced to the release that
  wrote it.
