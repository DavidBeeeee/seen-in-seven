import { dashboardPanels, isNewSince, boardCards, completedAt } from '/js/panels.mjs';
import { isClosedWork, isStandingWork, isBlockedWork, isHeldWork, openWorkBands, bandLabel, bandPrimary, bandSupporting } from '/js/open-work.mjs';

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
let todoFilter = '';
// WBR-359. Writing a revision re-renders the Dashboard, so whether the
// walkthrough panel is open has to outlive the render or the act of opening the
// composer would shut the thing being revised.
let walkthroughOpen = false;
let analyticsPeriod = 'week';
// The instruction thread, WBR-321. A render rebuilds the whole board, so the
// box David is typing in and the project he opened have to be remembered here
// or every save throws away the place he was working.
const openNoteComposers = new Set();
const noteDrafts = new Map();
const openProjects = new Set();

const TODO_QUADRANTS = {
  Q1: { title: 'Urgent and important', note: 'Doing now.' },
  Q2: { title: 'Important, not urgent', note: 'The real work. Protect this from the noise.' },
  Q3: { title: 'Urgent, not important', note: 'Deadlines that do not move the business.' },
  Q4: { title: 'Neither', note: 'Parked on purpose, still visible.' }
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
  for (const id of ['auth-card', 'loading', 'error-card', 'dashboard-app', 'todo-app', 'analytics-app', 'momentum300-app']) {
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
    else if (surface === 'momentum300') renderMomentum300();
    else renderDashboard();
    showOnly(surface === 'analytics' ? 'analytics-app' : surface === 'todo' ? 'todo-app' : surface === 'momentum300' ? 'momentum300-app' : 'dashboard-app');
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
  // A period that ran more than once shows every pass separately: a manual
  // extra Morning must never look like it replaced the scheduled one. The
  // latest pass is emphasized because it is also the headline above.
  const passes = period && Array.isArray(period.passes) ? period.passes : [];
  if (passes.length > 1) {
    const passList = document.createElement('ol');
    passList.className = 'report-passes';
    passes.forEach((pass, index) => {
      const row = document.createElement('li');
      if (index === passes.length - 1) row.className = 'is-latest';
      const letter = document.createElement('strong');
      letter.textContent = `Pass ${pass.pass || '?'}`;
      row.append(letter, document.createTextNode(` · ${pass.kind || 'scheduled'} · ${statusLabel(pass.status)}`));
      if (pass.updatedAt) {
        const when = document.createElement('time');
        when.dateTime = pass.updatedAt;
        when.textContent = ` · ${formatDateTime(pass.updatedAt)}`;
        row.append(when);
      }
      if (pass.summary) {
        const passSummary = document.createElement('span');
        passSummary.className = 'report-pass-summary';
        passSummary.textContent = ` — ${pass.summary}`;
        row.append(passSummary);
      }
      passList.append(row);
    });
    card.append(passList);
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
  // WBR-355. The morning is the lane that writes the day's orders, so the
  // button that opens them in plain words belongs on the morning card. This is
  // the half David actually asked for: he can read tonight's plan before
  // tonight runs it, in English, instead of decoding Board ids at the point
  // where correcting it is still cheap.
  if (label === 'Morning') {
    const walkthroughs = todaysWalkthroughs();
    if (walkthroughs.length) card.append(walkthroughButton(walkthroughs));
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

// The orders the morning wrote for today, as they were published beside the
// plan. `walkthrough_current` is the generator's own answer to whether the
// prose still matches the assignment: an order amended after its walkthrough
// was written says so on the page rather than reading as current, which is the
// failure the whole mechanism exists to make visible.
export function todaysWalkthroughs() {
  const orders = (state.updates || [])
    .filter(item => item.kind === 'outcome'
      && (item.metadata || {}).source === 'morning-work-order'
      && (item.metadata || {}).walkthrough);
  // ST-873773fb. Only the current day's work orders belong here. A retired plan
  // row keeps its `source: morning-work-order` and its walkthrough after the
  // next morning defers it, so filtering on source alone stacked every past
  // day's orders onto this list ("17 from yesterday"). The current day is the
  // latest published order date; anything older is history, not today's plan.
  const today = orders.reduce((latest, item) => {
    const date = (item.metadata || {}).date || '';
    return date > latest ? date : latest;
  }, '');
  return orders
    .filter(item => ((item.metadata || {}).date || '') === today)
    .sort((a, b) => Number(a.metadata.rank || 99) - Number(b.metadata.rank || 99))
    .map(item => ({
      item,
      lane: item.metadata.lane || '',
      revision: item.metadata.walkthrough_revision,
      current: item.metadata.walkthrough_current !== false,
      markdown: item.metadata.walkthrough,
      // WBR-359. Revisions David has written against this order that no lane
      // has answered. Surfaced on the button so he can see at a glance that
      // something is still owed him without opening the panel.
      unanswered: (item.notes || []).filter(note => note.author === 'david' && !note.acknowledged_at).length
    }));
}

function walkthroughButton(walkthroughs) {
  const wrap = document.createElement('div');
  wrap.className = 'report-walkthrough';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quiet-button walkthrough-button';
  const stale = walkthroughs.filter(entry => !entry.current).length;
  button.textContent = walkthroughs.length === 1
    ? "Read today's plan in plain words"
    : `Read today's ${walkthroughs.length} plans in plain words`;
  const panel = document.createElement('div');
  panel.className = 'walkthrough-panel';
  const fill = () => {
    panel.replaceChildren();
    walkthroughs.forEach(entry => {
      if (!entry.current) {
        const warning = document.createElement('p');
        warning.className = 'walkthrough-stale';
        warning.textContent = `This ${entry.lane} plan was written against an earlier version of the order and the order has changed since. Treat it as out of date.`;
        panel.append(warning);
      }
      panel.append(walkthroughBlock(entry.markdown, { item: entry.item }));
    });
  };
  panel.hidden = !walkthroughOpen;
  if (walkthroughOpen) fill();
  button.setAttribute('aria-expanded', String(walkthroughOpen));
  button.addEventListener('click', () => {
    walkthroughOpen = !walkthroughOpen;
    if (walkthroughOpen) fill();
    panel.hidden = !walkthroughOpen;
    button.setAttribute('aria-expanded', String(walkthroughOpen));
  });
  wrap.append(button);
  if (stale) {
    const flag = document.createElement('span');
    flag.className = 'walkthrough-stale-chip';
    flag.textContent = `${stale} out of date`;
    wrap.append(flag);
  }
  const waiting = walkthroughs.reduce((total, entry) => total + (entry.unanswered || 0), 0);
  if (waiting) {
    const flag = document.createElement('span');
    flag.className = 'walkthrough-waiting-chip';
    flag.textContent = `${waiting} revision${waiting === 1 ? '' : 's'} not answered yet`;
    wrap.append(flag);
  }
  wrap.append(panel);
  return wrap;
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
  // Every panel's contents come from js/panels.mjs, which WorkerBee's own gate
  // reads back from this deployed file. One definition, checked where it runs.
  const panels = dashboardPanels(state);
  const { needs, completed, commitments, diagnostics } = panels;
  const outcomes = currentOutcomes();
  const lastViewed = state.readState && state.readState.last_dashboard_viewed_at;
  fillUpdates('outcomes-list', outcomes, 'Today\u2019s outcomes will appear after the next WorkerBee synchronization.', 'outcome');
  fillUpdates('needs-list', needs, 'No explicit decision is recorded right now. Ongoing initiatives and improvement work still remain visible elsewhere on this page.', 'decision');
  fillUpdates('completed-list', completed, 'Nothing has been recorded as finished in the last fortnight.');
  fillUpdates('commitments-list', commitments, 'No dated commitment or blocker is currently published.');
  fillUpdates('diagnostics-list', diagnostics, 'No active defect, friction, streamlining opportunity, or expansion candidate is currently recorded.');
  // New since the last visit is an emphasis on work that is shown either way,
  // never the condition for showing it. WBR-336: any load moves that marker,
  // including a run's, so nothing a person needs may hang off it.
  const list = el('completed-list');
  if (list) {
    [...list.children].forEach((node, index) => {
      const item = completed[index];
      node.classList.toggle('is-new', Boolean(item && isNewSince(item, lastViewed)));
    });
  }
  el('needs-count').textContent = String(needs.length);
  // WBR-350. The workload count on the page he opens first, from the same
  // function as the Todo tabs, the analytics card and the audit.
  //
  // The headline figure is the Board alone, because that is the number David
  // asks about and the number the audit prints. Getting every surface onto one
  // selector was not enough by itself: this card first shipped counting the
  // Board and the execution queue together and read 159 against the audit's
  // 148 with both using the identical rule, because the scopes differed rather
  // than the filters. A number that does not say what it counts is the bug.
  //
  // The final correction, 2026-09-17: the headline is the actionable work, not
  // every tracked item. Held and standing stay visible as the supporting line,
  // the execution queue is named separately, and the full tracked total lives
  // on the tooltip. Held work must not inflate the main workload number.
  const cards = boardCards(state);
  const boardBands = openWorkBands(cards.filter(item => (item.metadata || {}).source === 'roadmap'));
  const queueBands = openWorkBands(cards.filter(item => (item.metadata || {}).source === 'execution-queue'));
  const boardCount = el('board-count');
  if (boardCount) {
    boardCount.hidden = false;
    const figure = el('board-count-figure');
    figure.textContent = String(boardBands.active ?? 0);
    figure.title = `${boardBands.open ?? 0} tracked in all.`;
    el('board-count-label').textContent = 'active Todo items on the Board.';
    const sub = el('board-count-sub');
    if (sub) {
      sub.textContent =
        `${boardBands.held ?? 0} held · ${boardBands.standing ?? 0} standing · ${queueBands.open ?? 0} in the execution queue.`;
    }
  }
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
  else if (surface === 'momentum300') renderMomentum300();
  else if (surface === 'todo') renderTodo();
  else renderDashboard();
}

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

function shortAnalyticsLabel(label) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (date) return `${date[2]}/${date[3]}`;
  const week = /^(\d{4})-W(\d{1,2})$/.exec(label);
  if (week) return `W${week[2]}`;
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  return month ? month[2] : label;
}

function barColumn(label, total, max, subset = 0) {
  const column = document.createElement('div');
  column.className = 'bar-col';
  const plot = document.createElement('span');
  plot.className = 'bar-plot';
  const value = document.createElement('span');
  value.className = 'bar-value';
  value.textContent = total;
  const bar = document.createElement('span');
  bar.className = 'bar-fill';
  const height = max && total ? Math.max(3, Math.round((total / max) * 108)) : 0;
  bar.style.height = `${height}px`;
  bar.title = `${label}: ${total}`;
  if (subset && total) {
    const part = document.createElement('span');
    part.className = 'bar-part';
    part.style.height = `${Math.min(100, Math.round((subset / total) * 100))}%`;
    part.title = `${label}: ${subset} of ${total} unattended`;
    bar.append(part);
    value.title = `${total} delivered, ${subset} unattended`;
  }
  const name = document.createElement('span');
  name.className = 'bar-label';
  name.textContent = shortAnalyticsLabel(label);
  name.title = label;
  plot.append(value, bar);
  column.append(plot, name);
  return column;
}

function renderAnalytics() {
  const snapshots = metricSnapshots();
  const note = el('analytics-note');
  const cards = el('analytics-cards');
  const chart = el('analytics-chart');
  const shape = el('analytics-shape');
  const demeritsBox = el('analytics-demerits');
  if (!cards || !chart || !shape || !demeritsBox) return;
  cards.replaceChildren();
  chart.replaceChildren();
  shape.replaceChildren();
  demeritsBox.replaceChildren();
  chart.className = 'bar-chart';
  shape.className = 'bar-chart';

  if (!snapshots.length) {
    note.textContent = 'No snapshots yet. They are written whenever the Board is published, so this fills in on its own.';
    return;
  }

  const latest = snapshots[snapshots.length - 1];
  const month = latest.score?.thisMonth || { delivered: 0, unattended: 0 };
  const workerbee = latest.workerbee || {};
  const david = latest.david || {};
  const board = latest.board || {};
  const share = month.delivered ? Math.round(((month.unattended || 0) / month.delivered) * 100) : 0;
  note.textContent = `${snapshots.length} daily snapshot${snapshots.length === 1 ? '' : 's'}, ${snapshots[0].date} to ${latest.date}.`;
  cards.append(
    statCard('Delivered this month', month.delivered || 0, 'Weighted by ranking, so urgent work counts for more.'),
    statCard('Unattended share', `${share}%`, 'Completed inside a scheduled run rather than with David in the room.'),
    // WBR-350. The Board on its own, first, because it is the number David
    // asks about and the number the audit prints. Everything under it says
    // what it counts: these two cards mix the Board with the execution queue,
    // which is why they could never match the audit even before the filters
    // were unified.
    //
    // The final correction, 2026-09-17: the figure is the actionable work, not
    // the full tracked total. Held and standing are the supporting line, the
    // tracked total is named as supporting information, and nothing is called
    // "waiting on something" — the blocked state was abolished.
    statCard('Active on the Board', board.active ?? 0,
      `${board.held ?? 0} held · ${board.standing ?? 0} standing · ${board.open ?? 0} tracked in all. Board only, the same count the audit prints.`),
    statCard('Active, WorkerBee', workerbee.active ?? 0,
      `${workerbee.held ?? 0} held · ${workerbee.standing ?? 0} standing · ${workerbee.open ?? 0} tracked. ${workerbee.next || 0} next. Board and execution queue.`),
    statCard('Active, David', david.active ?? 0,
      `${david.held ?? 0} held · ${david.standing ?? 0} standing · ${david.open ?? 0} tracked. ${david.needsOther || 0} needing something from me. Board and execution queue.`),
    statCard('Inbox', (workerbee.inbox || 0) + (david.inbox || 0), 'Captured and not yet routed. Empty is the target.'),
    statCard('Stalled past 21 days', (workerbee.stalledOver21 || 0) + (david.stalledOver21 || 0), `Oldest untouched item is ${Math.max(workerbee.oldestStillDays || 0, david.oldestStillDays || 0)} days still.`)
  );

  const score = latest.score || {};
  const series = score[analyticsPeriod === 'day' ? 'byDay' : analyticsPeriod === 'week' ? 'byWeek' : 'byMonth'] || {};
  const keys = Object.keys(series).sort().slice(analyticsPeriod === 'day' ? -21 : -12);
  const chartNote = el('chart-note');
  chartNote.textContent = keys.length
    ? `Weighted delivery per ${analyticsPeriod}, with unattended work shaded inside each bar. ${keys.length} ${analyticsPeriod}${keys.length === 1 ? '' : 's'} of history.`
    : 'Nothing delivered yet at this granularity.';
  const deliveredMax = Math.max(1, ...keys.map(key => series[key].delivered || 0));
  keys.forEach(key => chart.append(barColumn(key, series[key].delivered || 0, deliveredMax, series[key].unattended || 0)));

  // The shape chart follows the same rule as the cards: the height of a day is
  // the work that could have been acted on, not every tracked item.
  //
  // WBR-380. The comment that used to sit here said snapshots "have carried
  // `active` alongside `open` since WBR-350, so the history stays continuous",
  // and drew every day with `|| 0`. Snapshots written before WBR-350 carry no
  // `active` at all, so the chart opened with fifteen bars reading zero for
  // 08/31 to 09/14 and then jumped to 110. Those zeros were not quiet days,
  // they were days with no reading, and the caption underneath claimed the
  // chart began where the snapshots began. A missing measurement drawn as a
  // real zero is the one thing a chart must never do.
  //
  // So a day is plotted only when it actually carries the number. `|| 0` is
  // gone on purpose: absent and zero are different answers.
  const hasActive = snapshot => Number.isFinite(snapshot.workerbee?.active) || Number.isFinite(snapshot.david?.active);
  const activeFor = snapshot => (snapshot.workerbee?.active || 0) + (snapshot.david?.active || 0);
  const measured = snapshots.filter(hasActive).slice(-21);
  const shapeNote = shape.previousElementSibling;
  if (!measured.length) {
    shape.append(empty('No day yet carries a Board reading. This fills in as snapshots are written.'));
  } else {
    const boardMax = Math.max(1, ...measured.map(activeFor));
    measured.forEach(snapshot => shape.append(barColumn(snapshot.date, activeFor(snapshot), boardMax)));
  }
  if (shapeNote && shapeNote.classList.contains('analytics-sub')) {
    const skipped = snapshots.length - snapshots.filter(hasActive).length;
    shapeNote.textContent = 'Active items per side, the work that could be acted on that day rather than every tracked item. '
      + (measured.length ? `${measured.length} day${measured.length === 1 ? '' : 's'} carry this reading` : 'No day carries this reading yet')
      + (skipped ? `; ${skipped} earlier snapshot${skipped === 1 ? '' : 's'} predate it and are left out rather than drawn as zero.` : '.');
  }

  renderDemerits(score);
  renderDone();
  renderOrders();
  icons();
}

// WBR-356. Pulled out of renderAnalytics, where it ended in an early return on
// an empty demerit list. That return skipped everything after it, so on a board
// with nothing recorded against it the Done browser below never rendered at all
// and the page read as broken for the opposite of a bad reason.
function renderDemerits(score) {
  const demeritsBox = el('analytics-demerits');
  if (!demeritsBox) return;
  demeritsBox.replaceChildren();
  const all = score.demerits || [];
  const search = (el('demerits-search')?.value || '').trim().toLowerCase();
  const demerits = search
    ? all.filter(entry => `${entry.reason || ''} ${entry.at || ''}`.toLowerCase().includes(search))
    : all;
  const note = el('demerits-note');
  const penalty = score.penalty || all.reduce((total, entry) => total + (entry.weight || 1), 0);
  if (note) {
    note.textContent = !all.length
      ? 'None recorded.'
      : demerits.length === all.length
        ? `${all.length} recorded, ${penalty} point${penalty === 1 ? '' : 's'} lost.`
        : `${demerits.length} of ${all.length} recorded.`;
  }
  if (!all.length) return demeritsBox.append(empty('None recorded.'));
  if (!demerits.length) return demeritsBox.append(empty('Nothing matches that.'));
  const list = document.createElement('ul');
  list.className = 'demerit-list';
  demerits.slice().reverse().forEach(entry => {
    const row = document.createElement('li');
    row.className = 'demerit-row';
    const head = document.createElement('div');
    head.className = 'demerit-head';
    const when = document.createElement('span');
    when.className = 'demerit-date';
    when.textContent = entry.at || 'Undated';
    const cost = document.createElement('span');
    cost.className = 'demerit-weight';
    cost.textContent = `-${entry.weight || 1}`;
    head.append(when, cost);
    const reason = document.createElement('p');
    reason.className = 'demerit-reason';
    reason.textContent = entry.reason || 'No reason recorded.';
    row.append(head, reason);
    list.append(row);
  });
  demeritsBox.append(list);
}

// WBR-348. Everything that got moved off the list, in the same ninety-day window
// the payload now returns. Four sources, because "done" is spread across four
// tables and showing one of them would be the same undercount WBR-338 found on
// the Todo page: a number that looks complete and is a fraction.
const DONE_WINDOW_DAYS = 90;
const DONE_SOURCE_LABELS = {
  roadmap: 'Board',
  'execution-queue': 'Execution queue',
  commitment: 'Commitment',
  task: 'Todo page'
};

export function doneItems(state, now = Date.now()) {
  const floor = new Date(now - DONE_WINDOW_DAYS * 86400000).toISOString();
  const fromUpdates = (state.updates || [])
    .filter(item => item.status === 'completed')
    .map(item => ({
      id: item.id,
      title: item.title,
      detail: item.body || '',
      // The same `completed_at` panels.mjs settled on in WBR-335: when the work
      // finished, not when the publisher last touched the row.
      at: completedAt(item),
      source: (item.metadata || {}).source === 'roadmap' ? 'roadmap'
        : (item.metadata || {}).source === 'execution-queue' ? 'execution-queue'
        : 'commitment',
      owner: (item.metadata || {}).owner === 'david' ? 'david' : 'workerbee',
      ref: (item.metadata || {}).roadmap_item_id || null
    }));
  const fromTasks = (state.tasks || [])
    .filter(task => task.status === 'done' && !task.deleted_at)
    .map(task => ({
      id: task.id,
      title: task.title,
      detail: '',
      at: task.completed_at || task.updated_at || null,
      source: 'task',
      owner: task.owner === 'workerbee' ? 'workerbee' : 'david',
      ref: null
    }));
  // An item with no completion date is kept and labelled rather than dropped.
  // Dropping it is how a browser reads as complete while being a fraction,
  // which is the whole reason this window was widened. They sort last.
  return [...fromUpdates, ...fromTasks]
    .filter(entry => !entry.at || String(entry.at) >= floor)
    .sort((a, b) => {
      if (!a.at && !b.at) return a.title.localeCompare(b.title);
      if (!a.at) return 1;
      if (!b.at) return -1;
      return String(b.at).localeCompare(String(a.at));
    });
}

// The heading and the grouping key have to come from the same calendar, and
// until they did the page showed two "Wednesday, September 9" headings: the key
// was the UTC date in the timestamp and the heading was the reader's local one,
// so anything closed in the evening Denver time split its day in half.
function localDayKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'undated';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ST-96a3c053. David: "Anything that happens before the morning run should show
// up as yesterdays work on the dash board, I notice that you move it forward
// when we work past midnight."
//
// WBR-348 fixed the wrong line. It moved the boundary off the timestamp's UTC
// date and onto the reader's local midnight, which was right about the calendar
// and wrong about the day: his day does not end at midnight, it ends when the
// next morning run starts. Work finished at two in the morning is the end of
// the night before, and it was jumping onto a day that had not begun.
//
// So a finished item belongs to the day whose morning lane started most
// recently before it. The boundaries are published rather than guessed, because
// when a morning actually ran is a fact about the run record and not something
// a page can derive.
export function operatingBoundaries(state) {
  const row = (state.updates || []).find(item => item.kind === 'diagnostic'
    && (item.metadata || {}).source === 'lane-boundaries');
  const list = row && Array.isArray(row.metadata.boundaries) ? row.metadata.boundaries : [];
  return list.slice().sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}

export function operatingDayKey(iso, boundaries) {
  if (!iso) return 'undated';
  const at = String(iso);
  let key = null;
  for (const boundary of boundaries || []) {
    if (boundary.startedAt <= at) key = boundary.date; else break;
  }
  // Before the first recorded morning there is no boundary to apply, so the
  // reader's own calendar day is the honest answer rather than a guess.
  return key || localDayKey(iso);
}

function dayHeading(key) {
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Date not recorded';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function renderDone() {
  const list = el('done-list');
  if (!list) return;
  const note = el('done-note');
  const all = doneItems(state);
  const search = (el('done-search')?.value || '').trim().toLowerCase();
  const owner = el('done-owner')?.value || 'all';
  const source = el('done-source')?.value || 'all';
  const shown = all.filter(entry => (owner === 'all' || entry.owner === owner)
    && (source === 'all' || entry.source === source)
    && (!search || `${entry.title} ${entry.detail}`.toLowerCase().includes(search)));

  if (note) {
    note.textContent = shown.length === all.length
      ? `${all.length} finished in the last ${DONE_WINDOW_DAYS} days. Anything older than that is in the daily log, not here.`
      : `${shown.length} of ${all.length} finished in the last ${DONE_WINDOW_DAYS} days.`;
  }

  list.replaceChildren();
  if (!shown.length) {
    list.append(empty(all.length ? 'Nothing matches that.' : 'Nothing has been recorded as finished in this window.'));
    return;
  }

  const boundaries = operatingBoundaries(state);
  let currentDay = null;
  let group = null;
  shown.forEach(entry => {
    const day = entry.at ? operatingDayKey(entry.at, boundaries) : 'undated';
    if (day !== currentDay) {
      currentDay = day;
      const header = document.createElement('h3');
      header.className = 'done-day';
      header.textContent = day === 'undated' ? 'Date not recorded' : dayHeading(day);
      const count = document.createElement('span');
      count.textContent = `${shown.filter(other => (other.at ? operatingDayKey(other.at, boundaries) : 'undated') === day).length}`;
      header.append(count);
      group = document.createElement('div');
      group.className = 'done-group';
      list.append(header, group);
    }
    group.append(doneRow(entry));
  });
}

// WBR-356. The past work orders, and the row opens its walkthrough rather than
// its assignment text. David asked for the walkthrough precisely because the
// assignment is written in Board ids and funnel step numbers, so showing him the
// assignment in the history would rebuild the problem one surface over.
//
// An order with no walkthrough says so plainly instead of falling back to the
// assignment. Everything before tonight is in that state, and a blank is more
// honest than a wall of identifiers presented as if it were the thing he asked
// for.
export function orderHistoryItems(state) {
  // Both sources, unioned at read time rather than written twice. Today's
  // orders are published beside the plan because the Dashboard needs them
  // there; the history rows are everything before today. Publishing today into
  // both would mean two rows per order and a duplicate the moment the morning
  // reran, so the page joins them instead.
  //
  // Only the *active* plan row counts as today's. When a morning publishes a new
  // plan it defers the rows it replaces rather than deleting them, so yesterday's
  // plan row survives beside the history row written for the same order. Taking
  // every plan row showed one order twice; taking only the live one leaves the
  // history row as the single record of every closed day.
  return (state.updates || [])
    .filter(item => item.kind === 'outcome' && (item.metadata || {}).work_order_id
      && (item.metadata.source === 'work-order-history'
        || (item.metadata.source === 'morning-work-order' && item.status === 'active')))
    .map(item => {
      const meta = item.metadata || {};
      return {
        id: item.id,
        title: item.title,
        date: meta.date || null,
        lane: meta.lane || '',
        orderId: meta.work_order_id || '',
        orderStatus: meta.order_status || item.status,
        boardIds: Array.isArray(meta.board_ids) ? meta.board_ids : [],
        amendments: Number(meta.amendments || 0),
        doneWhen: meta.done_when || '',
        walkthrough: meta.walkthrough || null,
        today: meta.source === 'morning-work-order'
      };
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a.lane.localeCompare(b.lane));
}

function renderOrders() {
  const list = el('orders-list');
  if (!list) return;
  const all = orderHistoryItems(state);
  const search = (el('orders-search')?.value || '').trim().toLowerCase();
  const shown = search
    ? all.filter(entry => `${entry.title} ${entry.orderId} ${entry.lane} ${entry.date} ${entry.boardIds.join(' ')} ${entry.doneWhen} ${entry.walkthrough || ''}`.toLowerCase().includes(search))
    : all;
  const note = el('orders-note');
  if (note) {
    note.textContent = !all.length
      ? 'No past work order has been published yet.'
      : shown.length === all.length
        ? `${all.length} order${all.length === 1 ? '' : 's'} on record, ${all.filter(entry => entry.walkthrough).length} with a plain walkthrough. A row opens the walkthrough it was run from.`
        : `${shown.length} of ${all.length} orders.`;
  }
  list.replaceChildren();
  if (!shown.length) return list.append(empty(all.length ? 'Nothing matches that.' : 'No past work order has been published yet.'));
  shown.forEach(entry => list.append(orderRow(entry)));
}

function orderRow(entry) {
  const row = document.createElement('details');
  row.className = 'done-item order-item';
  const summary = document.createElement('summary');
  const title = document.createElement('span');
  title.className = 'done-title';
  title.textContent = entry.title;
  const tags = document.createElement('span');
  tags.className = 'done-tags';
  const when = document.createElement('em');
  when.className = 'done-source';
  when.textContent = entry.date ? `${formatDate(entry.date)} · ${entry.lane}` : entry.lane;
  const state_ = document.createElement('em');
  state_.className = `done-owner ${entry.orderStatus === 'completed' ? 'workerbee' : 'david'}`;
  // "Never closed" is the right words for a past order that was left open and
  // the wrong words for today's, which is open because it is still running.
  state_.textContent = entry.orderStatus === 'completed' ? 'Closed'
    : entry.today ? 'Running today' : 'Never closed';
  tags.append(state_, when);
  summary.append(title, tags);
  const body = document.createElement('div');
  body.className = 'done-detail order-detail';
  if (entry.walkthrough) {
    body.append(walkthroughBlock(entry.walkthrough));
  } else {
    const missing = document.createElement('p');
    missing.className = 'analytics-sub';
    missing.textContent = entry.amendments
      ? `No plain walkthrough was written for this one. It was amended ${entry.amendments} time${entry.amendments === 1 ? '' : 's'} and ran from the assignment alone.`
      : 'No plain walkthrough was written for this one. It predates them.';
    body.append(missing);
  }
  row.append(summary, body);
  return row;
}

// The walkthrough arrives as the markdown the generator wrote, and it is
// rendered rather than dumped: headings, bold step titles, list items and
// paragraphs. Deliberately not a markdown library, because the generator is the
// only thing that writes this and it emits four shapes.
// WBR-359. A revision is a note on the published work order, tagged with the
// step it belongs to. It reuses the note thread that already works on the Todo
// page rather than inventing a second channel, which is what David asked for
// and is also the only reason this reaches a lane at all: resume already reports
// every unanswered note on an update, so a revision written at nine is in front
// of the eleven o'clock lane without anybody carrying it.
//
// The step is carried as a prefix in the note body rather than in a column,
// because a note has no metadata field and adding one would be a migration for
// something a convention settles. `stepTag` and `parseStepTag` are the two ends
// of it and they are the only places that know the format.
//
// A revision deliberately does not edit the assignment. It lands beside the
// order as something to reconcile, so the amendment history stays readable and
// the lane has to answer rather than silently absorb it.
export function stepTag(step) {
  return `[Step ${step}]`;
}

export function parseStepTag(body) {
  const match = /^\[Step (\d+)\]\s*/.exec(String(body || ''));
  return match ? { step: Number(match[1]), body: String(body).slice(match[0].length) } : { step: null, body: String(body || '') };
}

function stepRevisions(item, step) {
  const wrap = document.createElement('div');
  wrap.className = 'step-revisions';
  const mine = (item.notes || [])
    .map(note => ({ note, parsed: parseStepTag(note.body) }))
    .filter(entry => entry.parsed.step === step.step)
    .sort((a, b) => String(a.note.created_at).localeCompare(String(b.note.created_at)));
  mine.forEach(({ note, parsed }) => {
    const entry = document.createElement('article');
    entry.className = 'task-note' + (note.author === 'workerbee' ? ' from-workerbee' : '');
    const meta = document.createElement('p');
    meta.className = 'task-note-meta';
    const who = document.createElement('strong');
    who.textContent = note.author === 'workerbee' ? 'WorkerBee' : 'David';
    const when = document.createElement('time');
    when.dateTime = note.created_at;
    when.textContent = formatDateTime(note.created_at);
    meta.append(who, when);
    if (note.author === 'david' && !note.acknowledged_at) {
      const waiting = document.createElement('span');
      waiting.className = 'task-note-waiting';
      waiting.textContent = 'The lane has not answered this yet';
      meta.append(waiting);
    }
    const body = document.createElement('p');
    body.className = 'task-note-body';
    body.textContent = parsed.body;
    entry.append(meta, body);
    wrap.append(entry);
  });
  wrap.append(stepComposer(item, step, mine.length));
  return wrap;
}

function stepComposer(item, step, threadLength) {
  const key = `step:${item.id}:${step.step}`;
  const wrap = document.createElement('div');
  wrap.className = 'task-note-add';
  wrap.dataset.noteTarget = key;
  const open = openNoteComposers.has(key);
  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'task-note-label';
  label.textContent = open ? 'Writing against this step'
    : threadLength ? 'Add to this step' : 'Change this step';
  label.setAttribute('aria-expanded', String(open));
  const form = document.createElement('form');
  form.className = 'task-note-form';
  form.hidden = !open;
  const box = document.createElement('textarea');
  box.className = 'task-note-box';
  box.rows = 3;
  box.maxLength = 3900;
  box.placeholder = `What should change about "${step.title}"?`;
  box.setAttribute('aria-label', `Revision for step ${step.step}`);
  box.value = noteDrafts.get(key) || '';
  box.addEventListener('input', () => noteDrafts.set(key, box.value));
  const actions = document.createElement('div');
  actions.className = 'task-note-actions';
  const save = document.createElement('button');
  save.className = 'primary-button small';
  save.type = 'submit';
  save.textContent = 'Save revision';
  const cancel = document.createElement('button');
  cancel.className = 'quiet-button small';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  actions.append(save, cancel);
  form.append(box, actions);

  const toggle = () => {
    if (openNoteComposers.has(key)) { openNoteComposers.delete(key); noteDrafts.delete(key); }
    else openNoteComposers.add(key);
    renderDashboard();
    if (openNoteComposers.has(key)) {
      [...document.querySelectorAll('[data-note-target]')]
        .find(node => node.dataset.noteTarget === key)?.querySelector('.task-note-box')?.focus();
    }
  };
  label.addEventListener('click', toggle);
  cancel.addEventListener('click', toggle);
  box.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const value = box.value.trim();
    if (!value) { box.focus(); return; }
    save.disabled = true;
    box.disabled = true;
    try {
      const created = await api('create_item_note', { update_id: item.id, body: `${stepTag(step.step)} ${value}` });
      item.notes = [...(item.notes || []), created];
      openNoteComposers.delete(key);
      noteDrafts.delete(key);
      renderDashboard();
      showToast('Revision saved. The lane that runs this order has to answer it before it starts.');
    } catch (error) {
      save.disabled = false;
      box.disabled = false;
      showToast(error.message, true);
    }
  });
  wrap.append(label, form);
  return wrap;
}

// WBR-359. The blocks of a walkthrough, split at each step so a revision can be
// written against one step rather than against the whole plan. David: every
// useful correction he made on 2026-09-15 was about one specific step, and all
// three of them reached the lane only because they were hand-carried into an
// amendment.
export function walkthroughSteps(markdown) {
  const blocks = String(markdown).split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  const steps = [];
  let current = { step: 0, title: null, blocks: [] };
  for (const block of blocks) {
    const heading = /^\*\*Step (\d+)\. (.+?)\*\*$/.exec(block);
    if (heading) {
      steps.push(current);
      current = { step: Number(heading[1]), title: heading[2], blocks: [block] };
    } else current.blocks.push(block);
  }
  steps.push(current);
  return steps.filter(entry => entry.blocks.length);
}

export function walkthroughBlock(markdown, options = {}) {
  const box = document.createElement('div');
  box.className = 'walkthrough';
  if (options.item) {
    for (const step of walkthroughSteps(markdown)) {
      const section = document.createElement('section');
      section.className = 'walkthrough-step';
      section.append(walkthroughBlock(step.blocks.join('\n\n')));
      if (step.step) section.append(stepRevisions(options.item, step));
      box.append(section);
    }
    return box;
  }
  for (const block of String(markdown).split(/\n{2,}/).map(part => part.trim()).filter(Boolean)) {
    if (block.startsWith('---')) continue;
    if (block.startsWith('### ')) {
      const heading = document.createElement('h4');
      heading.textContent = block.slice(4);
      box.append(heading);
    } else if (block.startsWith('## ')) {
      const heading = document.createElement('h3');
      heading.textContent = block.slice(3);
      box.append(heading);
    } else if (block.startsWith('- ')) {
      const list = document.createElement('ul');
      for (const line of block.split('\n')) {
        if (!line.trim().startsWith('- ')) continue;
        const entry = document.createElement('li');
        entry.textContent = line.trim().slice(2);
        list.append(entry);
      }
      box.append(list);
    } else {
      const paragraph = document.createElement('p');
      // **bold** is the only inline mark the generator emits, and it marks the
      // step title and the "what you get" label.
      for (const [index, part] of block.split(/\*\*/).entries()) {
        if (!part) continue;
        if (index % 2) {
          const strong = document.createElement('strong');
          strong.textContent = part;
          paragraph.append(strong);
        } else paragraph.append(document.createTextNode(part));
      }
      if (block.startsWith('_') && block.endsWith('_')) {
        paragraph.className = 'walkthrough-stamp';
        paragraph.replaceChildren(document.createTextNode(block.replace(/^_|_$/g, '')));
      }
      box.append(paragraph);
    }
  }
  return box;
}

function doneRow(entry) {
  const row = document.createElement('details');
  row.className = 'done-item';
  const summary = document.createElement('summary');
  const title = document.createElement('span');
  title.className = 'done-title';
  title.textContent = entry.title;
  const tags = document.createElement('span');
  tags.className = 'done-tags';
  const who = document.createElement('em');
  who.className = `done-owner ${entry.owner}`;
  who.textContent = entry.owner === 'david' ? 'DavidBee' : 'WorkerBee';
  const where = document.createElement('em');
  where.className = 'done-source';
  where.textContent = entry.ref ? `${DONE_SOURCE_LABELS[entry.source]} · ${entry.ref}` : DONE_SOURCE_LABELS[entry.source];
  tags.append(who, where);
  summary.append(title, tags);
  const body = document.createElement('div');
  body.className = 'done-detail';
  body.textContent = entry.detail || 'No result was written down for this one.';
  row.append(summary, body);
  return row;
}

function bindDoneFilters() {
  ['done-search', 'done-owner', 'done-source'].forEach(id => {
    const node = el(id);
    if (!node) return;
    node.addEventListener(node.tagName === 'SELECT' ? 'change' : 'input', renderDone);
  });
  const orders = el('orders-search');
  if (orders) orders.addEventListener('input', renderOrders);
  const demerits = el('demerits-search');
  if (demerits) demerits.addEventListener('input', () => {
    const snapshots = metricSnapshots();
    renderDemerits((snapshots[snapshots.length - 1] || {}).score || {});
  });
}

// WBR-356. Each history opens and shuts on its own and remembers nothing across
// loads, which is deliberate: a panel that reopens itself because it was open
// last week is how the page stops being one screen tall again without anybody
// changing anything.
//
// Typing in a panel's search opens it, because a search whose results are
// hidden behind a collapsed toggle is worse than no search.
function bindHistoryPanels() {
  document.querySelectorAll('[data-panel-toggle]').forEach(button => {
    const body = el(`${button.dataset.panelToggle}-body`);
    if (!body) return;
    button.addEventListener('click', () => {
      const open = body.hidden;
      body.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.closest('.history-panel')?.classList.toggle('open', open);
      if (open) icons();
    });
  });
  ['done', 'orders', 'demerits'].forEach(name => {
    const search = el(`${name}-search`);
    const body = el(`${name}-body`);
    const button = document.querySelector(`[data-panel-toggle="${name}"]`);
    if (!search || !body || !button) return;
    search.addEventListener('input', () => {
      if (!search.value.trim() || !body.hidden) return;
      body.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      button.closest('.history-panel')?.classList.add('open');
    });
  });
}

function bindPeriodTabs() {
  document.querySelectorAll('[data-period]').forEach(button => {
    button.addEventListener('click', () => {
      analyticsPeriod = button.dataset.period;
      document.querySelectorAll('[data-period]').forEach(other => {
        const active = other.dataset.period === analyticsPeriod;
        other.classList.toggle('active', active);
        other.setAttribute('aria-selected', String(active));
      });
      renderAnalytics();
    });
  });
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

// WBR-347. A capture is a task nobody has given a quadrant yet: `routed_at` is
// null. It sits above the quadrants rather than inside one, because guessing a
// quadrant for it would make the Board look decided when it is not, which is
// WBR-115's lesson one table over.
//
// David's rule, 2026-09-15: nothing is ever deferred and nothing is ever
// blocked. There may just be other things ahead of it. So routing a capture has
// exactly two outputs, a quadrant and an answer about position, and the answer
// comes back on the item's own note thread where he wrote it.
const CAPTURE_SECTION_TITLE = 'Inbox';

function captureSection() {
  return sortByOrder(state.sections).find(section => section.title === CAPTURE_SECTION_TITLE)
    || sortByOrder(state.sections)[0]
    || null;
}

export function isUnrouted(task) {
  return task.status !== 'done' && !task.deleted_at && !task.routed_at;
}

// The quadrant a single task belongs to. An explicit pair wins; with neither
// set the task keeps the quadrant its project has always derived, so nothing
// that existed before this feature moves.
function taskQuadrant(task, projectTasks) {
  if (typeof task.urgent === 'boolean' && typeof task.important === 'boolean') {
    if (task.urgent) return task.important ? 'Q1' : 'Q3';
    return task.important ? 'Q2' : 'Q4';
  }
  return taskProjectQuadrant(projectTasks);
}

function renderCaptures() {
  const list = el('capture-list');
  if (!list) return;
  list.replaceChildren();
  const captures = state.tasks.filter(isUnrouted)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const count = el('capture-count');
  if (count) count.textContent = captures.length;
  const strip = document.querySelector('.capture-strip');
  if (strip) strip.classList.toggle('has-captures', captures.length > 0);
  if (!captures.length) {
    list.append(empty('Nothing waiting. Everything written here has been given a quadrant.'));
    return;
  }
  captures.forEach(task => list.append(captureRow(task)));
}

function captureRow(task) {
  const item = document.createElement('div');
  item.className = 'capture-item';
  item.dataset.noteTask = task.id;

  const row = document.createElement('div');
  row.className = 'capture-row';

  const owner = document.createElement('span');
  owner.className = 'capture-owner';
  owner.textContent = task.owner === 'workerbee' ? 'WorkerBee' : 'DavidBee';

  const title = document.createElement('input');
  title.className = 'task-title';
  title.value = task.title;
  title.setAttribute('aria-label', 'Captured item');
  title.addEventListener('change', async () => {
    const value = title.value.trim();
    if (!value || value === task.title) { title.value = task.title; return; }
    try { Object.assign(task, await api('update_task', { id: task.id, title: value })); }
    catch (error) { title.value = task.title; showToast(error.message, true); }
  });

  const remove = iconButton('trash-2', 'Delete this capture', async () => {
    try {
      await api('delete_task', { id: task.id });
      state.tasks = state.tasks.filter(entry => entry.id !== task.id);
      renderTodo();
      showToast('Capture removed. It remains recoverable in history.');
    } catch (error) { showToast(error.message, true); }
  });
  const controls = document.createElement('div');
  controls.className = 'task-controls';
  controls.append(remove);

  row.append(owner, title, controls);

  // Four buttons rather than two toggles, because the quadrant is the thing
  // being chosen and naming it is clearer than asking two questions whose
  // answers he then has to combine in his head.
  const picker = document.createElement('div');
  picker.className = 'capture-picker';
  const prompt = document.createElement('span');
  prompt.className = 'capture-prompt';
  prompt.textContent = 'Where does it go?';
  picker.append(prompt);
  for (const [quadrant, copy] of Object.entries(TODO_QUADRANTS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'capture-quadrant';
    button.dataset.quadrant = quadrant;
    button.title = copy.title;
    const mark = document.createElement('strong');
    mark.textContent = quadrant;
    const words = document.createElement('small');
    words.textContent = copy.title;
    button.append(mark, words);
    button.addEventListener('click', async () => {
      const urgent = quadrant === 'Q1' || quadrant === 'Q3';
      const important = quadrant === 'Q1' || quadrant === 'Q2';
      picker.querySelectorAll('button').forEach(other => { other.disabled = true; });
      try {
        Object.assign(task, await api('update_task', { id: task.id, urgent, important }));
        renderTodo();
        showToast(`Routed to ${copy.title.toLowerCase()}.`);
      } catch (error) {
        picker.querySelectorAll('button').forEach(other => { other.disabled = false; });
        showToast(error.message, true);
      }
    });
    picker.append(button);
  }

  item.append(row, picker, itemThread(task, { task_id: task.id }));
  return item;
}

function bindCaptureForms() {
  document.querySelectorAll('[data-capture-owner]').forEach(form => {
    const input = form.querySelector('textarea');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const section = captureSection();
      if (!section) { showToast('There is no heading to capture into yet. Add one first.', true); return; }
      input.disabled = true;
      try {
        const created = await api('create_task', {
          section_id: section.id,
          title: value,
          owner: form.dataset.captureOwner,
          sort_order: state.tasks.length * 100,
          // Sending both flags explicitly as null is what asks for an unrouted
          // item. Leaving them out, which is what the per-heading input does,
          // creates an ordinary task that keeps its project's quadrant.
          urgent: null,
          important: null
        });
        const clientKey = todoOwner === 'clients' ? el('capture-client-key')?.value : '';
        if (clientKey) Object.assign(created, await api('link_task_client', { task_id: created.id, client_key: clientKey }));
        state.tasks.push(created);
        input.value = '';
        renderTodo();
        showToast('Written down. It waits above the quadrants until it has one.');
      } catch (error) { showToast(error.message, true); }
      finally { input.disabled = false; input.focus(); }
    });
  });
}

// WBR-351. Search, so an identifier handed over in conversation can be found on
// the page. David: "my search is gone from the TODO list so I can't see what
// wbr-214 is."
//
// It matches the id, the title, the detail and the project, because half the
// time the thing being looked for is remembered by its words rather than its
// number. That was the rule when this was first built on 31 August and it is
// still the right one; what changed is the page underneath, so the matcher now
// has to answer for three kinds of row rather than one: Board cards, the tasks
// under David's own headings, and the unrouted captures in the strip.
//
// Searching deliberately looks past the owner tab and past the quadrants. An id
// he has been handed is an id he wants found, and making him guess which of six
// containers it sits in before the page will admit it exists is the problem
// rather than the feature.
function matchesTodoFilter(fields) {
  if (!todoFilter) return true;
  return fields.filter(Boolean).join(' ').toLowerCase().includes(todoFilter);
}

// WBR-364. Ported from workerbee/seen-in-seven, which main was rebuilt without.
// These are the shapes a Board row needs in order to say anything beyond its
// own title, and every one of them has data waiting in the payload today.
const URL_PATTERN = /https?:\/\/[^\s<>()\[\]]+/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const NEXT_MAX = 4;
const LONG_TERM_MIN = 8;

function anchor(href, text) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text;
  return link;
}

function firstUrl(source) {
  if (!source) return null;
  if (typeof source === 'object') return source.url || source.link || null;
  const found = String(source).match(URL_PATTERN);
  return found ? found[0] : null;
}

// A link in a Board item is a link. David, 2026-09-01, about the item naming
// the three hundred questions: "I thought it was going to be on the Todo task."
// It was. It just was not clickable, which on a surface you work from is the
// same as absent.
function writeBodyText(host, text) {
  const rest = String(text);
  const parts = [];
  let last = 0;
  for (const match of rest.matchAll(MARKDOWN_LINK)) {
    parts.push({ text: rest.slice(last, match.index) });
    parts.push({ href: match[2], text: match[1] });
    last = match.index + match[0].length;
  }
  parts.push({ text: rest.slice(last) });
  for (const part of parts) {
    if (part.href) { host.append(anchor(part.href, part.text)); continue; }
    let cursor = 0;
    for (const found of part.text.matchAll(URL_PATTERN)) {
      if (found.index > cursor) host.append(document.createTextNode(part.text.slice(cursor, found.index)));
      host.append(anchor(found[0], found[0]));
      cursor = found.index + found[0].length;
    }
    if (cursor < part.text.length) host.append(document.createTextNode(part.text.slice(cursor)));
  }
}

function priorityOf(item) {
  const value = Number((item.metadata || {}).priority);
  return Number.isFinite(value) ? value : 5;
}

function isNext(item) {
  if (isStanding(item)) return reviewOverdue(item);
  if ((item.metadata || {}).pinned_today === true) return true;
  return priorityOf(item) <= NEXT_MAX
    && (item.metadata || {}).roadmap_status !== 'blocked'
    && (item.metadata || {}).queue_status !== 'blocked';
}

function isLongTerm(item) {
  if (isStanding(item)) return false;
  return priorityOf(item) >= LONG_TERM_MIN && !isNext(item);
}

// WBR-351. David: "we had separated tasks that don't have completion dates, and
// I think we actually did a really big change that helped us organize the items
// that did have a timeline."
//
// The change was real and it is not on this branch. Standing items are
// practices rather than tasks: they have no finish line on purpose, so they are
// read on a cadence instead of checked off. They were given their own panel on
// 31 August and kept out of the quadrants, because a thing that can never be
// completed sitting in "urgent and important" makes the quadrant meaningless
// for everything beside it. Main was rebuilt without that, so thirteen of them
// have been sitting in his quadrants ever since.
function isStanding(item) {
  return isStandingWork(item);
}

// A practice comes back when its review is due, which is the only thing keeping
// the panel from becoming a shelf. With no cadence recorded nothing would ever
// bring it back, so it counts as overdue and says so on the row.
function reviewDueAt(item) {
  const every = Number((item.metadata || {}).review_every);
  const last = Date.parse((item.metadata || {}).last_reviewed || '');
  if (!Number.isFinite(every) || every <= 0 || !Number.isFinite(last)) return null;
  return last + every * 86400000;
}

function reviewOverdue(item) {
  const due = reviewDueAt(item);
  return due === null ? true : due <= Date.now();
}

// A closed or dropped item is not open work and does not belong on a page
// titled "what needs doing". Eleven of them were rendering as live rows, which
// is also why the counters on this page have never agreed with each other.
//
// WBR-350. The status list used to be written out here, which made this the
// fourth place in two repositories holding its own opinion of what open means.
// It comes from js/open-work.mjs now and so does every other count on this
// page.
function isDeadBoardItem(item) {
  return isClosedWork(item);
}

function boardCardMatches(item) {
  const meta = item.metadata || {};
  return matchesTodoFilter([item.title, item.body, meta.roadmap_item_id, meta.queue_item_id,
    meta.theme, meta.initiative_title, meta.work_area]);
}

function taskMatches(task) {
  const section = state.sections.find(entry => entry.id === task.section_id);
  return matchesTodoFilter([task.title, task.work_area, task.owner, section && section.title]);
}

function renderTodo() {
  const root = el('todo-board');
  root.replaceChildren();
  const clientPicker = el('capture-client-key');
  const clientPickerWrap = document.querySelector('.capture-client-picker');
  const isClients = todoOwner === 'clients';
  if (clientPickerWrap) clientPickerWrap.hidden = !isClients;
  if (clientPicker) {
    const previous = clientPicker.value;
    clientPicker.replaceChildren(new Option('Choose a client', ''));
    state.clients.filter(client => !client.archived_at).forEach(client => clientPicker.add(new Option(client.name, client.stable_key)));
    clientPicker.value = previous;
  }
  if (isClients) {
    const activeClients = state.clients.filter(client => !client.archived_at);
    el('clients-task-count').textContent = String(activeClients.length);
    document.querySelectorAll('[data-todo-owner]').forEach(button => {
      const active = button.dataset.todoOwner === 'clients';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const legend = el('todo-count-legend');
    if (legend) legend.textContent = `${activeClients.length} active client${activeClients.length === 1 ? '' : 's'} · newest transcript first, then first name. Dragging nobody around: use the small arrows when you want a deliberate order.`;
    root.append(renderClientWorkspace());
    renderCaptures();
    renderTodoSearchCount({ workerbee: 0, david: 0, clients: activeClients.length });
    icons();
    return;
  }
  const sections = sortByOrder(state.sections);
  // Unrouted captures live in the strip above, not in a quadrant. Counting them
  // on the owner tabs is still right: they are open work, and a tab that says 4
  // while 6 things are waiting is the kind of quiet undercount this page exists
  // to stop.
  const openTasks = state.tasks.filter(task => task.status !== 'done' && !isUnrouted(task)).filter(taskMatches);
  // WBR-338. This page is titled "the whole board" and promises "everything
  // stays visible", and until now it showed only execution-queue cards: 11 of
  // them, while 192 active roadmap items sat published to the same table and
  // rendered on no page at all. They were written and orphaned. David opened
  // the board, counted what he could see against the ~200 he knew were open,
  // and got almost none of them. The whole board means the whole board, so
  // roadmap items are here too, grouped by initiative the same way.
  // WBR-366. A closed or dropped item is not open work and stays off the board,
  // but a search goes and gets it anyway.
  //
  // The dead-item filter shipped last night and broke the exact thing the search
  // was built for. David's complaint was "I can't see what wbr-214 is"; WBR-214
  // is dropped, so the filter hid it and his own search answered "nothing
  // matches that" about the one identifier he had asked about by name.
  //
  // Search already looks past the owner tab and past the quadrants, on the
  // principle that an id he has been handed is an id he wants found. A dropped
  // item is one more container to have to guess, so it looks past that too, and
  // the row says what happened to it rather than appearing as live work.
  const searching = Boolean(todoFilter);
  const liveBoard = boardCards(state).filter(item => searching || !isDeadBoardItem(item));
  const standingItems = liveBoard.filter(isStanding)
    .filter(boardCardMatches)
    .filter(item => (item.metadata?.owner === 'david' ? 'david' : 'workerbee') === todoOwner)
    .sort((a, b) => (reviewDueAt(a) ?? 0) - (reviewDueAt(b) ?? 0));
  // Held work gets the same treatment as standing: visible with its reopening
  // condition, counted on the tab, and kept out of the quadrants, because a
  // thing waiting on its condition is not "to do" however it is prioritized.
  const heldItems = liveBoard.filter(isHeldWork)
    .filter(boardCardMatches)
    .filter(item => (item.metadata?.owner === 'david' ? 'david' : 'workerbee') === todoOwner)
    .sort((a, b) => Number(a.metadata?.priority ?? 9) - Number(b.metadata?.priority ?? 9));
  const queueItems = liveBoard.filter(item => !isStanding(item) && !isHeldWork(item)).filter(boardCardMatches);
  const captures = state.tasks.filter(isUnrouted).filter(taskMatches);
  // Standing items are counted here even though they sit outside the quadrants.
  // They are open work; a tab that says 38 while 51 things are on the page is
  // the quiet undercount this board exists to stop.
  const standingAll = liveBoard.filter(isStanding).filter(boardCardMatches);
  const heldAll = liveBoard.filter(isHeldWork).filter(boardCardMatches);
  // WBR-350. One function, one rule, and the bands said out loud.
  //
  // These two numbers used to be sums assembled inline, and the tab showed the
  // sum with nothing saying what went into it. David's side read 23 while the
  // audit said 48, the analytics card said 14 and the board metrics said 27,
  // and no surface admitted which question it was answering. The count is the
  // same shape as before, because standing and blocked items are open work and
  // dropping them out of the tab is the undercount this page exists to stop.
  // What is new is that the composition is now visible instead of inferred.
  const ownerSide = item => ((item.metadata?.owner || 'workerbee') === 'david' ? 'david' : 'workerbee');
  const sideOfTask = task => (task.owner === 'workerbee' ? 'workerbee' : 'david');
  const bandsFor = side => {
    const board = [...queueItems, ...standingAll, ...heldAll].filter(item => ownerSide(item) === side);
    const tasks = [...openTasks, ...captures].filter(task => sideOfTask(task) === side);
    const bands = openWorkBands(board);
    // Loose tasks and unrouted captures have no roadmap status. They are always
    // open work with a finish line, so they land in the active band.
    return { ...bands, open: bands.open + tasks.length, active: bands.active + tasks.length, total: bands.total + tasks.length };
  };
  const bands = { workerbee: bandsFor('workerbee'), david: bandsFor('david') };
  // The search cross-tab counts. WBR-350 replaced the old inline definition
  // with bandsFor and left renderTodoSearchCount reading a name that no longer
  // existed, so the whole page failed with "counts is not defined" and showed
  // the error card instead of the board. Derived from the same filtered sets
  // as everything above, so a side with zero matches is 0, never undefined.
  const counts = {
    workerbee: [...queueItems, ...standingAll, ...heldAll].filter(item => ownerSide(item) === 'workerbee').length
      + [...openTasks, ...captures].filter(task => sideOfTask(task) === 'workerbee').length,
    david: [...queueItems, ...standingAll, ...heldAll].filter(item => ownerSide(item) === 'david').length
      + [...openTasks, ...captures].filter(task => sideOfTask(task) === 'david').length,
  };
  // The final WBR-350 correction, 2026-09-17: the tab headlines the work that
  // can be acted on now, not every tracked item. Held and standing move to the
  // supporting line, and the full tracked total survives on the tooltip and in
  // the legend, so nothing disappears — the number just stops claiming that
  // held work is today's workload.
  el('workerbee-task-count').textContent = String(bands.workerbee.active ?? 0);
  el('david-task-count').textContent = String(bands.david.active ?? 0);
  el('clients-task-count').textContent = String(state.clients.filter(client => !client.archived_at).length);
  document.querySelectorAll('[data-todo-owner]').forEach(button => {
    const side = button.dataset.todoOwner;
    const active = side === todoOwner;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    if (bands[side]) button.title = bandLabel(bands[side]);
  });
  const legend = el('todo-count-legend');
  if (legend) {
    const side = bands[todoOwner] ? todoOwner : 'workerbee';
    const who = side === 'david' ? 'DavidBee' : 'WorkerBee';
    // The scope, not just the bands. The tab said 23 while other surfaces said
    // 48, 14 and 27, and the reason none of them matched is that all four were
    // answering different questions. This one counts one person's side of
    // everything, which is a wider question than the Board figure on the
    // Dashboard, and now it says so.
    const current = bands[side];
    const supporting = bandSupporting(current);
    legend.textContent = `${who}: ${bandPrimary(current)}${supporting ? ` · ${supporting}` : ''}. `
      + `${current.open ?? 0} tracked in all — Board, execution queue, loose tasks and unrouted captures on this side.`;
  }

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

    // A section can now appear in more than one quadrant, showing only the
    // tasks that belong there. Before WBR-347 a whole heading took one quadrant
    // derived from its busiest task, so routing a single captured item would
    // have dragged everything under the same heading with it.
    const editableProjects = sections.map((section, sectionIndex) => {
      const sectionTasks = sortByOrder(openTasks.filter(task => task.section_id === section.id
        && (task.owner === 'workerbee' ? 'workerbee' : 'david') === todoOwner));
      return {
        section,
        sectionIndex,
        sectionTasks,
        tasks: sectionTasks.filter(task => taskQuadrant(task, sectionTasks) === quadrant)
      };
    }).filter(project => (project.sectionTasks.length
      ? project.tasks.length > 0
      : (todoOwner === 'david' && quadrant === 'Q2')));
    const queueProjects = groupQueueProjects(queueItems.filter(item => (item.metadata?.owner === 'david' ? 'david' : 'workerbee') === todoOwner && boardQuadrant(item) === quadrant));

    editableProjects.forEach(project => panel.append(editableTodoProject(project)));
    queueProjects.forEach(project => panel.append(queueTodoProject(project)));
    if (!editableProjects.length && !queueProjects.length) panel.append(empty('Nothing here.'));
    root.append(panel);
  }
  if (standingItems.length) root.append(standingPanel(standingItems));
  if (heldItems.length) root.append(heldPanel(heldItems));
  renderCaptures();
  renderTodoSearchCount(counts);
  icons();
}

function clientPlan(client) {
  const saved = client.living_plan && typeof client.living_plan === 'object' ? client.living_plan : {};
  const active = Array.isArray(client.commitments) ? client.commitments.filter(item => !['done', 'complete', 'completed'].includes(item.status)) : [];
  const byDavid = active.filter(item => /^(david|workerbee)$/i.test(item.owner || '')).map(item => item.title);
  const byClient = active.filter(item => !/^(david|workerbee)$/i.test(item.owner || '')).map(item => item.title);
  const next = client.metadata?.nextCheck || active[0]?.nextCheck || '';
  return {
    currentGoal: saved.currentGoal || client.current_focus || '',
    clientCommitments: saved.clientCommitments || byClient.join('\n'),
    davidSupport: saved.davidSupport || byDavid.join('\n'),
    nextStep: saved.nextStep || next,
    nextSessionAgenda: saved.nextSessionAgenda || next,
    privateSummary: saved.privateSummary || client.metadata?.privateSummary || ''
  };
}

function clientActivityAt(client) {
  const raw = client.metadata?.latestSessionAt || client.updated_at || client.created_at || '';
  const at = Date.parse(raw);
  return Number.isFinite(at) ? at : 0;
}

function orderedClients(clients) {
  return [...clients].sort((a, b) => {
    const explicitOrder = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
    const aOrder = explicitOrder(a.display_order);
    const bOrder = explicitOrder(b.display_order);
    if (aOrder !== null || bOrder !== null) return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
    return clientActivityAt(b) - clientActivityAt(a) || a.name.localeCompare(b.name);
  });
}

function renderClientWorkspace() {
  const root = document.createElement('section');
  root.className = 'clients-workspace';
  const active = orderedClients(state.clients.filter(client => !client.archived_at).filter(client => matchesTodoFilter([client.name, client.current_focus, client.metadata?.latestTranscript])));
  if (!active.length) root.append(empty(todoFilter ? 'No active client matches that search.' : 'No active clients are in the private workspace yet.'));
  active.forEach((client, index) => root.append(clientWorkspaceCard(client, active, index)));

  const archived = orderedClients(state.clients.filter(client => client.archived_at));
  if (archived.length) {
    const archive = document.createElement('details');
    archive.className = 'client-archive';
    const summary = document.createElement('summary');
    summary.textContent = `Archived clients (${archived.length})`;
    archive.append(summary);
    const body = document.createElement('div');
    body.className = 'client-archive-body';
    archived.forEach((client, index) => body.append(clientWorkspaceCard(client, archived, index, true)));
    archive.append(body);
    root.append(archive);
  }
  return root;
}

function clientWorkspaceCard(client, peers, index, archived = false) {
  const details = document.createElement('details');
  details.className = 'client-workspace-card';
  // The Clients tab is a roster first. Opening a card is an intentional choice,
  // so returning to the page never drops someone into one client's workspace.
  details.open = false;
  const summary = document.createElement('summary');
  const name = document.createElement('strong');
  name.textContent = client.name;
  const stamp = document.createElement('span');
  stamp.className = 'client-workspace-stamp';
  const transcript = client.metadata?.latestTranscript ? `Last transcript: ${client.metadata.latestTranscript}` : 'No transcript recorded';
  stamp.textContent = `${transcript}${client.metadata?.latestSessionAt ? ` · ${formatDate(client.metadata.latestSessionAt)}` : ''}${client.plan_updated_at ? ` · plan updated ${formatDate(client.plan_updated_at)}` : ''}`;
  summary.append(name, stamp);
  details.append(summary);
  const body = document.createElement('div');
  body.className = 'client-workspace-body';
  const controls = document.createElement('div');
  controls.className = 'client-workspace-controls';
  if (!archived) {
    controls.append(
      textButton('↑', 'Move client up', () => moveClient(client, peers, index, -1)),
      textButton('↓', 'Move client down', () => moveClient(client, peers, index, 1)),
      textButton('Archive', `Archive ${client.name}`, () => archiveClient(client, true))
    );
  } else controls.append(textButton('Restore', `Restore ${client.name}`, () => archiveClient(client, false)));
  body.append(controls);

  const plan = clientPlan(client);
  const planForm = document.createElement('form');
  planForm.className = 'client-plan-form';
  const fields = [
    ['currentGoal', 'Current goal'], ['nextStep', 'Next step'], ['nextSessionAgenda', 'Next-session agenda'],
    ['privateSummary', 'Private Client Thread summary']
  ];
  const boxes = {};
  fields.forEach(([key, label]) => {
    const wrap = document.createElement('label');
    wrap.className = 'client-plan-field';
    const text = document.createElement('span');
    text.textContent = label;
    const box = document.createElement('textarea');
    box.rows = key === 'currentGoal' || key === 'privateSummary' ? 7 : 5;
    box.value = plan[key] || '';
    box.name = key;
    wrap.append(text, box);
    boxes[key] = box;
    planForm.append(wrap);
  });
  const savePlan = document.createElement('button');
  savePlan.type = 'submit';
  savePlan.className = 'primary-button small';
  savePlan.textContent = 'Save Living Plan';
  planForm.append(savePlan);
  planForm.addEventListener('submit', async event => {
    event.preventDefault();
    savePlan.disabled = true;
    // Keep legacy prose untouched while this card moves to the structured
    // commitment panel below. A save should never blank a field David has not
    // chosen to edit just because it is no longer shown as a second checklist.
    const living_plan = { ...plan, ...Object.fromEntries(Object.entries(boxes).map(([key, box]) => [key, box.value.trim()])) };
    try {
      const updated = await api('update_client_plan', { stable_key: client.stable_key, expected_plan_version: client.plan_version, living_plan });
      Object.assign(client, updated);
      showToast(`${client.name}'s Living Plan is saved.`);
    } catch (error) { showToast(error.message, true); }
    finally { savePlan.disabled = false; }
  });
  body.append(planForm);

  const activeCommitments = Array.isArray(client.commitments) ? client.commitments
    .filter(item => !['done', 'complete', 'completed', 'dropped'].includes(String(item.status || '').toLowerCase())) : [];
  const commitmentBlock = document.createElement('section');
  commitmentBlock.className = 'client-commitments';
  const commitmentHeading = document.createElement('h3');
  commitmentHeading.textContent = `Active commitments (${activeCommitments.length})`;
  commitmentBlock.append(commitmentHeading);
  if (!activeCommitments.length) commitmentBlock.append(empty('No active commitments have been extracted yet.'));
  else {
    const groups = new Map();
    activeCommitments.forEach(item => {
      const group = String(item.group || 'Current work').trim() || 'Current work';
      groups.set(group, [...(groups.get(group) || []), item]);
    });
    groups.forEach((items, group) => {
      const groupNode = document.createElement('details');
      groupNode.className = 'client-commitment-group';
      groupNode.open = groups.size === 1;
      const groupSummary = document.createElement('summary');
      groupSummary.textContent = `${group} (${items.length})`;
      groupNode.append(groupSummary);
      const list = document.createElement('div');
      list.className = 'client-commitment-list';
      items.forEach(item => {
        const row = document.createElement('article');
        row.className = 'client-commitment';
        const title = document.createElement('strong');
        title.textContent = item.title || 'Untitled commitment';
        const meta = document.createElement('small');
        const details = [item.owner, item.status, item.nextCheck ? `check ${item.nextCheck}` : ''].filter(Boolean);
        meta.textContent = details.join(' · ');
        row.append(title, meta);
        list.append(row);
      });
      groupNode.append(list);
      commitmentBlock.append(groupNode);
    });
  }
  body.append(commitmentBlock);

  const changeBlock = document.createElement('section');
  changeBlock.className = 'client-changes';
  const changeHeading = document.createElement('h3');
  changeHeading.textContent = 'Recent changes';
  changeBlock.append(changeHeading);
  const changes = (client.changes || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (!changes.length) changeBlock.append(empty('No dated changes recorded yet. New transcript decisions will appear here.'));
  else changes.slice(0, 12).forEach(change => {
    const entry = document.createElement('article');
    entry.className = 'client-change';
    const meta = document.createElement('small');
    meta.textContent = `${change.author === 'workerbee' ? 'WorkerBee' : 'David'} · ${formatDateTime(change.created_at)}`;
    const summaryText = document.createElement('strong');
    summaryText.textContent = change.summary;
    entry.append(meta, summaryText);
    if (change.changed) { const changed = document.createElement('p'); changed.textContent = `Changed: ${change.changed}`; entry.append(changed); }
    if (change.uncertainty) { const uncertain = document.createElement('p'); uncertain.className = 'client-change-uncertainty'; uncertain.textContent = `Needs verification: ${change.uncertainty}`; entry.append(uncertain); }
    if (change.source_url) {
      const source = document.createElement('a'); source.href = change.source_url; source.target = '_blank'; source.rel = 'noopener'; source.textContent = 'Open source transcript'; entry.append(source);
    }
    changeBlock.append(entry);
  });
  body.append(changeBlock);

  const linked = state.tasks.filter(task => task.client_key === client.stable_key && task.status !== 'done' && !task.deleted_at);
  const todoBlock = document.createElement('section');
  todoBlock.className = 'client-linked-todos';
  const todoHeading = document.createElement('h3');
  todoHeading.textContent = `Client Todos (${linked.length})`;
  todoBlock.append(todoHeading);
  if (linked.length) {
    const list = document.createElement('div');
    list.className = 'task-list';
    linked.forEach((task, taskIndex) => list.append(taskRow(task, linked, taskIndex)));
    todoBlock.append(list);
  } else todoBlock.append(empty('No client-linked Todos yet. Use the selector in the manual Todo box above.'));
  body.append(todoBlock);

  const noteBlock = document.createElement('section');
  noteBlock.className = 'client-notes';
  const noteHeading = document.createElement('h3');
  noteHeading.textContent = 'Private notes';
  noteBlock.append(noteHeading);
  const notes = (client.notes || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  notes.forEach(note => {
    const noteNode = document.createElement('article');
    noteNode.className = `client-note ${note.author === 'workerbee' ? 'from-workerbee' : ''}`;
    const meta = document.createElement('small');
    meta.textContent = `${note.author === 'workerbee' ? 'WorkerBee' : 'David'} · ${formatDateTime(note.created_at)}${note.acknowledged_at ? '' : ' · needs review'}`;
    const words = document.createElement('p');
    words.textContent = note.body;
    noteNode.append(meta, words);
    noteBlock.append(noteNode);
  });
  const noteForm = document.createElement('form');
  noteForm.className = 'client-note-form';
  const noteBox = document.createElement('textarea');
  noteBox.rows = 5;
  noteBox.placeholder = `Add a private note for ${client.name}`;
  const noteSave = document.createElement('button');
  noteSave.type = 'submit';
  noteSave.className = 'secondary-button small';
  noteSave.textContent = 'Add note';
  noteForm.append(noteBox, noteSave);
  noteForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!noteBox.value.trim()) return;
    noteSave.disabled = true;
    try {
      const note = await api('create_client_note', { stable_key: client.stable_key, body: noteBox.value.trim() });
      client.notes = [...(client.notes || []), note];
      noteBox.value = '';
      renderTodo();
    } catch (error) { showToast(error.message, true); }
    finally { noteSave.disabled = false; }
  });
  noteBlock.append(noteForm);
  body.append(noteBlock);
  details.append(body);
  return details;
}

function textButton(text, label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button small';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', handler);
  return button;
}

