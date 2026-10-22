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
    tableSafe('books', 'solution_vault_books', 'id,slug,title,subtitle,description,format,status,cover_url,content_path,content_version,page_count,file_size_bytes,sha256,download_enabled,previous_content_path,interactive,updated_at,created_at'),
    tableSafe('bookGrants', 'solution_vault_book_grants', 'id,user_id,book_id,grant_kind,source_kind,source_ref,status,expires_at,granted_at,revoked_at')
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
  const published = books.filter(b => b.status === 'published');
  const activeGrants = grants.filter(g => g.status === 'active');
  const setText = (id, value) => { const el = adminEl(id); if (el) el.textContent = String(value); };
  setText('books-total', books.length);
  setText('books-published', published.length);
  setText('books-grants', activeGrants.length);
  const list = adminEl('books-status-list');
  if (!list) return;
  if (studioAdminState.errors.books) {
    list.innerHTML = '<p class="catalog-visibility-status">Books could not load: ' + escapeHtml(studioAdminState.errors.books) + '</p>';
    return;
  }
  // Publishing distributes a book; unpublishing stops new gifts but every
  // reader who already holds it keeps it. Retiring is left to SQL on purpose.
  list.innerHTML = books.map(book => {
    const isPublished = book.status === 'published';
    const label = { published: 'Published', unpublished: 'Unpublished, readers keep it', draft: 'Draft', retired: 'Retired' }[book.status] || book.status;
    const action = book.status === 'retired' ? '' :
      '<button class="secondary-button" type="button" onclick="adminToggleBookPublish(event,\'' + safeAttr(book.slug) + '\',' + (isPublished ? 'true' : 'false') + ')">' + (isPublished ? 'Unpublish' : 'Publish') + '</button>';
    const edit = book.status === 'retired' ? '' :
      '<button class="secondary-button" type="button" onclick="openBookEditor(\'' + safeAttr(book.slug) + '\')">Edit</button>';
    return '<div class="books-status-row"><span><strong>' + escapeHtml(book.title) + '</strong> · ' + escapeHtml(label) + '</span><span class="books-status-actions">' + edit + action + '</span></div>';
  }).join('');
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

