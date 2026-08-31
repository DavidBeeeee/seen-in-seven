const SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const surface = document.body.dataset.workerbeeSurface;
const el = id => document.getElementById(id);
let session = null;
let state = { sections: [], tasks: [], updates: [], journal: [], clients: [], events: [], products: [], changes: [], readState: null };
let toastTimer = null;
let journalExpanded = false;
let todoOwner = 'workerbee';

// There is no parked work. David abolished it on 2026-08-31 and this caption
// went on saying otherwise, because the quadrant copy lives in two places and
// only the repository copy was corrected. Q4 is not a shelf: it is real work
// the enterprise would survive without, kept visible so it stays a decision.
const TODO_QUADRANTS = {
  Q1: { title: 'Urgent and important', note: 'Queued behind Next.' },
  Q2: { title: 'Important, not urgent', note: 'The real work. Protect this from the noise.' },
  Q3: { title: 'Urgent, not important', note: 'Real chores and deadlines that do not move the business. A thin Q3 is a good sign.' },
  Q4: { title: 'Neither', note: 'Real work the enterprise would survive without. Nothing here is parked, and each item says why it ranks low.' }
};

function icons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
}

function showToast(message, error = false) {
  const node = el('toast');
  node.textContent = message;
  node.className = 'toast' + (error ? ' error' : '');
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 3200);
}

function showOnly(name) {
  for (const id of ['auth-card', 'loading', 'error-card', 'dashboard-app', 'todo-app', 'analytics-app']) {
    const node = el(id);
    if (node) node.hidden = id !== name;
  }
  if (el('sign-out')) el('sign-out').hidden = !session;
}

async function api(action, payload) {
  if (!session) throw new Error('Please sign in again.');
  const options = { headers: { Authorization: `Bearer ${session.access_token}` } };
  if (action) {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ action, payload });
  }
  const response = await fetch('/api/workerbee', options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'WorkerBee could not save that change.');
  return action ? result.result : result;
}

async function activate(nextSession) {
  session = nextSession;
  if (!session) {
    showOnly('auth-card');
    return;
  }
  showOnly('loading');
  try {
    state = await api();
    if (surface === 'analytics') renderAnalytics();
    else if (surface === 'todo') renderTodo();
    else renderDashboard();
    showOnly(surface === 'analytics' ? 'analytics-app' : surface === 'todo' ? 'todo-app' : 'dashboard-app');
    await api('mark_viewed', { surface }).catch(() => null);
    icons();
  } catch (error) {
    el('error-message').textContent = error.message;
    showOnly('error-card');
  }
}

function empty(message) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = message;
  return p;
}

function validDate(value, dateOnly = false) {
  if (!value) return null;
  const date = new Date(dateOnly ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = validDate(value);
  return date ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function formatDate(value) {
  const date = validDate(value, /^\d{4}-\d{2}-\d{2}$/.test(String(value)));
  return date ? date.toLocaleDateString([], { dateStyle: 'medium' }) : '';
}

function appendMetaText(root, text, className = '') {
  if (!text) return;
  const node = document.createElement('span');
  if (className) node.className = className;
  node.textContent = text;
  root.append(node);
}

function appendMetaTime(root, label, value, { dateOnly = false, className = '' } = {}) {
  const formatted = dateOnly ? formatDate(value) : formatDateTime(value);
  if (!formatted) return;
  const time = document.createElement('time');
  if (className) time.className = className;
  time.dateTime = value;
  time.textContent = `${label} ${formatted}`;
  root.append(time);
}

function appendRecordTimestamp(card, value, label = 'Record updated') {
  const formatted = formatDateTime(value);
  if (!formatted) return;
  const row = document.createElement('p');
  row.className = 'record-timestamp';
  const time = document.createElement('time');
  time.dateTime = value;
  time.textContent = `${label} ${formatted}`;
  row.append(time);
  card.append(row);
}

function updateCard(item, actionMode = null) {
  const card = document.createElement('article');
  card.className = 'update-card';
  const title = document.createElement('h3');
  title.textContent = item.title;
  card.append(title);
  if (item.body) {
    const body = document.createElement('p');
    body.textContent = item.body;
    card.append(body);
    if (item.body.length > 160) {
      body.classList.add('clamped');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'quiet-button body-toggle';
      toggle.textContent = 'Show more';
      toggle.addEventListener('click', () => {
        const clamped = body.classList.toggle('clamped');
        toggle.textContent = clamped ? 'Show more' : 'Show less';
      });
      card.append(toggle);
    }
  }
  const meta = document.createElement('div');
  meta.className = 'update-meta';
  appendMetaText(meta, item.metadata && item.metadata.category);
  appendMetaText(meta, statusLabel(item.status));
  appendMetaTime(meta, 'Due', item.due_at, { className: 'due-time' });
  appendMetaText(meta, item.action_id || '');
  appendMetaTime(meta, item.updated_at ? 'Updated' : 'Added', item.updated_at || item.created_at);
  card.append(meta);
  if (actionMode === 'decision' && item.status === 'active') {
    const actions = document.createElement('div');
    actions.className = 'update-actions';
    for (const [label, status] of [['Acknowledge', 'acknowledged'], ['Approve', 'approved'], ['Defer', 'deferred'], ['Reject', 'rejected']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const updated = await api('update_update', { id: item.id, status });
          Object.assign(item, updated);
          renderDashboard();
          showToast(`${label} recorded.`);
        } catch (error) { showToast(error.message, true); }
      });
      actions.append(button);
    }
    card.append(actions);
  }
  if (actionMode === 'outcome' && item.status === 'active') {
    const actions = document.createElement('div');
    actions.className = 'update-actions outcome-actions';
    for (const [label, icon, handler] of [
      ['Move up', 'arrow-up', () => moveOutcome(item, -1)],
      ['Move down', 'arrow-down', () => moveOutcome(item, 1)],
      ['Edit', 'pencil', () => editOutcome(card, item)],
      ['Defer', 'clock-3', () => setOutcomeStatus(item, 'deferred', 'Outcome deferred.')],
      ['Done', 'check', () => setOutcomeStatus(item, 'completed', 'Outcome completed.')]
    ]) actions.append(iconButton(icon, label, handler));
    card.append(actions);
  }
  return card;
}

function fillUpdates(id, items, message, actions = null) {
  const root = el(id);
  root.replaceChildren();
  if (!items.length) root.append(empty(message));
  else items.forEach(item => root.append(updateCard(item, actions)));
}

