// Community Business Cards fields (WBR-477, David 2026-11-14): email (required,
// to David), phone, up to two more links, a social, and an optional "who you'd
// like to meet" line. Email and phone are never publicly selectable; members
// read them only through network_directory_contacts() and only when shared.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
for (const page of ['index.html', 'network.html']) {
  const html = read(page);
  const form = html.slice(html.indexOf('id="network-form"'), html.indexOf('</form>', html.indexOf('id="network-form"')));
  for (const id of ['network-email', 'network-phone', 'network-social', 'network-link-2', 'network-link-3', 'network-looking', 'network-show-contact']) {
    assert.match(form, new RegExp(`id="${id}"`), `${page} form needs #${id}`);
    assert.match(form, new RegExp(`for="${id}"`), `${page} #${id} needs a label`);
  }
  assert.match(form, /id="network-email"[^>]*required/, `${page}: email is required`);
  assert.ok(!/id="network-phone"[^>]*required/.test(form), `${page}: phone is optional`);
  assert.match(form, /Who you'd like to meet/);
}
const js = read('js/network.js');
assert.ok(!/\.select\([^)]*\b(email|phone)\b/.test(js), 'the public select must never ask for email or phone');
assert.match(js, /rpc\('network_directory_contacts'\)/);
assert.match(js, /show_contact: Boolean\(showContactInput && showContactInput\.checked\)/);
const sql = read('supabase_migrations/2026-11-14_network_directory_card_fields.sql');
assert.match(sql, /revoke select on table public\.network_directory from anon, authenticated;/);
const grant = sql.match(/grant select \(([^)]*)\)\s+on table public\.network_directory to anon, authenticated/);
assert.ok(grant && !/\bemail\b|\bphone\b|show_contact/.test(grant[1]), 'public column grant must exclude email, phone and show_contact');
assert.match(sql, /function public\.network_directory_contacts\(\)[\s\S]*auth\.uid\(\) is null[\s\S]*show_contact = true/);
assert.match(sql, /revoke all on function public\.network_directory_contacts\(\) from public, anon/);
assert.match(read('js/admin-studio.js'), /p_show_contact: values\.show_contact/);
console.log('PASS check-network-card-fields: email required, phone/links/social/who-to-meet optional, contact private to signed-in members by choice, admin edits every field.');