async function sendStudioAccessEmail(email, appKey, nextPath) {
  const { error } = await adminSb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + (nextPath
        ? '/?next=' + encodeURIComponent(nextPath)
        : '/?access=' + encodeURIComponent(appKey)),
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
  const giveBook = Boolean(adminEl('enrollment-book-5e') && adminEl('enrollment-book-5e').checked);
  if (!appKeys.length && !giveBook) {
    setEnrollmentMessage('Choose at least one app or book to give this person.', 'error');
    return;
  }

  button.disabled = true;
  button.querySelector('span').textContent = 'Enrolling...';
  setEnrollmentMessage('');
  try {
    // A book on its own is a gift, not an app enrollment: no Studio app access
    // is created for a book-only recipient (WBR-445).
    if (appKeys.length) {
      const { error } = await adminSb.rpc('admin_enroll_studio_customer', {
        target_email: email,
        target_name: name || null,
        target_app_keys: appKeys
      });
      if (error) throw error;
    }

    let bookNote = '';
    if (giveBook) {
      const { error: bookError } = await adminSb.rpc('admin_grant_book', { p_email: email, p_book_slug: '5e-framework' });
      if (bookError && !appKeys.length) throw bookError;
      bookNote = bookError
        ? ' The 5E Framework was NOT granted: ' + bookError.message
        : ' The 5E Framework is on their Book Shelf as a lifetime gift.';
    }

    const bookOnly = giveBook && !appKeys.length;
    const linkError = await sendStudioAccessEmail(email, appKeys[0], bookOnly ? '/vault?book=5e-framework' : null);
    setEnrollmentMessage(
      (linkError
        ? 'Access is ready for ' + email + ', but the Studio access email could not be sent.'
        : 'Access is ready for ' + email + ' and their Studio access email is on its way.') + bookNote,
      linkError || /NOT granted/.test(bookNote) ? 'error' : 'success'
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
  const books = (studioAdminState.books || []).filter(book => book.status !== 'retired');
  const grants = (studioAdminState.bookGrants || []).filter(g => g.user_id === row.user.id);
  if (studioAdminState.errors.books || studioAdminState.errors.bookGrants) {
    return '<p style="color: var(--studio-muted); font-size: 12px;">Books could not load: ' + escapeHtml(studioAdminState.errors.books || studioAdminState.errors.bookGrants) + '</p>';
  }
  if (!books.length) {
    return '<p style="color: var(--studio-muted); font-size: 12px;">No books are in the catalog yet.</p>';
  }

  // Every contributing source is listed with its own revoke, because access is
  // the union of sources: revoking one leaves the others in place.
  const now = Date.now();
  return books.map(book => {
    const bookGrants = grants.filter(g => g.book_id === book.id);
    const live = bookGrants.filter(g => g.status === 'active' && (!g.expires_at || Date.parse(g.expires_at) > now));
    const sources = bookGrants.map(g => {
      const expired = g.expires_at && Date.parse(g.expires_at) <= now;
      const state = g.status === 'revoked' ? 'revoked ' + formatDate(g.revoked_at) : expired ? 'ended ' + formatDate(g.expires_at) : 'active';
      const kind = g.grant_kind === 'conditional' ? 'conditional until ' + formatDate(g.expires_at) : 'lifetime gift';
      const revoke = g.status === 'active' && !expired
        ? ' <button class="secondary-button" type="button" onclick="adminRevokeBook(event,\'' + safeAttr(g.id) + '\',\'' + safeAttr(row.user.id) + '\')">Revoke this source</button>'
        : '';
      return '<li>' + escapeHtml(g.source_kind + ' (' + g.source_ref + ')') + ' · ' + escapeHtml(kind) + ' · ' + escapeHtml(state) + revoke + '</li>';
    }).join('');
    return '<article class="drawer-app">' +
      '<div class="drawer-app-head">' +
        '<strong>' + escapeHtml(book.title) + '</strong>' +
        '<span class="access-badge' + (live.length ? ' active' : '') + '">' + (live.length ? 'Has this book' : 'No access') + '</span>' +
      '</div>' +
      (sources ? '<ul class="book-grant-sources">' + sources + '</ul>' : '<p>No grants yet.</p>') +
      '<div class="drawer-actions">' +
        (live.some(g => g.source_kind === 'admin' && g.source_ref === 'admin:manual') ? '' :
          '<button class="secondary-button" type="button" onclick="adminGrantBook(event,\'' + safeAttr(row.user.email || '') + '\',\'' + safeAttr(book.slug) + '\',\'' + safeAttr(row.user.id) + '\')">Give as lifetime gift</button>') +
      '</div>' +
    '</article>';
  }).join('');
}

function openCustomer(userId) {
  const row = studioAdminState.rows.find(item => item.user.id === userId);
  if (!row) return;
  const name = row.user.name || 'Studio customer';
  adminEl('drawer-title').textContent = name;
  if (adminEl('drawer-eyebrow')) adminEl('drawer-eyebrow').textContent = 'Customer';
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

async function adminGrantBook(event, email, bookSlug, userId) {
  event.stopPropagation();
  const button = event.currentTarget;
  if (!email) { alert('This customer has no email on file, so a book cannot be granted.'); return; }
  button.disabled = true;
  button.textContent = 'Granting...';
  const { error } = await adminSb.rpc('admin_grant_book', { p_email: email, p_book_slug: bookSlug });
  if (error) {
    alert('Could not grant book: ' + error.message);
    button.disabled = false;
    button.textContent = 'Give as lifetime gift';
    return;
  }
  await loadStudioAdmin();
  openCustomer(userId);
}

async function adminRevokeBook(event, grantId, userId) {
  event.stopPropagation();
  if (!window.confirm('Revoke this source? Any other source that gives them the book stays in place, and their saved page is kept. A copy they already downloaded cannot be taken back.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Revoking...';
  const { data, error } = await adminSb.rpc('admin_revoke_book_grant', { p_grant_id: grantId });
  if (error) {
    alert('Could not revoke: ' + error.message);
    button.disabled = false;
    button.textContent = 'Revoke this source';
    return;
  }
  if (data && data.still_has_book) alert('Revoked. They still have the book through another source.');
  await loadStudioAdmin();
  openCustomer(userId);
}

async function adminToggleBookPublish(event, bookSlug, currentlyPublished) {
  event.stopPropagation();
  if (currentlyPublished && !window.confirm('Unpublish this book? New gifts stop. Everyone who already has it keeps it.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  const { error } = await adminSb.rpc('admin_set_book_status', {
    p_book_slug: bookSlug,
    p_status: currentlyPublished ? 'unpublished' : 'published'
  });
  if (error) {
    alert('Could not update book status: ' + error.message);
    button.disabled = false;
    return;
  }
  await loadStudioAdmin();
}

/* ── Book editor (WBR-445) ───────────────────────────────────────────── */
// Covers go to the public solution-vault-covers bucket; book files go to the
// private solution-vault-books bucket as the next content version. Every
// upload is checked before the book points at it: the file's own checksum is
// re-read from storage, and the database refuses an object that is not there.
// The old file is kept so "Restore previous file" can put it back.
const COVER_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const BOOK_MAX_BYTES = 50 * 1024 * 1024;
const PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

function formatBytes(bytes) {
  if (!bytes) return '-';
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_SRC;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('The PDF checker could not load.'));
    document.head.appendChild(script);
  });
}

function bookEditorMessage(id, text, type) {
  const el = adminEl(id);
  if (!el) return;
  el.textContent = text || '';
  el.className = 'enrollment-message' + (type ? ' ' + type : '');
}

function openBookEditor(slug) {
  const book = (studioAdminState.books || []).find(b => b.slug === slug);
  if (!book) return;
  adminEl('drawer-eyebrow').textContent = 'Book';
  adminEl('drawer-title').textContent = book.title;
  const isPdf = book.format === 'pdf';
  adminEl('drawer-content').innerHTML =
    '<section class="drawer-section"><h4>Details</h4>' +
      '<form class="book-editor-form" id="book-details-form">' +
        '<label>Title<input id="book-edit-title" maxlength="200" required value="' + safeAttr(book.title) + '"></label>' +
        '<label>Subtitle<input id="book-edit-subtitle" maxlength="300" value="' + safeAttr(book.subtitle || '') + '"></label>' +
        '<label>Description<textarea id="book-edit-description" maxlength="1200" rows="4">' + escapeHtml(book.description || '') + '</textarea></label>' +
        (isPdf ? '<label class="book-editor-check"><input id="book-edit-download" type="checkbox"' + (book.download_enabled ? ' checked' : '') + '> Readers can download the PDF</label>' : '') +
        '<button class="secondary-button" type="submit">Save details</button>' +
        '<p class="enrollment-message" id="book-details-message" role="status"></p>' +
      '</form></section>' +
    '<section class="drawer-section"><h4>Cover</h4>' +
      '<div class="book-editor-cover"><img id="book-edit-cover-preview" src="' + safeAttr(book.cover_url || '/assets/eee/vault.png') + '" alt="Current cover">' +
      '<div><p>PNG, JPEG or WebP, up to 5 MB. Portrait works best; it is shown whole, never cropped.</p>' +
      '<input id="book-edit-cover" type="file" accept="image/png,image/jpeg,image/webp">' +
      '<button class="secondary-button" type="button" id="book-cover-save">Upload new cover</button>' +
      '<p class="enrollment-message" id="book-cover-message" role="status"></p></div></div></section>' +
    (isPdf
      ? '<section class="drawer-section"><h4>Book file</h4>' +
          '<p class="book-editor-file">Version ' + escapeHtml(book.content_version) + ' · ' + escapeHtml(book.page_count || '?') + ' pages · ' + escapeHtml(formatBytes(book.file_size_bytes)) +
          (book.sha256 ? ' · SHA-256 ' + escapeHtml(book.sha256.slice(0, 8)) + '...' : '') + '</p>' +
          '<p>Replacing the file keeps the current one, so it can be restored. Readers keep the book; their saved page resets because page numbers may have moved, and the shelf tells them so. Copies people already downloaded are not affected.</p>' +
          '<input id="book-edit-file" type="file" accept="application/pdf">' +
          '<div class="drawer-actions"><button class="secondary-button" type="button" id="book-file-save">Replace book file</button>' +
          (book.previous_content_path ? '<button class="secondary-button" type="button" id="book-file-restore">Restore previous file</button>' : '') + '</div>' +
          '<p class="enrollment-message" id="book-file-message" role="status"></p></section>'
      : '') +
    (book.format === 'interactive' ? '<div id="vi-editor-host"></div>' : '') +
    (!['5e-framework', 'content-lies', 'sample-web-book'].includes(book.slug)
      ? '<section class="drawer-section"><h4>Manage</h4>' +
          '<div class="drawer-actions"><button class="secondary-button" type="button" style="color: var(--studio-danger, #ef4444);" onclick="deleteBook(\'' + safeAttr(book.slug) + '\')">Delete book</button></div></section>'
      : '');
  adminEl('drawer-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  refreshAdminIcons();

  adminEl('book-details-form').addEventListener('submit', event => saveBookDetails(event, book));
  adminEl('book-cover-save').addEventListener('click', () => uploadBookCover(book));
  adminEl('book-edit-cover').addEventListener('change', () => {
    const file = adminEl('book-edit-cover').files[0];
    if (file && COVER_TYPES[file.type]) adminEl('book-edit-cover-preview').src = URL.createObjectURL(file);
  });
  if (isPdf) adminEl('book-file-save').addEventListener('click', () => replaceBookFile(book));
  if (book.format === 'interactive') openInteractiveEditor(book);
  if (adminEl('book-file-restore')) adminEl('book-file-restore').addEventListener('click', () => restoreBookFile(book));
}

function currentDetails(book) {
  return {
    p_book_slug: book.slug,
    p_title: adminEl('book-edit-title').value,
    p_subtitle: adminEl('book-edit-subtitle').value,
    p_description: adminEl('book-edit-description').value,
    p_download_enabled: adminEl('book-edit-download') ? adminEl('book-edit-download').checked : null
  };
}

async function reopenBookEditor(slug) {
  await loadStudioAdmin();
  openBookEditor(slug);
}

async function saveBookDetails(event, book) {
  event.preventDefault();
  bookEditorMessage('book-details-message', 'Saving...');
  const { error } = await adminSb.rpc('admin_update_book_details', currentDetails(book));
  if (error) return bookEditorMessage('book-details-message', 'Not saved: ' + error.message, 'error');
  await reopenBookEditor(book.slug);
  bookEditorMessage('book-details-message', 'Saved. Readers see it the next time their shelf loads.', 'success');
}

async function uploadBookCover(book) {
  const file = adminEl('book-edit-cover').files[0];
  if (!file) return bookEditorMessage('book-cover-message', 'Choose an image first.', 'error');
  const ext = COVER_TYPES[file.type];
  if (!ext) return bookEditorMessage('book-cover-message', 'Covers must be PNG, JPEG or WebP.', 'error');
  if (file.size > COVER_MAX_BYTES) return bookEditorMessage('book-cover-message', 'That image is ' + formatBytes(file.size) + '; the limit is 5 MB.', 'error');

  bookEditorMessage('book-cover-message', 'Uploading...');
  const path = book.slug + '/' + Date.now() + '-cover.' + ext;
  const bucket = adminSb.storage.from('solution-vault-covers');
  const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return bookEditorMessage('book-cover-message', 'Upload failed: ' + uploadError.message, 'error');
  const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
  const { error } = await adminSb.rpc('admin_update_book_details', Object.assign(currentDetails(book), { p_cover_url: publicUrl }));
  if (error) return bookEditorMessage('book-cover-message', 'Uploaded, but the book was not updated: ' + error.message, 'error');
  await reopenBookEditor(book.slug);
  bookEditorMessage('book-cover-message', 'New cover is live. The previous cover image is kept in storage.', 'success');
}

async function replaceBookFile(book) {
  const file = adminEl('book-edit-file').files[0];
  const say = (text, type) => bookEditorMessage('book-file-message', text, type);
  if (!file) return say('Choose a PDF first.', 'error');
  if (file.size > BOOK_MAX_BYTES) return say('That file is ' + formatBytes(file.size) + '; the limit is 50 MB.', 'error');

  const buffer = await file.arrayBuffer();
  if (new TextDecoder().decode(buffer.slice(0, 5)) !== '%PDF-') return say('That file is not a PDF.', 'error');

  say('Checking the PDF...');
  let pages;
  try {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: buffer.slice(0) }).promise;
    pages = doc.numPages;
    doc.destroy();
  } catch (err) {
    return say('This PDF could not be opened, so it was not uploaded: ' + (err.message || err), 'error');
  }
  if (!window.confirm('Replace "' + book.title + '" with ' + file.name + ' (' + pages + ' pages, ' + formatBytes(file.size) + ')? Readers keep the book; their saved page resets.')) return say('');

  const sha = await sha256Hex(buffer);
  const name = file.name.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'book';
  const path = book.slug + '/v' + (Number(book.content_version) + 1) + '/' + name + '.pdf';
  const bucket = adminSb.storage.from('solution-vault-books');

  say('Uploading...');
  const { error: uploadError } = await bucket.upload(path, new Blob([buffer], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false });
  if (uploadError) return say('Upload failed: ' + uploadError.message, 'error');

  say('Verifying the stored copy...');
  const { data: stored, error: readError } = await bucket.download(path);
  if (readError || !stored) return say('Uploaded but could not be read back, so the book was not switched: ' + (readError ? readError.message : 'empty'), 'error');
  if (await sha256Hex(await stored.arrayBuffer()) !== sha) return say('The stored copy does not match your file, so the book was not switched. Try again.', 'error');

  const { error } = await adminSb.rpc('admin_replace_book_file', {
    p_book_slug: book.slug, p_content_path: path, p_sha256: sha, p_file_size_bytes: file.size, p_page_count: pages
  });
  if (error) return say('Stored, but the book was not switched: ' + error.message, 'error');
  await reopenBookEditor(book.slug);
  say('Readers now get the new file (' + pages + ' pages, SHA-256 ' + sha.slice(0, 8) + '...). The previous file is kept and can be restored.', 'success');
}

async function restoreBookFile(book) {
  if (!window.confirm('Put the previous file back for "' + book.title + '"? The current file is kept as the one you can restore next.')) return;
  const { error } = await adminSb.rpc('admin_restore_previous_book_file', { p_book_slug: book.slug });
  if (error) return bookEditorMessage('book-file-message', 'Not restored: ' + error.message, 'error');
  await reopenBookEditor(book.slug);
  bookEditorMessage('book-file-message', 'The previous file is back. Saved pages reset, as with any file change.', 'success');
}

/* ── New book creation & deletion (WBR-445) ─────────────────────────── */
function openNewBookDrawer() {
  adminEl('drawer-eyebrow').textContent = 'Solution Vault';
  adminEl('drawer-title').textContent = 'New book';
  adminEl('drawer-content').innerHTML =
    '<section class="drawer-section"><h4>Book details</h4>' +
      '<form class="book-editor-form" id="book-new-form">' +
        '<label>Slug (internal identifier)<input id="book-new-slug" maxlength="60" required placeholder="my-new-book" pattern="[a-z0-9][a-z0-9_-]*"></label>' +
        '<label>Title<input id="book-new-title" maxlength="200" required placeholder="Title of the book"></label>' +
        '<label>Subtitle<input id="book-new-subtitle" maxlength="300" placeholder="Subtitle or hook"></label>' +
        '<label>Description<textarea id="book-new-description" maxlength="1200" rows="3" placeholder="Short description for the shelf card"></textarea></label>' +
        '<label>Format' +
          '<select id="book-new-format">' +
            '<option value="pdf">PDF document</option>' +
            '<option value="web">Web book (chapters)</option>' +
            '<option value="interactive">Interactive book (claims)</option>' +
          '</select>' +
        '</label>' +
        '<label>Cover image (optional)<input id="book-new-cover" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
        '<div id="book-new-pdf-fields">' +
          '<label>PDF file <span aria-hidden="true">*</span><input id="book-new-file" type="file" accept="application/pdf"></label>' +
          '<label class="book-editor-check"><input id="book-new-download" type="checkbox" checked> Allow PDF download</label>' +
        '</div>' +
        '<p style="font-size: 12px; color: var(--studio-muted); margin: 4px 0;">New books start unpublished. You can preview and review them before publishing.</p>' +
        '<div class="drawer-actions"><button class="secondary-button" type="submit" id="book-new-submit"><span>Create book</span></button></div>' +
        '<p class="enrollment-message" id="book-new-message" role="status"></p>' +
      '</form>' +
    '</section>';
  adminEl('drawer-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  refreshAdminIcons();

  const slugInput = adminEl('book-new-slug');
  const titleInput = adminEl('book-new-title');
  let slugManual = false;
  slugInput.addEventListener('input', () => { slugManual = true; });
  titleInput.addEventListener('input', () => {
    if (!slugManual) {
      slugInput.value = titleInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    }
  });

  const formatSelect = adminEl('book-new-format');
  const pdfFields = adminEl('book-new-pdf-fields');
  formatSelect.addEventListener('change', () => {
    pdfFields.hidden = formatSelect.value !== 'pdf';
  });

  adminEl('book-new-form').addEventListener('submit', createBook);
}

async function createBook(event) {
  event.preventDefault();
  const say = (text, type) => bookEditorMessage('book-new-message', text, type);
  const slug = adminEl('book-new-slug').value.trim().toLowerCase();
  const title = adminEl('book-new-title').value.trim();
  const subtitle = adminEl('book-new-subtitle').value.trim() || null;
  const description = adminEl('book-new-description').value.trim() || null;
  const format = adminEl('book-new-format').value;
  const submitBtn = adminEl('book-new-submit');

  if (!slug || !/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
    return say('Slug must contain only lowercase letters, numbers, dashes, and underscores.', 'error');
  }
  if (!title) {
    return say('Title is required.', 'error');
  }

  submitBtn.disabled = true;
  say('Preparing book...');

  let coverUrl = null;
  const coverFile = adminEl('book-new-cover').files[0];
  if (coverFile) {
    const ext = COVER_TYPES[coverFile.type];
    if (!ext) {
      submitBtn.disabled = false;
      return say('Cover must be PNG, JPEG or WebP.', 'error');
    }
    if (coverFile.size > COVER_MAX_BYTES) {
      submitBtn.disabled = false;
      return say('Cover is ' + formatBytes(coverFile.size) + '; limit is 5 MB.', 'error');
    }
    say('Uploading cover...');
    const coverPath = slug + '/' + Date.now() + '-cover.' + ext;
    const coverBucket = adminSb.storage.from('solution-vault-covers');
    const { error: coverErr } = await coverBucket.upload(coverPath, coverFile, { contentType: coverFile.type, upsert: false });
    if (coverErr) {
      submitBtn.disabled = false;
      return say('Cover upload failed: ' + coverErr.message, 'error');
    }
    coverUrl = coverBucket.getPublicUrl(coverPath).data.publicUrl;
  }

  let contentPath = null;
  let sha = null;
  let fileSize = null;
  let pages = null;
  let downloadEnabled = false;

  if (format === 'pdf') {
    const pdfFile = adminEl('book-new-file').files[0];
    if (!pdfFile) {
      submitBtn.disabled = false;
      return say('A PDF file is required for PDF format books.', 'error');
    }
    if (pdfFile.size > BOOK_MAX_BYTES) {
      submitBtn.disabled = false;
      return say('PDF is ' + formatBytes(pdfFile.size) + '; limit is 50 MB.', 'error');
    }
    const buffer = await pdfFile.arrayBuffer();
    if (new TextDecoder().decode(buffer.slice(0, 5)) !== '%PDF-') {
      submitBtn.disabled = false;
      return say('Selected file is not a valid PDF.', 'error');
    }
    say('Inspecting PDF...');
    try {
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: buffer }).promise;
      pages = doc.numPages;
    } catch (e) {
      submitBtn.disabled = false;
      return say('Could not read PDF pages: ' + e.message, 'error');
    }

    sha = await sha256Hex(buffer);
    fileSize = pdfFile.size;
    downloadEnabled = adminEl('book-new-download').checked;
    contentPath = slug + '/v1/' + (slug + '.pdf');

    say('Uploading PDF file...');
    const bookBucket = adminSb.storage.from('solution-vault-books');
    const { error: pdfErr } = await bookBucket.upload(contentPath, new Blob([buffer], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false });
    if (pdfErr) {
      submitBtn.disabled = false;
      return say('PDF upload failed: ' + pdfErr.message, 'error');
    }

    say('Verifying stored file...');
    const { data: stored, error: readError } = await bookBucket.download(contentPath);
    if (readError || !stored) {
      submitBtn.disabled = false;
      return say('Uploaded file could not be verified.', 'error');
    }
    const storedSha = await sha256Hex(await stored.arrayBuffer());
    if (storedSha !== sha) {
      submitBtn.disabled = false;
      return say('Stored checksum mismatch.', 'error');
    }
  }

  say('Creating book in catalog...');
  const { data, error } = await adminSb.rpc('admin_create_book', {
    p_slug: slug,
    p_title: title,
    p_subtitle: subtitle,
    p_description: description,
    p_format: format,
    p_cover_url: coverUrl,
    p_content_path: contentPath,
    p_sha256: sha,
    p_file_size_bytes: fileSize,
    p_page_count: pages,
    p_download_enabled: downloadEnabled,
    p_download_filename: format === 'pdf' ? slug + '.pdf' : null
  });

  if (error) {
    submitBtn.disabled = false;
    return say('Failed to create book: ' + error.message, 'error');
  }

  say('Book created successfully.', 'success');
  await loadStudioAdmin();
  openBookEditor(slug);
}

