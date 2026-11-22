const STUDIO_SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const STUDIO_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const STUDIO_THEME_KEY = 'sis_theme_v1';
const studioSb = supabase.createClient(STUDIO_SUPABASE_URL, STUDIO_SUPABASE_KEY, window.StudioEgress ? StudioEgress.clientOptions() : undefined);

let studioSession = null;
let studioProfile = null;
let studioAccess = [];
let userHasBooks = false;
let userHasCourses = false;
let studioCatalogMode = 'automatic';
let authMode = 'password';
let pendingPasswordRecovery = new URLSearchParams(window.location.search).get('reset') === '1';
let studioAuthResolved = false;
const HAS_CACHED_SESSION = (() => {
  try {
    return Boolean(localStorage.getItem('sb-zdtkwpzdwnzzmdwrvmka-auth-token'));
  } catch (e) {
    return false;
  }
})();
const FRONT_DOOR_TABS = ['seeninseven', 'library', 'business-cards'];
let activeFrontDoorTab = 'seeninseven';
const ACCESS_APP_NAMES = { seeninseven: 'SeenInSeven', boardroom: 'AI Boardroom', eee: 'EEE Membership', storysculpt: 'StorySculpt', navigator: 'Next Step Navigator', vault: 'Solution Vault', certainty: 'Certainty Sessions' };
// Per-app Hub access (WBR-442): the Hub opens for its bundle or any one app.
const HUB_APP_KEYS = ['storysculpt', 'navigator', 'vault', 'certainty'];
const accessNoticeApp = new URLSearchParams(window.location.search).get('access');

const el = id => document.getElementById(id);
// WBR-464. Display only: shows the /cmo link in the sidebar for the CMO
// account. /api/cmo-questions enforces CMO_EMAILS on the server, so keep this
// list in step with that variable (default davidkamau.t+cmo@gmail.com).
const CMO_EMAILS = ['davidkamau.t+cmo@gmail.com'];

// Return to a Studio page after sign-in (WBR-445). A gifted book link sends a
// signed-out reader here with ?next=/vault?book=...; once they sign in they
// land in the book. Only same-site paths are kept, never another origin. The
// value lives in localStorage for 30 minutes so a magic link opened in a new
// tab still finds it.
const STUDIO_NEXT_KEY = 'studio_next_v1';
const SAFE_NEXT = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*(\?[A-Za-z0-9_=&%.-]*)?$/;

function rememberStudioNext() {
  const raw = new URLSearchParams(window.location.search).get('next');
  if (!raw) return;
  try {
    if (SAFE_NEXT.test(raw)) localStorage.setItem(STUDIO_NEXT_KEY, JSON.stringify({ path: raw, at: Date.now() }));
  } catch (e) {}
  if (window.history && window.history.replaceState) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('next');
    window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }
}

function pendingStudioNext() {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDIO_NEXT_KEY) || 'null');
    if (saved && SAFE_NEXT.test(saved.path) && Date.now() - saved.at < 30 * 60 * 1000) return saved.path;
    localStorage.removeItem(STUDIO_NEXT_KEY);
  } catch (e) {}
  return null;
}

function followStudioNext() {
  const path = pendingStudioNext();
  if (!path) return false;
  try { localStorage.removeItem(STUDIO_NEXT_KEY); } catch (e) {}
  window.location.replace(path);
  return true;
}

const STUDIO_GIFT_SHOWN_PREFIX = 'studio_gift_shown_v1_';

function isGiftBookShown(userId, slug) {
  try {
    return Boolean(localStorage.getItem(STUDIO_GIFT_SHOWN_PREFIX + userId + '_' + slug));
  } catch (e) {
    return false;
  }
}

function markGiftBookShown(userId, slug) {
  try {
    localStorage.setItem(STUDIO_GIFT_SHOWN_PREFIX + userId + '_' + slug, String(Date.now()));
  } catch (e) {}
}

