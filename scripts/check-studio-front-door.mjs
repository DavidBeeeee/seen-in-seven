import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const indexHtml = read('index.html');
const studioJs = read('js/studio.js');
const studioCss = read('css/studio.css');
const networkJs = read('js/network.js');

// 1. Zero em dashes across front-door files
for (const [name, text] of [
  ['index.html', indexHtml],
  ['js/studio.js', studioJs],
  ['css/studio.css', studioCss],
  ['js/network.js', networkJs]
]) {
  assert.doesNotMatch(text, /\u2014/, `${name} must not contain em dashes`);
}

// 2. Structural isolation of the signed-out front door
assert.match(indexHtml, /id="studio-sidebar"[^>]*hidden/, 'Sidebar must start hidden so signed-out visitors never see member apps');
assert.match(indexHtml, /id="studio-member-view"[^>]*hidden/, 'Member workspace must start hidden before auth resolves');
assert.match(indexHtml, /id="studio-front-door"[^>]*hidden/, 'Front door starts hidden and is revealed by studio.js');

const frontDoorHtml = indexHtml.split('id="studio-front-door"')[1].split('id="studio-member-view"')[0];
const tabMatches = [...frontDoorHtml.matchAll(/data-fd-tab="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(tabMatches, ['seeninseven', 'library', 'business-cards'], 'Front door must expose exactly three tabs');
assert.match(frontDoorHtml, /<span>SeenInSeven<\/span>/);
assert.match(frontDoorHtml, /<span>The Library<\/span>/);
assert.match(frontDoorHtml, /<span>Business Cards<\/span>/);
const visibleFrontDoorText = frontDoorHtml.replace(/<[^>]+>/g, ' ');
assert.doesNotMatch(visibleFrontDoorText, /\bnetwork(?:ing)?\b/i, 'Member-facing copy must say Business Cards, never Network');

for (const hiddenRoute of ['/storysculpt', '/navigator', '/certainty', '/boardroom', '/eee', '/admin', '/dashboard', 'href="http']) {
  assert.ok(!frontDoorHtml.includes(hiddenRoute), `Front door must not include ${hiddenRoute}`);
}
assert.ok(frontDoorHtml.includes('href="/seeninseven"'), 'SeenInSeven tab links to /seeninseven guest path');
assert.ok(frontDoorHtml.includes('id="fd-library-sign-in"'), 'The Library tab includes Sign in to read button');

// 3. Behavioral walkthrough in VM: signed-out -> tabs -> Business Cards form -> signed-in
const elements = {};
function makeEl(id, init = {}) {
  const classes = new Set();
  const attrs = {};
  const listeners = {};
  const labelSpan = { textContent: init.spanText || '' };
  const el = {
    id,
    value: init.value || '',
    checked: Boolean(init.checked),
    hidden: Boolean(init.hidden),
    disabled: false,
    required: false,
    tabIndex: 0,
    textContent: init.textContent || '',
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
    querySelector: sel => sel === 'span' ? labelSpan : null,
    focus: () => {},
    reset: () => {
      elements['network-name'].value = '';
      elements['network-what'].value = '';
      elements['network-link'].value = '';
      elements['network-consent'].checked = false;
    }
  };
  if (init.errormessage) attrs['aria-errormessage'] = init.errormessage;
  if (init.fdTab) attrs['data-fd-tab'] = init.fdTab;
  elements[id] = el;
  return el;
}

for (const id of [
  'studio-sidebar', 'studio-member-view', 'studio-front-door',
  'sign-in-button', 'account-button', 'device-progress',
  'management-label', 'management-divider', 'workerbee-nav-item', 'admin-nav-item',
  'eee-card', 'vault-card', 'vault-nav-books', 'vault-nav-videos', 'vault-nav-group', 'vault-nav-link',
  'studio-app-count', 'account-email', 'menu-email', 'account-avatar', 'welcome-heading', 'welcome-copy',
  'access-notice', 'access-notice-title', 'access-notice-copy',
  'auth-modal', 'auth-close', 'auth-email', 'auth-password', 'auth-submit', 'auth-message',
  'magic-tab', 'password-tab', 'password-field', 'auth-form',
  'account-menu', 'sign-out-button', 'settings-button', 'settings-close', 'settings-modal',
  'settings-email', 'settings-password', 'settings-password-confirm', 'settings-password-submit',
  'settings-password-message', 'settings-password-form', 'theme-button',
  'fd-library-sign-in', 'seeninseven-locked-cover', 'boardroom-locked-cover', 'eee-locked-cover'
]) {
  makeEl(id, { hidden: ['studio-sidebar', 'studio-member-view', 'studio-front-door', 'account-button', 'auth-modal', 'settings-modal', 'account-menu'].includes(id) });
}

makeEl('fd-seeninseven-start', { spanText: 'Start SeenInSeven' });
makeEl('fd-tab-seeninseven', { fdTab: 'seeninseven' });
makeEl('fd-tab-library', { fdTab: 'library' });
makeEl('fd-tab-business-cards', { fdTab: 'business-cards' });
makeEl('fd-panel-seeninseven', { hidden: false });
makeEl('fd-panel-library', { hidden: true });
makeEl('fd-panel-business-cards', { hidden: true });

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
makeEl('network-directory-list');

const tablistListeners = {};
const tablistEl = {
  addEventListener: (type, fn) => { tablistListeners[type] = fn; },
  trigger: (type, ev) => { if (tablistListeners[type]) return tablistListeners[type](ev); }
};

const docClasses = new Set();
const bodyEl = {
  dataset: {},
  classList: { contains: c => c === 'studio-home' }
};
const storage = new Map();
let authCallback = null;

const sbClient = {
  auth: {
    onAuthStateChange: fn => { authCallback = fn; },
    signOut: async () => {},
    signInWithPassword: async () => ({ error: null }),
    signInWithOtp: async () => ({ error: null }),
    updateUser: async () => ({ error: null })
  },
  rpc: async name => {
    if (name === 'claim_studio_profile') return { data: { id: 'u1', email: 'member@example.com', name: 'Alex Member', is_admin: false }, error: null };
    if (name === 'has_any_book_access') return { data: false, error: null };
    return { data: null, error: null };
  },
  from: table => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: async () => ({ data: [], error: null }),
      insert: async () => ({ error: { message: 'relation does not exist' } }),
      maybeSingle: async () => {
        if (table === 'studio_catalog_settings') return { data: { catalog_mode: 'automatic' }, error: null };
        return { data: null, error: null };
      }
    };
    return chain;
  }
};