async function archiveClient(client, archived) {
  try {
    const updated = await api('set_client_archive', { stable_key: client.stable_key, archived });
    Object.assign(client, updated);
    renderTodo();
    showToast(archived ? `${client.name} moved to Archived.` : `${client.name} restored.`);
  } catch (error) { showToast(error.message, true); }
}

async function moveClient(client, peers, index, direction) {
  const other = peers[index + direction];
  if (!other) return;
  try {
    const currentOrder = Number.isFinite(Number(client.display_order)) ? Number(client.display_order) : index * 100;
    const otherOrder = Number.isFinite(Number(other.display_order)) ? Number(other.display_order) : (index + direction) * 100;
    const [updatedClient, updatedOther] = await Promise.all([
      api('set_client_order', { stable_key: client.stable_key, display_order: otherOrder }),
      api('set_client_order', { stable_key: other.stable_key, display_order: currentOrder })
    ]);
    Object.assign(client, updatedClient);
    Object.assign(other, updatedOther);
    renderTodo();
  } catch (error) { showToast(error.message, true); }
}

// WBR-351. Practices, with a review cadence instead of a checkbox, below the
// quadrants rather than inside one. No done control, because the thing that
// makes an item standing is that it has no finish line.
function standingPanel(items) {
  const panel = document.createElement('section');
  panel.className = 'todo-quadrant standing-panel';
  panel.dataset.quadrant = 'standing';
  const heading = document.createElement('header');
  heading.className = 'todo-quadrant-heading';
  const words = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Standing';
  const note = document.createElement('p');
  note.textContent = 'Practices, not tasks. These have no finish line on purpose, so they are read on a cadence rather than checked off. They are counted in the tracked total and the supporting line but not in the to-do-now number, and they stay out of the quadrants, because something that can never be finished sitting in "urgent and important" makes the quadrant meaningless for everything beside it.';
  words.append(title, note);
  const label = document.createElement('span');
  label.className = 'quadrant-label';
  label.textContent = String(items.length);
  heading.append(words, label);
  panel.append(heading);
  // WBR-364. The same row as everything else on the board, so a practice gains
  // the identifier and the context every other item just got, with its review
  // cadence inserted where a done control would be. It deliberately has no done
  // control, which boardRow already knows.
  items.forEach(item => {
    const row = boardRow(item);
    const when = reviewDueAt(item);
    const cadence = document.createElement('small');
    cadence.className = reviewOverdue(item) ? 'last-moved stale' : 'last-moved';
    cadence.textContent = when === null
      ? 'No review cadence recorded, so nothing will bring this back on its own.'
      : `Every ${item.metadata.review_every} days · next ${new Date(when).toISOString().slice(0, 10)}${reviewOverdue(item) ? ' · due now' : ''}`;
    row.insertBefore(cadence, row.querySelector('.task-thread'));
    panel.append(row);
  });
  return panel;
}

