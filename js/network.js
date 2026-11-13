const NETWORK_SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const NETWORK_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const NETWORK_THEME_KEY = 'sis_theme_v1';
const NETWORK_STORAGE_KEY = 'cm_network_preview_entries_v1';

const networkSb = window.supabase
  ? window.supabase.createClient(
      NETWORK_SUPABASE_URL,
      NETWORK_SUPABASE_KEY,
      window.StudioEgress ? window.StudioEgress.clientOptions() : undefined
    )
  : null;

const SEED_ENTRIES = [
  {
    id: 'seed-david-bee',
    name: 'David Bee',
    what_you_do: 'Founder of Colorado Mastermind and creator of SeenInSeven. Helping entrepreneurs get on camera and tell stories that bring the right people closer.',
    link_url: 'https://coloradomastermind.com',
    open_to_collaborating: true,
    consent_given: true,
    status: 'approved',
    created_at: '2026-11-05T19:00:00.000Z',
    approved_at: '2026-11-05T19:05:00.000Z'
  }
];

const netEl = id => document.getElementById(id);

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

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
  }
}

function loadLocalEntries() {
  try {
    const raw = localStorage.getItem(NETWORK_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(SEED_ENTRIES));
      return SEED_ENTRIES.slice();
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (e) {}
  return SEED_ENTRIES.slice();
}

function saveLocalEntries(entries) {
  try {
    localStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {}
}

let directoryState = {
  mode: 'preview-stub',
  entries: loadLocalEntries()
};

async function fetchDirectoryEntries() {
  const local = loadLocalEntries();
  if (!networkSb) {
    directoryState.entries = local;
    renderDirectory();
    return;
  }

  try {
    const { data, error } = await networkSb
      .from('network_directory')
      .select('id,name,what_you_do,link_url,open_to_collaborating,status,created_at,approved_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) {
      directoryState.mode = 'preview-stub';
      directoryState.entries = local;
    } else {
      directoryState.mode = 'live-table';
      directoryState.entries = Array.isArray(data) ? data : [];
    }
  } catch (err) {
    directoryState.mode = 'preview-stub';
    directoryState.entries = local;
  }

  renderDirectory();
}

function renderDirectory() {
  const all = directoryState.entries || [];
  const approved = all.filter(item => item.status === 'approved');
  const pending = all.filter(item => item.status === 'pending');

  const countEl = netEl('network-directory-count');
  if (countEl) {
    countEl.textContent = approved.length + ' approved';
  }

  const badgeEl = netEl('pending-count-badge');
  if (badgeEl) {
    badgeEl.textContent = String(pending.length);
  }

  const listEl = netEl('network-directory-list');
  if (listEl) {
    if (!approved.length) {
      listEl.innerHTML = '<div class="network-empty">No approved cards are showing right now. Add your card on the left and approve it to see it here.</div>';
    } else {
      listEl.innerHTML = approved.map(entry => {
        const collabOpen = Boolean(entry.open_to_collaborating);
        const badgeClass = collabOpen ? 'is-open' : 'is-closed';
        const badgeText = collabOpen ? 'Open to collaborating' : 'Not collaborating right now';
        const link = String(entry.link_url || '').trim();
        return '<article class="network-card" data-entry-id="' + safeAttr(entry.id) + '">' +
          '<div class="network-card-top">' +
            '<h3 class="network-card-name">' + escapeHtml(entry.name) + '</h3>' +
            '<span class="network-collab-badge ' + badgeClass + '">' + escapeHtml(badgeText) + '</span>' +
          '</div>' +
          '<p class="network-card-bio">' + escapeHtml(entry.what_you_do) + '</p>' +
          (link ? '<a class="network-card-link" href="' + safeAttr(link) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(link) + '</a>' : '') +
        '</article>';
      }).join('');
    }
  }

  renderAdminPreviewList(all);
  refreshIcons();
}

function renderAdminPreviewList(all) {
  const host = netEl('network-admin-list');
  if (!host) return;
  if (!all.length) {
    host.innerHTML = '<p>No entries submitted yet.</p>';
    return;
  }

  host.innerHTML = all.map(entry => {
    const statusLabel = entry.status === 'approved' ? 'Approved (showing)' : entry.status === 'hidden' ? 'Hidden' : 'Pending approval (hidden)';
    const collabLabel = entry.open_to_collaborating ? 'Open to collaborating' : 'Not collaborating right now';
    return '<div class="network-admin-row" data-admin-entry-id="' + safeAttr(entry.id) + '">' +
      '<div class="network-admin-meta">' +
        '<strong>' + escapeHtml(entry.name) + ' (' + escapeHtml(statusLabel) + ')</strong>' +
        '<span>' + escapeHtml(entry.what_you_do) + ' · ' + escapeHtml(collabLabel) + ' · ' + escapeHtml(entry.link_url) + '</span>' +
      '</div>' +
      '<div class="network-admin-actions">' +
        (entry.status !== 'approved'
          ? '<button class="secondary-button" type="button" data-network-action="approve" data-entry-id="' + safeAttr(entry.id) + '">Approve</button>'
          : '<button class="secondary-button" type="button" data-network-action="hide" data-entry-id="' + safeAttr(entry.id) + '">Hide</button>') +
      '</div>' +
    '</div>';
  }).join('');
}

async function setEntryStatus(entryId, newStatus) {
  const local = loadLocalEntries();
  const next = local.map(item => {
    if (String(item.id) !== String(entryId)) return item;
    return Object.assign({}, item, {
      status: newStatus,
      approved_at: newStatus === 'approved' ? new Date().toISOString() : item.approved_at
    });
  });
  saveLocalEntries(next);
  directoryState.entries = next;

  if (networkSb && directoryState.mode === 'live-table') {
    try {
      await networkSb.rpc('admin_set_network_directory_status', {
        p_entry_id: entryId,
        p_status: newStatus
      });
    } catch (e) {}
  }

  renderDirectory();
}

function validateField(input) {
  if (!input || !input.matches || !input.matches('input, textarea')) return true;
  let valid = true;
  const val = String(input.value || '').trim();

  if (input.id === 'network-name') {
    valid = val.length >= 1 && val.length <= 120;
  } else if (input.id === 'network-what') {
    valid = val.length >= 1 && val.length <= 500;
  } else if (input.id === 'network-link') {
    valid = /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(val) && val.length <= 300;
  } else if (input.id === 'network-consent') {
    valid = Boolean(input.checked);
  } else {
    valid = input.checkValidity();
  }

  const errorId = input.getAttribute('aria-errormessage');
  const errorEl = errorId ? netEl(errorId) : null;

  input.classList.toggle('is-invalid', !valid);
  if (errorEl) {
    errorEl.classList.toggle('is-visible', !valid);
  }
  if (!valid) {
    input.setAttribute('aria-invalid', 'true');
  } else {
    input.removeAttribute('aria-invalid');
  }
  return valid;
}

function syncUserInvalid(event) {
  const input = event.target;
  if (!input || !input.matches || !input.matches('input, textarea')) return;

  let isUserInvalid = false;
  try {
    isUserInvalid = input.matches(':user-invalid');
  } catch (e) {}

  if (event.type === 'blur' && input.value.trim() !== '') {
    validateField(input);
    return;
  }

  if (isUserInvalid) {
    input.setAttribute('aria-invalid', 'true');
  } else if (input.getAttribute('aria-invalid') === 'true') {
    validateField(input);
  }
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const nameInput = netEl('network-name');
  const whatInput = netEl('network-what');
  const linkInput = netEl('network-link');
  const consentInput = netEl('network-consent');
  const statusBox = netEl('network-form-status');
  const submitBtn = netEl('network-submit');

  const controls = [nameInput, whatInput, linkInput, consentInput];
  let firstInvalid = null;
  for (const control of controls) {
    const ok = validateField(control);
    if (!ok && !firstInvalid) firstInvalid = control;
  }

  if (firstInvalid) {
    statusBox.hidden = false;
    statusBox.className = 'network-status is-error';
    statusBox.textContent = 'Please check the highlighted field before sending your card.';
    firstInvalid.focus();
    return;
  }

  const collabRadio = document.querySelector('input[name="open_to_collaborating"]:checked');
  const openToCollab = !collabRadio || collabRadio.value === 'yes';

  const newEntry = {
    id: (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : ('net-' + Date.now()),
    name: nameInput.value.trim(),
    what_you_do: whatInput.value.trim(),
    link_url: linkInput.value.trim(),
    open_to_collaborating: openToCollab,
    consent_given: true,
    status: 'pending',
    created_at: new Date().toISOString(),
    approved_at: null
  };

  submitBtn.disabled = true;
  const labelSpan = submitBtn.querySelector('span');
  if (labelSpan) labelSpan.textContent = 'Sending...';

  let savedRemotely = false;
  let liveInsertFailed = false;
  if (networkSb) {
    try {
      const { error } = await networkSb
        .from('network_directory')
        .insert([{
          name: newEntry.name,
          what_you_do: newEntry.what_you_do,
          link_url: newEntry.link_url,
          open_to_collaborating: newEntry.open_to_collaborating,
          consent_given: true
        }]);
      if (!error) {
        savedRemotely = true;
      } else if (directoryState.mode === 'live-table') {
        liveInsertFailed = true;
      }
    } catch (e) {
      if (directoryState.mode === 'live-table') liveInsertFailed = true;
    }
  }

  if (liveInsertFailed && !savedRemotely) {
    submitBtn.disabled = false;
    if (labelSpan) labelSpan.textContent = document.body && document.body.classList.contains('studio-home') ? 'Send my card' : 'Send card for approval';
    statusBox.hidden = false;
    statusBox.className = 'network-status is-error';
    statusBox.textContent = 'We could not save your card right now. Please check your details and try again.';
    return;
  }

  const current = loadLocalEntries();
  current.unshift(newEntry);
  saveLocalEntries(current);
  if (directoryState.mode !== 'live-table') {
    directoryState.entries = current;
  }

  netEl('network-form').reset();
  for (const control of controls) {
    control.classList.remove('is-invalid');
    control.removeAttribute('aria-invalid');
    const errId = control.getAttribute('aria-errormessage');
    if (errId && netEl(errId)) netEl(errId).classList.remove('is-visible');
  }

  submitBtn.disabled = false;
  if (labelSpan) labelSpan.textContent = document.body && document.body.classList.contains('studio-home') ? 'Send my card' : 'Send card for approval';

  statusBox.hidden = false;
  statusBox.className = 'network-status';
  statusBox.textContent = 'Thank you, ' + newEntry.name + '. Your card is in the approval queue and stays hidden from the public directory until David approves it.';

  renderDirectory();
}

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('studio-light');
  try {
    localStorage.setItem(NETWORK_THEME_KEY, isLight ? 'light' : 'dark');
  } catch (e) {}
}

function toggleAdminDrawer() {
  const drawer = netEl('network-admin-preview');
  const btn = netEl('toggle-admin-preview');
  if (!drawer || !btn) return;
  const nextHidden = !drawer.hidden;
  drawer.hidden = nextHidden;
  btn.setAttribute('aria-expanded', String(!nextHidden));
}

document.addEventListener('blur', syncUserInvalid, true);
document.addEventListener('focus', syncUserInvalid, true);
document.addEventListener('input', event => {
  const input = event.target;
  if (!input || !input.matches || !input.matches('input, textarea')) return;
  if (input.hasAttribute('aria-invalid') || input.classList.contains('is-invalid')) {
    validateField(input);
  }
});
document.addEventListener('change', event => {
  const input = event.target;
  if (input && input.id === 'network-consent' && (input.hasAttribute('aria-invalid') || input.classList.contains('is-invalid'))) {
    validateField(input);
  }
});

if (netEl('network-form')) {
  netEl('network-form').addEventListener('submit', handleFormSubmit);
}
if (netEl('theme-button') && !(document.body && document.body.classList && document.body.classList.contains('studio-home'))) {
  netEl('theme-button').addEventListener('click', toggleTheme);
}
if (netEl('toggle-admin-preview')) {
  netEl('toggle-admin-preview').addEventListener('click', toggleAdminDrawer);
}
if (netEl('network-admin-list')) {
  netEl('network-admin-list').addEventListener('click', event => {
    const btn = event.target.closest('button[data-network-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-network-action');
    const entryId = btn.getAttribute('data-entry-id');
    if (!entryId) return;
    setEntryStatus(entryId, action === 'approve' ? 'approved' : 'pending');
  });
}

window.addEventListener('storage', event => {
  if (event.key === NETWORK_STORAGE_KEY) {
    directoryState.entries = loadLocalEntries();
    renderDirectory();
  }
});

fetchDirectoryEntries();
refreshIcons();
