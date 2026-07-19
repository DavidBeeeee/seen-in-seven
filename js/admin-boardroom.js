const BOARDROOM_ADMIN_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const BOARDROOM_ADMIN_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const BOARDROOM_ADMIN_EMAILS = new Set(['contact@davidbee.me', 'davidkamau.t@gmail.com', 'davidkamau@live.com']);
const boardroomAdminSb = supabase.createClient(BOARDROOM_ADMIN_URL, BOARDROOM_ADMIN_KEY);
const boardroomEl = id => document.getElementById(id);
let boardroomAdminState = { users: [], entitlements: [], activity: [], rows: [] };

function boardroomIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } }); }
function boardroomEscape(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function boardroomAttr(value) { return boardroomEscape(value).replace(/`/g, '&#096;'); }
function boardroomMs(value) { const ms = value ? new Date(value).getTime() : 0; return Number.isFinite(ms) ? ms : 0; }
function boardroomDate(value) { return boardroomMs(value) ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No activity yet'; }
function boardroomActive(item) { return item && item.status === 'active' && (!item.expires_at || boardroomMs(item.expires_at) > Date.now()); }

function setBoardroomTheme(theme) {
  const light = theme === 'light';
  document.documentElement.classList.toggle('studio-light', light);
  try { localStorage.setItem('sis_theme_v1', light ? 'light' : 'dark'); } catch (e) {}
}

function boardroomAuthMessage(message, type) {
  boardroomEl('auth-message').textContent = message || '';
  boardroomEl('auth-message').className = 'admin-auth-message' + (type ? ' ' + type : '');
}

async function sendBoardroomAdminLink(event) {
  event.preventDefault();
  const email = boardroomEl('admin-email').value.trim().toLowerCase();
  const button = boardroomEl('admin-auth-submit');
  if (!BOARDROOM_ADMIN_EMAILS.has(email)) return boardroomAuthMessage('This email does not have administrator access.', 'error');
  button.disabled = true;
  button.querySelector('span').textContent = 'Sending...';
  const { error } = await boardroomAdminSb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + '/admin/boardroom', shouldCreateUser: false } });
  boardroomAuthMessage(error ? 'We could not send the link just now. Please try again.' : 'Your secure login link is on its way.', error ? 'error' : 'success');
  button.disabled = false;
  button.querySelector('span').textContent = 'Send login link';
}

async function boardroomRpc(name) {
  const { data, error } = await boardroomAdminSb.rpc(name);
  if (error) throw error;
  return data || [];
}

async function enterBoardroomAdmin(session) {
  const email = (session.user.email || '').toLowerCase();
  if (!BOARDROOM_ADMIN_EMAILS.has(email)) throw new Error('Admin access required');
  const { error } = await boardroomAdminSb.rpc('provision_admin_account');
  if (error) throw error;
  boardroomEl('auth-screen').hidden = true;
  boardroomEl('admin-app').hidden = false;
  boardroomEl('account-email').textContent = email;
  boardroomEl('menu-email').textContent = email;
  boardroomEl('account-avatar').textContent = email.charAt(0).toUpperCase();
  await loadBoardroomAdmin();
}

async function loadBoardroomAdmin() {
  const button = boardroomEl('refresh-button');
  button.disabled = true;
  button.classList.add('loading');
  try {
    const [users, entitlements, activity] = await Promise.all([
      boardroomRpc('admin_get_users'), boardroomRpc('admin_get_studio_entitlements'), boardroomRpc('admin_get_boardroom_activity')
    ]);
    boardroomAdminState.users = users;
    boardroomAdminState.entitlements = entitlements.filter(item => item.app_key === 'boardroom');
    boardroomAdminState.activity = activity;
    const accessByUser = Object.fromEntries(boardroomAdminState.entitlements.map(item => [item.user_id, item]));
    const activityByUser = Object.fromEntries(activity.map(item => [item.user_id, item]));
    boardroomAdminState.rows = users.filter(user => accessByUser[user.id] || activityByUser[user.id]).map(user => ({
      user, entitlement: accessByUser[user.id] || null, activity: activityByUser[user.id] || null,
      active: boardroomActive(accessByUser[user.id])
    })).sort((a, b) => boardroomMs(b.activity && b.activity.last_active) - boardroomMs(a.activity && a.activity.last_active));
    boardroomEl('admin-notice').hidden = true;
    renderBoardroomAdmin();
    boardroomEl('last-loaded').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch (error) {
    boardroomEl('admin-notice').hidden = false;
    boardroomEl('admin-notice').textContent = 'Boardroom activity could not be loaded. Refresh before changing access.';
  } finally {
    button.disabled = false;
    button.classList.remove('loading');
  }
}

function renderBoardroomAdmin() {
  const rows = boardroomAdminState.rows;
  boardroomEl('metric-access').textContent = rows.filter(row => row.active).length;
  boardroomEl('metric-conversations').textContent = rows.reduce((sum, row) => sum + Number(row.activity?.conversations || 0), 0);
  boardroomEl('metric-messages').textContent = rows.reduce((sum, row) => sum + Number(row.activity?.messages || 0), 0);
  boardroomEl('metric-cards').textContent = rows.reduce((sum, row) => sum + Number(row.activity?.active_cards || 0), 0);
  boardroomEl('metric-documents').textContent = rows.reduce((sum, row) => sum + Number(row.activity?.documents || 0), 0);
  renderBoardroomRows();
  boardroomIcons();
}

function renderBoardroomRows() {
  const query = boardroomEl('customer-search').value.trim().toLowerCase();
  const filter = boardroomEl('access-filter').value;
  const rows = boardroomAdminState.rows.filter(row => {
    const haystack = [row.user.name, row.user.email, row.activity?.workspace_name].filter(Boolean).join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (filter === 'all' || (filter === 'active' ? row.active : !row.active));
  });
  const tbody = boardroomEl('boardroom-rows');
  if (!rows.length) tbody.innerHTML = '<tr><td colspan="9" class="table-loading">No Boardroom customers match this view.</td></tr>';
  else tbody.innerHTML = rows.map(row => {
    const a = row.activity || {};
    const button = row.active
      ? '<button class="revoke boardroom-access-button" onclick="setBoardroomAccess(event,\'' + boardroomAttr(row.user.id) + '\',false)">Remove</button>'
      : '<button class="boardroom-access-button" onclick="setBoardroomAccess(event,\'' + boardroomAttr(row.user.id) + '\',true)">Grant access</button>';
    return '<tr><td><div class="customer-name">' + boardroomEscape(row.user.name || 'Studio customer') + '</div><div class="customer-email">' + boardroomEscape(row.user.email || '') + '</div></td>' +
      '<td>' + (a.workspace_name ? '<span class="boardroom-workspace">' + boardroomEscape(a.workspace_name) + '</span>' : '<span class="boardroom-empty">Opens on first visit</span>') + '</td>' +
      '<td>' + (a.profile_complete ? '<span class="profile-status complete">Complete</span><small class="profile-name">' + boardroomEscape(a.profile_name || '') + '</small>' : '<span class="profile-status">Not started</span>') + '</td>' +
      '<td>' + Number(a.conversations || 0) + '</td><td>' + Number(a.messages || 0) + '</td><td>' + Number(a.active_cards || 0) + '</td><td>' + Number(a.documents || 0) + '</td>' +
      '<td>' + boardroomEscape(boardroomDate(a.last_active)) + '</td><td><div class="access-control">' + button + '</div></td></tr>';
  }).join('');
  boardroomEl('customer-count').textContent = rows.length + ' of ' + boardroomAdminState.rows.length + ' customers shown';
}

async function setBoardroomAccess(event, userId, enabled) {
  event.stopPropagation();
  if (!enabled && !window.confirm('Remove this customer\'s AI Boardroom access? Their saved work will remain in place.')) return;
  event.currentTarget.disabled = true;
  const { error } = await boardroomAdminSb.rpc('admin_set_studio_access', { target_user_id: userId, target_app_key: 'boardroom', enabled, target_access_source: 'admin' });
  if (error) {
    boardroomEl('admin-notice').hidden = false;
    boardroomEl('admin-notice').textContent = 'Access was not changed. Please refresh and try again.';
    event.currentTarget.disabled = false;
    return;
  }
  await loadBoardroomAdmin();
}

boardroomAdminSb.auth.onAuthStateChange((event, session) => {
  if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED'].includes(event)) return;
  setTimeout(() => {
    if (!session?.user) { boardroomEl('auth-screen').hidden = false; boardroomEl('admin-app').hidden = true; return; }
    enterBoardroomAdmin(session).catch(() => { boardroomEl('auth-screen').hidden = false; boardroomEl('admin-app').hidden = true; boardroomAuthMessage('This account does not have administrator access.', 'error'); });
  }, 0);
});

boardroomEl('admin-auth-form').addEventListener('submit', sendBoardroomAdminLink);
boardroomEl('theme-button').addEventListener('click', () => setBoardroomTheme(document.documentElement.classList.contains('studio-light') ? 'dark' : 'light'));
boardroomEl('refresh-button').addEventListener('click', loadBoardroomAdmin);
boardroomEl('customer-search').addEventListener('input', renderBoardroomRows);
boardroomEl('access-filter').addEventListener('change', renderBoardroomRows);
boardroomEl('account-button').addEventListener('click', () => { boardroomEl('account-menu').hidden = !boardroomEl('account-menu').hidden; });
boardroomEl('sign-out-button').addEventListener('click', async () => { await boardroomAdminSb.auth.signOut(); window.location.href = '/'; });
boardroomIcons();