async function setOutcomeStatus(item, status, message) {
  try {
    Object.assign(item, await api('update_update', { id: item.id, status }));
    renderDashboard();
    showToast(message);
  } catch (error) { showToast(error.message, true); }
}

async function moveOutcome(item, direction) {
  const outcomes = currentOutcomes();
  const index = outcomes.findIndex(entry => entry.id === item.id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= outcomes.length) return;
  [outcomes[index], outcomes[target]] = [outcomes[target], outcomes[index]];
  try {
    await api('reorder_outcomes', { ids: outcomes.map(entry => entry.id) });
    outcomes.forEach((entry, rank) => { entry.metadata = { ...(entry.metadata || {}), rank: rank + 1 }; });
    renderDashboard();
    showToast('Outcome order updated.');
  } catch (error) { showToast(error.message, true); }
}

function editOutcome(card, item) {
  if (card.querySelector('.inline-edit')) return;
  const form = document.createElement('form');
  form.className = 'inline-edit';
  const title = document.createElement('input');
  title.value = item.title;
  title.required = true;
  title.setAttribute('aria-label', 'Outcome title');
  const body = document.createElement('textarea');
  body.value = item.body || '';
  body.rows = 3;
  body.setAttribute('aria-label', 'Outcome detail');
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const save = document.createElement('button');
  save.className = 'primary-button';
  save.type = 'submit';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.className = 'quiet-button';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => form.remove());
  actions.append(save, cancel);
  form.append(title, body, actions);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      Object.assign(item, await api('update_update', { id: item.id, title: title.value, body: body.value }));
      renderDashboard();
      showToast('Outcome updated.');
    } catch (error) { showToast(error.message, true); save.disabled = false; }
  });
  card.append(form);
  title.focus();
}

function currentOutcomes() {
  return state.updates
    .filter(item => item.kind === 'outcome' && item.status === 'active')
    .sort((a, b) => Number(a.metadata && a.metadata.rank || 99) - Number(b.metadata && b.metadata.rank || 99))
    .slice(0, 3);
}

function statusLabel(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

function healthUpdate() {
  return state.updates.find(item => item.metadata && item.metadata.source === 'runtime-health-gate');
}

function gradeUpdate() {
  return state.updates.find(item => item.metadata && item.metadata.source === 'evolution-grade');
}

function dailyReportUpdates() {
  return state.updates
    .filter(item => item.kind === 'summary' && item.status === 'active' && item.metadata && item.metadata.source === 'daily-report')
    .sort((a, b) => String(b.metadata.report_date || '').localeCompare(String(a.metadata.report_date || '')))
    .slice(0, 2);
}

function localDateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function reportDayLabel(reportDate) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (reportDate === localDateKey(today)) return 'Today';
  if (reportDate === localDateKey(yesterday)) return 'Yesterday';
  return formatDate(reportDate) || 'Report';
}

