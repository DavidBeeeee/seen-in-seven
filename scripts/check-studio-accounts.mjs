// Studio accounts (2026-11-17): people create their own Studio login, reset a
// forgotten password, and manage a profile. A new account carries no app
// access, and the database refuses a self-made admin or paid flag on insert.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const indexHtml = read('index.html');
const studioJs = read('js/studio.js');
const migration = read('supabase_migrations/2026-11-17-users-insert-privilege-guard.sql');

for (const [name, text] of [['index.html', indexHtml], ['js/studio.js', studioJs]]) {
  assert.doesNotMatch(text, /—/, `${name} must not contain em dashes`);
}

// Three ways in, plus reset.
const tabs = [...indexHtml.split('id="auth-tabs"')[1].split('</div>')[0].matchAll(/id="([a-z]+-tab)"/g)].map(m => m[1]);
assert.deepEqual(tabs, ['password-tab', 'magic-tab', 'signup-tab'], 'Sign in, Email link and Create account tabs, in that order');
for (const id of ['auth-name', 'auth-password-confirm', 'forgot-password', 'auth-back', 'profile-name-form', 'profile-access', 'profile-sign-out', 'settings-password-form']) {
  assert.match(indexHtml, new RegExp(`id="${id}"`), `${id} must exist`);
}
assert.match(studioJs, /auth\.signUp\(\{\s*email,\s*password,\s*options: \{ emailRedirectTo: window\.location\.origin \+ '\/', data: \{ name \} \}/, 'Sign-up sends the name as auth metadata');
assert.match(studioJs, /resetPasswordForEmail\(email, \{ redirectTo: window\.location\.origin \+ '\/\?reset=1' \}\)/, 'Reset link returns to Studio in recovery mode');
assert.match(studioJs, /event === 'PASSWORD_RECOVERY'\) pendingPasswordRecovery = true/, 'Recovery event opens the password form');
assert.match(studioJs, /!pendingPasswordRecovery && followStudioNext\(\)/, 'Recovery wins over return-to-page redirects');

// Sign-up never grants access from the client.
const signupBlock = studioJs.split("} else if (authMode === 'signup') {")[1].split("} else if (authMode === 'reset') {")[0];
assert.doesNotMatch(signupBlock, /studio_entitlements|is_paid|is_admin/, 'Sign-up must not write access or privilege');
assert.doesNotMatch(studioJs.split('async function syncSignupName')[1].split('\n}\n')[0], /is_paid|is_admin/, 'Name sync writes the name only');

// Existing address is told to sign in, not given a second account.
assert.match(studioJs, /identities\.length === 0/, 'An existing address returned without identities is treated as already registered');

// Insert-path privilege guard.
assert.match(migration, /before insert or update on public\.users/, 'Guard runs on insert as well as update');
assert.match(migration, /if tg_op = 'INSERT' then\s*new\.is_admin := false;\s*new\.is_paid := false;/, 'Non-admin inserts are forced to non-admin, unpaid');

console.log('Studio accounts check passed.');
