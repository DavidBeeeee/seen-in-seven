const ADMIN_SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const ADMIN_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const ADMIN_EMAILS = new Set(['contact@davidbee.me', 'email@davidbee.me', 'davidkamau.t@gmail.com', 'davidkamau@live.com']);
const ADMIN_THEME_KEY = 'sis_theme_v1';
const adminSb = supabase.createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_KEY);

const APP_CATALOG = [
  { key: 'seeninseven', name: 'SeenInSeven', connected: true, adminPath: '/admin/seeninseven' },
  { key: 'boardroom', name: 'AI Boardroom', connected: true, adminPath: '/admin/boardroom' },
  { key: 'eee', name: 'EEE Membership', connected: true, adminPath: '/eee' }
];

const adminEl = id => document.getElementById(id);
let studioAdminSession = null;
let studioAdminState = { users: [], entitlements: [], grants: [], webhooks: [], scripts: [], progress: [], logs: [], boardroom: [], catalog: [], rows: [], errors: {} };

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

function maskEmail(value) {
  const email = String(value || '');
  const parts = email.split('@');
  if (parts.length !== 2) return email || 'Unknown customer';
  const local = parts[0];
  return (local.length <= 2 ? local.charAt(0) + '*' : local.slice(0, 2) + '*'.repeat(Math.min(5, local.length - 2))) + '@' + parts[1];
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

function setEnrollmentMessage(message, type) {
  const element = adminEl('enrollment-message');
  element.textContent = message || '';
  element.className = 'enrollment-message' + (type ? ' ' + type : '');
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

async function tableSafe(name, tableName, columns) {
  try {
    const { data, error } = await adminSb.from(tableName).select(columns);
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
    rpcSafe('grants', 'admin_get_studio_access_grants'),
    rpcSafe('webhooks', 'admin_get_systeme_webhook_events'),
    rpcSafe('scripts', 'admin_get_scripts'),
    rpcSafe('progress', 'admin_get_progress'),
    rpcSafe('logs', 'admin_get_logs'),
    rpcSafe('boardroom', 'admin_get_boardroom_activity'),
    tableSafe('catalog', 'studio_catalog_settings', 'app_key,catalog_mode,updated_at')
  ]);
  const loaded = Object.fromEntries(results.map(result => [result.name, result]));
  studioAdminState.users = loaded.users.data;
  studioAdminState.entitlements = loaded.entitlements.data;
  studioAdminState.grants = loaded.grants.data;
  studioAdminState.webhooks = loaded.webhooks.data;
  studioAdminState.scripts = loaded.scripts.data;
  studioAdminState.progress = loaded.progress.data;
  studioAdminState.logs = loaded.logs.data;
  studioAdminState.boardroom = loaded.boardroom.data;
  studioAdminState.catalog = loaded.catalog.data;
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
  const boardroomByUser = groupBy(studioAdminState.boardroom, 'user_id');

  return studioAdminState.users.map(user => {
    const entitlements = accessByUser[user.id] || [];
    const activeAccess = entitlements.filter(isActiveEntitlement);
    const scripts = scriptsByUser[user.id] || [];
    const progress = progressByUser[user.id] || [];
    const logs = (logsByUser[user.id] || []).slice().sort((a, b) => dateMs(b.created_at) - dateMs(a.created_at));
    const filmed = progress.filter(item => item.status === 'filmed');
    const boardroom = boardroomByUser[user.id] || [];
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
      seenInSevenAccess: activeAccess.some(item => item.app_key === 'seeninseven'),
      boardroomAccess: activeAccess.some(item => item.app_key === 'boardroom'),
      eeeAccess: activeAccess.some(item => item.app_key === 'eee'),
      boardroom: boardroom[0] || null
    };
  }).sort((a, b) => dateMs(b.lastActive) - dateMs(a.lastActive));
}

function renderStudioAdmin() {
  renderNotice();
  renderMetrics();
  renderAppSummary();
  renderEeeVisibility();
  renderCommerce();
  renderCustomers();
  refreshAdminIcons();
}

