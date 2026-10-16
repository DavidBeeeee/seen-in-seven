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

// Per-app access (WBR-442). Every app has its own switch; the Momentum Hub
// bundle ('eee', what a purchase grants) opens every Hub app, including AI
// Boardroom. An app a person holds only through the bundle shows "via Hub".
const ACCESS_APPS = [
  { key: 'seeninseven', name: 'SeenInSeven', short: 'SeenInSeven', hub: false },
  { key: 'storysculpt', name: 'StorySculpt', short: 'StorySculpt', hub: true },
  { key: 'navigator', name: 'Next Step Navigator', short: 'Navigator', hub: true },
  { key: 'vault', name: 'Solution Vault', short: 'Vault', hub: true },
  { key: 'boardroom', name: 'AI Boardroom', short: 'Boardroom', hub: true },
  { key: 'certainty', name: 'Certainty Sessions', short: 'Certainty', hub: true }
];
const HUB_BUNDLE = { key: 'eee', name: 'Full Momentum Hub', short: 'Full Hub' };
const HUB_APP_KEYS = ACCESS_APPS.filter(app => app.hub).map(app => app.key);

function accessAppName(appKey) {
  if (appKey === HUB_BUNDLE.key) return HUB_BUNDLE.name;
  const app = ACCESS_APPS.find(item => item.key === appKey);
  return app ? app.name : appKey;
}

// 'own' (its own switch), 'bundle' (only through the Momentum Hub), or 'none'.
function appAccessState(row, appKey) {
  if (row.activeAccess.some(item => item.app_key === appKey)) return 'own';
  if (appKey !== HUB_BUNDLE.key && HUB_APP_KEYS.includes(appKey) && row.activeAccess.some(item => item.app_key === HUB_BUNDLE.key)) return 'bundle';
  return 'none';
}

const adminEl = id => document.getElementById(id);
let studioAdminSession = null;
let studioAdminState = { users: [], entitlements: [], grants: [], webhooks: [], scripts: [], progress: [], logs: [], boardroom: [], catalog: [], hubUsage: [], books: [], bookGrants: [], rows: [], errors: {} };

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
    rpcSafe('hubUsage', 'admin_get_hub_usage'),
    tableSafe('catalog', 'studio_catalog_settings', 'app_key,catalog_mode,updated_at'),
    tableSafe('books', 'solution_vault_books', 'id,slug,title,subtitle,format,is_published,created_at'),
    tableSafe('bookGrants', 'solution_vault_book_grants', 'id,user_id,book_id,source_kind,source_id,status,granted_at,revoked_at')
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
  studioAdminState.hubUsage = loaded.hubUsage.data;
  studioAdminState.catalog = loaded.catalog.data;
  studioAdminState.books = loaded.books ? loaded.books.data : [];
  studioAdminState.bookGrants = loaded.bookGrants ? loaded.bookGrants.data : [];
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
      boardroomAccess: activeAccess.some(item => item.app_key === 'boardroom' || item.app_key === 'eee'),
      eeeAccess: activeAccess.some(item => item.app_key === 'eee'),
      hubAccess: activeAccess.some(item => item.app_key === 'eee' || HUB_APP_KEYS.includes(item.app_key)),
      boardroom: boardroom[0] || null
    };
  }).sort((a, b) => dateMs(b.lastActive) - dateMs(a.lastActive));
}

function renderBooksSummary() {
  const books = studioAdminState.books || [];
  const grants = studioAdminState.bookGrants || [];
  const published = books.filter(b => b.is_published !== false);
  const activeGrants = grants.filter(g => g.status === 'active');
  const setText = (id, value) => { const el = adminEl(id); if (el) el.textContent = String(value); };
  setText('books-total', books.length);
  setText('books-published', published.length);
  setText('books-grants', activeGrants.length);
}

function renderStudioAdmin() {
  renderNotice();
  renderMetrics();
  renderAppSummary();
  renderBooksSummary();
  renderHubUsage();
  renderEeeVisibility();
  renderCommerce();
  renderCustomers();
  refreshAdminIcons();
}

