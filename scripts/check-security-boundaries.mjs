import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase_migrations/2026-08-09-document-private-table-boundaries.sql', import.meta.url), 'utf8');
const privateTables = [
  'api_usage',
  'preauth_events',
  'studio_access_grants',
  'systeme_product_routes',
  'systeme_webhook_config',
  'systeme_webhook_events'
];

assert.match(migration, /revoke all on table public\.preauth_events from anon, authenticated/, 'Pre-auth events retained unnecessary direct table privileges.');
for (const table of privateTables) {
  assert.match(migration, new RegExp('on public\\.' + table + ' for all to anon, authenticated'), table + ' is missing an explicit private-table policy.');
}
assert.equal((migration.match(/using \(false\) with check \(false\)/g) || []).length, privateTables.length, 'A private operational table can still accept direct client access.');

console.log('Private operational-table checks passed for explicit deny policies and pre-auth privilege removal.');
