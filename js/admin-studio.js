const ADMIN_SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const ADMIN_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const ADMIN_EMAILS = new Set(['email@davidbee.me', 'davidkamau@live.com']);
const ADMIN_THEME_KEY = 'sis_theme_v1';
const adminSb = supabase.createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_KEY);

const APP_CATALOG = [
  { key: 'seeninseven', name: 'SeenInSeven', connected: true, adminPath: '/admin/seeninseven' },
  { key: 'boardroom', name: 'AI Boardroom', connected: false, adminPath: '/admin/boardroom' }
];

const adminEl = id => document.getElementById(id);
let studioAdminSession = null;
let studioAdminState = { users: [], entitlements: [], scripts: [], progress: [], logs: [], rows: [], errors: {} };

function refreshAdminIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function dateMs(value) {
  const ms = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function formatDate(value) {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'No activity yet';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function uniqueVideoCount(rows, field) {
  return new Set((rows || []).map(row => Number(row[field])).filter(Number.isFinite)).size;
}

function isActiveEntitlement(entitlement) {
  if (!entitlement || entitlement.status !== 'active') return false;
  return !entitlement.expires_at || dateMs(entitlement.expires_at) > Date.now();
}

function groupBy(rows, key) {
  return (rows || []).reduce((groups, row) => {
    const value = row[key];
    if (!groups[value]) groups[value] = [];
    groups[value].push(row);
    return groups;
  }, {});
}

function setAdminTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.classList.toggle('studio-light', isLight);
  try { localStorage.setItem(ADMIN_THEME_KEY, isLight ? 'light' : 'dark'); } catch (e) {}
}

function toggleAdminTheme() {
  setAdminTheme(document.documentElement.classList.contains('studio-light') ? 'dark' : 'light');
}

function setAuthMessage(message, type) {
  adminEl('auth-message').textContent = message || '';
  adminEl('auth-message').className = 'admin-auth-message' + (type ? ' ' + type : '');
}

async function sendAdminLink(event) {
  event.preventDefault();
  const email = adminEl('admin-email').value.trim().toLowerCase();
  const button = adminEl('admin-auth-submit');
  if (!ADMIN_EMAILS.has(email)) {
    setAuthMessage('This email does not have administrator access.', 'error');
    return;
  }

  button.disabled = true;
  button.querySelector('span').textContent = 'Sending...';
  setAuthMessage('');
  try {
    const { error } = await adminSb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + '/admin', shouldCreateUser: false }
    });
    if (error) throw error;
    setAuthMessage('Your secure login link is on its way.', 'success');
  } catch (error) {
    setAuthMessage('We could not send the link just now. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Send login link';
  }
}

function showDenied(email) {
  adminEl('auth-screen').hidden = false;
  adminEl('admin-app').hidden = true;
  adminEl('admin-email').value = email || '';
  setAuthMessage('This account is signed in as a customer and does not have administrator access.', 'error');
}

async function enterAdmin(session) {
  studioAdminSession = session;
  const email = session.user.email.toLowerCase();
  if (!ADMIN_EMAILS.has(email)) {
    showDenied(email);
    return;
  }

  const { error } = await adminSb.rpc('provision_admin_account');
  if (error) throw error;

  adminEl('auth-screen').hidden = true;
  adminEl('admin-app').hidden = false;
  adminEl('account-email').textContent = email;
  adminEl('menu-email').textContent = email;
  adminEl('account-avatar').textContent = email.charAt(0).toUpperCase();
  refreshAdminIcons();
  await loadStudioAdmin();
}

async function rpcSafe(name, rpcName) {
  try {
    const { data, error } = await adminSb.rpc(rpcName);
    return { name, data: data || [], error: error ? error.message : null };
  } catch (error) {
    return { name, data: [], error: error.message || String(error) };
  }
}

async function loadStudioAdmin() {
  const button = adminEl('refresh-button');
  button.classList.add('loading');
  button.disabled = true;
  const results = await Promise.all([
    rpcSafe('users', 'admin_get_users'),
    rpcSafe('entitlements', 'admin_get_studio_entitlements'),
    rpcSafe('scripts', 'admin_get_scripts'),
    rpcSafe('progress', 'admin_get_progress'),
    rpcSafe('logs', 'admin_get_logs')
  ]);
  const loaded = Object.fromEntries(results.map(result => [result.name, result]));
  studioAdminState.users = loaded.users.data;
  studioAdminState.entitlements = loaded.entitlements.data;
  studioAdminState.scripts = loaded.scripts.data;
  studioAdminState.progress = loaded.progress.data;
  studioAdminState.logs = loaded.logs.data;
  studioAdminState.errors = Object.fromEntries(results.filter(result => result.error).map(result => [result.name, result.error]));
  studioAdminState.rows = buildCustomerRows();
  renderStudioAdmin();
  adminEl('last-loaded').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  button.classList.remove('loading');
  button.disabled = false;
}