async function deleteBook(slug) {
  if (!window.confirm('Delete book "' + slug + '" and remove its files? This cannot be undone.')) return;

  // The database decides first (WBR-445 review): it refuses seeded books and
  // any book someone holds or has read, and files are only removed after the
  // row is gone, so a refused delete never leaves a book without its file.
  const { error } = await adminSb.rpc('admin_delete_book', { p_book_slug: slug });
  if (error) {
    return alert('Could not delete book: ' + error.message);
  }

  const leftovers = [];
  async function clearFolder(bucket, folder) {
    const { data: entries, error: listError } = await bucket.list(folder, { limit: 1000 });
    if (listError) { leftovers.push(folder); return; }
    const files = [];
    for (const entry of entries || []) {
      if (entry.id) files.push(folder + '/' + entry.name);
      else await clearFolder(bucket, folder + '/' + entry.name);
    }
    if (files.length) {
      const { data: removed, error: removeError } = await bucket.remove(files);
      if (removeError || !removed || removed.length !== files.length) leftovers.push(folder);
    }
  }
  try {
    await clearFolder(adminSb.storage.from('solution-vault-books'), slug);
    await clearFolder(adminSb.storage.from('solution-vault-covers'), slug);
  } catch (storageErr) {
    leftovers.push(slug);
  }
  if (leftovers.length) {
    alert('The book was deleted, but some of its files could not be removed: ' + leftovers.join(', '));
  }
  closeCustomer();
  await loadStudioAdmin();
}