// WBR-384: surface each Momentum Hub tool's server-logged usage. Defensive by
// design: any failure here must never break the rest of the admin, so it is
// wrapped and every element write is guarded.
function renderHubUsage() {
  try {
    const usage = (Array.isArray(studioAdminState.hubUsage) && studioAdminState.hubUsage[0]) || {};
    const setText = (id, value) => { const el = adminEl(id); if (el) el.textContent = value; };
    setText('usage-storysculpt', String(Number(usage.storysculpt_generations || 0)));
    setText('usage-navigator', String(Number(usage.navigator_generations || 0)));
    setText('usage-boardroom', String(Number(usage.boardroom_deepseek_calls || 0)));
    setText('usage-certainty', String(Number(usage.certainty_events || 0)));
    const lastValues = [usage.storysculpt_last, usage.navigator_last, usage.boardroom_last, usage.certainty_last]
      .map(dateMs).filter(ms => ms > 0);
    const updated = adminEl('usage-updated');
    if (updated) {
      updated.textContent = lastValues.length
        ? 'Last tool activity ' + formatDate(new Date(Math.max.apply(null, lastValues)).toISOString())
        : (studioAdminState.errors && studioAdminState.errors.hubUsage ? 'Usage could not be loaded.' : 'No tool usage recorded yet.');
    }
  } catch (error) {
    // Never let the usage panel break the admin.
  }
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
    if (HUB_APP_KEYS.includes(filter) && filter !== 'boardroom' && appAccessState(row, filter) === 'none') return false;
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
    // Only what they can actually open, so the column reads at a glance.
    const badges = (row.eeeAccess ? '<span class="access-badge active">' + escapeHtml(HUB_BUNDLE.name) + '</span>' : '') +
      ACCESS_APPS.filter(app => appAccessState(row, app.key) === 'own')
        .map(app => '<span class="access-badge active">' + escapeHtml(app.name) + '</span>').join('') ||
      '<span class="access-badge">No apps</span>';
    const progressPercent = Math.round((row.filmedCount / 7) * 100);
    const switches = accessSwitches(row);
    return '<tr>' +
      '<td><div class="customer-name">' + escapeHtml(name) + (row.user.is_admin ? '<span class="customer-role">Admin</span>' : '') + '</div><div class="customer-email">' + escapeHtml(row.user.email || 'No email') + '</div></td>' +
      '<td><div class="access-badges">' + badges + '</div></td>' +
      '<td><div class="progress-mini"><div class="progress-mini-bar"><div class="progress-mini-fill" style="width:' + progressPercent + '%"></div></div><span>' + row.filmedCount + '/7 filmed · ' + row.scriptCount + '/7 scripts</span></div></td>' +
      '<td>' + escapeHtml(formatDate(row.lastActive)) + '</td>' +
      '<td><div class="access-control">' + switches + '</div></td>' +
      '<td><button class="icon-button row-detail-button" type="button" title="View customer" aria-label="View ' + safeAttr(name) + '" onclick="openCustomer(\'' + safeAttr(row.user.id) + '\')"><i data-lucide="chevron-right"></i></button></td>' +
      '</tr>';
  }).join('');
  adminEl('customer-count').textContent = rows.length + ' of ' + studioAdminState.rows.length + ' customers shown';
  refreshAdminIcons();
}

// One switch per app plus the bundle. On: click removes. Off: click grants.
// Via Hub: click offers to take just this app away from a bundle member.
function accessSwitches(row, { hubOnly = false } = {}) {
  const id = safeAttr(row.user.id);
  const one = (key, label) => {
    const state = appAccessState(row, key);
    const title = accessAppName(key) + (state === 'own' ? ': on. Click to remove.' : state === 'bundle' ? ': on through the Full Momentum Hub. Click to remove just this app.' : ': off. Click to grant.');
    const action = state === 'own'
      ? 'setAppAccess(event,\'' + id + '\',\'' + key + '\',false)'
      : state === 'bundle'
        ? 'removeFromHub(event,\'' + id + '\',\'' + key + '\')'
        : 'setAppAccess(event,\'' + id + '\',\'' + key + '\',true)';
    return '<button type="button" class="access-switch is-' + state + '" aria-pressed="' + (state !== 'none') + '" title="' + safeAttr(title) + '" onclick="' + action + '">' +
      escapeHtml(label) + (state === 'bundle' ? ' <small>via Hub</small>' : '') + '</button>';
  };
  return ACCESS_APPS.filter(app => !hubOnly || app.hub).map(app => one(app.key, app.short)).join('') + one(HUB_BUNDLE.key, HUB_BUNDLE.short);
}

