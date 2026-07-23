const STUDIO_SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const STUDIO_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const STUDIO_THEME_KEY = 'sis_theme_v1';
const studioSb = supabase.createClient(STUDIO_SUPABASE_URL, STUDIO_SUPABASE_KEY);

let studioSession = null;
let studioProfile = null;
let studioAccess = [];
let authMode = 'magic';
const ACCESS_APP_NAMES = { seeninseven: 'SeenInSeven', boardroom: 'AI Boardroom' };
const accessNoticeApp = new URLSearchParams(window.location.search).get('access');

const el = id => document.getElementById(id);

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

function setStudioTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.classList.toggle('studio-light', isLight);
  try { localStorage.setItem(STUDIO_THEME_KEY, isLight ? 'light' : 'dark'); } catch (e) {}
}

function toggleStudioTheme() {
  setStudioTheme(document.documentElement.classList.contains('studio-light') ? 'dark' : 'light');
}

function openAuthModal() {
  el('auth-modal').hidden = false;
  el('auth-email').focus();
}

function closeAuthModal() {
  el('auth-modal').hidden = true;
  setAuthMessage('');
}

function setAuthMode(nextMode) {
  authMode = nextMode;
  const passwordMode = authMode === 'password';
  el('magic-tab').classList.toggle('active', !passwordMode);
  el('password-tab').classList.toggle('active', passwordMode);
  el('password-field').hidden = !passwordMode;
  el('auth-password').required = passwordMode;
  el('auth-submit').querySelector('span').textContent = passwordMode ? 'Sign in' : 'Send my sign-in link';
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

function hasStudioAccess(appKey) {
  return studioAccess.some(item => item.app_key === appKey);
}

function renderAppAccess(appKey, unlocked, betaCopy) {
  el(appKey + '-locked-cover').hidden = unlocked;
  el(appKey + '-open-button').hidden = !unlocked;
  el(appKey + '-request-button').hidden = unlocked;
  el(appKey + '-access-label').textContent = unlocked ? 'Beta access' : 'Early access';
  el(appKey + '-access-label').classList.toggle('unlocked', unlocked);
  el(appKey + '-status').classList.toggle('unlocked', unlocked);
  el(appKey + '-status').innerHTML = unlocked
    ? '<i data-lucide="badge-check"></i><span>' + betaCopy + '</span>'
    : '<i data-lucide="clock-3"></i><span>Coming soon. Message David Bee for early access.</span>';
}

async function hydrateStudio(session) {
  studioSession = session;
  studioProfile = null;
  studioAccess = [];

  if (session && session.user) {
    studioProfile = await ensureStudioProfile(session.user);
    if (studioProfile) studioAccess = await loadStudioAccess(studioProfile);
  }
  renderStudio();
}

function renderStudio() {
  const signedIn = Boolean(studioSession && studioSession.user);
  const email = signedIn ? studioSession.user.email : '';
  const localProgress = hasLocalSeenInSevenProgress();
  const seenInSevenUnlocked = hasStudioAccess('seeninseven') || localProgress;
  const boardroomUnlocked = hasStudioAccess('boardroom');

  el('sign-in-button').hidden = signedIn;
  el('account-button').hidden = !signedIn;
  el('device-progress').hidden = !localProgress || hasStudioAccess('seeninseven');
  const isAdmin = Boolean(signedIn && studioProfile && studioProfile.is_admin === true);
  el('admin-nav-item').hidden = !isAdmin;
  el('admin-menu-item').hidden = !isAdmin;

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

  renderAppAccess('seeninseven', seenInSevenUnlocked, 'Included in your Studio beta access.');
  renderAppAccess('boardroom', boardroomUnlocked, 'Your private advisor team is ready.');
  const accessName = ACCESS_APP_NAMES[accessNoticeApp];
  el('access-notice').hidden = !accessName || !signedIn;
  if (accessName && signedIn) {
    el('access-notice-title').textContent = accessName + ' is ready for you.';
    el('access-notice-copy').textContent = 'Your Studio access is active. Open the app whenever you are ready.';
  }
  refreshIcons();
}

async function submitAuth(event) {
  event.preventDefault();
  const email = el('auth-email').value.trim().toLowerCase();
  const password = el('auth-password').value;
  const submitButton = el('auth-submit');
  const submitLabel = submitButton.querySelector('span');
  const originalLabel = authMode === 'password' ? 'Sign in' : 'Send my sign-in link';

  submitButton.disabled = true;
  submitLabel.textContent = 'One moment...';
  setAuthMessage('');

  try {
    if (authMode === 'password') {
      const { error } = await studioSb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAuthModal();
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
      ? 'That email and password did not match. Try again or use a magic link.'
      : raw.includes('rate')
        ? 'There have been too many attempts. Please wait a few minutes and try again.'
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
  closeSettingsModal();
  renderStudio();
}

function setPasswordMessage(message, type) {
  const messageEl = el('settings-password-message');
  messageEl.textContent = message || '';
  messageEl.className = 'auth-message' + (type ? ' ' + type : '');
}

function openSettingsModal() {
  if (!studioSession || !studioSession.user) return;
  el('account-menu').hidden = true;
  el('settings-email').textContent = studioSession.user.email || '';
  el('settings-modal').hidden = false;
  el('settings-password').focus();
}

function closeSettingsModal() {
  el('settings-modal').hidden = true;
  el('settings-password-form').reset();
  setPasswordMessage('');
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
  if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED'].includes(event)) return;
  setTimeout(() => {
    hydrateStudio(session).catch(() => {
      studioSession = session;
      studioProfile = null;
      studioAccess = [];
      renderStudio();
    });
  }, 0);
});

el('theme-button').addEventListener('click', toggleStudioTheme);
el('sign-in-button').addEventListener('click', openAuthModal);
el('auth-close').addEventListener('click', closeAuthModal);
el('auth-modal').addEventListener('click', event => {
  if (event.target === el('auth-modal')) closeAuthModal();
});
el('magic-tab').addEventListener('click', () => setAuthMode('magic'));
el('password-tab').addEventListener('click', () => setAuthMode('password'));
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

refreshIcons();
renderStudio();