function currentEeeCatalogMode() {
  const setting = studioAdminState.catalog.find(item => item.app_key === 'eee');
  return setting && ['automatic', 'visible', 'hidden'].includes(setting.catalog_mode)
    ? setting.catalog_mode
    : 'automatic';
}

function adminEeeCartOpen() {
  return Boolean(
    window.SevenSevenSevenLaunch &&
    window.SevenSevenSevenLaunch.launchState().cart === 'open'
  );
}

function renderEeeVisibility() {
  const mode = currentEeeCatalogMode();
  adminEl('eee-visibility-' + mode).checked = true;
  const status = mode === 'visible'
    ? 'Non-members can currently see the EEE card in Studio.'
    : mode === 'hidden'
      ? 'Only members can currently see the EEE card in Studio.'
      : adminEeeCartOpen()
        ? 'Automatic mode is active. The cart is open, so non-members can see the EEE card.'
        : 'Automatic mode is active. The card will appear to non-members when the founders cart opens.';
  adminEl('eee-visibility-status').textContent = status;
}

async function saveEeeVisibility(event) {
  event.preventDefault();
  const selected = document.querySelector('input[name="eee-visibility"]:checked');
  const mode = selected ? selected.value : 'automatic';
  const button = adminEl('eee-visibility-submit');
  const message = adminEl('eee-visibility-message');
  button.disabled = true;
  button.querySelector('span').textContent = 'Saving...';
  message.textContent = '';
  message.className = 'enrollment-message';
  try {
    const { error } = await adminSb.rpc('admin_set_studio_catalog_visibility', { target_mode: mode });
    if (error) throw error;
    message.textContent = 'EEE Studio visibility updated.';
    message.className = 'enrollment-message success';
    await loadStudioAdmin();
  } catch (error) {
    message.textContent = 'Visibility was not changed. Please refresh and try again.';
    message.className = 'enrollment-message error';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Save visibility';
  }
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
  const boardroomRows = studioAdminState.rows.filter(row => row.boardroomAccess);
  adminEl('boardroom-users').textContent = boardroomRows.length;
  adminEl('boardroom-sessions').textContent = studioAdminState.boardroom.reduce((sum, row) => sum + Number(row.conversations || 0), 0);
  adminEl('boardroom-cards').textContent = studioAdminState.boardroom.reduce((sum, row) => sum + Number(row.active_cards || 0), 0);
  const eeeRows = studioAdminState.rows.filter(row => row.eeeAccess);
  const eeeGrants = studioAdminState.grants.filter(item => item.app_key === 'eee' && item.status === 'active');
  const canceled = studioAdminState.webhooks.filter(item => String(item.event_type || '').toLowerCase().includes('canceled') && item.status === 'processed');
  adminEl('eee-users').textContent = eeeRows.length;
  adminEl('eee-active-grants').textContent = eeeGrants.length;
  adminEl('eee-canceled').textContent = canceled.length;
}