function renderReportPeriod(label, period) {
  const card = document.createElement('article');
  card.className = 'report-period';
  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = label;
  const status = document.createElement('span');
  status.className = 'status-chip';
  status.textContent = statusLabel(period && period.status);
  const periodMeta = document.createElement('div');
  periodMeta.className = 'report-period-meta';
  periodMeta.append(status);
  if (period && period.updatedAt) {
    const updated = document.createElement('time');
    updated.dateTime = period.updatedAt;
    updated.textContent = `Updated ${formatDateTime(period.updatedAt)}`;
    periodMeta.append(updated);
  }
  header.append(title, periodMeta);
  card.append(header);
  if (period && period.summary) {
    const summary = document.createElement('p');
    summary.textContent = period.summary;
    card.append(summary);
  }
  const items = period && Array.isArray(period.completed) ? period.completed : [];
  if (items.length) {
    const list = document.createElement('ul');
    items.forEach(item => {
      const row = document.createElement('li');
      if (item.title) {
        const strong = document.createElement('strong');
        strong.textContent = item.title;
        row.append(strong, document.createTextNode(` ${item.result}`));
      } else {
        row.textContent = item.result;
      }
      list.append(row);
    });
    card.append(list);
  }
  (period && period.unknowns || []).forEach(item => {
    const unknown = document.createElement('p');
    unknown.className = 'report-unknown';
    unknown.textContent = `Unknown: ${item}`;
    card.append(unknown);
  });
  if (period && period.next && period.next.length) {
    const next = document.createElement('p');
    next.className = 'report-next';
    next.textContent = `Next: ${period.next.join(' · ')}`;
    card.append(next);
  }
  const publicActions = period && Array.isArray(period.publicActions) ? period.publicActions : [];
  if (publicActions.length) {
    const actions = document.createElement('div');
    actions.className = 'report-public-actions';
    const actionsLabel = document.createElement('strong');
    actionsLabel.textContent = 'Public activity';
    actions.append(actionsLabel);
    publicActions.forEach(item => {
      const link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${String(item.platform || 'Public').toUpperCase()}: ${item.label || item.action || 'View activity'}`;
      link.setAttribute('aria-label', `Open ${item.platform || 'public'} ${item.action || 'activity'} in a new tab`);
      actions.append(link);
    });
    card.append(actions);
  }
  return card;
}

function renderDailyReport() {
  const root = el('daily-report');
  const date = el('daily-report-date');
  root.replaceChildren();
  const records = dailyReportUpdates();
  if (!records.length) {
    date.textContent = 'Not published';
    root.append(empty('Today’s scheduled WorkerBee results have not been published yet. A cycle is incomplete until its own report appears.'));
    return;
  }
  date.textContent = records.length > 1 ? 'Today + Yesterday' : reportDayLabel(records[0].metadata.report_date);
  records.forEach(record => {
    const reportDate = record.metadata.report_date;
    const day = document.createElement('section');
    day.className = 'daily-report-day';
    const heading = document.createElement('div');
    heading.className = 'daily-report-day-heading';
    const label = document.createElement('h3');
    label.textContent = reportDayLabel(reportDate);
    const stamp = document.createElement('time');
    stamp.dateTime = reportDate;
    stamp.textContent = formatDate(reportDate);
    heading.append(label, stamp);
    const grid = document.createElement('div');
    grid.className = 'daily-report-grid';
    grid.append(
      renderReportPeriod('Morning', record.metadata.morning),
      renderReportPeriod('Afternoon', record.metadata.afternoon),
      renderReportPeriod('Moltbook', record.metadata.moltbook),
      renderReportPeriod('Late night', record.metadata.late_night)
    );
    day.append(heading, grid);
    root.append(day);
  });
}

function renderHealth() {
  const update = healthUpdate();
  const root = el('health-lights');
  root.replaceChildren();
  const overall = el('health-overall');
  const checked = el('health-last-checked');
  if (!update || !update.metadata || !update.metadata.components) {
    overall.textContent = 'Health not yet verified';
    checked.textContent = 'Unknown';
    root.append(empty('The next WorkerBee pulse will publish a component-level health check.'));
    return;
  }
  const status = String(update.metadata.health_status || 'unknown').toUpperCase();
  overall.textContent = `Overall: ${status}`;
  checked.textContent = update.updated_at ? `Checked ${formatDateTime(update.updated_at)}` : status;
  Object.entries(update.metadata.components).forEach(([name, component]) => {
    const item = document.createElement('div');
    item.className = `health-light ${String(component.status || 'unknown').toLowerCase()}`;
    const lamp = document.createElement('span');
    lamp.className = 'health-lamp';
    lamp.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = name.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
    const detail = document.createElement('small');
    detail.textContent = component.summary || statusLabel(component.status);
    copy.append(label, detail);
    item.append(lamp, copy);
    root.append(item);
  });
}

function renderGrade() {
  const record = gradeUpdate();
  const mark = el('grade-current');
  const summary = el('grade-summary');
  const controls = el('grade-controls');
  summary.replaceChildren();
  controls.replaceChildren();
  if (!record || !record.metadata) {
    mark.textContent = '—';
    summary.append(empty('The first evidence score has not been published yet.'));
    return;
  }
  const metadata = record.metadata;
  const evidence = metadata.evidence_grade || '—';
  const david = metadata.david_grade || null;
  mark.textContent = david || evidence;
  mark.className = `grade-mark grade-${String(david || evidence).toLowerCase()}`;
  const lines = [
    ['Evidence grade', evidence],
    ['Current standing', david || evidence],
    ['Next repair', metadata.next_repair || record.body || 'No repair recorded.']
  ];
  if (david) lines.splice(1, 0, ['David’s assessment', david]);
  lines.forEach(([label, value]) => appendDetail(summary, label, value));
  if (metadata.david_note) appendDetail(summary, 'Why', metadata.david_note);
  if (metadata.david_assessed_at) appendDetail(summary, 'David assessed', formatDateTime(metadata.david_assessed_at));
  appendDetail(summary, 'Record updated', formatDateTime(record.updated_at));
  const form = document.createElement('form');
  form.className = 'grade-form';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Set David’s assessment of WorkerBee');
  ['A', 'B', 'C', 'D', 'F'].forEach(grade => {
    const option = document.createElement('option');
    option.value = grade;
    option.textContent = `Set my grade to ${grade}`;
    option.selected = grade === (david || evidence);
    select.append(option);
  });
  const note = document.createElement('input');
  note.required = true;
  note.maxLength = 500;
  note.placeholder = 'Why this grade?';
  note.value = metadata.david_note || '';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'quiet-button';
  save.textContent = 'Record your assessment';
  form.append(select, note, save);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      const updated = await api('update_update', {
        id: record.id,
        metadata: { ...metadata, david_grade: select.value, david_note: note.value.trim(), david_assessed_at: new Date().toISOString(), grade_source: 'david-assessment' }
      });
      Object.assign(record, updated);
      renderGrade();
      showToast('Your assessment is recorded and will sync back to WorkerBee.');
    } catch (error) { showToast(error.message, true); save.disabled = false; }
  });
  controls.append(form);
}

function renderDashboard() {
  const active = state.updates.filter(item => !['rejected', 'completed', 'deferred', 'approved', 'acknowledged'].includes(item.status));
  const outcomes = currentOutcomes();
  const needs = active.filter(item => item.kind === 'needs_david');
  const lastViewed = state.readState && state.readState.last_dashboard_viewed_at;
  const completed = state.updates.filter(item => item.kind === 'completed' && item.status === 'completed' && (!lastViewed || item.updated_at > lastViewed)).slice(0, 8);
  const commitments = active.filter(item => ['commitment', 'blocker'].includes(item.kind)).slice(0, 10);
  const diagnostics = active.filter(item => item.kind === 'diagnostic').slice(0, 10);
  fillUpdates('outcomes-list', outcomes, 'Today’s outcomes will appear after the next WorkerBee synchronization.', 'outcome');
  fillUpdates('needs-list', needs, 'No explicit decision is recorded right now. Ongoing initiatives and improvement work still remain visible elsewhere on this page.', 'decision');
  fillUpdates('completed-list', completed, 'No new completed work since your last visit.');
  fillUpdates('commitments-list', commitments, 'No dated commitment or blocker is currently published.');
  fillUpdates('diagnostics-list', diagnostics, 'No active defect, friction, streamlining opportunity, or expansion candidate is currently recorded.');
  el('needs-count').textContent = String(needs.length);
  el('dashboard-freshness').textContent = state.generatedAt ? `Dashboard synced ${formatDateTime(state.generatedAt)}.` : 'Current state loaded.';
  renderHealth();
  renderGrade();
  renderDailyReport();
  renderClients();
  renderEvents();
  renderProducts();
  renderJournal();
  icons();
}

function renderJournal() {
  const root = el('journal-list');
  root.replaceChildren();
  const scanStatus = el('journal-scan-status');
  if (scanStatus) {
    if (!state.journal.length) {
      scanStatus.textContent = 'No entries yet · daily scan runs every scheduled session.';
    } else {
      const latest = new Date(`${state.journal[0].entry_date}T12:00:00`);
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recent = state.journal.filter(entry => new Date(`${entry.entry_date}T12:00:00`).getTime() >= weekAgo).length;
      scanStatus.textContent = `Last entry ${latest.toLocaleDateString([], { dateStyle: 'medium' })} · ${recent} in last 7 days · ${state.journal.length} total`;
    }
  }
  if (!state.journal.length) {
    root.append(empty('The Journal is ready. I will write only when something real surfaces.'));
    return;
  }
  const visible = journalExpanded ? state.journal.slice(0, 20) : state.journal.slice(0, 1);
  for (const entry of visible) {
    const article = document.createElement('article');
    article.className = 'journal-entry';
    const header = document.createElement('header');
    const left = document.createElement('div');
    const type = document.createElement('div');
    type.className = 'journal-type';
    type.textContent = entry.category;
    const title = document.createElement('h3');
    title.textContent = entry.title;
    left.append(type, title);
    const time = document.createElement('time');
    time.dateTime = entry.entry_date;
    time.textContent = formatDate(entry.entry_date);
    header.append(left, time);
    const body = document.createElement('p');
    body.textContent = entry.body;
    article.append(header, body);
    appendRecordTimestamp(article, entry.updated_at, 'Entry updated');
    root.append(article);
  }
  el('toggle-journal').hidden = state.journal.length <= 1;
  el('toggle-journal').textContent = journalExpanded ? 'Show latest' : `View all (${state.journal.length})`;
}

function makeLink(label, url) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = label;
  return link;
}

function moduleCard(titleText, statusText) {
  const card = document.createElement('article');
  card.className = 'module-card';
  const heading = document.createElement('div');
  heading.className = 'module-card-heading';
  const title = document.createElement('h3');
  title.textContent = titleText;
  const status = document.createElement('span');
  status.className = 'status-chip';
  status.textContent = statusText;
  heading.append(title, status);
  card.append(heading);
  return card;
}

function appendDetail(card, label, value) {
  if (!value) return;
  const row = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(value));
  card.append(row);
}

function appendLinks(card, links) {
  const valid = links.filter(Boolean);
  if (!valid.length) return;
  const row = document.createElement('div');
  row.className = 'module-links';
  valid.forEach(link => row.append(link));
  card.append(row);
}

function renderClients() {
  const root = el('clients-list');
  root.replaceChildren();
  if (!state.clients.length) return root.append(empty('Client records are ready for the next synchronization.'));
  state.clients.forEach(client => {
    const card = moduleCard(client.name, client.transcript_status || client.relationship_status);
    card.classList.add(`client-${String(client.transcript_status || 'unknown').toLowerCase()}`);
    appendDetail(card, 'Focus', client.current_focus);
    appendDetail(card, 'Transcript', client.metadata && client.metadata.latestTranscript);
    appendDetail(card, 'Latest session', formatDate(client.metadata && client.metadata.latestSessionAt));
    appendDetail(card, 'Next check', client.metadata && client.metadata.nextCheck);
    appendDetail(card, 'Next meeting', formatDateTime(client.next_meeting_at));
    appendDetail(card, 'Follow up', formatDate(client.follow_up_date));
    appendDetail(card, 'Nearest deadline', formatDate(client.nearest_deadline));
    const open = Array.isArray(client.commitments) ? client.commitments.filter(item => !['done', 'complete', 'completed'].includes(item.status)).length : 0;
    appendDetail(card, 'Open commitments', open ? String(open) : null);
    const overdue = Array.isArray(client.commitments)
      ? client.commitments.filter(item => item.overdue && item.followUpQuestion)
      : [];
    overdue.forEach(item => appendDetail(card, 'Overdue — ready to send', item.followUpQuestion));
    appendLinks(card, [makeLink('Source', client.drive_url), makeLink('Living plan', client.living_plan_url)]);
    appendRecordTimestamp(card, client.updated_at);
    root.append(card);
  });
}

function renderEvents() {
  const root = el('events-list');
  root.replaceChildren();
  if (!state.events.length) return root.append(empty('No current event or launch record.'));
  state.events.slice(0, 5).forEach(event => {
    const card = moduleCard(event.title, event.status);
    appendDetail(card, 'Starts', formatDateTime(event.starts_at));
    appendDetail(card, 'Ends', formatDateTime(event.ends_at));
    appendDetail(card, 'Next', event.next_action);
    appendLinks(card, [makeLink('Page', event.registration_url), makeLink('Source', event.source_url)]);
    appendRecordTimestamp(card, event.updated_at);
    root.append(card);
  });
}

function renderProducts() {
  const root = el('products-list');
  root.replaceChildren();
  if (!state.products.length) return root.append(empty('No product freshness records yet.'));
  state.products.slice(0, 8).forEach(product => {
    const card = moduleCard(product.name, product.status);
    appendDetail(card, 'Last change', formatDateTime(product.last_meaningful_change_at) || 'Unknown');
    appendDetail(card, 'Next review', formatDate(product.next_review_date));
    appendDetail(card, 'Next', product.next_improvement);
    appendLinks(card, [makeLink('Open app', product.route_url), makeLink('Roadmap', product.roadmap_url)]);
    appendRecordTimestamp(card, product.updated_at);
    root.append(card);
  });
}

function sortByOrder(items) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

async function replaceFromServer() {
  state = await api();
  if (surface === 'analytics') renderAnalytics();
  else if (surface === 'todo') renderTodo();
  else renderDashboard();
}

function iconButton(name, label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  const icon = document.createElement('i');
  icon.dataset.lucide = name;
  button.append(icon);
  button.addEventListener('click', handler);
  return button;
}

let todoFilter = '';

// Collapsed categories are remembered, so hiding one to focus on another
// survives a reload. Wrapped because a browser with site data blocked throws
// on access rather than returning nothing.
const COLLAPSE_KEY = 'wb-todo-collapsed';
function collapsedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch { return new Set(); }
}
function rememberCollapse(name, collapsed) {
  try {
    const set = collapsedSet();
    if (collapsed) set.add(name); else set.delete(name);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]));
  } catch { /* a viewer with storage blocked simply does not get the memory */ }
}

// One category block: a big, collapsible, ember heading with its count.
function categoryBlock(name, count) {
  const details = document.createElement('details');
  details.className = 'todo-category';
  details.open = !collapsedSet().has(name);
  const summary = document.createElement('summary');
  const label = document.createElement('span');
  label.textContent = name;
  const chip = document.createElement('span');
  chip.className = 'category-count';
  chip.textContent = count;
  summary.append(label, chip);
  const body = document.createElement('div');
  details.append(summary, body);
  details.addEventListener('toggle', () => rememberCollapse(name, !details.open));
  return { details, body };
}

// Search, so an ID shared in conversation can be found on the page. Matches
// the identifier, the title, the detail and the category, because half the
// time the thing being looked for is remembered by its words rather than its
// number.
function matchesFilter(item) {
  if (!todoFilter) return true;
  const meta = item.metadata || {};
  return [item.title, item.body, meta.roadmap_item_id, meta.queue_item_id, meta.theme, meta.initiative_title]
    .filter(Boolean).join(' ').toLowerCase().includes(todoFilter);
}

function renderTodo() {
  const root = el('todo-board');
  root.replaceChildren();
  const sections = sortByOrder(state.sections);
  const openTasks = state.tasks.filter(task => task.status !== 'done');
  const queueItems = state.updates.filter(item => item.kind === 'commitment' && item.status === 'active' && ['execution-queue', 'roadmap'].includes(item.metadata?.source));
  const counts = {
    workerbee: queueItems.filter(item => (item.metadata?.owner || 'workerbee') !== 'david').length + openTasks.filter(task => task.owner === 'workerbee').length,
    david: openTasks.filter(task => task.owner !== 'workerbee').length + queueItems.filter(item => item.metadata?.owner === 'david').length
  };
  el('workerbee-task-count').textContent = counts.workerbee;
  el('david-task-count').textContent = counts.david;
  document.querySelectorAll('[data-todo-owner]').forEach(button => {
    const active = button.dataset.todoOwner === todoOwner;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  // The score, computed here rather than published as a number. A point is an
  // item WorkerBee filed, finished, where finishing left an artifact naming it.
  const scored = state.updates.filter(item => item.kind === 'commitment' && item.metadata?.filed_by === 'workerbee');
  const points = scored.filter(item => item.metadata?.item_status === 'completed' && ['commit', 'log', 'outcome'].includes(item.metadata?.last_moved_kind));
  const scoreEl = el('todo-score');
  if (scoreEl) {
    scoreEl.textContent = scored.length
      ? `${points.length} point${points.length === 1 ? '' : 's'} · ${scored.length} filed · ${scored.filter(i => i.metadata?.item_status !== 'completed').length} open`
      : 'No items filed yet.';
    scoreEl.title = 'A point is an item WorkerBee put on this board and then finished, where finishing left a commit, a log entry or a recorded outcome naming it.';
  }

  const mine = queueItems.filter(item => (item.metadata?.owner === 'david' ? 'david' : 'workerbee') === todoOwner).filter(matchesFilter);
  // Inbox above everything. David: it "was the inital point of it, So I could
  // add tasks and they would be organzied." An inbox below the work is a
  // drawer; the whole point is that things pass through it.
  const inboxSection = sections.find(section => /^inbox$/i.test(section.title || ''));
  const inboxTasks = inboxSection ? sortByOrder(openTasks.filter(task => task.section_id === inboxSection.id)) : [];
  const inboxItems = mine.filter(item => item.metadata?.item_status === 'inbox');
  const inboxPanel = document.createElement('section');
  inboxPanel.className = 'todo-quadrant';
  inboxPanel.dataset.quadrant = 'inbox';
  const inboxHead = document.createElement('header');
  inboxHead.className = 'todo-quadrant-heading';
  const inboxWords = document.createElement('div');
  const inboxTitle = document.createElement('h2');
  inboxTitle.textContent = 'Inbox';
  const inboxNote = document.createElement('p');
  inboxNote.textContent = 'Captured and not yet routed. Give each one an owner, a number and a home, or drop it. Empty is the target state.';
  inboxWords.append(inboxTitle, inboxNote);
  inboxHead.append(inboxWords);
  inboxPanel.append(inboxHead);
  if (!inboxTasks.length && !inboxItems.length) inboxPanel.append(empty('Empty, which is the target rather than an achievement.'));
  else {
    if (inboxTasks.length && inboxSection) inboxPanel.append(editableTodoProject({ section: inboxSection, sectionIndex: sections.indexOf(inboxSection), tasks: inboxTasks }));
    inboxItems.forEach(item => inboxPanel.append(queueTaskRow(item, { showProject: true })));
  }
  root.append(inboxPanel);

  root.append(flatPanel({
    id: 'today',
    title: 'Next',
    note: 'Priority 4 and under and not blocked. It does not have to be done today, but it should be done as soon as possible. It sits in front of the quadrants on purpose: clearing this is how the urgent and important work becomes reachable.',
    items: mine.filter(isNext),
    emptyText: 'Nothing actionable at this priority, which either means the board is clear or everything urgent is blocked. Check Q1 before believing the first one.'
  }));

  for (const [quadrant, copy] of Object.entries(TODO_QUADRANTS)) {
    const panel = document.createElement('section');
    panel.className = 'todo-quadrant';
    panel.dataset.quadrant = quadrant;
    const heading = document.createElement('header');
    heading.className = 'todo-quadrant-heading';
    const words = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = copy.title;
    const note = document.createElement('p');
    note.textContent = copy.note;
    const label = document.createElement('span');
    label.className = 'quadrant-label';
    label.textContent = quadrant;
    words.append(title, note);
    heading.append(words, label);
    panel.append(heading);

    const editableProjects = sections.map((section, sectionIndex) => ({
      section,
      sectionIndex,
      tasks: sortByOrder(openTasks.filter(task => task.section_id === section.id && (task.owner === 'workerbee' ? 'workerbee' : 'david') === todoOwner))
    })).filter(project => !/^inbox$/i.test(project.section.title || ''))
      .filter(project => (project.tasks.length ? taskProjectQuadrant(project.tasks) === quadrant : (todoOwner === 'david' && quadrant === 'Q2')));
    const queueProjects = groupQueueProjects(mine.filter(item => !isNext(item) && !isLongTerm(item) && queueQuadrant(item) === quadrant));

    editableProjects.forEach(project => panel.append(editableTodoProject(project)));
    queueProjects.forEach(project => panel.append(queueTodoProject(project)));
    if (!editableProjects.length && !queueProjects.length) panel.append(empty('Nothing here.'));
    root.append(panel);
  }

  root.append(flatPanel({
    id: 'horizon',
    title: 'Long term',
    note: 'Priority 8 and over. Where this is all going. A high number is not unimportant, it means something else has to finish first.',
    items: mine.filter(isLongTerm),
    emptyText: 'Nothing recorded, which would mean the long-form plans were never extracted.'
  }));
  icons();
}

function dueSoon(task) {
  const raw = task.due_date || task.follow_up_date;
  if (!raw) return false;
  const when = validDate(raw, true);
  if (!when) return false;
  return when.getTime() <= Date.now() + (3 * 86400000);
}

function taskProjectQuadrant(tasks) {
  if (tasks.some(task => task.status === 'active' && dueSoon(task))) return 'Q1';
  if (tasks.some(task => task.status === 'active')) return 'Q2';
  if (tasks.some(task => task.status === 'waiting' && dueSoon(task))) return 'Q3';
  return 'Q4';
}

function priorityOf(item) {
  const value = Number(item.metadata?.priority);
  return Number.isFinite(value) ? value : 5;
}

// Next, not Today. This is the comprehensive board rather than the quick
// dashboard, so the band has no cap: everything urgent and actionable is in
// it. It sits in front of Q1 deliberately, which is where the pressure comes
// from, and blocked work is never in it because something waiting on a
// dependency cannot be done as soon as possible.
const NEXT_MAX = 4;
const LONG_TERM_MIN = 8;
// Wider than NEXT_MAX on purpose. When the two matched, Next swallowed Q1 and
// both Q1 and Q3 rendered empty.
const URGENT_AT_OR_UNDER = 6;

function isNext(item) {
  if (item.metadata?.pinned_today === true) return true;
  return priorityOf(item) <= NEXT_MAX && item.metadata?.roadmap_status !== 'blocked' && item.metadata?.queue_status !== 'blocked';
}

function isLongTerm(item) {
  return priorityOf(item) >= LONG_TERM_MIN && !isNext(item);
}

// The quadrant is the pair of axes: priority says when, importance says
// whether the enterprise would survive its absence. Reading importance off
// the initiative's status made it always true once no initiative was parked,
// which emptied Q3 and Q4 without anyone being told.
function queueQuadrant(item) {
  const urgent = priorityOf(item) <= URGENT_AT_OR_UNDER;
  const important = item.metadata?.important !== false;
  if (important && urgent) return 'Q1';
  if (important) return 'Q2';
  if (urgent) return 'Q3';
  return 'Q4';
}

function groupQueueProjects(items) {
  const groups = new Map();
  items.forEach(item => {
    const id = item.metadata?.initiative_id || 'unassigned';
    if (!groups.has(id)) groups.set(id, { title: item.metadata?.initiative_title || 'Unassigned WorkerBee work', items: [] });
    groups.get(id).items.push(item);
  });
  return [...groups.values()];
}

function projectShell(title, count) {
  const details = document.createElement('details');
  details.className = 'todo-project';
  const summary = document.createElement('summary');
  const name = document.createElement('span');
  name.textContent = title;
  const badge = document.createElement('span');
  badge.className = 'project-count';
  badge.textContent = `${count} open`;
  summary.append(name, badge);
  const body = document.createElement('div');
  body.className = 'todo-project-body';
  details.append(summary, body);
  return { details, body };
}

function editableTodoProject({ section, sectionIndex, tasks }) {
  const { details, body } = projectShell(section.title, tasks.length);
  const headingRow = document.createElement('div');
  headingRow.className = 'section-title-row';
  const heading = document.createElement('input');
  heading.className = 'section-title';
  heading.value = section.title;
  heading.setAttribute('aria-label', 'Heading title');
  heading.addEventListener('change', async () => {
    const value = heading.value.trim();
    if (!value || value === section.title) { heading.value = section.title; return; }
    try { Object.assign(section, await api('update_section', { id: section.id, title: value })); showToast('Heading saved.'); renderTodo(); }
    catch (error) { heading.value = section.title; showToast(error.message, true); }
  });
  const controls = document.createElement('div');
  controls.className = 'section-controls';
  controls.append(
    iconButton('arrow-up', 'Move heading up', () => moveSection(sectionIndex, -1)),
    iconButton('arrow-down', 'Move heading down', () => moveSection(sectionIndex, 1)),
    iconButton('archive', 'Archive heading', () => archiveSection(section))
  );
  headingRow.append(heading, controls);
  const list = document.createElement('div');
  list.className = 'task-list';
  tasks.forEach((task, index) => list.append(taskRow(task, tasks, index)));
  const add = document.createElement('form');
  add.className = 'task-add';
  const plus = document.createElement('span');
  plus.textContent = '+';
  const input = document.createElement('input');
  input.placeholder = 'Add a task';
  input.setAttribute('aria-label', `Add a task under ${section.title}`);
  add.append(plus, input);
  add.addEventListener('submit', async event => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.disabled = true;
    try {
      const created = await api('create_task', { section_id: section.id, title: value, owner: todoOwner, sort_order: tasks.length * 100 });
      state.tasks.push(created);
      renderTodo();
    } catch (error) { showToast(error.message, true); input.disabled = false; }
  });
  body.append(headingRow, list, add);
  return details;
}

function queueTaskRow(item, { showProject = false } = {}) {
  const row = document.createElement('div');
  row.className = 'queue-task';
  const head = document.createElement('div');
  head.className = 'queue-task-head';
  const badge = document.createElement('span');
  badge.className = 'priority-badge';
  badge.dataset.band = isNext(item) ? 'today' : isLongTerm(item) ? 'horizon' : 'board';
  badge.textContent = priorityOf(item);
  badge.title = 'Weight of urgency on what to do next. 1 is today, 10 means something else has to finish first.';
  const title = document.createElement('strong');
  title.textContent = item.title;
  head.append(badge, title);
  row.append(head);
  if (showProject && item.metadata?.initiative_title) {
    const project = document.createElement('em');
    project.className = 'queue-task-project';
    project.textContent = item.metadata.initiative_title;
    row.append(project);
  }
  const next = document.createElement('small');
  next.textContent = item.body || item.metadata?.intended_result || '';
  row.append(next);
  // When it last actually moved, derived from commits, logs and recorded
  // outcomes rather than from a field anything could refresh. "Created" means
  // written down and not acted on since, which is a real answer.
  const movedAt = item.metadata?.last_moved_at;
  if (movedAt) {
    const days = Math.max(0, Math.floor((Date.now() - Date.parse(movedAt)) / 86400000));
    const moved = document.createElement('small');
    moved.className = 'last-moved' + (days > 21 ? ' stale' : '');
    const kind = item.metadata.last_moved_kind === 'created' ? 'written down' : item.metadata.last_moved_kind;
    moved.textContent = `Last moved ${days === 0 ? 'today' : `${days}d ago`} · ${kind}${item.metadata.last_moved_ref ? ` ${item.metadata.last_moved_ref}` : ''}`;
    row.append(moved);
  }
  // What the other person owes on this item. Shown, never blocking: the item
  // stays owned and advances as far as it can without them.
  const owes = item.metadata?.needs_from_david ? ['Needs from David', item.metadata.needs_from_david]
    : item.metadata?.needs_from_workerbee ? ['Needs from WorkerBee', item.metadata.needs_from_workerbee] : null;
  if (owes) {
    const line = document.createElement('small');
    line.className = 'needs-from';
    line.textContent = `${owes[0]}: ${owes[1]}`;
    row.append(line);
  }
  if (item.metadata?.not_important_because) {
    const why = document.createElement('small');
    why.className = 'waiting-on';
    why.textContent = `Not important: ${item.metadata.not_important_because}`;
    row.append(why);
  }
  if (item.metadata?.blocked_by) {
    const waiting = document.createElement('small');
    waiting.className = 'waiting-on';
    waiting.textContent = `Waiting on: ${item.metadata.blocked_by}`;
    row.append(waiting);
  }
  return row;
}

function byPriority(a, b) {
  return priorityOf(a) - priorityOf(b);
}

function queueTodoProject(project) {
  const { details, body } = projectShell(project.title, project.items.length);
  const rows = project.items.sort(byPriority);
  // Grouped by theme once the project is big enough that the fold is a wall
  // rather than a summary. Below that, headings cost more than they explain.
  const themes = new Map();
  rows.forEach(item => {
    const theme = item.metadata?.theme || 'Other';
    if (!themes.has(theme)) themes.set(theme, []);
    themes.get(theme).push(item);
  });
  if (rows.length > 6 && themes.size > 1) {
    for (const [theme, items] of themes) {
      const block = categoryBlock(theme, items.length);
      items.forEach(item => block.body.append(queueTaskRow(item)));
      body.append(block.details);
    }
  } else {
    rows.forEach(item => body.append(queueTaskRow(item)));
  }
  return details;
}

// A flat strip rather than folded projects. Today and the horizon are both
// read straight through, so hiding them behind a disclosure would defeat them.
function flatPanel({ id, title, note, items, emptyText }) {
  const panel = document.createElement('section');
  panel.className = 'todo-quadrant';
  panel.dataset.quadrant = id;
  const heading = document.createElement('header');
  heading.className = 'todo-quadrant-heading';
  const words = document.createElement('div');
  const name = document.createElement('h2');
  name.textContent = title;
  const sub = document.createElement('p');
  sub.textContent = note;
  words.append(name, sub);
  heading.append(words);
  panel.append(heading);
  if (!items.length) { panel.append(empty(emptyText)); return panel; }
  // Grouped by category. Thirty-one items in a flat list is the wall this
  // board exists to prevent, and Next is meant to be comprehensive.
  const groups = new Map();
  for (const item of items.sort(byPriority)) {
    const name = item.metadata?.theme || item.metadata?.initiative_title || 'Unassigned';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
  }
  if (groups.size <= 1) { items.forEach(item => panel.append(queueTaskRow(item, { showProject: true }))); return panel; }
  for (const [name, rows] of groups) {
    const { details, body } = categoryBlock(name, rows.length);
    rows.forEach(item => body.append(queueTaskRow(item)));
    panel.append(details);
  }
  return panel;
}

// ---------------------------------------------------------------------------
// Analytics.
//
// David: an analytics tab "that automatically tracks these numbers as it
// happens". It reads the daily snapshots published as diagnostics rather than
// recomputing anything, so this page and the Board can never disagree about
// what the numbers are.
//
// It is honest about how little history exists. A trend drawn through one
// point is a decoration, and saying so is better than drawing it.
// ---------------------------------------------------------------------------

function metricSnapshots() {
  return state.updates
    .filter(item => item.kind === 'diagnostic' && item.metadata?.source === 'metrics' && item.metadata?.snapshot)
    .map(item => item.metadata.snapshot)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function statCard(label, value, note) {
  const card = document.createElement('div');
  card.className = 'card analytics-card';
  const heading = document.createElement('small');
  heading.textContent = label;
  const figure = document.createElement('strong');
  figure.textContent = value;
  card.append(heading, figure);
  if (note) {
    const sub = document.createElement('p');
    sub.textContent = note;
    card.append(sub);
  }
  return card;
}

// A bar per day, drawn with divs. A charting library for a handful of numbers
// is a dependency to maintain and a page that breaks when it changes.
function barRow(label, value, max, tone) {
  const row = document.createElement('div');
  row.className = 'bar-row';
  const name = document.createElement('span');
  name.className = 'bar-label';
  name.textContent = label;
  const track = document.createElement('span');
  track.className = 'bar-track';
  const fill = document.createElement('span');
  fill.className = `bar-fill${tone ? ` ${tone}` : ''}`;
  fill.style.width = `${max ? Math.max(2, Math.round((value / max) * 100)) : 0}%`;
  track.append(fill);
  const number = document.createElement('span');
  number.className = 'bar-value';
  number.textContent = value;
  row.append(name, track, number);
  return row;
}

function renderAnalytics() {
  const snapshots = metricSnapshots();
  const note = el('analytics-note');
  const cards = el('analytics-cards');
  const chart = el('analytics-chart');
  const demeritsBox = el('analytics-demerits');
  if (!cards) return;
  cards.replaceChildren();
  chart.replaceChildren();
  demeritsBox.replaceChildren();

  if (!snapshots.length) {
    note.textContent = 'No snapshots yet. They are written whenever the board is published, so this fills in on its own.';
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const month = latest.score.thisMonth || { delivered: 0, unattended: 0 };
  const share = month.delivered ? Math.round((month.unattended / month.delivered) * 100) : 0;

  note.textContent = snapshots.length === 1
    ? `One snapshot so far, from ${latest.date}. Trends need days to become real, so this page is a starting line rather than a picture.`
    : `${snapshots.length} daily snapshots, ${snapshots[0].date} to ${latest.date}.`;

  cards.append(
    statCard('Delivered this month', month.delivered, 'Weighted by the ranking, so urgent work counts for more.'),
    statCard('Unattended share', `${share}%`, 'Completed inside a scheduled run rather than with David in the room. The number that measures growth.'),
    statCard('Open, WorkerBee', latest.workerbee.open, `${latest.workerbee.next} in Next, ${latest.workerbee.blocked} blocked.`),
    statCard('Open, David', latest.david.open, `${latest.david.next} in Next, ${latest.david.needsOther} needing something from me.`),
    statCard('Inbox', latest.workerbee.inbox + latest.david.inbox, 'Captured and not yet routed. Empty is the target.'),
    statCard('Stalled past 21 days', latest.workerbee.stalledOver21 + latest.david.stalledOver21, `Oldest untouched item is ${Math.max(latest.workerbee.oldestStillDays, latest.david.oldestStillDays)} days still.`)
  );

  const recent = snapshots.slice(-21);
  const max = Math.max(1, ...recent.map(s => s.workerbee.open + s.david.open));
  for (const snapshot of recent) {
    chart.append(barRow(snapshot.date, snapshot.workerbee.open + snapshot.david.open, max));
  }

  const demerits = (latest.score.demerits || []);
  if (!demerits.length) {
    const clean = document.createElement('p');
    clean.className = 'analytics-sub';
    clean.textContent = latest.score.penalty ? `${latest.score.penalty} points lost to demerits.` : 'None recorded.';
    demeritsBox.append(clean);
  }
  icons();
}

function bindTodoSearch() {
  const box = el('todo-search');
  if (!box) return;
  box.addEventListener('input', () => {
    todoFilter = box.value.trim().toLowerCase();
    renderTodo();
  });
}

function bindTodoOwnerTabs() {
  document.querySelectorAll('[data-todo-owner]').forEach(button => {
    button.addEventListener('click', () => {
      todoOwner = button.dataset.todoOwner;
      renderTodo();
    });
  });
}

function taskRow(task, siblingTasks, index) {
  const row = document.createElement('div');
  row.className = 'task-row' + (task.status === 'done' ? ' done' : '');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-check';
  checkbox.checked = task.status === 'done';
  checkbox.setAttribute('aria-label', `Complete ${task.title}`);
  checkbox.addEventListener('change', async () => {
    try {
      Object.assign(task, await api('update_task', { id: task.id, status: checkbox.checked ? 'done' : 'active' }));
      renderTodo();
    } catch (error) { checkbox.checked = !checkbox.checked; showToast(error.message, true); }
  });
  const title = document.createElement('input');
  title.className = 'task-title';
  title.value = task.title;
  title.setAttribute('aria-label', 'Task title');
  title.addEventListener('change', async () => {
    const value = title.value.trim();
    if (!value || value === task.title) { title.value = task.title; return; }
    try { Object.assign(task, await api('update_task', { id: task.id, title: value })); }
    catch (error) { title.value = task.title; showToast(error.message, true); }
  });
  const controls = document.createElement('div');
  controls.className = 'task-controls';
  controls.append(
    iconButton('arrow-up', 'Move task up', () => moveTask(siblingTasks, index, -1)),
    iconButton('arrow-down', 'Move task down', () => moveTask(siblingTasks, index, 1)),
    iconButton('trash-2', 'Delete task', async () => {
      try { await api('delete_task', { id: task.id }); state.tasks = state.tasks.filter(item => item.id !== task.id); renderTodo(); showToast('Task removed. It remains recoverable in history.'); }
      catch (error) { showToast(error.message, true); }
    })
  );
  row.append(checkbox, title, controls);
  return row;
}

async function moveSection(index, direction) {
  const sections = sortByOrder(state.sections);
  const target = index + direction;
  if (target < 0 || target >= sections.length) return;
  const first = sections[index];
  const second = sections[target];
  const firstOrder = first.sort_order;
  try {
    await Promise.all([
      api('update_section', { id: first.id, sort_order: second.sort_order }),
      api('update_section', { id: second.id, sort_order: firstOrder })
    ]);
    await replaceFromServer();
  } catch (error) { showToast(error.message, true); }
}

async function moveTask(tasks, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= tasks.length) return;
  const first = tasks[index];
  const second = tasks[target];
  const firstOrder = first.sort_order;
  try {
    await Promise.all([
      api('update_task', { id: first.id, sort_order: second.sort_order }),
      api('update_task', { id: second.id, sort_order: firstOrder })
    ]);
    await replaceFromServer();
  } catch (error) { showToast(error.message, true); }
}

async function archiveSection(section) {
  if (!window.confirm(`Archive “${section.title}” and hide its tasks?`)) return;
  try { await api('update_section', { id: section.id, archived_at: new Date().toISOString() }); state.sections = state.sections.filter(item => item.id !== section.id); renderTodo(); showToast('Heading archived.'); }
  catch (error) { showToast(error.message, true); }
}

function bindEvents() {
  el('auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = el('auth-email').value.trim().toLowerCase();
    const button = event.submitter;
    button.disabled = true;
    try {
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: false } });
      if (error) throw error;
      el('auth-message').textContent = 'Your sign-in link is on its way.';
      el('auth-message').className = 'form-message';
    } catch (error) {
      el('auth-message').textContent = 'I could not send that link. Please try again.';
      el('auth-message').className = 'form-message error';
    } finally { button.disabled = false; }
  });
  el('sign-out').addEventListener('click', () => sb.auth.signOut());
  if (surface === 'todo') {
    bindTodoOwnerTabs();
bindTodoSearch();
    el('add-section').addEventListener('click', async () => {
      const title = window.prompt('New heading');
      if (!title || !title.trim()) return;
      try { state.sections.push(await api('create_section', { title, sort_order: state.sections.length * 100 })); renderTodo(); }
      catch (error) { showToast(error.message, true); }
    });
  } else if (surface === 'analytics') {
    // Read-only surface. It binds nothing beyond the shared auth form above,
    // and it must not reach for Todo or Journal controls that are not on the
    // page: doing so threw before the auth listener was ever attached, which
    // is why this page could not be signed into at all.
  } else {
    el('toggle-journal').addEventListener('click', () => { journalExpanded = !journalExpanded; renderJournal(); });
    el('new-journal-button').addEventListener('click', () => { el('journal-form').hidden = false; el('journal-title').focus(); });
    el('cancel-journal').addEventListener('click', () => { el('journal-form').reset(); el('journal-form').hidden = true; });
    el('journal-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      try {
        const created = await api('create_journal', { category: el('journal-category').value, title: el('journal-title').value, body: el('journal-body').value });
        state.journal.unshift(created);
        event.currentTarget.reset();
        event.currentTarget.hidden = true;
        renderJournal();
        showToast('Journal entry saved.');
      } catch (error) { showToast(error.message, true); }
      finally { button.disabled = false; }
    });
  }
}

bindEvents();
icons();
sb.auth.onAuthStateChange((_event, nextSession) => {
  setTimeout(() => activate(nextSession), 0);
});
const { data } = await sb.auth.getSession();
await activate(data.session);