function buildCustomerRows() {
  const accessByUser = groupBy(studioAdminState.entitlements, 'user_id');
  const scriptsByUser = groupBy(studioAdminState.scripts.filter(script => script.is_current !== false), 'user_id');
  const progressByUser = groupBy(studioAdminState.progress, 'user_id');
  const logsByUser = groupBy(studioAdminState.logs, 'user_id');

  return studioAdminState.users.map(user => {
    const entitlements = accessByUser[user.id] || [];
    const activeAccess = entitlements.filter(isActiveEntitlement);
    const scripts = scriptsByUser[user.id] || [];
    const progress = progressByUser[user.id] || [];
    const logs = (logsByUser[user.id] || []).slice().sort((a, b) => dateMs(b.created_at) - dateMs(a.created_at));
    const filmed = progress.filter(item => item.status === 'filmed');
    return {
      user,
      entitlements,
      activeAccess,
      scripts,
      progress,
      logs,
      scriptCount: uniqueVideoCount(scripts, 'video_number'),
      filmedCount: uniqueVideoCount(filmed, 'video_index'),
      lastActive: user.last_active || (logs[0] && logs[0].created_at) || user.created_at,
      seenInSevenAccess: activeAccess.some(item => item.app_key === 'seeninseven')
    };
  }).sort((a, b) => dateMs(b.lastActive) - dateMs(a.lastActive));
}

function renderStudioAdmin() {
  renderNotice();
  renderMetrics();
  renderAppSummary();
  renderCustomers();
  refreshAdminIcons();
}

function renderNotice() {
  const errors = Object.keys(studioAdminState.errors);
  adminEl('admin-notice').hidden = errors.length === 0;
  adminEl('admin-notice').textContent = errors.length
    ? 'Some information could not be loaded: ' + errors.join(', ') + '. Refresh or check Supabase before changing access.'
    : '';
}

function renderMetrics() {
  const rows = studioAdminState.rows;
  const activePasses = studioAdminState.entitlements.filter(isActiveEntitlement);
  const recent = rows.filter(row => dateMs(row.lastActive) >= Date.now() - (7 * 24 * 60 * 60 * 1000));
  const withAccess = rows.filter(row => row.activeAccess.length > 0);
  adminEl('metric-customers').textContent = rows.length;
  adminEl('metric-customers-note').textContent = withAccess.length + ' with app access';
  adminEl('metric-access').textContent = activePasses.length;
  adminEl('metric-access-note').textContent = new Set(activePasses.map(item => item.app_key)).size + ' app type' + (new Set(activePasses.map(item => item.app_key)).size === 1 ? '' : 's');
  adminEl('metric-recent').textContent = recent.length;
  adminEl('metric-apps').textContent = APP_CATALOG.filter(app => app.connected).length;
}

function renderAppSummary() {
  const sisRows = studioAdminState.rows.filter(row => row.seenInSevenAccess);
  const filmed = studioAdminState.progress.filter(item => item.status === 'filmed');
  const issues = studioAdminState.logs.filter(item => ['error', 'script_failed'].includes(item.event_type) && dateMs(item.created_at) >= Date.now() - (24 * 60 * 60 * 1000));
  adminEl('sis-users').textContent = sisRows.length;
  adminEl('sis-progress').textContent = filmed.length;
  adminEl('sis-errors').textContent = issues.length;
}

function filteredCustomerRows() {
  const query = adminEl('customer-search').value.trim().toLowerCase();
  const filter = adminEl('access-filter').value;
  return studioAdminState.rows.filter(row => {
    const haystack = [row.user.name, row.user.email].filter(Boolean).join(' ').toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (filter === 'any' && row.activeAccess.length === 0) return false;
    if (filter === 'none' && row.activeAccess.length > 0) return false;
    if (filter === 'seeninseven' && !row.seenInSevenAccess) return false;
    return true;
  });
}

function renderCustomers() {
  const rows = filteredCustomerRows();
  const tbody = adminEl('customer-rows');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No customers match this view.</td></tr>';
    adminEl('customer-count').textContent = '0 shown';
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const name = row.user.name || 'Studio customer';
    const badges = APP_CATALOG.filter(app => app.connected).map(app => {
      const active = row.activeAccess.some(item => item.app_key === app.key);
      return '<span class="access-badge' + (active ? ' active' : '') + '">' + escapeHtml(app.name) + '</span>';
    }).join('');
    const progressPercent = Math.round((row.filmedCount / 7) * 100);
    const accessButton = row.seenInSevenAccess
      ? '<button class="revoke" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'seeninseven\',false)">Remove SIS</button>'
      : '<button onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'seeninseven\',true)">Grant SIS</button>';
    return '<tr>' +
      '<td><div class="customer-name">' + escapeHtml(name) + (row.user.is_admin ? '<span class="customer-role">Admin</span>' : '') + '</div><div class="customer-email">' + escapeHtml(row.user.email || 'No email') + '</div></td>' +
      '<td><div class="access-badges">' + badges + '</div></td>' +
      '<td><div class="progress-mini"><div class="progress-mini-bar"><div class="progress-mini-fill" style="width:' + progressPercent + '%"></div></div><span>' + row.filmedCount + '/7 filmed · ' + row.scriptCount + '/7 scripts</span></div></td>' +
      '<td>' + escapeHtml(formatDate(row.lastActive)) + '</td>' +
      '<td><div class="access-control">' + accessButton + '</div></td>' +
      '<td><button class="icon-button row-detail-button" type="button" title="View customer" aria-label="View ' + safeAttr(name) + '" onclick="openCustomer(\'' + safeAttr(row.user.id) + '\')"><i data-lucide="chevron-right"></i></button></td>' +
      '</tr>';
  }).join('');
  adminEl('customer-count').textContent = rows.length + ' of ' + studioAdminState.rows.length + ' customers shown';
  refreshAdminIcons();
}

