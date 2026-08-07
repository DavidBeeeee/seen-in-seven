const EEE_SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const EEE_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const eeeSb = supabase.createClient(EEE_SUPABASE_URL, EEE_SUPABASE_KEY);

function eeeElement(id) {
  return document.getElementById(id);
}

function eeeRefreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
}

function eeeSetTheme(theme) {
  const light = theme === 'light';
  document.documentElement.classList.toggle('studio-light', light);
  try { localStorage.setItem('sis_theme_v1', light ? 'light' : 'dark'); } catch (error) {}
}

async function eeeProfileFor(session) {
  const { data, error } = await eeeSb.from('users').select('*').eq('auth_id', session.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function eeeHasAccess() {
  const { data, error } = await eeeSb.rpc('has_studio_app_access', { target_app_key: 'eee' });
  if (error) throw error;
  return data === true;
}

function eeeShowGate(kind) {
  const gate = eeeElement('eee-access-gate');
  const app = eeeElement('eee-app');
  if (app) app.hidden = true;
  if (!gate) return;
  gate.hidden = false;
  const title = eeeElement('eee-gate-title');
  const copy = eeeElement('eee-gate-copy');
  const button = eeeElement('eee-gate-button');
  if (kind === 'sign-in') {
    title.textContent = 'Sign in to enter EEE.';
    copy.textContent = 'Use the Studio email connected to your membership.';
    button.textContent = 'Go to Studio sign in';
    button.href = '/?access=eee';
  } else {
    title.textContent = 'EEE membership is not active on this account.';
    copy.textContent = 'Your other Studio access remains unchanged.';
    button.textContent = 'Return to My Studio';
    button.href = '/';
  }
  eeeRefreshIcons();
}

async function eeeInitialize(onReady) {
  const { data } = await eeeSb.auth.getSession();
  const session = data && data.session;
  if (!session) {
    eeeShowGate('sign-in');
    return;
  }

  const [profile, allowed] = await Promise.all([eeeProfileFor(session), eeeHasAccess()]);
  if (!profile || !allowed) {
    eeeShowGate('access');
    return;
  }

  const gate = eeeElement('eee-access-gate');
  const app = eeeElement('eee-app');
  if (gate) gate.hidden = true;
  if (app) app.hidden = false;
  const email = eeeElement('eee-account-email');
  const avatar = eeeElement('eee-account-avatar');
  if (email) email.textContent = session.user.email || '';
  if (avatar) avatar.textContent = String(profile.name || session.user.email || 'E').charAt(0).toUpperCase();
  if (typeof onReady === 'function') await onReady({ session, profile, sb: eeeSb });
  eeeRefreshIcons();
}

document.addEventListener('click', event => {
  const themeButton = event.target.closest('[data-eee-theme]');
  if (themeButton) eeeSetTheme(document.documentElement.classList.contains('studio-light') ? 'dark' : 'light');
  const signOut = event.target.closest('[data-eee-sign-out]');
  if (signOut) eeeSb.auth.signOut().then(() => { window.location.href = '/'; });
});

eeeSb.auth.onAuthStateChange((event, session) => {
  if (event !== 'SIGNED_OUT' || session) return;
  setTimeout(() => eeeShowGate('sign-in'), 0);
});

window.EEEStudio = { initialize: eeeInitialize, refreshIcons: eeeRefreshIcons, supabase: eeeSb };