async function findNewestUnopenedGiftBook(userProfile) {
  if (!userProfile || !userProfile.id) return null;
  try {
    const { data: grants, error: grantsErr } = await studioSb
      .from('solution_vault_book_grants')
      .select('book_id, grant_kind, status, granted_at, solution_vault_books(slug, title, status)')
      .eq('user_id', userProfile.id)
      .eq('grant_kind', 'gift')
      .eq('status', 'active')
      .order('granted_at', { ascending: false });

    if (grantsErr || !grants || grants.length === 0) return null;

    const { data: progressRows, error: progErr } = await studioSb
      .from('solution_vault_book_progress')
      .select('book_id, last_page, last_chapter_id, completed')
      .eq('user_id', userProfile.id);

    if (progErr) return null;

    const progressByBook = new Map();
    for (const p of (progressRows || [])) {
      if (p.book_id) progressByBook.set(p.book_id, p);
    }

    for (const grant of grants) {
      const book = Array.isArray(grant.solution_vault_books)
        ? grant.solution_vault_books[0]
        : grant.solution_vault_books;
      if (!book || !book.slug || book.status === 'retired' || book.status === 'draft') continue;

      if (isGiftBookShown(userProfile.id, book.slug)) continue;

      const p = progressByBook.get(grant.book_id);
      const hasProgress = Boolean(
        p && (
          (p.last_page != null && p.last_page > 1) ||
          (p.last_chapter_id != null && p.last_chapter_id !== '') ||
          p.completed === true
        )
      );

      if (!hasProgress) {
        return book.slug;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

rememberStudioNext();

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
}

function hasLocalSeenInSevenProgress() {
  try {
    const raw = localStorage.getItem('bwb_challenge_v1');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    return Boolean(saved && (saved.name || saved.level || saved.videos || saved.topicFreewrite));
  } catch (e) {
    return false;
  }
}

function setStudioTheme(theme, persist = true) {
  const isLight = theme === 'light';
  document.documentElement.classList.toggle('studio-light', isLight);
  if (persist) {
    try { localStorage.setItem(STUDIO_THEME_KEY, isLight ? 'light' : 'dark'); } catch (e) {}
  }
}

function applyThemeForAuth(signedIn) {
  let saved = null;
  try { saved = localStorage.getItem(STUDIO_THEME_KEY); } catch (e) {}
  if (saved === 'light') {
    setStudioTheme('light', false);
  } else if (saved === 'dark') {
    setStudioTheme('dark', false);
  } else {
    // Signed-out visitors land on the light Colorado Mastermind look by default;
    // signed-in members keep the existing dark Studio default unless toggled.
    setStudioTheme(signedIn ? 'dark' : 'light', false);
  }
}

function toggleStudioTheme() {
  setStudioTheme(document.documentElement.classList.contains('studio-light') ? 'dark' : 'light', true);
}

function normalizeFrontDoorTab(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/^#/, '');
  if (key === 'network' || key === 'business-cards' || key === 'cards') return 'business-cards';
  if (key === 'library' || key === 'the-library') return 'library';
  if (key === 'seeninseven' || key === 'sis') return 'seeninseven';
  return null;
}

function activateFrontDoorTab(tabKey, moveFocus = false) {
  const next = FRONT_DOOR_TABS.includes(tabKey) ? tabKey : 'seeninseven';
  activeFrontDoorTab = next;
  for (const key of FRONT_DOOR_TABS) {
    const selected = key === next;
    const tab = el('fd-tab-' + key);
    const panel = el('fd-panel-' + key);
    if (tab) {
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      if (selected && moveFocus) tab.focus();
    }
    if (panel) {
      panel.hidden = !selected;
    }
  }
}

function initFrontDoorTabs() {
  const params = new URLSearchParams(window.location.search);
  const initial = normalizeFrontDoorTab(params.get('tab')) || normalizeFrontDoorTab(window.location.hash) || 'seeninseven';
  activateFrontDoorTab(initial, false);

  const tablist = document.querySelector('.front-door-tabs');
  if (!tablist) return;

  tablist.addEventListener('click', event => {
    const btn = event.target.closest('[data-fd-tab]');
    if (!btn) return;
    activateFrontDoorTab(btn.getAttribute('data-fd-tab'), false);
  });

  tablist.addEventListener('keydown', event => {
    const btn = event.target.closest('[data-fd-tab]');
    if (!btn) return;
    const idx = FRONT_DOOR_TABS.indexOf(btn.getAttribute('data-fd-tab'));
    if (idx === -1) return;
    let nextIdx = -1;
    if (event.key === 'ArrowRight') nextIdx = (idx + 1) % FRONT_DOOR_TABS.length;
    else if (event.key === 'ArrowLeft') nextIdx = (idx - 1 + FRONT_DOOR_TABS.length) % FRONT_DOOR_TABS.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = FRONT_DOOR_TABS.length - 1;
    if (nextIdx !== -1) {
      event.preventDefault();
      activateFrontDoorTab(FRONT_DOOR_TABS[nextIdx], true);
    }
  });
}

function openAuthModal() {
  el('auth-modal').hidden = false;
  el('auth-email').focus();
}

function closeAuthModal() {
  el('auth-modal').hidden = true;
  setAuthMessage('');
}

// Four ways in (Studio accounts, 2026-11-17): password sign-in, an emailed
// link, self-service account creation, and a password reset email. New
// accounts carry no app access; access is still granted by David.
const AUTH_MODES = {
  password: { title: 'Welcome back.', intro: 'Use the same email you use with Colorado Mastermind.', submit: 'Sign in' },
  magic: { title: 'Welcome back.', intro: 'We will email you a link that signs you straight in. No password needed.', submit: 'Send my sign-in link' },
  signup: { title: 'Create your Studio account.', intro: 'One login for everything you use with Colorado Mastermind.', submit: 'Create my account' },
  reset: { title: 'Reset your password.', intro: 'Enter your email and we will send you a link to choose a new password.', submit: 'Send my reset link' }
};

function setAuthMode(nextMode) {
  authMode = AUTH_MODES[nextMode] ? nextMode : 'password';
  const mode = AUTH_MODES[authMode];
  const usesPassword = authMode === 'password' || authMode === 'signup';
  const signup = authMode === 'signup';
  el('password-tab').classList.toggle('active', authMode === 'password');
  el('magic-tab').classList.toggle('active', authMode === 'magic');
  el('signup-tab').classList.toggle('active', signup);
  el('auth-tabs').hidden = authMode === 'reset';
  el('auth-back').hidden = authMode !== 'reset';
  el('name-field').hidden = !signup;
  el('auth-name').required = signup;
  el('password-field').hidden = !usesPassword;
  el('auth-password').required = usesPassword;
  el('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  el('auth-password').placeholder = signup ? 'At least 6 characters' : 'Your password';
  el('forgot-password').hidden = authMode !== 'password';
  el('confirm-field').hidden = !signup;
  el('auth-password-confirm').required = signup;
  el('auth-title').textContent = mode.title;
  el('auth-intro').textContent = mode.intro;
  el('auth-submit').querySelector('span').textContent = mode.submit;
  setAuthMessage('');
}

function setAuthMessage(message, type) {
  const messageEl = el('auth-message');
  messageEl.textContent = message || '';
  messageEl.className = 'auth-message' + (type ? ' ' + type : '');
}

async function ensureStudioProfile(user) {
  const { data: claimed, error: claimError } = await studioSb.rpc('claim_studio_profile');
  if (!claimError && claimed) return claimed;

  const { data: existing, error: selectError } = await studioSb
    .from('users')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: created, error: insertError } = await studioSb
    .from('users')
    .insert({ auth_id: user.id, email: user.email })
    .select()
    .maybeSingle();

  if (!insertError && created) return created;

  const { data: retry, error: retryError } = await studioSb
    .from('users')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (retryError) throw retryError;
  return retry;
}

async function loadStudioAccess(profile) {
  const { data, error } = await studioSb
    .from('studio_entitlements')
    .select('app_key,status,access_source,granted_at,expires_at')
    .eq('user_id', profile.id)
    .eq('status', 'active');

  if (error) {
    // Preview deployments may load before the additive Studio migration is applied.
    if (profile.is_paid === true) return [{ app_key: 'seeninseven', status: 'active', access_source: 'beta' }];
    return [];
  }
  return (data || []).filter(item => !item.expires_at || new Date(item.expires_at).getTime() > Date.now());
}

async function loadStudioCatalogMode() {
  const { data, error } = await studioSb
    .from('studio_catalog_settings')
    .select('catalog_mode')
    .eq('app_key', 'eee')
    .maybeSingle();

  if (!error && data && ['automatic', 'visible', 'hidden'].includes(data.catalog_mode)) {
    studioCatalogMode = data.catalog_mode;
  }
  return studioCatalogMode;
}

function isEeeCartOpen() {
  return Boolean(
    window.SevenSevenSevenLaunch &&
    window.SevenSevenSevenLaunch.launchState().cart === 'open'
  );
}

function shouldShowEeeCard(unlocked) {
  if (unlocked) return true;
  if (studioCatalogMode === 'visible') return true;
  if (studioCatalogMode === 'hidden') return false;
  return isEeeCartOpen();
}

function hasStudioAccess(appKey) {
  return studioAccess.some(item => item.app_key === appKey);
}

function renderAppAccess(appKey, unlocked, betaCopy, lockedCopy) {
  const cover = el(appKey + '-locked-cover');
  if (!cover) return;
  cover.hidden = unlocked;
  if (el(appKey + '-open-button')) el(appKey + '-open-button').hidden = !unlocked;
  if (el(appKey + '-request-button')) el(appKey + '-request-button').hidden = unlocked;
  if (el(appKey + '-access-label')) {
    el(appKey + '-access-label').textContent = unlocked ? (appKey === 'eee' ? 'Membership active' : 'Beta access') : (appKey === 'eee' ? 'Membership' : 'Early access');
    el(appKey + '-access-label').classList.toggle('unlocked', unlocked);
  }
  if (el(appKey + '-status')) {
    el(appKey + '-status').classList.toggle('unlocked', unlocked);
    el(appKey + '-status').innerHTML = unlocked
      ? '<i data-lucide="badge-check"></i><span>' + betaCopy + '</span>'
      : '<i data-lucide="lock"></i><span>' + (lockedCopy || 'Coming soon. Message David Bee for early access.') + '</span>';
  }
}

// A self-created account carries the name typed at sign-up in its auth
// metadata. Copy it onto the Studio profile once, never over a name already set.
async function syncSignupName(user) {
  const signupName = user && user.user_metadata && typeof user.user_metadata.name === 'string' ? user.user_metadata.name.trim() : '';
  if (!signupName || !studioProfile || (studioProfile.name && studioProfile.name.trim())) return;
  const { error } = await studioSb.from('users').update({ name: signupName.slice(0, 80) }).eq('id', studioProfile.id);
  if (!error) studioProfile.name = signupName.slice(0, 80);
}

async function hydrateStudio(session) {
  studioSession = session;
  studioProfile = null;
  studioAccess = [];
  userHasBooks = false;
  userHasCourses = false;

  await loadStudioCatalogMode();

  if (session && session.user) {
    studioProfile = await ensureStudioProfile(session.user);
    if (studioProfile) {
      await syncSignupName(session.user);
      studioAccess = await loadStudioAccess(studioProfile);
      try {
        const { data: hasBooks } = await studioSb.rpc('has_any_book_access');
        userHasBooks = Boolean(hasBooks);
      } catch (e) {
        userHasBooks = false;
      }
      try {
        const { data: hasCourses } = await studioSb.rpc('has_any_classroom_access');
        userHasCourses = Boolean(hasCourses);
      } catch (e) {
        userHasCourses = false;
      }
      if (!pendingPasswordRecovery && followStudioNext()) return;

      if (userHasBooks && !pendingPasswordRecovery) {
        const unopenedSlug = await findNewestUnopenedGiftBook(studioProfile);
        if (unopenedSlug) {
          markGiftBookShown(studioProfile.id, unopenedSlug);
          window.location.replace('/vault?book=' + encodeURIComponent(unopenedSlug));
          return;
        }
      }
    }
  }
  studioAuthResolved = true;
  renderStudio();
  if (pendingPasswordRecovery && studioSession && studioSession.user) {
    pendingPasswordRecovery = false;
    clearResetParam();
    openSettingsModal({ recovery: true });
    return;
  }
  const nextPath = !studioSession && pendingStudioNext();
  if (nextPath) {
    openAuthModal();
    setAuthMessage(nextPath.startsWith('/vault?claim=')
      ? 'Sign in, or get a magic link if you are new here, and your book goes onto your shelf and opens.'
      : nextPath.startsWith('/vault')
        ? 'Sign in with the email your book was sent to, and it opens right away.'
        : 'Sign in and Studio takes you straight back.');
  }
}

function renderStudio() {
  const signedIn = Boolean(studioSession && studioSession.user);
  const showFrontDoor = !signedIn && (studioAuthResolved || !HAS_CACHED_SESSION);
  const email = signedIn ? studioSession.user.email : '';
  const localProgress = hasLocalSeenInSevenProgress();
  const seenInSevenUnlocked = true;
  const hubBundle = hasStudioAccess('eee');
  // The Momentum Hub bundle includes AI Boardroom (David, 2026-10-14).
  const boardroomUnlocked = hasStudioAccess('boardroom') || hubBundle;
  const hubApps = HUB_APP_KEYS.filter(hasStudioAccess);
  const eeeUnlocked = hubBundle || hubApps.length > 0;
  const eeeCardVisible = shouldShowEeeCard(eeeUnlocked);

  // Solution Vault book access, classroom access, or standalone vault access
  const vaultUnlocked = hasStudioAccess('vault') || userHasBooks || userHasCourses;
  // If user is book-only or has standalone vault access without full EEE bundle, show vault-card
  const showVaultCard = signedIn && vaultUnlocked && !hubBundle;

  document.body.dataset.auth = signedIn ? 'signed-in' : (showFrontDoor ? 'signed-out' : 'pending');
  applyThemeForAuth(signedIn);

  if (el('studio-sidebar')) el('studio-sidebar').hidden = !signedIn;
  if (el('studio-member-view')) el('studio-member-view').hidden = !signedIn;
  if (el('studio-front-door')) el('studio-front-door').hidden = !showFrontDoor;

  const fdSisStart = el('fd-seeninseven-start');
  if (fdSisStart) {
    const fdSisLabel = fdSisStart.querySelector('span');
    if (fdSisLabel) fdSisLabel.textContent = localProgress ? 'Continue SeenInSeven' : 'Start SeenInSeven';
  }

  el('sign-in-button').hidden = signedIn;
  el('account-button').hidden = !signedIn;
  el('device-progress').hidden = !signedIn || !localProgress || hasStudioAccess('seeninseven');
  const isAdmin = Boolean(signedIn && studioProfile && studioProfile.is_admin === true);
  if (el('management-label')) el('management-label').hidden = !isAdmin;
  // The line under the apps is for everyone signed in: CoMM Business Cards
  // sits there for members, with WorkerBee and Administration for admins only.
  if (el('management-divider')) el('management-divider').hidden = !signedIn;
  if (el('cards-nav-item')) el('cards-nav-item').hidden = !signedIn;
  if (el('cards-card')) el('cards-card').hidden = !signedIn;
  el('workerbee-nav-item').hidden = !isAdmin;
  el('admin-nav-item').hidden = !isAdmin;
  if (el('cmo-nav-item')) el('cmo-nav-item').hidden = !(signedIn && (isAdmin || CMO_EMAILS.includes(String(email || '').trim().toLowerCase())));
  el('eee-card').hidden = !eeeCardVisible;

  // Solution Vault in the sidebar (WBR-445, WBR-491): Book Shelf, Classroom,
  // and Video Room links under it, each shown only when this account can use that section.
  // Admins can preview every book and course. With none, it stays one plain link.
  const vaultVideos = signedIn && (hasStudioAccess('vault') || hubBundle);
  const vaultBooksNav = signedIn && (userHasBooks || isAdmin);
  const vaultCoursesNav = signedIn && (userHasCourses || isAdmin);
  el('vault-nav-books').hidden = !vaultBooksNav;
  if (el('vault-nav-courses')) el('vault-nav-courses').hidden = !vaultCoursesNav;
  el('vault-nav-videos').hidden = !vaultVideos;
  el('vault-nav-group').hidden = !(vaultBooksNav || vaultCoursesNav || vaultVideos);
  el('vault-nav-link').hidden = vaultBooksNav || vaultCoursesNav || vaultVideos;

  const vaultCard = el('vault-card');
  if (vaultCard) {
    vaultCard.hidden = !showVaultCard;
    if (showVaultCard) {
      const statusText = el('vault-status-text');
      if (statusText) {
        statusText.textContent = userHasBooks
          ? 'Your books are ready in your personal library.'
          : 'Your Solution Vault masterclasses are ready.';
      }
    }
  }

  let workspaceCount = 1; // SeenInSeven
  if (eeeCardVisible) workspaceCount++;
  if (showVaultCard) workspaceCount++;
  if (signedIn) workspaceCount++; // Community Business Cards
  el('studio-app-count').textContent = workspaceCount + ' workspace' + (workspaceCount === 1 ? '' : 's');

  if (signedIn) {
    el('account-email').textContent = email;
    el('menu-email').textContent = email;
    el('account-avatar').textContent = (studioProfile && studioProfile.name ? studioProfile.name : email).charAt(0).toUpperCase();
    const firstName = studioProfile && studioProfile.name ? studioProfile.name.trim().split(/\s+/)[0] : '';
    el('welcome-heading').textContent = firstName ? 'Welcome back, ' + firstName + '.' : 'Welcome back to your Studio.';
    el('welcome-copy').textContent = 'Everything you have access to lives here, under one login.';
  } else {
    el('welcome-heading').textContent = 'Your tools, work, and resources in one place.';
    el('welcome-copy').textContent = 'Sign in once, then return to everything you are building with Colorado Mastermind.';
  }

  renderAppAccess('seeninseven', seenInSevenUnlocked, 'SeenInSeven beta access is open.');
  renderAppAccess('boardroom', boardroomUnlocked, 'Your private advisor team is ready.');
  renderAppAccess(
    'eee',
    eeeUnlocked,
    hubBundle
      ? 'All five EEE components are ready in one workspace.'
      : 'Ready for you: ' + hubApps.map(key => ACCESS_APP_NAMES[key]).join(', ') + '.',
    eeeCardVisible ? 'Founders enrollment is open. Explore the complete EEE membership.' : 'Sign in with the email connected to your EEE membership.'
  );
  const accessName = ACCESS_APP_NAMES[accessNoticeApp];
  el('access-notice').hidden = !accessName || !signedIn;
  if (accessName && signedIn) {
    el('access-notice-title').textContent = accessName + ' is ready for you.';
    el('access-notice-copy').textContent = 'Your Studio access is active. Open the app whenever you are ready.';
  }
  refreshIcons();
}

function signupAlreadyExists(error, data) {
  const raw = (error && error.message ? error.message : '').toLowerCase();
  if (raw.includes('already registered') || raw.includes('already exists')) return true;
  // With email confirmation on, Supabase answers an existing address with a
  // user that has no identities rather than an error.
  return Boolean(!error && data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
}

async function submitAuth(event) {
  event.preventDefault();
  const email = el('auth-email').value.trim().toLowerCase();
  const password = el('auth-password').value;
  const submitButton = el('auth-submit');
  const submitLabel = submitButton.querySelector('span');
  const originalLabel = AUTH_MODES[authMode].submit;

  if (authMode === 'signup') {
    const name = el('auth-name').value.trim();
    if (!name) { setAuthMessage('Add your name so people know who you are.', 'error'); return; }
    if (password.length < 6) { setAuthMessage('Use at least 6 characters for your password.', 'error'); return; }
    if (password !== el('auth-password-confirm').value) { setAuthMessage('Those passwords do not match.', 'error'); return; }
  }

  submitButton.disabled = true;
  submitLabel.textContent = 'One moment...';
  setAuthMessage('');

  try {
    if (authMode === 'password') {
      const { error } = await studioSb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAuthModal();
    } else if (authMode === 'signup') {
      const name = el('auth-name').value.trim();
      const { data, error } = await studioSb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + '/', data: { name } }
      });
      if (signupAlreadyExists(error, data)) {
        setAuthMode('password');
        el('auth-email').value = email;
        setAuthMessage('You already have an account with that email. Sign in below, or use Forgot your password.', 'error');
        return;
      }
      if (error) throw error;
      if (data && data.session) {
        closeAuthModal();
      } else {
        setAuthMessage('Almost done. We sent a confirmation link to ' + email + '. Open it to finish creating your account.', 'success');
      }
    } else if (authMode === 'reset') {
      const { error } = await studioSb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/?reset=1' });
      if (error) throw error;
      setAuthMessage('If there is an account for ' + email + ', a reset link is on its way. Check your inbox.', 'success');
    } else {
      const { error } = await studioSb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/', shouldCreateUser: true }
      });
      if (error) throw error;
      setAuthMessage('Your sign-in link is on its way. Check your inbox.', 'success');
    }
  } catch (error) {
    const raw = (error && error.message ? error.message : '').toLowerCase();
    const message = raw.includes('invalid login') || raw.includes('invalid credentials')
      ? 'That email and password did not match. Try again, or use Forgot your password.'
      : raw.includes('email not confirmed')
        ? 'Please confirm your email first. Open the link we sent when you created your account.'
        : raw.includes('rate')
          ? 'There have been too many attempts. Please wait a few minutes and try again.'
          : raw.includes('password') && raw.includes('weak')
            ? 'That password is too easy to guess. Try a longer one.'
            : authMode === 'signup'
              ? 'We could not create your account just now. Please try again.'
              : 'We could not sign you in just now. Please try again.';
    setAuthMessage(message, 'error');
  } finally {
    submitButton.disabled = false;
    submitLabel.textContent = originalLabel;
  }
}

