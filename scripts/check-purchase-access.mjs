import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('js/app.js');
const admin = read('admin-seeninseven.html');
const migration = read('supabase_migrations/2026-08-09-fix-seen-in-seven-purchase-access.sql');
const commerceRepair = read('supabase_migrations/2026-09-14-route-current-systeme-products-and-fail-unmapped-sales.sql');

assert.match(
  app,
  /emailCheck\.has_level \|\| emailCheck\.has_access/,
  'A newly entitled buyer can still be rejected for not having a challenge level.'
);
assert.match(
  app,
  /await sendMagicLink\(email\)/,
  'The access bridge reports success without verifying that the sign-in link request succeeded.'
);
assert.match(
  migration,
  /'has_access', exists \([\s\S]*e\.app_key = 'seeninseven'[\s\S]*e\.status = 'active'/,
  'The pre-auth check does not derive SeenInSeven access from an active entitlement.'
);
assert.match(
  migration,
  /revoke all on function public\.check_email_exists\(text\) from public/,
  'The purchase-access RPC still has an uncontrolled PUBLIC execute grant.'
);
assert.match(
  admin,
  /function isSeenInSevenPaid\(r\)[\s\S]*access\.access_source !== 'systeme'/,
  'The SeenInSeven admin does not use the Systeme entitlement as payment truth.'
);

assert.match(
  commerceRepair,
  /\(3376492, 'seeninseven_retail', array\['seeninseven'\], true\)/,
  'The current $297 SeenInSeven plan is not routed to SeenInSeven.'
);
assert.match(
  commerceRepair,
  /\(3424955, 'momentum_hub', array\['eee', 'boardroom'\], true\)/,
  'The current Momentum Hub plan is not routed to both Hub applications.'
);
assert.match(
  commerceRepair,
  /set status = 'failed'[\s\S]*'unmapped_price_plan'/,
  'An unmapped paid sale can still disappear as an ordinary ignored event.'
);
assert.match(
  commerceRepair,
  /if prior_status = 'processed' then[\s\S]*'duplicate'/,
  'Webhook retries cannot distinguish an already delivered sale from a repairable failure.'
);

console.log('Purchase-to-access checks passed for current routing, repairable retries, loud failures, entitlement sign-in, and admin payment truth.');