function renderCommerce() {
  const rows = studioAdminState.webhooks.slice().sort((a, b) => dateMs(b.received_at) - dateMs(a.received_at));
  const processed = rows.filter(row => row.status === 'processed').length;
  const duplicates = rows.reduce((sum, row) => sum + Math.max(0, Number(row.delivery_count || 1) - 1), 0);
  const failed = rows.filter(row => row.status === 'failed').length;
  adminEl('commerce-processed').textContent = processed;
  adminEl('commerce-duplicates').textContent = duplicates;
  adminEl('commerce-failed').textContent = failed;
  adminEl('commerce-count').textContent = rows.length + ' recent event' + (rows.length === 1 ? '' : 's');

  const tbody = adminEl('commerce-rows');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No Systeme purchase events have arrived yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.slice(0, 100).map(row => {
    const payload = row.payload || {};
    const statusClass = row.status === 'failed' ? ' webhook-failed' : row.status === 'processed' ? ' webhook-processed' : '';
    const product = row.product_key || row.price_plan_id || 'Unmapped price plan';
    return '<tr>' +
      '<td><span class="webhook-status' + statusClass + '">' + escapeHtml(row.status || 'received') + '</span></td>' +
      '<td>' + escapeHtml(row.event_type || 'Unknown event') + (Number(row.delivery_count || 1) > 1 ? '<small class="event-attempts">' + Number(row.delivery_count) + ' deliveries</small>' : '') + '</td>' +
      '<td>' + escapeHtml(maskEmail(row.customer_email)) + '</td>' +
      '<td>' + escapeHtml(product) + '</td>' +
      '<td>' + escapeHtml(formatDate(row.received_at)) + '</td>' +
      '<td><code class="message-id">' + escapeHtml(String(row.message_id || '').slice(0, 12)) + '</code></td>' +
      '</tr>';
  }).join('');
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
    if (filter === 'boardroom' && !row.boardroomAccess) return false;
    if (filter === 'eee' && !row.eeeAccess) return false;
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
    const sisButton = row.seenInSevenAccess
      ? '<button class="revoke" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'seeninseven\',false)">Remove SIS</button>'
      : '<button onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'seeninseven\',true)">Grant SIS</button>';
    const boardroomButton = row.boardroomAccess
      ? '<button class="revoke" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'boardroom\',false)">Remove Boardroom</button>'
      : '<button onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'boardroom\',true)">Grant Boardroom</button>';
    const eeeButton = row.eeeAccess
      ? '<button class="revoke" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'eee\',false)">Remove EEE</button>'
      : '<button onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'eee\',true)">Grant EEE</button>';
    return '<tr>' +
      '<td><div class="customer-name">' + escapeHtml(name) + (row.user.is_admin ? '<span class="customer-role">Admin</span>' : '') + '</div><div class="customer-email">' + escapeHtml(row.user.email || 'No email') + '</div></td>' +
      '<td><div class="access-badges">' + badges + '</div></td>' +
      '<td><div class="progress-mini"><div class="progress-mini-bar"><div class="progress-mini-fill" style="width:' + progressPercent + '%"></div></div><span>' + row.filmedCount + '/7 filmed · ' + row.scriptCount + '/7 scripts</span></div></td>' +
      '<td>' + escapeHtml(formatDate(row.lastActive)) + '</td>' +
      '<td><div class="access-control">' + sisButton + boardroomButton + eeeButton + '</div></td>' +
      '<td><button class="icon-button row-detail-button" type="button" title="View customer" aria-label="View ' + safeAttr(name) + '" onclick="openCustomer(\'' + safeAttr(row.user.id) + '\')"><i data-lucide="chevron-right"></i></button></td>' +
      '</tr>';
  }).join('');
  adminEl('customer-count').textContent = rows.length + ' of ' + studioAdminState.rows.length + ' customers shown';
  refreshAdminIcons();
}

async function setAppAccess(event, userId, appKey, enabled) {
  event.stopPropagation();
  const app = APP_CATALOG.find(item => item.key === appKey);
  const customer = studioAdminState.rows.find(item => item.user.id === userId);
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
    if (enabled && customer && customer.user.email) {
      const inviteError = await sendStudioAccessEmail(customer.user.email, appKey);
      adminEl('admin-notice').hidden = false;
      adminEl('admin-notice').textContent = inviteError
        ? app.name + ' access is ready, but the access email could not be sent. You can try granting access again later.'
        : app.name + ' access is ready and their Studio access email is on its way.';
    }
    if (!adminEl('drawer-backdrop').hidden) openCustomer(userId);
  } catch (error) {
    button.disabled = false;
    button.textContent = original;
    adminEl('admin-notice').hidden = false;
    adminEl('admin-notice').textContent = 'Access was not changed. Please refresh and try again.';
  }
}

async function sendStudioAccessEmail(email, appKey) {
  const { error } = await adminSb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + '/?access=' + encodeURIComponent(appKey),
      shouldCreateUser: true
    }
  });
  return error || null;
}

