// Colorado Mastermind Networking Directory preview check (WBR-477, 2026-11-09)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('network.html');
const js = read('js/network.js');
const adminHtml = read('admin.html');
const adminJs = read('js/admin-studio.js');
const sql = read('supabase_migrations/2026-11-09_network_directory.sql');
const vercel = JSON.parse(read('vercel.json'));

// 1. No em dashes in copy
for (const [name, content] of [['network.html', html], ['js/network.js', js], ['migration', sql]]) {
  assert.doesNotMatch(content, /—/, `${name} must not contain em dashes`);
}

// 2. Uses hub-theme.css tokens and responsive layout
assert.match(html, /href="\/css\/hub-theme\.css"/, 'network.html must load css/hub-theme.css');
assert.match(html, /@media \(max-width: 860px\)/, 'network.html must include mobile responsive styles');

// 3. Form fields and accessibility attributes (labels, focus order, error text)
for (const [id, errId] of [
  ['network-name', 'network-name-error'],
  ['network-what', 'network-what-error'],
  ['network-link', 'network-link-error'],
  ['network-consent', 'network-consent-error']
]) {
  assert.match(html, new RegExp(`for="${id}"`), `Label must exist for ${id}`);
  assert.match(html, new RegExp(`id="${id}"`), `Input must exist for ${id}`);
  assert.match(html, new RegExp(`aria-errormessage="${errId}"`), `${id} must link to error text ${errId}`);
  assert.match(html, new RegExp(`id="${errId}"`), `Error element ${errId} must exist`);
}
assert.match(html, /name="open_to_collaborating" value="yes"/, 'Collaborating radio yes must exist');
assert.match(html, /name="open_to_collaborating" value="no"/, 'Collaborating radio no must exist');

// 4. Route rewrite in vercel.json
const rewrites = Object.fromEntries(vercel.rewrites.map(r => [r.source, r.destination]));
assert.equal(rewrites['/network'], '/network.html');
assert.equal(rewrites['/network/'], '/network.html');

// 5. Migration defines table, RLS, approved-only public read, and admin functions
assert.match(sql, /create table if not exists public\.network_directory/);
assert.match(sql, /alter table public\.network_directory enable row level security/);
assert.match(sql, /using \(status = 'approved'\)/, 'Public select policy must only show approved entries');
assert.match(sql, /create or replace function public\.admin_get_network_directory/);
assert.match(sql, /create or replace function public\.admin_set_network_directory_status/);

// 6. Admin page includes approval list
assert.match(adminHtml, /id="network-directory"/, 'admin.html must include #network-directory section');
assert.match(adminHtml, /id="network-admin-rows"/, 'admin.html must include #network-admin-rows table body');
assert.match(adminJs, /function renderNetworkDirectoryAdmin\(/, 'admin-studio.js must render networking approval list');
assert.match(adminJs, /function adminSetNetworkDirectoryStatus\(/, 'admin-studio.js must allow approving or hiding entries');

// 7. Behavioral walkthrough in VM: submit form -> thank-you shown & entry hidden -> approve -> entry shown
const elements = {};
function makeEl(id, init = {}) {
  const classes = new Set();
  const attrs = {};
  const listeners = {};
  const el = {
    id,
    value: init.value || '',
    checked: Boolean(init.checked),
    hidden: Boolean(init.hidden),
    disabled: false,
    textContent: '',
    innerHTML: '',
    className: '',
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, force) => {
        const next = force === undefined ? !classes.has(c) : Boolean(force);
        if (next) classes.add(c); else classes.delete(c);
        return next;
      },
      contains: c => classes.has(c)
    },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: k => attrs[k] || null,
    removeAttribute: k => { delete attrs[k]; },
    hasAttribute: k => Object.prototype.hasOwnProperty.call(attrs, k),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    trigger: (type, ev = {}) => { if (listeners[type]) return listeners[type](ev); },
    matches: sel => sel.includes('input') || sel.includes('textarea'),
    querySelector: () => ({ textContent: '' }),
    focus: () => {},
    reset: () => {
      elements['network-name'].value = '';
      elements['network-what'].value = '';
      elements['network-link'].value = '';
      elements['network-consent'].checked = false;
    }
  };
  if (init.errormessage) attrs['aria-errormessage'] = init.errormessage;
  elements[id] = el;
  return el;
}

