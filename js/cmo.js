const SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const el = (id) => document.getElementById(id);

let session = null;
let activeUserId = null;
let payload = null;
let selectedApp = null;
let selectedList = 'all';
let selectedScore = 'all';
let searchText = '';

function showOnly(name) {
  for (const id of ['cmo-auth-card', 'cmo-recovery-card', 'cmo-loading', 'cmo-error-card', 'cmo-app']) {
    const node = el(id);
    if (node) node.hidden = id !== name;
  }
  const signOutBtn = el('cmo-sign-out');
  if (signOutBtn) signOutBtn.hidden = !session;
}

function scoreChip(score) {
  const chip = document.createElement('span');
  const label = String(score || 'UNSCORED');
  chip.className = 'count-badge m300-chip m300-' + label.replace('/', '').toLowerCase();
  chip.textContent = label;
  return chip;
}

function render() {
  const note = el('cmo-note');
  const tabs = el('cmo-apps');
  const cards = el('cmo-cards');
  const rowsBox = el('cmo-rows');
  const count = el('cmo-count');
  const listSelect = el('cmo-list');
  if (!note || !tabs || !cards || !rowsBox || !count || !listSelect) return;

  tabs.replaceChildren();
  cards.replaceChildren();
  rowsBox.replaceChildren();

  const apps = Array.isArray(payload?.apps) ? payload.apps : [];
  if (!apps.length) {
    note.textContent = 'No Momentum 300 question sets have been published yet.';
    count.textContent = '';
    return;
  }

  if (!selectedApp || !apps.some((app) => app.key === selectedApp)) {
    selectedApp = apps[0].key;
  }

  const currentApp = apps.find((app) => app.key === selectedApp) || apps[0];
  note.textContent = [
    currentApp.name || currentApp.key,
    currentApp.scoredOn ? `scored on ${currentApp.scoredOn}` : (currentApp.status === 'needs-score' ? 'not scored yet' : null),
    payload?.cadence ? `· ${payload.cadence}` : null,
  ].filter(Boolean).join(' ');

  for (const app of apps) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'period-tab' + (app.key === currentApp.key ? ' active' : '');
    tab.textContent = app.name || app.key;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(app.key === currentApp.key));
    tab.addEventListener('click', () => {
      selectedApp = app.key;
      selectedList = 'all';
      render();
    });
    tabs.append(tab);
  }

  const tally = currentApp.tally || {};
  for (const label of ['PASS', 'FAIL', 'LIVE', 'N/A', 'UNSCORED']) {
    if (!tally[label]) continue;
    const card = document.createElement('div');
    card.className = 'analytics-card';
    const title = document.createElement('p');
    title.className = 'analytics-card-label';
    title.textContent = label;
    const figure = document.createElement('p');
    figure.className = 'analytics-card-figure';
    figure.textContent = String(tally[label]);
    card.append(title, figure);
    cards.append(card);
  }

  const rows = Array.isArray(currentApp.rows) ? currentApp.rows : [];
  const listLabels = new Map((payload?.lists || []).map((item) => [item.id, item]));
  const presentLists = [...new Set(rows.map((row) => row.list).filter(Boolean))];
  if (selectedList !== 'all' && !presentLists.includes(selectedList)) selectedList = 'all';

  listSelect.replaceChildren();
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = `All ${rows.length} questions`;
  listSelect.append(allOpt);
  for (const listId of presentLists) {
    const opt = document.createElement('option');
    opt.value = listId;
    opt.textContent = (listLabels.get(listId) || {}).label || listId;
    listSelect.append(opt);
  }
  listSelect.value = selectedList;

  const needle = searchText.trim().toLowerCase();
  const visible = rows.filter((row) =>
    (selectedScore === 'all' || row.score === selectedScore)
    && (selectedList === 'all' || row.list === selectedList)
    && (!needle || (`${row.question} ${row.check || ''}`).toLowerCase().includes(needle))
  );

  count.textContent = visible.length === rows.length
    ? `All ${rows.length} questions.`
    : `${visible.length} of ${rows.length} questions.`;

  let lastSection = null;
  for (const row of visible) {
    const key = `${row.list}|${row.section || ''}`;
    if (key !== lastSection) {
      lastSection = key;
      const head = document.createElement('h3');
      head.className = 'm300-section';
      const listMeta = listLabels.get(row.list);
      head.textContent = `${listMeta ? listMeta.label : (row.list || 'Questions')} · ${row.section || 'General'}`;
      rowsBox.append(head);
    }

    const item = document.createElement('article');
    item.className = 'm300-row';

    const top = document.createElement('div');
    top.className = 'm300-row-head';
    const num = document.createElement('span');
    num.className = 'm300-num';
    num.textContent = `${row.number ?? ''}.`;
    const q = document.createElement('span');
    q.className = 'm300-question';
    q.textContent = row.question || '';
    top.append(num, q, scoreChip(row.score));
    item.append(top);

    if (row.check) {
      const checkNote = document.createElement('p');
      checkNote.className = 'm300-note';
      checkNote.textContent = row.check;
      item.append(checkNote);
    }

    rowsBox.append(item);
  }
}

async function loadQuestions() {
  if (!session) {
    showOnly('cmo-auth-card');
    return;
  }
  showOnly('cmo-loading');
  try {
    const response = await fetch('/api/cmo-questions', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'CMO access denied.');
    payload = body;
    render();
    showOnly('cmo-app');
  } catch (error) {
    el('cmo-error-message').textContent = error.message || 'Could not load questions.';
    showOnly('cmo-error-card');
  }
}

function handleSession(event, nextSession) {
  session = nextSession;
  if (event === 'PASSWORD_RECOVERY') {
    showOnly('cmo-recovery-card');
    return;
  }
  const userId = nextSession?.user?.id || null;
  if (!userId) {
    activeUserId = null;
    payload = null;
    showOnly('cmo-auth-card');
    return;
  }
  if (userId === activeUserId && payload) return;
  activeUserId = userId;
  loadQuestions();
}

el('cmo-auth-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = String(el('cmo-auth-email')?.value || '').trim();
  const password = String(el('cmo-auth-password')?.value || '');
  const msg = el('cmo-auth-message');
  if (msg) msg.textContent = 'Signing in...';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error && msg) msg.textContent = error.message || 'Could not sign in.';
});

el('cmo-recovery-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = String(el('cmo-new-password')?.value || '');
  const confirm = String(el('cmo-confirm-password')?.value || '');
  const msg = el('cmo-recovery-message');
  if (password.length < 8) {
    if (msg) msg.textContent = 'Use at least 8 characters.';
    return;
  }
  if (password !== confirm) {
    if (msg) msg.textContent = 'Passwords do not match.';
    return;
  }
  if (msg) msg.textContent = 'Saving...';
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    if (msg) msg.textContent = error.message || 'Could not save password.';
    return;
  }
  if (msg) msg.textContent = 'Password saved.';
  await loadQuestions();
});

el('cmo-sign-out')?.addEventListener('click', async () => {
  await sb.auth.signOut();
  session = null;
  activeUserId = null;
  payload = null;
  showOnly('cmo-auth-card');
});

el('cmo-search')?.addEventListener('input', (event) => {
  searchText = String(event.target.value || '');
  render();
});

el('cmo-verdict')?.addEventListener('change', (event) => {
  selectedScore = String(event.target.value || 'all');
  render();
});

el('cmo-list')?.addEventListener('change', (event) => {
  selectedList = String(event.target.value || 'all');
  render();
});

sb.auth.onAuthStateChange((event, nextSession) => {
  setTimeout(() => handleSession(event, nextSession), 0);
});