/* ── Interactive book editor (WBR-445) ─────────────────────────────────── */
// Edits the whole interactive book as data: the intro, every claim (add, move,
// hide, never delete once saved), pull quotes, verdict lines, score messages
// and the closing. The database validates before saving. Each claim shows how
// many readers believed it, said "No way" or just opened it.
const STUDIO_ORIGIN = 'https://studio.coloradomastermind.com';
let viEdit = null;

const paras = text => String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
const lines = text => String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
const joinParas = list => (list || []).join('\n\n');

function claimSlug(text, taken) {
  const base = String(text || 'claim').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'claim';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = base.slice(0, 36) + '-' + n;
  return id;
}

function viField(label, key, value, opts = {}) {
  const tag = opts.area ? 'textarea' : 'input';
  const rows = opts.area ? ' rows="' + (opts.rows || 3) + '"' : '';
  const val = opts.area ? escapeHtml(value || '') : '';
  const attr = opts.area ? '' : ' value="' + safeAttr(value || '') + '"';
  return '<label>' + escapeHtml(label) + (opts.hint ? ' <small>' + escapeHtml(opts.hint) + '</small>' : '') +
    '<' + tag + ' data-vi="' + key + '"' + rows + attr + (opts.max ? ' maxlength="' + opts.max + '"' : '') + '>' + (opts.area ? val + '</textarea>' : '') + '</label>';
}