async function enrollCustomer(event) {
  event.preventDefault();
  const email = adminEl('enrollment-email').value.trim().toLowerCase();
  const name = adminEl('enrollment-name').value.trim();
  const appKeys = APP_CATALOG.filter(app => adminEl('enrollment-' + app.key).checked).map(app => app.key);
  const button = adminEl('enrollment-submit');

  if (!email) {
    setEnrollmentMessage('Enter an email address first.', 'error');
    return;
  }
  if (!appKeys.length) {
    setEnrollmentMessage('Choose at least one app to enroll this person in.', 'error');
    return;
  }

  button.disabled = true;
  button.querySelector('span').textContent = 'Enrolling...';
  setEnrollmentMessage('');
  try {
    const { error } = await adminSb.rpc('admin_enroll_studio_customer', {
      target_email: email,
      target_name: name || null,
      target_app_keys: appKeys
    });
    if (error) throw error;

    const linkError = await sendStudioAccessEmail(email, appKeys[0]);
    setEnrollmentMessage(
      linkError
        ? 'Access is ready for ' + email + ', but the Studio access email could not be sent.'
        : 'Access is ready for ' + email + ' and their Studio access email is on its way.',
      linkError ? 'error' : 'success'
    );
    adminEl('enrollment-form').reset();
    adminEl('enrollment-seeninseven').checked = true;
    await loadStudioAdmin();
  } catch (error) {
    setEnrollmentMessage(error && error.message ? error.message : 'This person could not be enrolled. Please try again.', 'error');
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Enroll person';
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
  const boardroomAccess = row.boardroomAccess;
  const eeeAccess = row.eeeAccess;
  const boardroom = row.boardroom || {};
  const activeGrants = studioAdminState.grants.filter(grant => grant.user_id === row.user.id && grant.status === 'active');
  const grantSummary = activeGrants.length
    ? activeGrants.map(grant => '<span class="access-badge active">' + escapeHtml(grant.app_key + ' · ' + grant.source_kind) + '</span>').join('')
    : '<span class="access-badge">No active grants</span>';
  adminEl('drawer-content').innerHTML =
    '<div class="drawer-profile"><h3>' + escapeHtml(name) + '</h3><p>' + escapeHtml(row.user.email || 'No email') + '</p></div>' +
    '<section class="drawer-section"><h4>Studio summary</h4>' +
      drawerKv('Joined', formatDate(row.user.created_at)) +
      drawerKv('Last active', formatDate(row.lastActive)) +
      drawerKv('Apps available', String(row.activeAccess.length)) +
      '<div class="drawer-grants">' + grantSummary + '</div>' +
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
      '<article class="drawer-app"><div class="drawer-app-head"><strong>AI Boardroom</strong><span class="access-badge' + (boardroomAccess ? ' active' : '') + '">' + (boardroomAccess ? 'Active' : 'No access') + '</span></div>' +
      '<p>' + Number(boardroom.conversations || 0) + ' conversations, ' + Number(boardroom.messages || 0) + ' messages, and ' + Number(boardroom.active_cards || 0) + ' open cards.</p>' +
      '<div class="drawer-actions">' +
        (boardroomAccess
          ? '<button class="secondary-button" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'boardroom\',false)">Remove access</button>'
          : '<button class="secondary-button" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'boardroom\',true)">Grant access</button>') +
        '<a class="secondary-button" href="/admin/boardroom">Open app admin</a>' +
      '</div></article>' +
      '<article class="drawer-app"><div class="drawer-app-head"><strong>EEE Membership</strong><span class="access-badge' + (eeeAccess ? ' active' : '') + '">' + (eeeAccess ? 'Active' : 'No access') + '</span></div>' +
      '<p>StorySculpt, Next Step Navigator, Solution Vault, AI Boardroom, and Certainty Sessions from one Studio home.</p>' +
      '<div class="drawer-actions">' +
        (eeeAccess
          ? '<button class="secondary-button" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'eee\',false)">Remove access</button>'
          : '<button class="secondary-button" onclick="setAppAccess(event,\'' + safeAttr(row.user.id) + '\',\'eee\',true)">Grant access</button>') +
        '<a class="secondary-button" href="/eee">Open EEE home</a>' +
      '</div></article>' +
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
adminEl('enrollment-form').addEventListener('submit', enrollCustomer);
adminEl('eee-visibility-form').addEventListener('submit', saveEeeVisibility);
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