// Held work, with the reopening condition on the row instead of a checkbox.
// Nothing is ever blocked: a held item is deliberately inactive until its
// named condition is true, and the condition is the whole reason it is not
// in a quadrant competing with work that can actually start.
function heldPanel(items) {
  const panel = document.createElement('section');
  panel.className = 'todo-quadrant standing-panel';
  panel.dataset.quadrant = 'held';
  const heading = document.createElement('header');
  heading.className = 'todo-quadrant-heading';
  const words = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = 'Held';
  const note = document.createElement('p');
  note.textContent = 'Deliberately inactive, each with the condition that reopens it written on the row. Held is not a junk drawer and it is not blocked: the moment its condition is true, the item comes back. Held work is counted in the tracked total on the tab tooltip and in the supporting line, but not in the to-do-now number, because work waiting on its condition is not to-do however it is prioritized.';
  words.append(title, note);
  const label = document.createElement('span');
  label.className = 'quadrant-label';
  label.textContent = String(items.length);
  heading.append(words, label);
  panel.append(heading);
  items.forEach(item => {
    const row = boardRow(item);
    const condition = document.createElement('small');
    condition.className = 'last-moved';
    condition.textContent = item.metadata?.reopening_condition
      ? `Reopens when: ${item.metadata.reopening_condition}`
      : 'No reopening condition recorded — that is a defect, because an unconditioned hold is parking.';
    row.insertBefore(condition, row.querySelector('.task-thread'));
    panel.append(row);
  });
  return panel;
}