function interactiveEditorHtml() {
  const c = viEdit.content;
  const close = c.close || {};
  const score = c.score || {};
  const stats = viEdit.stats || { readers: 0, claims: {} };
  const claimOptions = id => c.items.map((item, i) => '<option value="' + safeAttr(item.id) + '"' + (item.id === id ? ' selected' : '') + '>' + (i + 1) + '. ' + escapeHtml(item.claim.slice(0, 50)) + '</option>').join('');

  const items = c.items.map((item, i) => {
    const s = stats.claims[item.id] || { yes: 0, no: 0, open: 0 };
    return '<article class="vi-edit-claim' + (item.hidden ? ' is-hidden' : '') + '" data-index="' + i + '">' +
      '<div class="vi-edit-claim-head"><strong>' + (i + 1) + '</strong>' +
        '<span class="vi-edit-stat">No way ' + s.no + ' · Believe ' + s.yes + ' · Opened ' + s.open + '</span>' +
        '<span class="vi-edit-moves"><button type="button" class="icon-button" data-vi-move="-1" title="Move up" aria-label="Move claim ' + (i + 1) + ' up">&uarr;</button>' +
        '<button type="button" class="icon-button" data-vi-move="1" title="Move down" aria-label="Move claim ' + (i + 1) + ' down">&darr;</button></span></div>' +
      '<label>Claim<input data-vi-item="claim" maxlength="300" value="' + safeAttr(item.claim) + '"></label>' +
      '<label>What you say after it <small>blank line between paragraphs; **bold**</small><textarea data-vi-item="body" rows="5">' + escapeHtml(joinParas(item.body)) + '</textarea></label>' +
      '<label class="book-editor-check"><input type="checkbox" data-vi-item="hidden"' + (item.hidden ? ' checked' : '') + '> Hidden from readers (answers are kept)</label>' +
      (viEdit.savedIds.has(item.id) ? '' : '<button type="button" class="secondary-button" data-vi-remove>Remove (not saved yet)</button>') +
    '</article>';
  }).join('');

  const quotes = (c.quotes || []).map((q, i) =>
    '<div class="vi-edit-quote" data-quote="' + i + '"><input data-vi-quote="text" maxlength="300" value="' + safeAttr(q.text) + '">' +
    '<select data-vi-quote="after" aria-label="Show after claim">' + claimOptions(q.after) + '</select>' +
    '<button type="button" class="secondary-button" data-vi-quote-remove>Remove</button></div>').join('');

  return '<section class="drawer-section"><h4>Content</h4>' +
    '<p>' + c.items.filter(i => !i.hidden).length + ' claims showing · ' + stats.readers + (stats.readers === 1 ? ' reader has' : ' readers have') + ' called at least one. Placeholders: {total}, {total_word}, {doubted}.</p>' +
    '<div class="book-editor-form vi-edit">' +
      viField('Kicker', 'kicker', c.kicker, { max: 120 }) +
      viField('Heading', 'heading', c.heading, { max: 200 }) +
      viField('Heading, italic ending', 'heading_emphasis', c.heading_emphasis, { max: 120 }) +
      viField('Intro', 'intro', joinParas(c.intro), { area: true, rows: 6, hint: 'blank line between paragraphs; **bold**' }) +
      '<div class="vi-edit-row">' + viField('Divider label', 'start_label', c.start_label, { max: 60 }) +
        viField('Believe button', 'believe_label', c.believe_label, { max: 40 }) + viField('Doubt button', 'doubt_label', c.doubt_label, { max: 40 }) + '</div>' +
      '<div class="vi-edit-row">' + viField('Skip line, top', 'skip_top', c.skip_top, { max: 120 }) +
        viField('Skip line, bottom', 'skip_bottom', c.skip_bottom, { max: 120 }) + viField('Skip button', 'skip_button', c.skip_button, { max: 60 }) + '</div>' +
      '<h5>Claims</h5>' + items +
      '<button type="button" class="secondary-button" data-vi-add>Add a claim</button>' +
      '<h5>Pull quotes</h5>' + quotes +
      '<button type="button" class="secondary-button" data-vi-quote-add>Add a pull quote</button>' +
      '<h5>Verdict lines</h5>' +
      viField('After "Believe it"', 'believed_lines', (c.believed_lines || []).join('\n'), { area: true, rows: 4, hint: 'one per line, picked at random' }) +
      viField('After "No way"', 'doubted_lines', (c.doubted_lines || []).join('\n'), { area: true, rows: 4, hint: 'one per line' }) +
      viField('After "Open all"', 'opened_line', c.opened_line, { max: 80 }) +
      '<h5>Score</h5>' +
      [['none', 'Believed every one'], ['one', 'Doubted exactly one'], ['most', 'Doubted three quarters or more'], ['some', 'Doubted some']].map(([key, label]) =>
        viField(label + ': heading', 'score.' + key + '.heading', (score[key] || {}).heading, { max: 200 }) +
        viField(label + ': message', 'score.' + key + '.body', (score[key] || {}).body, { area: true, rows: 2 })).join('') +
      '<h5>Closing</h5>' +
      viField('Heading', 'close.heading', close.heading, { max: 200 }) +
      viField('Paragraphs', 'close.paragraphs', joinParas(close.paragraphs), { area: true, rows: 6, hint: 'blank line between paragraphs' }) +
      '<div class="vi-edit-row">' + viField('Button label', 'close.button_label', close.button_label, { max: 60 }) +
        viField('Button link', 'close.button_url', close.button_url, { max: 300, hint: 'https:// address; leave empty for no button' }) + '</div>' +
      viField('Signature', 'close.signature', close.signature, { max: 80 }) +
      '<div class="drawer-actions"><button type="button" class="secondary-button" data-vi-save>Save content</button>' +
        '<a class="secondary-button" href="/vault?book=' + encodeURIComponent(viEdit.slug) + '" target="_blank" rel="noopener">Preview in reader</a></div>' +
      '<p class="enrollment-message" id="vi-edit-message" role="status"></p>' +
    '</div></section>' +
    '<section class="drawer-section"><h4>Claim link</h4>' +
      '<p>Put this on the RSVP page. Whoever opens it while signed in (or signs in from it) gets the book on their shelf once. Replacing it stops the old link working; people who already claimed keep the book.</p>' +
      '<div id="vi-claim-link"></div>' +
      '<p class="enrollment-message" id="vi-claim-message" role="status"></p>' +
    '</section>';
}