// Take one app away from someone who has it through the Momentum Hub bundle:
// they move from the bundle to individual switches for every other Hub app,
// so nothing else changes for them.
async function removeFromHub(event, userId, appKey) {
  event.stopPropagation();
  const customer = studioAdminState.rows.find(item => item.user.id === userId);
  const keep = HUB_APP_KEYS.filter(key => key !== appKey);
  const who = customer && (customer.user.name || customer.user.email) || 'This customer';
  if (!window.confirm(who + ' has ' + accessAppName(appKey) + ' through the Full Momentum Hub. Remove just ' + accessAppName(appKey) + '? They will keep ' + keep.map(accessAppName).join(', ') + ' as individual apps. Their saved work stays in place.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    for (const key of keep) {
      if (customer && appAccessState(customer, key) === 'own') continue;
      const { error } = await adminSb.rpc('admin_set_studio_access', { target_user_id: userId, target_app_key: key, enabled: true, target_access_source: 'admin' });
      if (error) throw error;
    }
    const own = customer && customer.activeAccess.some(item => item.app_key === appKey);
    if (own) {
      const { error } = await adminSb.rpc('admin_set_studio_access', { target_user_id: userId, target_app_key: appKey, enabled: false, target_access_source: 'admin' });
      if (error) throw error;
    }
    const { error } = await adminSb.rpc('admin_set_studio_access', { target_user_id: userId, target_app_key: HUB_BUNDLE.key, enabled: false, target_access_source: 'admin' });
    if (error) throw error;
    await loadStudioAdmin();
    reportAccessOutcome(userId, appKey, false);
    if (!adminEl('drawer-backdrop').hidden) openCustomer(userId);
  } catch (error) {
    button.disabled = false;
    adminEl('admin-notice').hidden = false;
    adminEl('admin-notice').textContent = 'Access was not changed. Please refresh and try again.';
  }
}

// Say what is actually true after a change. A purchase grant is separate from
// an admin grant, so removing the admin one can leave access on; say so rather
// than let the page look like the removal worked.
function reportAccessOutcome(userId, appKey, wanted) {
  const row = studioAdminState.rows.find(item => item.user.id === userId);
  if (!row) return;
  const now = appKey === HUB_BUNDLE.key ? row.eeeAccess : appAccessState(row, appKey) !== 'none';
  if (now === wanted) return;
  adminEl('admin-notice').hidden = false;
  adminEl('admin-notice').textContent = wanted
    ? accessAppName(appKey) + ' did not turn on. Please refresh and try again.'
    : accessAppName(appKey) + ' is still on for this person because it also comes from a purchase or the Full Momentum Hub. Remove that first.';
}