const context = vm.createContext({
  URL,
  URLSearchParams,
  console,
  setTimeout,
  clearTimeout,
  window: {
    location: { origin: 'https://studio.coloradomastermind.com', href: 'https://studio.coloradomastermind.com/', search: '', hash: '' },
    crypto: { randomUUID: () => 'fd-card-1' },
    history: { replaceState: () => {} },
    addEventListener: () => {},
    setInterval: () => 1,
    setTimeout: () => 1
  },
  document: {
    body: bodyEl,
    visibilityState: 'visible',
    documentElement: {
      classList: {
        add: c => docClasses.add(c),
        remove: c => docClasses.delete(c),
        toggle: (c, force) => {
          const next = force === undefined ? !docClasses.has(c) : Boolean(force);
          if (next) docClasses.add(c); else docClasses.delete(c);
          return next;
        },
        contains: c => docClasses.has(c)
      }
    },
    getElementById: id => elements[id] || null,
    querySelector: sel => {
      if (sel === '.front-door-tabs') return tablistEl;
      if (sel.includes('open_to_collaborating')) return { value: 'yes' };
      return null;
    },
    addEventListener: () => {}
  },
  localStorage: {
    getItem: k => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k)
  },
  supabase: { createClient: () => sbClient }
});

vm.runInContext(networkJs, context);
vm.runInContext(studioJs, context);

// Signed-out visitor sees front door in light Colorado Mastermind look, sidebar & member view hidden
assert.equal(bodyEl.dataset.auth, 'signed-out');
assert.equal(docClasses.has('studio-light'), true, 'Signed-out visitor defaults to light Colorado Mastermind look');
assert.equal(elements['studio-front-door'].hidden, false, 'Signed-out front door must be visible');
assert.equal(elements['studio-sidebar'].hidden, true, 'Sidebar must remain hidden while signed out');
assert.equal(elements['studio-member-view'].hidden, true, 'Member workspace must remain hidden while signed out');
assert.equal(elements['sign-in-button'].hidden, false, 'Sign in button must be visible while signed out');

// Tab switching works
assert.equal(elements['fd-tab-seeninseven'].getAttribute('aria-selected'), 'true');
assert.equal(elements['fd-panel-seeninseven'].hidden, false);
assert.equal(elements['fd-panel-library'].hidden, true);
assert.equal(elements['fd-panel-business-cards'].hidden, true);

tablistEl.trigger('click', { target: { closest: () => elements['fd-tab-business-cards'] } });
assert.equal(elements['fd-tab-business-cards'].getAttribute('aria-selected'), 'true');
assert.equal(elements['fd-panel-business-cards'].hidden, false);
assert.equal(elements['fd-panel-seeninseven'].hidden, true);

// Submitting Business Cards form stores pending entry and hides it from public list
elements['network-name'].value = 'Jordan Cole';
elements['network-what'].value = 'Helps founders clarify their offer.';
elements['network-link'].value = 'https://jordancole.example.com';
elements['network-consent'].checked = true;
await elements['network-form'].trigger('submit', { preventDefault() {} });
assert.equal(elements['network-form-status'].hidden, false);
assert.doesNotMatch(elements['network-directory-list'].innerHTML, /Jordan Cole/, 'Pending card must stay hidden until approved');

// Library tab + Sign in to read button opens auth modal
tablistEl.trigger('click', { target: { closest: () => elements['fd-tab-library'] } });
assert.equal(elements['fd-panel-library'].hidden, false);
elements['fd-library-sign-in'].trigger('click');
assert.equal(elements['auth-modal'].hidden, false, 'Sign in to read must open the sign-in dialog');

// Signing in restores the full Studio view and dark Studio default (since sis_theme_v1 unset)
await context.hydrateStudio({ user: { id: 'auth-1', email: 'member@example.com' } });
assert.equal(bodyEl.dataset.auth, 'signed-in');
assert.equal(elements['studio-front-door'].hidden, true, 'Front door must hide after sign-in');
assert.equal(elements['studio-sidebar'].hidden, false, 'Sidebar must appear after sign-in');
assert.equal(elements['studio-member-view'].hidden, false, 'Member workspace must appear after sign-in');
assert.equal(elements['sign-in-button'].hidden, true);
assert.equal(elements['account-button'].hidden, false);
assert.equal(docClasses.has('studio-light'), false, 'Signed-in Studio defaults back to existing dark palette when unset');

console.log('PASS check-studio-front-door: signed-out 3-tab front door, light default, Business Cards approval gating, Library sign-in, and signed-in Studio parity verified.');