function setDeep(obj, path, value) {
  const keys = path.split('.');
  let target = obj;
  keys.slice(0, -1).forEach(k => { target[k] = target[k] && typeof target[k] === 'object' ? target[k] : {}; target = target[k]; });
  target[keys[keys.length - 1]] = value;
}

function readInteractiveForm(root) {
  const c = viEdit.content;
  root.querySelectorAll('[data-vi]').forEach(el => {
    const key = el.dataset.vi;
    const value = el.value;
    if (key === 'intro' || key === 'close.paragraphs') setDeep(c, key, paras(value));
    else if (key === 'believed_lines' || key === 'doubted_lines') c[key] = lines(value);
    else setDeep(c, key, value.trim());
  });
  root.querySelectorAll('.vi-edit-claim').forEach(card => {
    const item = c.items[Number(card.dataset.index)];
    item.claim = card.querySelector('[data-vi-item="claim"]').value.trim();
    item.body = paras(card.querySelector('[data-vi-item="body"]').value);
    item.hidden = card.querySelector('[data-vi-item="hidden"]').checked;
  });
  c.quotes = [...root.querySelectorAll('.vi-edit-quote')].map(row => ({
    text: row.querySelector('[data-vi-quote="text"]').value.trim(),
    after: row.querySelector('[data-vi-quote="after"]').value
  })).filter(q => q.text);
  // A new claim's id comes from its words the first time it is saved, then never changes.
  const taken = new Set(c.items.filter(i => i.id).map(i => i.id));
  c.items.forEach(item => { if (!item.id) { item.id = claimSlug(item.claim, taken); taken.add(item.id); } });
}