async function signOutStudio() {
  await studioSb.auth.signOut();
  el('account-menu').hidden = true;
  studioSession = null;
  studioProfile = null;
  studioAccess = [];
  userHasBooks = false;
  userHasCourses = false;
  closeSettingsModal();
  studioAuthResolved = true;
  renderStudio();
}

function setPasswordMessage(message, type) {
  const messageEl = el('settings-password-message');
  messageEl.textContent = message || '';
  messageEl.className = 'auth-message' + (type ? ' ' + type : '');
}

function clearResetParam() {
  if (!window.history || !window.history.replaceState) return;
  const cleanUrl = new URL(window.location.href);
  if (!cleanUrl.searchParams.has('reset')) return;
  cleanUrl.searchParams.delete('reset');
  window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
}

function setProfileNameMessage(message, type) {
  const messageEl = el('profile-name-message');
  messageEl.textContent = message || '';
  messageEl.className = 'auth-message' + (type ? ' ' + type : '');
}

function profileDisplayName() {
  return studioProfile && studioProfile.name && studioProfile.name.trim() ? studioProfile.name.trim() : '';
}

function renderProfileHead() {
  const email = studioSession && studioSession.user ? studioSession.user.email || '' : '';
  const name = profileDisplayName();
  el('settings-title').textContent = name || 'Your profile';
  el('settings-email').textContent = email;
  el('profile-avatar').textContent = (name || email || '?').charAt(0).toUpperCase();
}