async function setAppAccess(event, userId, appKey, enabled) {
  event.stopPropagation();
  const app = APP_CATALOG.find(item => item.key === appKey);
  if (!app || !app.connected) return;
  if (!enabled && !window.confirm('Remove this customer\'s access to ' + app.name + '? Their saved work will remain in place.')) return;

  const button = event.currentTarget;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving...';
  try {
    const { error } = await adminSb.rpc('admin_set_studio_access', {
      target_user_id: userId,
      target_app_key: appKey,
      enabled,
      target_access_source: 'admin'
    });
    if (error) throw error;
    await loadStudioAdmin();
    if (!adminEl('drawer-backdrop').hidden) openCustomer(userId);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    adminEl('admin-notice').hidden = false;
    adminEl('admin-notice').textContent = 'Access was not changed. Please refresh and try again.';
  }
}

function drawerKv(label, value) {
  return '<div class="drawer-kv"><span>' + escapeHtml(label) + '</span><span>' + escapeHtml(value) + '</span></div>';
}

function openCustomer(userId) {
  const row = studioAdminState.rows.find(item => item.user.id === userId);
  if (!row) return;
  const name = row.user.name || 'Studio customer';
  adminEl('drawer-title').textContent = name;
  const sisAccess = row.seenInSevenAccess;
  adminEl('drawer-content').innerHTML =
    '<div class="drawer-profile"><h3>' + escapeHtml(name) + '</h3><p>' + escapeHtml(row.user.email || 'No email') + '</p></div>' +
    '<section class="drawer-section"><h4>Studio summary</h4>' +
      drawerKv('Joined', formatDate(row.user.created_at)) +
      drawerKv('Last active', formatDate(row.lastActive)) +
      drawerKv('Apps available', String(row.activeAccess.length)) +
    '</section>' +
    '<section class="drawer-section"><h4>App access</h4>' +
      '<article class="drawer-app"><div class="drawer-app-head"><strong>SeenInSeven</strong><span class="access-badge' + (sisAccess ? ' active' : '') + '">' + (sisAccess ? 'Active' : 'No access') + '</span></div>' +
      '<p>' + row.scriptCount + ' of 7 scripts and ' + row.filmedCount + ' of 7 videos filmed.</p>' +
      '<div class="drawer-actions">' +
        (sisAccess
          ? '<button class="secondary-button" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'seeninseven\',false)">Remove access</button>'
          : '<button class="secondary-button" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'seeninseven\',true)">Grant access</button>') +
        '<a class="secondary-button" href="/admin/seeninseven">Open app admin</a>' +
      '</div></article>' +
      '<article class="drawer-app"><div class="drawer-app-head"><strong>AI Boardroom</strong><span class="access-badge">Not connected</span></div><p>This control becomes available when the Boardroom joins Studio.</p></article>' +
    '</section>';
  adminEl('drawer-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  refreshAdminIcons();
}

function closeCustomer() {
  adminEl('drawer-backdrop').hidden = true;
  document.body.style.overflow = '';
}

async function signOutAdmin() {
  await adminSb.auth.signOut();
  studioAdminSession = null;
  adminEl('account-menu').hidden = true;
  adminEl('admin-app').hidden = true;
  adminEl('auth-screen').hidden = false;
  setAuthMessage('');
}

adminSb.auth.onAuthStateChange((event, session) => {
  if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED'].includes(event)) return;
  setTimeout(() => {
    if (!session || !session.user) {
      adminEl('auth-screen').hidden = false;
      adminEl('admin-app').hidden = true;
      return;
    }
    enterAdmin(session).catch(() => showDenied(session.user.email));
  }, 0);
});

adminEl('admin-auth-form').addEventListener('submit', sendAdminLink);
adminEl('theme-button').addEventListener('click', toggleAdminTheme);
adminEl('refresh-button').addEventListener('click', loadStudioAdmin);
adminEl('customer-search').addEventListener('input', renderCustomers);
adminEl('access-filter').addEventListener('change', renderCustomers);
adminEl('account-button').addEventListener('click', () => { adminEl('account-menu').hidden = !adminEl('account-menu').hidden; });
adminEl('sign-out-button').addEventListener('click', signOutAdmin);
adminEl('drawer-close').addEventListener('click', closeCustomer);
adminEl('drawer-backdrop').addEventListener('click', event => { if (event.target === adminEl('drawer-backdrop')) closeCustomer(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeCustomer();
    adminEl('account-menu').hidden = true;
  }
});

refreshAdminIcons();