// A search that finds nothing on this tab and four things on the other one has
// to say so, or the page reads as "it does not exist" when the honest answer is
// "it is one click away". This is the same failure shape as a panel that filters
// on something the reader cannot see.
function renderTodoSearchCount(counts) {
  const node = el('todo-search-count');
  if (!node) return;
  if (!todoFilter) { node.textContent = ''; return; }
  if (todoOwner === 'clients') {
    const here = counts.clients || 0;
    node.textContent = here ? `${here} client${here === 1 ? '' : 's'} match${here === 1 ? 'es' : ''}.` : 'No clients match that.';
    return;
  }
  const here = counts[todoOwner];
  const other = todoOwner === 'workerbee' ? 'david' : 'workerbee';
  const elsewhere = counts[other];
  const otherLabel = other === 'david' ? 'DavidBee' : 'WorkerBee';
  if (!here && !elsewhere) { node.textContent = 'Nothing matches that.'; return; }
  const mine = `${here} match${here === 1 ? '' : 'es'} here`;
  node.textContent = elsewhere ? `${mine}, ${elsewhere} under ${otherLabel}.` : `${mine}.`;
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

function queueQuadrant(item) {
  const status = item.metadata?.queue_status;
  const activeInitiative = item.metadata?.initiative_status === 'active';
  const urgent = ['executing', 'ready', 'capability-repair'].includes(status);
  if (activeInitiative && urgent) return 'Q1';
  if (activeInitiative) return 'Q2';
  if (urgent) return 'Q3';
  return 'Q4';
}

// A roadmap card carries no queue_status; its urgency is its priority. One and
// its blockers are the urgent work, two is the real work, three and below park
// on purpose but stay visible. An execution-queue card keeps its own logic.
function boardQuadrant(item) {
  if (item.metadata?.source === 'execution-queue') return queueQuadrant(item);
  const priority = Number(item.metadata?.priority);
  const blocked = Boolean(item.metadata?.blocked_by);
  if (priority <= 1) return blocked ? 'Q3' : 'Q1';
  if (priority === 2) return 'Q2';
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

function projectShell(title, count, key) {
  const details = document.createElement('details');
  details.className = 'todo-project';
  if (key) {
    details.open = openProjects.has(key);
    details.addEventListener('toggle', () => {
      if (details.open) openProjects.add(key); else openProjects.delete(key);
    });
  }
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
  const { details, body } = projectShell(section.title, tasks.length, `section:${section.id}`);
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

function queueTodoProject(project) {
  const { details, body } = projectShell(project.title, project.items.length, `queue:${project.title}`);
  project.items.sort((a, b) => priorityOf(a) - priorityOf(b)).forEach(item => body.append(boardRow(item)));
  return details;
}

// WBR-364. Everything a Board row can say, which until now was its title and a
// line of body text.
//
// All of this existed on workerbee/seen-in-seven and main was rebuilt without
// it, while the publisher kept sending the data. Every field read here has been
// arriving in the payload the whole time and landing on the floor: the
// identifier, the priority, when the item last actually moved, what the other
// person owes on it, what it is blocked by, and why something was judged not
// important.
//
// Two of these David asked for by name and then watched disappear.
// 2026-09-03: "I also can't check off my own items on the list." He could not,
// because every published row was plain text and the only checkable thing on
// the page was a task he had typed himself. And the identifier on the row is
// the other half of the search shipped last night: search lets him find an id
// he was handed, this lets him read back the id of a thing he is looking at.
//
// Main's note thread stays. That is the one part of this row main had and the
// branch did not, and it is the reason this is a port rather than a merge.
function boardRow(item) {
  const row = document.createElement('div');
  row.className = 'queue-task';

  const head = document.createElement('div');
  head.className = 'queue-task-head';

  // A standing practice gets no done control, because it has no finish line.
  // That is the whole reason it is standing. A held item gets none either:
  // its reopening condition, not a checkbox, is what brings it back.
  if (!isStanding(item) && !isHeldWork(item) && !isDeadBoardItem(item)) {
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'queue-task-done';
    done.setAttribute('aria-label', `Mark done: ${item.title}`);
    done.title = 'Mark this done';
    done.addEventListener('click', async () => {
      done.disabled = true;
      try {
        await api('update_update', { id: item.id, status: 'completed' });
        // Marked here and reconciled into WorkerBee's own files on its next
        // pass. Without that pull-back the next publish would read the source
        // still saying active and quietly undo this, which is worse than no
        // button at all.
        showToast('Marked done. WorkerBee picks it up on its next pass.');
        state.updates = state.updates.map(entry => (entry.id === item.id ? { ...entry, status: 'completed' } : entry));
        renderTodo();
      } catch (error) {
        done.disabled = false;
        showToast(error.message, true);
      }
    });
    head.append(done);
  }

  const badge = document.createElement('span');
  badge.className = 'priority-badge';
  badge.dataset.band = isNext(item) ? 'next' : isLongTerm(item) ? 'horizon' : 'board';
  badge.textContent = priorityOf(item);
  badge.title = 'Weight of urgency on what to do next. 1 is this week, 8 and over means something else has to finish first.';

  const title = document.createElement('strong');
  title.textContent = item.title;
  head.append(badge, title);

  const meta = item.metadata || {};
  if (isDeadBoardItem(item)) {
    row.classList.add('queue-task-dead');
    const gone = document.createElement('span');
    gone.className = 'queue-task-dead-tag';
    gone.textContent = String(meta.roadmap_status || 'closed');
    head.append(gone);
  }
  const ref = meta.dbr_id || meta.roadmap_item_id || meta.queue_item_id;
  if (ref) {
    const tag = document.createElement('span');
    tag.className = 'queue-task-ref';
    tag.textContent = ref;
    head.append(tag);
  }
  row.append(head);

  const detail = document.createElement('small');
  writeBodyText(detail, item.body || meta.intended_result || '');
  row.append(detail);

  const itemUrl = firstUrl(meta.source_url) || firstUrl(item.body);
  if (itemUrl) {
    const open = anchor(itemUrl, 'Open');
    open.className = 'card-open-link queue-task-open';
    row.append(open);
  }

  // When it last actually moved, derived from commits, logs and recorded
  // outcomes rather than from a field anything could refresh. "Written down"
  // means exactly that and nothing since, which is a real answer rather than a
  // blank.
  if (meta.last_moved_at) {
    const days = Math.max(0, Math.floor((Date.now() - Date.parse(meta.last_moved_at)) / 86400000));
    const moved = document.createElement('small');
    moved.className = `last-moved${days > 21 ? ' stale' : ''}`;
    const kind = meta.last_moved_kind === 'created' ? 'written down' : meta.last_moved_kind;
    moved.textContent = `Last moved ${days === 0 ? 'today' : `${days}d ago`} · ${kind}${meta.last_moved_ref ? ` ${meta.last_moved_ref}` : ''}`;
    row.append(moved);
  }

  // What the other person owes on this item. Shown, never blocking: the item
  // stays owned and advances as far as it can without them.
  const owes = meta.needs_from_david ? ['Needs from David', meta.needs_from_david]
    : meta.needs_from_workerbee ? ['Needs from WorkerBee', meta.needs_from_workerbee] : null;
  if (owes) {
    const line = document.createElement('small');
    line.className = 'needs-from';
    line.textContent = `${owes[0]}: ${owes[1]}`;
    row.append(line);
  }
  if (meta.not_important_because) {
    const why = document.createElement('small');
    why.className = 'waiting-on';
    why.textContent = `Not important: ${meta.not_important_because}`;
    row.append(why);
  }
  if (meta.blocked_by) {
    const waiting = document.createElement('small');
    waiting.className = 'waiting-on';
    waiting.textContent = `Waiting on: ${meta.blocked_by}`;
    row.append(waiting);
  }

  row.append(itemThread(item, { update_id: item.id }));
  return row;
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

// WBR-321. David asked for this on the 12th, in a note he had to write as a
// task because there was nowhere else to put it: instructions under each todo,
// through the same + he already uses to add one, so he can tell a run what he
// wants between sessions. The store and the route shipped on the 13th. This is
// the half he can touch.
function noteTargetKey(target) {
  return target.task_id ? `task:${target.task_id}` : `update:${target.update_id}`;
}

function itemThread(item, target) {
  const thread = document.createElement('div');
  thread.className = 'task-thread';
  const notes = (item.notes || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  notes.forEach(note => {
    const entry = document.createElement('article');
    entry.className = 'task-note' + (note.author === 'workerbee' ? ' from-workerbee' : '');
    const meta = document.createElement('p');
    meta.className = 'task-note-meta';
    const who = document.createElement('strong');
    who.textContent = note.author === 'workerbee' ? 'WorkerBee' : 'David';
    const when = document.createElement('time');
    when.dateTime = note.created_at;
    when.textContent = formatDateTime(note.created_at);
    meta.append(who, when);
    if (note.author === 'david' && !note.acknowledged_at) {
      const waiting = document.createElement('span');
      waiting.className = 'task-note-waiting';
      waiting.textContent = 'Not answered yet';
      meta.append(waiting);
    }
    const body = document.createElement('p');
    body.className = 'task-note-body';
    body.textContent = note.body;
    entry.append(meta, body);
    thread.append(entry);
  });
  thread.append(noteComposer(item, target, notes.length));
  return thread;
}

function noteComposer(item, target, threadLength) {
  const wrap = document.createElement('div');
  wrap.className = 'task-note-add';
  const key = noteTargetKey(target);
  wrap.dataset.noteTarget = key;
  const open = openNoteComposers.has(key);
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'task-note-plus';
  plus.textContent = '+';
  plus.title = 'Write an instruction under this task';
  plus.setAttribute('aria-label', `Write an instruction under ${item.title}`);
  plus.setAttribute('aria-expanded', String(open));
  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'task-note-label';
  label.textContent = open ? 'Writing an instruction' : threadLength ? 'Add to this thread' : 'Add an instruction';
  const form = document.createElement('form');
  form.className = 'task-note-form';
  form.hidden = !open;
  const box = document.createElement('textarea');
  box.className = 'task-note-box';
  box.rows = 3;
  box.maxLength = 4000;
  box.placeholder = 'What should I know, or do, about this one?';
  box.setAttribute('aria-label', `Instruction for ${item.title}`);
  box.value = noteDrafts.get(key) || '';
  box.addEventListener('input', () => noteDrafts.set(key, box.value));
  const actions = document.createElement('div');
  actions.className = 'task-note-actions';
  const save = document.createElement('button');
  save.className = 'primary-button small';
  save.type = 'submit';
  save.textContent = 'Save instruction';
  const cancel = document.createElement('button');
  cancel.className = 'quiet-button small';
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  actions.append(save, cancel);
  form.append(box, actions);

  const toggle = () => {
    const nowOpen = !openNoteComposers.has(key);
    if (nowOpen) openNoteComposers.add(key); else { openNoteComposers.delete(key); noteDrafts.delete(key); }
    renderTodo();
    if (nowOpen) {
      const reopened = [...document.querySelectorAll('[data-note-target]')]
        .find(node => node.dataset.noteTarget === key)?.querySelector('.task-note-box');
      if (reopened) reopened.focus();
    }
  };
  plus.addEventListener('click', toggle);
  label.addEventListener('click', toggle);
  cancel.addEventListener('click', toggle);

  // Cmd or Ctrl with Return saves, because a textarea swallows a plain Return
  // and the instruction is often more than one line.
  box.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const value = box.value.trim();
    if (!value) { box.focus(); return; }
    save.disabled = true;
    box.disabled = true;
    try {
      const created = await api('create_item_note', { ...target, body: value });
      item.notes = [...(item.notes || []), created];
      openNoteComposers.delete(key);
      noteDrafts.delete(key);
      renderTodo();
      showToast('Instruction saved. The next run reads it before it starts.');
    } catch (error) {
      save.disabled = false;
      box.disabled = false;
      showToast(error.message, true);
    }
  });

  wrap.append(plus, label, form);
  return wrap;
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
  const item = document.createElement('div');
  item.className = 'task-item';
  item.dataset.noteTask = task.id;
  item.append(row, itemThread(task, { task_id: task.id }));
  return item;
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
    bindCaptureForms();
    el('add-section').addEventListener('click', async () => {
      const title = window.prompt('New heading');
      if (!title || !title.trim()) return;
      try { state.sections.push(await api('create_section', { title, sort_order: state.sections.length * 100 })); renderTodo(); }
      catch (error) { showToast(error.message, true); }
    });
  } else if (surface === 'analytics') {
    bindPeriodTabs();
    bindDoneFilters();
    bindHistoryPanels();
  } else if (surface === 'momentum300') {
    bindMomentum300Filters();
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

// ── MOMENTUM HUB THREE HUNDRED ────────────────────────
// WBR-373. David asked three times to read these results from the Dashboard
// rather than from a Claude artifact. The payload side has existed for a
// while; what was missing every time was this, a page. `ward_artifact` has
// been published since 2026-09-05 under a comment claiming the Studio page
// renders it, and no renderer was ever written, so the Ward three hundred is
// still only readable as an artifact too. That is the same shape as the stale
// Dashboard bug: publishing is not showing.
//
// The rows arrive on WBR-373's own Board row, in the same authenticated
// payload as everything else here, so there is no second fetch path to keep
// in step and nothing to go stale on its own.

let m300App = null;
let m300Verdict = 'all';
let m300List = 'all';
let m300Search = '';

function momentumArtifact() {
  const row = state.updates.find(item => item.metadata && item.metadata.momentum_hub_artifact);
  return row ? row.metadata.momentum_hub_artifact : null;
}

function m300Chip(verdict) {
  const chip = document.createElement('span');
  chip.className = 'count-badge m300-chip m300-' + String(verdict).replace('/', '').toLowerCase();
  chip.textContent = verdict;
  return chip;
}

function renderMomentum300() {
  const note = el('m300-note');
  const tabs = el('m300-apps');
  const cards = el('m300-cards');
  const rowsBox = el('m300-rows');
  const count = el('m300-count');
  if (!note || !tabs || !cards || !rowsBox || !count) return;

  const artifact = momentumArtifact();
  tabs.replaceChildren();
  cards.replaceChildren();
  rowsBox.replaceChildren();

  if (!artifact) {
    note.textContent = 'The Momentum Hub score has not been published yet. It rides on WBR-373 and appears here the next time the Board is published.';
    count.textContent = '';
    return;
  }

  const scored = artifact.scored || {};
  const scoredKeys = Object.keys(scored);
  const appsMeta = new Map((artifact.apps || []).map(app => [app.key, app]));
  if (!scoredKeys.length) {
    note.textContent = 'No app has been scored against the three hundred yet. ' + (artifact.cadence || '');
    count.textContent = '';
    return;
  }
  if (!m300App || !scored[m300App]) m300App = scoredKeys[0];

  const meta = appsMeta.get(m300App) || {};
  note.textContent = [
    (meta.name || m300App) + ' scored against ' + (artifact.scoredAgainst || 'the product'),
    meta.scoredOn ? 'on ' + meta.scoredOn : null,
    artifact.cadence ? '· ' + artifact.cadence : null,
  ].filter(Boolean).join(' ');

  // App switcher. Apps that exist but have no scoring yet are shown and
  // disabled rather than hidden, because "not scored yet" is a fact about the
  // rotation David should be able to see without opening a file.
  for (const app of (artifact.apps || [])) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'period-tab' + (app.key === m300App ? ' active' : '');
    tab.textContent = app.name || app.key;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(app.key === m300App));
    if (!scored[app.key]) {
      tab.disabled = true;
      tab.title = app.note || 'Not scored yet.';
    } else {
      tab.addEventListener('click', () => { m300App = app.key; renderMomentum300(); icons(); });
    }
    tabs.append(tab);
  }

  const rows = scored[m300App].rows || [];
  const tally = scored[m300App].tally || {};

  for (const verdict of ['PASS', 'PART', 'FAIL', 'LIVE', 'N/A']) {
    if (!tally[verdict]) continue;
    const card = document.createElement('div');
    card.className = 'analytics-card';
    const label = document.createElement('p');
    label.className = 'analytics-card-label';
    label.textContent = verdict;
    const figure = document.createElement('p');
    figure.className = 'analytics-card-figure';
    figure.textContent = String(tally[verdict]);
    const sub = document.createElement('p');
    sub.className = 'analytics-card-sub';
    sub.textContent = ({
      PASS: 'The product does this.',
      PART: 'Half of it.',
      FAIL: 'It does not.',
      LIVE: 'Needs a live look that has not happened.',
      'N/A': 'The capability genuinely does not exist.',
    })[verdict] || '';
    card.append(label, figure, sub);
    cards.append(card);
  }

  const needle = m300Search.trim().toLowerCase();
  const visible = rows.filter(row =>
    (m300Verdict === 'all' || row.verdict === m300Verdict)
    && (m300List === 'all' || row.list === m300List)
    && (!needle || (row.question + ' ' + (row.note || '')).toLowerCase().includes(needle)));

  count.textContent = visible.length === rows.length
    ? `All ${rows.length} questions.`
    : `${visible.length} of ${rows.length} questions.`;

  const listLabels = new Map((artifact.lists || []).map(list => [list.id, list]));
  let lastKey = null;
  for (const row of visible) {
    const key = row.list + '|' + (row.section || '');
    if (key !== lastKey) {
      lastKey = key;
      const head = document.createElement('h3');
      head.className = 'm300-section';
      const list = listLabels.get(row.list);
      head.textContent = (list ? list.label : row.list) + ' · ' + (row.section || 'Unsectioned');
      rowsBox.append(head);
    }
    const line = document.createElement('div');
    line.className = 'm300-row';

    const number = document.createElement('span');
    number.className = 'm300-number';
    number.textContent = String(row.number);

    const words = document.createElement('div');
    words.className = 'm300-words';
    const question = document.createElement('p');
    question.className = 'm300-question';
    question.textContent = row.question;
    words.append(question);
    if (row.note) {
      const noteLine = document.createElement('p');
      noteLine.className = 'm300-note';
      noteLine.textContent = row.note;
      words.append(noteLine);
    }

    line.append(number, words, m300Chip(row.verdict));
    rowsBox.append(line);
  }

  if (!visible.length) {
    const none = document.createElement('p');
    none.className = 'analytics-sub';
    none.textContent = 'Nothing matches that filter.';
    rowsBox.append(none);
  }
}

function bindMomentum300Filters() {
  const search = el('m300-search');
  const verdict = el('m300-verdict');
  const list = el('m300-list');
  if (search) search.addEventListener('input', () => { m300Search = search.value; renderMomentum300(); icons(); });
  if (verdict) verdict.addEventListener('change', () => { m300Verdict = verdict.value; renderMomentum300(); icons(); });
  if (list) list.addEventListener('change', () => { m300List = list.value; renderMomentum300(); icons(); });
}