function renderProfileAccess() {
  const list = el('profile-access');
  list.textContent = '';
  const items = [];
  if (studioProfile && studioProfile.is_admin === true) items.push({ name: 'Studio admin', note: 'Full access' });
  studioAccess.forEach(item => {
    const note = item.expires_at
      ? 'Until ' + new Date(item.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : item.access_source === 'beta' ? 'Beta' : '';
    items.push({ name: ACCESS_APP_NAMES[item.app_key] || item.app_key, note });
  });
  items.push({ name: 'Community Business Cards', note: 'Every member' });
  items.forEach(item => {
    const li = document.createElement('li');
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'badge-check');
    const label = document.createElement('span');
    label.textContent = item.name;
    li.append(icon, label);
    if (item.note) {
      const note = document.createElement('span');
      note.className = 'profile-access-note';
      note.textContent = item.note;
      li.append(note);
    }
    list.append(li);
  });
  if (!studioAccess.length && !(studioProfile && studioProfile.is_admin === true)) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Apps you are given access to show up here. Message David Bee if you are expecting one.';
    list.append(li);
  }
  refreshIcons();
}

function openSettingsModal(options = {}) {
  if (!studioSession || !studioSession.user) return;
  const recovery = options.recovery === true;
  el('account-menu').hidden = true;
  renderProfileHead();
  el('profile-name').value = profileDisplayName();
  setProfileNameMessage('');
  renderProfileAccess();
  el('profile-notice').hidden = !recovery;
  el('profile-notice').textContent = recovery ? 'You are signed in from your reset link. Choose a new password below.' : '';
  el('profile-password-title').textContent = recovery ? 'Choose a new password' : 'Password';
  el('profile-password-hint').textContent = recovery
    ? 'Save it and use it next time you sign in.'
    : 'Set or change your password so you can sign in without waiting for an email.';
  el('settings-modal').hidden = false;
  if (recovery) el('settings-password').focus();
}