function renderInteractiveEditor() {
  const host = adminEl('vi-editor-host');
  host.innerHTML = interactiveEditorHtml();
  host.querySelector('[data-vi-add]').addEventListener('click', () => {
    readInteractiveForm(host);
    viEdit.content.items.push({ id: '', claim: 'A new claim', body: [], hidden: false, added_at: new Date().toISOString() });
    renderInteractiveEditor();
    const cards = host.querySelectorAll('.vi-edit-claim');
    cards[cards.length - 1].querySelector('input').focus();
  });
  host.querySelectorAll('[data-vi-move]').forEach(btn => btn.addEventListener('click', () => {
    readInteractiveForm(host);
    const i = Number(btn.closest('.vi-edit-claim').dataset.index);
    const j = i + Number(btn.dataset.viMove);
    const items = viEdit.content.items;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    renderInteractiveEditor();
  }));
  host.querySelectorAll('[data-vi-remove]').forEach(btn => btn.addEventListener('click', () => {
    readInteractiveForm(host);
    viEdit.content.items.splice(Number(btn.closest('.vi-edit-claim').dataset.index), 1);
    renderInteractiveEditor();
  }));
  host.querySelector('[data-vi-quote-add]').addEventListener('click', () => {
    readInteractiveForm(host);
    const last = viEdit.content.items[viEdit.content.items.length - 1];
    viEdit.content.quotes = (viEdit.content.quotes || []).concat([{ text: 'A new pull quote', after: last ? last.id : '' }]);
    renderInteractiveEditor();
  });
  host.querySelectorAll('[data-vi-quote-remove]').forEach(btn => btn.addEventListener('click', () => {
    readInteractiveForm(host);
    viEdit.content.quotes.splice(Number(btn.closest('.vi-edit-quote').dataset.quote), 1);
    renderInteractiveEditor();
  }));
  host.querySelector('[data-vi-save]').addEventListener('click', saveInteractiveContent);
  renderClaimLink();
}