makeEl('network-name', { errormessage: 'network-name-error' });
makeEl('network-what', { errormessage: 'network-what-error' });
makeEl('network-link', { errormessage: 'network-link-error' });
makeEl('network-consent', { errormessage: 'network-consent-error' });
makeEl('network-name-error');
makeEl('network-what-error');
makeEl('network-link-error');
makeEl('network-consent-error');
makeEl('network-form');
makeEl('network-submit');
makeEl('network-form-status', { hidden: true });
makeEl('network-directory-count');
makeEl('pending-count-badge');
makeEl('network-directory-list');
makeEl('network-admin-list');
makeEl('network-admin-preview', { hidden: true });
makeEl('toggle-admin-preview');
makeEl('theme-button');

const storage = new Map();
const context = vm.createContext({
  window: {
    crypto: { randomUUID: () => 'test-entry-123' },
    addEventListener: () => {}
  },
  document: {
    getElementById: id => elements[id] || null,
    querySelector: sel => {
      if (sel.includes('open_to_collaborating')) return { value: 'yes' };
      return null;
    },
    documentElement: { classList: { toggle: () => false } },
    addEventListener: () => {}
  },
  localStorage: {
    getItem: k => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => storage.set(k, String(v))
  }
});

vm.runInContext(js, context);

// Initial render has 1 seeded approved entry (David Bee)
assert.equal(elements['network-directory-count'].textContent, '1 approved');
assert.equal(elements['pending-count-badge'].textContent, '0');
assert.match(elements['network-directory-list'].innerHTML, /David Bee/);

// Scenario 1: Visitor fills the form and sees a thank-you; unapproved entry does not show
elements['network-name'].value = 'Maya Lin';
elements['network-what'].value = 'B2B podcast producer helping founders launch interview shows.';
elements['network-link'].value = 'https://mayalin.example.com';
elements['network-consent'].checked = true;

await elements['network-form'].trigger('submit', { preventDefault() {} });

assert.equal(elements['network-form-status'].hidden, false, 'Thank-you status must become visible');
assert.match(elements['network-form-status'].textContent, /Thank you, Maya Lin\. Your card is in the approval queue and stays hidden/);
assert.equal(elements['network-directory-count'].textContent, '1 approved', 'Approved count must remain 1 before approval');
assert.equal(elements['pending-count-badge'].textContent, '1', 'Pending count must increment to 1');
assert.doesNotMatch(elements['network-directory-list'].innerHTML, /Maya Lin/, 'Unapproved entry must not appear in public directory');
assert.match(elements['network-admin-list'].innerHTML, /Maya Lin \(Pending approval \(hidden\)\)/, 'Unapproved entry must appear in admin queue');

// Scenario 2: Admin approves the entry -> Approved entry shows with name, what they do, link, collaboration flag
await context.setEntryStatus('test-entry-123', 'approved');
assert.equal(elements['network-directory-count'].textContent, '2 approved', 'Approved count must become 2 after approval');
assert.equal(elements['pending-count-badge'].textContent, '0', 'Pending count must become 0 after approval');
assert.match(elements['network-directory-list'].innerHTML, /Maya Lin/, 'Approved entry name must show');
assert.match(elements['network-directory-list'].innerHTML, /B2B podcast producer helping founders launch interview shows\./, 'Approved entry bio must show');
assert.match(elements['network-directory-list'].innerHTML, /https:\/\/mayalin\.example\.com/, 'Approved entry link must show');
assert.match(elements['network-directory-list'].innerHTML, /Open to collaborating/, 'Approved entry collaboration flag must show');

console.log('PASS check-network-directory: form, accessibility, unapproved hiding, admin approval, and migration verified.');