async function setAppAccess(event, userId, appKey, enabled) {
  event.stopPropagation();
  const app = { key: appKey, name: accessAppName(appKey) };
  const customer = studioAdminState.rows.find(item => item.user.id === userId);
  if (appKey !== HUB_BUNDLE.key && !ACCESS_APPS.some(item => item.key === appKey)) return;
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
    reportAccessOutcome(userId, appKey, enabled);
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
  const appKeys = ACCESS_APPS.concat([HUB_BUNDLE]).filter(app => adminEl('enrollment-' + app.key) && adminEl('enrollment-' + app.key).checked).map(app => app.key);
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

    const book5eCheckbox = adminEl('enrollment-book-5e');
    if (book5eCheckbox && book5eCheckbox.checked) {
      try {
        await adminSb.rpc('admin_grant_book_by_email', {
          p_email: email,
          p_book_slug: 'the-5e-framework',
          p_source_kind: 'admin',
          p_source_id: 'manual'
        });
      } catch (bookErr) {
        // Book grant failed but customer enrolled
      }
    }

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

function customerBookSection(row) {
  const books = studioAdminState.books || [];
  const allGrants = studioAdminState.bookGrants || [];
  const userGrants = allGrants.filter(g => g.user_id === row.user.id && g.status === 'active');

  if (!books.length) {
    return '<p style="color: var(--studio-muted); font-size: 12px;">No books are registered in the catalog yet.</p>';
  }

  return books.map(book => {
    const activeGrant = userGrants.find(g => g.book_id === book.id);
    const hasAccess = Boolean(activeGrant);
    return '<article class="drawer-app">' +
      '<div class="drawer-app-head">' +
        '<strong>' + escapeHtml(book.title) + '</strong>' +
        '<span class="access-badge' + (hasAccess ? ' active' : '') + '">' + (hasAccess ? 'Active grant' : 'No access') + '</span>' +
      '</div>' +
      '<p>' + escapeHtml(book.subtitle || (book.format ? book.format.toUpperCase() + ' book' : 'Book')) +
        (activeGrant ? ' · Granted via ' + escapeHtml(activeGrant.source_kind) + ' (' + formatDate(activeGrant.granted_at) + ')' : '') +
      '</p>' +
      '<div class="drawer-actions">' +
        (hasAccess
          ? '<button class="secondary-button" onclick="adminRevokeBook(event,\'' + safeAttr(row.user.id) + '\',\'' + safeAttr(book.slug) + '\',\'' + safeAttr(activeGrant.source_kind) + '\',\'' + safeAttr(activeGrant.source_id) + '\')">Revoke book</button>'
          : '<button class="secondary-button" onclick="adminGrantBook(event,\'' + safeAttr(row.user.id) + '\',\'' + safeAttr(book.slug) + '\')">Grant book</button>') +
      '</div>' +
    '</article>';
  }).join('');
}

function openCustomer(userId) {
  const row = studioAdminState.rows.find(item => item.user.id === userId);
  if (!row) return;
  const name = row.user.name || 'Studio customer';
  adminEl('drawer-title').textContent = name;
  const sisAccess = row.seenInSevenAccess;
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
      '<article class="drawer-app"><div class="drawer-app-head"><strong>Momentum Hub apps</strong><span class="access-badge' + (row.hubAccess ? ' active' : '') + '">' + (row.eeeAccess ? 'Full Hub' : row.hubAccess ? 'Some apps' : 'No access') + '</span></div>' +
      '<p>Turn each app on or off. "Via Hub" means it comes with the Full Momentum Hub; removing one of those keeps the others as individual apps. AI Boardroom: ' + Number(boardroom.conversations || 0) + ' conversations and ' + Number(boardroom.active_cards || 0) + ' open cards.</p>' +
      '<div class="access-control drawer-switches">' + accessSwitches(row, { hubOnly: true }) + '</div>' +
      '<div class="drawer-actions"><a class="secondary-button" href="/eee">Open Hub home</a><a class="secondary-button" href="/admin/boardroom">Boardroom admin</a></div>' +
      '</article>' +
    '</section>' +
    '<section class="drawer-section"><h4>Solution Vault Books</h4>' +
      customerBookSection(row) +
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

async function adminGrantBook(event, userId, bookSlug) {
  event.stopPropagation();
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Granting...';
  try {
    const { error } = await adminSb.rpc('admin_grant_book', {
      p_user_id: userId,
      p_book_slug: bookSlug,
      p_source_kind: 'admin',
      p_source_id: 'manual'
    });
    if (error) throw error;
    await loadStudioAdmin();
    openCustomer(userId);
  } catch (error) {
    alert('Could not grant book: ' + (error.message || String(error)));
    button.disabled = false;
    button.textContent = 'Grant book';
  }
}

async function adminRevokeBook(event, userId, bookSlug, sourceKind, sourceId) {
  event.stopPropagation();
  if (!window.confirm('Revoke access to ' + bookSlug + '? Their saved reading position will remain in place.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Revoking...';
  try {
    const { error } = await adminSb.rpc('admin_revoke_book_grant', {
      p_user_id: userId,
      p_book_slug: bookSlug,
      p_source_kind: sourceKind || 'admin',
      p_source_id: sourceId || 'manual'
    });
    if (error) throw error;
    await loadStudioAdmin();
    openCustomer(userId);
  } catch (error) {
    alert('Could not revoke book grant: ' + (error.message || String(error)));
    button.disabled = false;
    button.textContent = 'Revoke book';
  }
}

async function adminToggleBookPublish(event, bookSlug, currentlyPublished) {
  event.stopPropagation();
  if (currentlyPublished && !window.confirm('Unpublish ' + bookSlug + '? Existing entitled readers will keep access, but new distribution stops.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    if (currentlyPublished) {
      const { error } = await adminSb.rpc('admin_unpublish_book', { p_book_slug: bookSlug });
      if (error) throw error;
    } else {
      const { error } = await adminSb.from('solution_vault_books').update({ is_published: true }).eq('slug', bookSlug);
      if (error) throw error;
    }
    await loadStudioAdmin();
  } catch (error) {
    alert('Could not update book status: ' + (error.message || String(error)));
    button.disabled = false;
  }
}

window.adminGrantBook = adminGrantBook;
window.adminRevokeBook = adminRevokeBook;
window.adminToggleBookPublish = adminToggleBookPublish;

refreshAdminIcons();
