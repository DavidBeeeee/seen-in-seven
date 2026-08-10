import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('js/app.js');
const admin = read('admin-seeninseven.html');
const migration = read('supabase_migrations/2026-08-09-fix-seen-in-seven-purchase-access.sql');

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

console.log('Purchase-to-access checks passed for entitlement sign-in, delivery errors, and admin payment truth.');