function closeSettingsModal() {
  el('settings-modal').hidden = true;
  el('settings-password-form').reset();
  setPasswordMessage('');
  setProfileNameMessage('');
}

async function saveProfileName(event) {
  event.preventDefault();
  if (!studioProfile) return;
  const name = el('profile-name').value.trim().slice(0, 80);
  if (!name) { setProfileNameMessage('Add your name first.', 'error'); return; }
  const button = el('profile-name-submit');
  button.disabled = true;
  button.querySelector('span').textContent = 'Saving...';
  setProfileNameMessage('');
  try {
    const { error } = await studioSb.from('users').update({ name }).eq('id', studioProfile.id);
    if (error) throw error;
    studioProfile.name = name;
    renderProfileHead();
    renderStudio();
    setProfileNameMessage('Saved.', 'success');
  } catch (error) {
    setProfileNameMessage('We could not save your name. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Save';
  }
}

async function saveStudioPassword(event) {
  event.preventDefault();
  const password = el('settings-password').value;
  const confirmation = el('settings-password-confirm').value;
  const button = el('settings-password-submit');
  if (password.length < 6) {
    setPasswordMessage('Use at least 6 characters.', 'error');
    return;
  }
  if (password !== confirmation) {
    setPasswordMessage('Those passwords do not match.', 'error');
    return;
  }
  button.disabled = true;
  button.querySelector('span').textContent = 'Saving...';
  setPasswordMessage('');
  try {
    const { error } = await studioSb.auth.updateUser({ password });
    if (error) throw error;
    el('settings-password-form').reset();
    setPasswordMessage('Password saved. You can use it next time you sign in.', 'success');
  } catch (error) {
    setPasswordMessage('We could not save that password. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Save password';
  }
}

studioSb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') pendingPasswordRecovery = true;
  if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'PASSWORD_RECOVERY'].includes(event)) return;
  setTimeout(() => {
    hydrateStudio(session).catch(() => {
      studioSession = session;
      studioProfile = null;
      studioAccess = [];
      studioAuthResolved = true;
      renderStudio();
    });
  }, 0);
});