async function saveInteractiveContent() {
  const host = adminEl('vi-editor-host');
  readInteractiveForm(host);
  bookEditorMessage('vi-edit-message', 'Saving...');
  const { data, error } = await adminSb.rpc('admin_save_interactive_content', { p_book_slug: viEdit.slug, p_content: viEdit.content });
  if (error) return bookEditorMessage('vi-edit-message', 'Not saved: ' + error.message, 'error');
  viEdit.savedIds = new Set(viEdit.content.items.map(i => i.id));
  renderInteractiveEditor();
  bookEditorMessage('vi-edit-message', 'Saved ' + data.claims + ' claims. Readers see it the next time they open the book.', 'success');
}

async function renderClaimLink() {
  const host = adminEl('vi-claim-link');
  if (!host) return;
  const { data, error } = await adminSb.from('solution_vault_claim_links')
    .select('code,claims,created_at').eq('book_id', viEdit.bookId).eq('active', true).maybeSingle();
  if (error) { host.innerHTML = '<p>Could not load the link: ' + escapeHtml(error.message) + '</p>'; return; }
  const url = data ? STUDIO_ORIGIN + '/vault?claim=' + data.code : '';
  host.innerHTML = (data
    ? '<input class="vi-claim-url" readonly value="' + safeAttr(url) + '" aria-label="Claim link">' +
      '<p>' + data.claims + ' ' + (data.claims === 1 ? 'person has' : 'people have') + ' claimed through this link since ' + escapeHtml(formatDate(data.created_at)) + '.</p>'
    : '<p>No claim link yet.</p>') +
    '<div class="drawer-actions">' + (data ? '<button type="button" class="secondary-button" data-vi-copy>Copy link</button>' : '') +
    '<button type="button" class="secondary-button" data-vi-rotate>' + (data ? 'Replace link' : 'Create link') + '</button></div>';
  const copy = host.querySelector('[data-vi-copy]');
  if (copy) copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); bookEditorMessage('vi-claim-message', 'Copied.', 'success'); }
    catch (e) { host.querySelector('.vi-claim-url').select(); bookEditorMessage('vi-claim-message', 'Select the link and copy it.', ''); }
  });
  host.querySelector('[data-vi-rotate]').addEventListener('click', async () => {
    if (data && !window.confirm('Replace the claim link? The current link stops working right away. Anyone who already claimed keeps the book.')) return;
    const { error: rotateError } = await adminSb.rpc('admin_rotate_claim_link', { p_book_slug: viEdit.slug });
    if (rotateError) return bookEditorMessage('vi-claim-message', 'Not changed: ' + rotateError.message, 'error');
    bookEditorMessage('vi-claim-message', data ? 'Replaced. Update the RSVP page with the new link.' : 'Created. Put it on the RSVP page.', 'success');
    renderClaimLink();
  });
}

async function openInteractiveEditor(book) {
  const host = adminEl('vi-editor-host');
  if (!host) return;
  host.innerHTML = '<p>Loading content...</p>';
  const { data: stats } = await adminSb.rpc('admin_book_answer_stats', { p_book_slug: book.slug });
  viEdit = {
    slug: book.slug,
    bookId: book.id,
    content: JSON.parse(JSON.stringify(book.interactive || { items: [] })),
    savedIds: new Set(((book.interactive || {}).items || []).map(i => i.id)),
    stats: stats || { readers: 0, claims: {} }
  };
  if (!Array.isArray(viEdit.content.items)) viEdit.content.items = [];
  renderInteractiveEditor();
}

window.openBookEditor = openBookEditor;
window.adminGrantBook = adminGrantBook;
window.adminRevokeBook = adminRevokeBook;
window.adminToggleBookPublish = adminToggleBookPublish;
window.openNewBookDrawer = openNewBookDrawer;
window.deleteBook = deleteBook;

refreshAdminIcons();