el('theme-button').addEventListener('click', toggleStudioTheme);
el('sign-in-button').addEventListener('click', openAuthModal);
if (el('fd-library-sign-in')) {
  el('fd-library-sign-in').addEventListener('click', openAuthModal);
}
el('auth-close').addEventListener('click', closeAuthModal);
el('auth-modal').addEventListener('click', event => {
  if (event.target === el('auth-modal')) closeAuthModal();
});
el('magic-tab').addEventListener('click', () => setAuthMode('magic'));
el('password-tab').addEventListener('click', () => setAuthMode('password'));
el('signup-tab').addEventListener('click', () => setAuthMode('signup'));
el('forgot-password').addEventListener('click', () => {
  setAuthMode('reset');
  el('auth-email').focus();
});
el('auth-back').addEventListener('click', () => setAuthMode('password'));
el('profile-name-form').addEventListener('submit', saveProfileName);
el('profile-sign-out').addEventListener('click', signOutStudio);
el('auth-form').addEventListener('submit', submitAuth);
el('account-button').addEventListener('click', () => {
  el('account-menu').hidden = !el('account-menu').hidden;
});
el('sign-out-button').addEventListener('click', signOutStudio);
el('settings-button').addEventListener('click', openSettingsModal);
el('settings-close').addEventListener('click', closeSettingsModal);
el('settings-modal').addEventListener('click', event => {
  if (event.target === el('settings-modal')) closeSettingsModal();
});
el('settings-password-form').addEventListener('submit', saveStudioPassword);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeAuthModal();
    closeSettingsModal();
    el('account-menu').hidden = true;
  }
});

if (ACCESS_APP_NAMES[accessNoticeApp] && window.history && window.history.replaceState) {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('access');
  window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
}

initFrontDoorTabs();
refreshIcons();
renderStudio();

if (HAS_CACHED_SESSION) {
  window.setTimeout(() => {
    if (!studioAuthResolved) {
      studioAuthResolved = true;
      renderStudio();
    }
  }, 1000);
}

window.setInterval(renderStudio, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  loadStudioCatalogMode().then(renderStudio).catch(() => {});
});
