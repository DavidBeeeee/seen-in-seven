const STORY_STARTERS = {
  bold: 'Share one specific insight, story, or hot take you have had recently. It can be casual, uncomfortable, funny, or a position you keep returning to.',
  mini: 'What recent insight, lesson, belief, or idea do you want to turn into a short video?',
  rant: 'Type the raw rant or experience you want to turn into a video. Do not organize it first. Get the real thought out.'
};
const STORY_MODE_LABELS = { bold: 'Bold', mini: 'Mini', rant: 'Rant' };
const STORY_TITLES = { bold: 'New bold script', mini: 'New mini lesson', rant: 'New rant' };

// The member's standing "story profile". One row per member in
// storysculpt_member_context, editable in the profile panel, and read into the
// existing MEMBER CONTEXT block on every generation. The StorySculpt prompt and
// interview flow are untouched: this only supplies context the member controls.
const MEMORY_FIELDS = [
  ['name', 'mem-name', 'Name'],
  ['role', 'mem-role', 'What they do'],
  ['audience', 'mem-audience', 'Who their videos are for'],
  ['voice', 'mem-voice', 'Voice and phrasing'],
  ['offers', 'mem-offers', 'Offers and recurring calls to action'],
  ['facts', 'mem-facts', 'Facts and results to reuse'],
  ['notes', 'mem-notes', 'Other notes']
];

let storyContext = null;
let storyProjects = [];
let activeStory = null;
let storySaveTimer = null;
let memoryProfile = {};
let helpReturnFocus = null;

const storyEl = id => document.getElementById(id);

function storyEscape(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 320) + 'px';
}

// Build the standing story-profile block. Empty when the member has set nothing,
// so a blank profile adds nothing to the context.
function composeMemory() {
  const lines = MEMORY_FIELDS
    .map(([key, , label]) => {
      const value = String(memoryProfile[key] || '').trim();
      return value ? label + ': ' + value : '';
    })
    .filter(Boolean);
  return lines.length ? 'MEMBER STORY PROFILE (standing facts the member set once):\n' + lines.join('\n') : '';
}

// The context sent to StorySculpt: the standing story profile first, then any
// notes specific to this one chat. Both are the member's own words.
function composeContext() {
  const notes = storyEl('story-context').value.trim();
  return [composeMemory(), notes].filter(part => part && part.trim()).join('\n\n');
}

function renderProjectList() {
  const list = storyEl('story-project-list');
  list.innerHTML = storyProjects.length ? storyProjects.map(project =>
    '<button class="eee-rail-button' + (activeStory && activeStory.id === project.id ? ' active' : '') + '" type="button" data-project-id="' + storyEscape(project.id) + '">' + storyEscape(project.title || 'Untitled script') + '</button>'
  ).join('') : '<p class="eee-message">No chats yet.</p>';
}

function renderConversation() {
  const conversation = Array.isArray(activeStory && activeStory.conversation) ? activeStory.conversation : [];
  storyEl('story-conversation').innerHTML = conversation.map(message =>
    '<article class="story-message ' + (message.role === 'user' ? 'user' : 'assistant') + '">' +
      '<span class="story-message-role">' + (message.role === 'user' ? 'You' : 'StorySculpt') + '</span>' +
      '<div class="story-message-body">' + storyEscape(message.content) + '</div>' +
    '</article>'
  ).join('');
  const hasOutput = Boolean(activeStory && activeStory.output);
  storyEl('story-output').hidden = !hasOutput;
  storyEl('story-composer').hidden = hasOutput;
  storyEl('story-generation-status').hidden = hasOutput;
  if (hasOutput) {
    storyEl('story-output-copy').value = activeStory.output || '';
    autoGrow(storyEl('story-output-copy'));
  }
}

function scrollThread() {
  const thread = storyEl('story-conversation');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function showProject(project) {
  activeStory = project;
  storyEl('story-start').hidden = true;
  storyEl('story-editor').hidden = false;
  storyEl('delete-project-button').hidden = false;
  storyEl('story-title').value = project.title || '';
  storyEl('story-mode').value = project.content_type || 'bold';
  storyEl('story-format-badge').textContent = STORY_MODE_LABELS[project.content_type] || 'Bold';
  storyEl('story-context').value = project.intake && project.intake.context || '';
  storyEl('story-save-status').textContent = '';
  storyEl('story-refine-status').textContent = '';
  renderProjectList();
  renderConversation();
  EEEStudio.refreshIcons();
  scrollThread();
  (project.output ? storyEl('story-refine-note') : storyEl('story-answer')).focus();
}

function showStart() {
  activeStory = null;
  storyEl('story-start').hidden = false;
  storyEl('story-editor').hidden = true;
  storyEl('delete-project-button').hidden = true;
  storyEl('story-notes').hidden = true;
  renderProjectList();
}

async function loadStoryProjects() {
  const { data, error } = await storyContext.sb.from('storysculpt_projects').select('*').eq('user_id', storyContext.profile.id).order('updated_at', { ascending: false });
  if (error) throw error;
  storyProjects = data || [];
  if (storyProjects.length) showProject(storyProjects[0]); else showStart();
}

async function createStoryProject(mode) {
  const conversation = [{ role: 'assistant', content: STORY_STARTERS[mode] }];
  const { data, error } = await storyContext.sb.from('storysculpt_projects').insert({ user_id: storyContext.profile.id, title: STORY_TITLES[mode], content_type: mode, conversation }).select().single();
  if (error) throw error;
  storyProjects.unshift(data);
  showProject(data);
}

async function saveActiveStory(message) {
  if (!activeStory) return;
  const updates = {
    title: storyEl('story-title').value.trim() || 'Untitled script',
    intake: { context: storyEl('story-context').value.trim() },
    conversation: activeStory.conversation || [],
    output: activeStory.output || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await storyContext.sb.from('storysculpt_projects').update(updates).eq('id', activeStory.id);
  if (error) throw error;
  Object.assign(activeStory, updates);
  renderProjectList();
  if (message) {
    storyEl('story-save-status').textContent = message;
    storyEl('story-save-status').className = 'eee-message success';
  }
}

function queueStorySave() {
  clearTimeout(storySaveTimer);
  storySaveTimer = setTimeout(() => saveActiveStory().catch(() => {
    storyEl('story-save-status').textContent = 'This change could not be saved yet.';
    storyEl('story-save-status').className = 'eee-message error';
  }), 500);
}

// The browser half of the receipt-to-outcome trail. The server logs every
// request under a trace id; this records the two failures only the browser can
// see, against that same id: the answer never arrived (delivery), or it arrived
// and could not be saved (save). Fire and forget: it never blocks or throws,
// and it carries no member content, only the class, the trace, and a status.
// WBR-005, 2026-10-03 evening order.
function recordStoryFailure(failureClass, trace, status) {
  try {
    const layer = failureClass === 'delivery-error' ? 'delivery' : 'database';
    storyContext.sb.rpc('record_log_event', {
      p_event_type: 'storysculpt_' + (layer === 'delivery' ? 'delivery_failed' : 'save_failed'),
      p_detail: {
        schema: 1,
        trace: String(trace || ''),
        outcome: 'error',
        mode: String(activeStory && activeStory.content_type || ''),
        failureClass,
        layer,
        ...(Number.isFinite(status) ? { status } : {}),
        side: 'browser'
      }
    }).then(() => {}, () => {});
  } catch (error) {
    // Observability never breaks the app.
  }
}

// One request path for both a fresh answer and a refine note. It posts the
// current conversation (plus the member's standing profile as context) to the
// unchanged /api/storysculpt endpoint and folds the response back in.
async function runGeneration(intent = 'interview') {
  let response;
  try {
    response = await fetch('/api/storysculpt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + storyContext.session.access_token },
    body: JSON.stringify({
      mode: activeStory.content_type,
      projectId: activeStory.id,
      intent,
      projectTitle: storyEl('story-title').value,
      context: composeContext(),
      messages: activeStory.conversation
    })
    });
  } catch (error) {
    recordStoryFailure('delivery-error', '', 0);
    throw new Error('StorySculpt could not be reached. Check your connection. Your answers are still saved.');
  }
  const data = await response.json().catch(() => null);
  if (!data) {
    recordStoryFailure('delivery-error', '', response.status);
    throw new Error('StorySculpt\'s reply did not arrive in one piece. Your answers are still saved, so please try again.');
  }
  if (!response.ok) throw new Error(data.error || 'StorySculpt could not complete this step.');
  if (data.final) activeStory.output = data.content;
  else activeStory.conversation.push({ role: 'assistant', content: data.content });
  try {
    await saveActiveStory(data.final ? 'Finished draft saved' : null);
  } catch (error) {
    recordStoryFailure('save-error', data.trace, 0);
    renderConversation();
    throw new Error('StorySculpt answered, but it could not be saved to your account yet. Keep this page open and try again.');
  }
  renderConversation();
  scrollThread();
  return data;
}

async function sendStoryAnswer(event) {
  event.preventDefault();
  const answer = storyEl('story-answer').value.trim();
  if (!activeStory || !answer) return;
  if (activeStory.output) {
    storyEl('story-refine-status').textContent = 'Your script is finished. Use Refine with a note to change it.';
    storyEl('story-refine-note').focus();
    return;
  }
  const button = storyEl('story-send');
  button.disabled = true;
  storyEl('story-generation-status').textContent = 'Reading the full thread and finding the next useful move.';
  activeStory.conversation = [...(activeStory.conversation || []), { role: 'user', content: answer }];
  storyEl('story-answer').value = '';
  autoGrow(storyEl('story-answer'));
  renderConversation();
  scrollThread();
  // The finally block used to reset this status line unconditionally, which
  // wiped the error the catch had just written: a rejected or failed step
  // showed the member the idle line and nothing else. Only a success resets it
  // now. WBR-005, found 2026-10-03 while surfacing the output rejection.
  const status = storyEl('story-generation-status');
  let failed = false;
  try {
    await saveActiveStory();
    const data = await runGeneration('interview');
    if (data.final) storyEl('story-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    failed = true;
    status.textContent = error.message || 'This step did not finish. Your answers are still saved.';
    status.classList.add('error');
  } finally {
    button.disabled = false;
    if (!failed && !activeStory.output) {
      status.textContent = 'StorySculpt saves your chat as you go.';
      status.classList.remove('error');
    }
    EEEStudio.refreshIcons();
  }
}

// Refine with a note. The current (possibly edited) script goes back into the
// conversation as the last draft, then the member's plain-words note follows, so
// StorySculpt revises the existing script instead of starting over. No prompt or
// flow change: it is one more turn in the same interview.
async function refineStory() {
  const note = storyEl('story-refine-note').value.trim();
  if (!activeStory || !note || !activeStory.output) return;
  const button = storyEl('story-refine-send');
  button.disabled = true;
  const status = storyEl('story-refine-status');
  status.textContent = 'Revising your script with that note.';
  status.className = 'eee-message';
  const currentScript = storyEl('story-output-copy').value.trim();
  activeStory.output = currentScript;
  activeStory.conversation = [
    ...(activeStory.conversation || []),
    { role: 'assistant', content: currentScript },
    { role: 'user', content: 'Please revise the script above. Keep what works and change this: ' + note }
  ];
  try {
    await saveActiveStory();
    const data = await runGeneration('refine');
    storyEl('story-refine-note').value = '';
    autoGrow(storyEl('story-refine-note'));
    if (data.final) { status.textContent = 'Script revised.'; status.className = 'eee-message success'; }
    else { status.textContent = 'StorySculpt asked a question before revising. See the chat above.'; status.className = 'eee-message'; }
  } catch (error) {
    status.textContent = error.message || 'That revision did not finish. Your script is still saved.';
    status.className = 'eee-message error';
  } finally {
    button.disabled = false;
    EEEStudio.refreshIcons();
  }
}

// Inline edits to the finished script save straight to the project.
function queueOutputSave() {
  if (!activeStory) return;
  activeStory.output = storyEl('story-output-copy').value;
  clearTimeout(storySaveTimer);
  storySaveTimer = setTimeout(() => saveActiveStory().catch(() => {}), 600);
}

async function deleteActiveStory() {
  if (!activeStory || !window.confirm('Delete this StorySculpt chat?')) return;
  const id = activeStory.id;
  const { error } = await storyContext.sb.from('storysculpt_projects').delete().eq('id', id);
  if (error) return;
  storyProjects = storyProjects.filter(project => project.id !== id);
  if (storyProjects.length) showProject(storyProjects[0]); else showStart();
}

// Story profile (member memory) panel.
async function loadMemory() {
  const { data, error } = await storyContext.sb.from('storysculpt_member_context').select('profile').eq('user_id', storyContext.profile.id).maybeSingle();
  if (error) throw error;
  memoryProfile = (data && data.profile) || {};
  MEMORY_FIELDS.forEach(([key, id]) => { storyEl(id).value = memoryProfile[key] || ''; });
}

function openMemory() {
  MEMORY_FIELDS.forEach(([key, id]) => { storyEl(id).value = memoryProfile[key] || ''; });
  storyEl('mem-status').textContent = '';
  storyEl('story-memory').hidden = false;
  storyEl('story-memory-scrim').hidden = false;
  EEEStudio.refreshIcons();
}

function closeMemory() {
  storyEl('story-memory').hidden = true;
  storyEl('story-memory-scrim').hidden = true;
}

function openHelp() {
  helpReturnFocus = document.activeElement;
  storyEl('story-help').hidden = false;
  storyEl('story-help-scrim').hidden = false;
  storyEl('story-help-close').focus();
  EEEStudio.refreshIcons();
}

function closeHelp() {
  storyEl('story-help').hidden = true;
  storyEl('story-help-scrim').hidden = true;
  if (helpReturnFocus && typeof helpReturnFocus.focus === 'function') helpReturnFocus.focus();
}

async function saveMemory() {
  const draft = {};
  MEMORY_FIELDS.forEach(([key, id]) => { draft[key] = storyEl(id).value.trim(); });
  const button = storyEl('mem-save');
  button.disabled = true;
  const status = storyEl('mem-status');
  status.textContent = 'Saving your story profile.';
  status.className = 'eee-message';
  try {
    const { error } = await storyContext.sb.from('storysculpt_member_context').upsert({
      user_id: storyContext.profile.id,
      profile: draft,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) throw error;
    memoryProfile = draft;
    status.textContent = 'Saved. StorySculpt will use this on every chat.';
    status.className = 'eee-message success';
  } catch (error) {
    status.textContent = error.message || 'Your story profile could not be saved yet.';
    status.className = 'eee-message error';
  } finally {
    button.disabled = false;
  }
}

storyEl('story-mode-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-mode]');
  if (button) createStoryProject(button.dataset.mode).catch(() => {});
});
storyEl('story-project-list').addEventListener('click', event => {
  const button = event.target.closest('[data-project-id]');
  const project = button && storyProjects.find(item => item.id === button.dataset.projectId);
  if (project) showProject(project);
});
storyEl('new-project-button').addEventListener('click', showStart);
storyEl('delete-project-button').addEventListener('click', deleteActiveStory);
storyEl('story-notes-toggle').addEventListener('click', () => {
  storyEl('story-notes').hidden = !storyEl('story-notes').hidden;
});
storyEl('story-title').addEventListener('input', queueStorySave);
storyEl('story-context').addEventListener('input', queueStorySave);
storyEl('story-composer').addEventListener('submit', sendStoryAnswer);
storyEl('story-answer').addEventListener('input', event => autoGrow(event.target));
storyEl('story-answer').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); storyEl('story-composer').requestSubmit(); }
});
storyEl('story-output-copy').addEventListener('input', event => { autoGrow(event.target); queueOutputSave(); });
storyEl('story-refine-send').addEventListener('click', refineStory);
storyEl('story-refine-note').addEventListener('input', event => autoGrow(event.target));
storyEl('story-open-memory').addEventListener('click', openMemory);
storyEl('story-open-memory-top').addEventListener('click', openMemory);
storyEl('story-memory-close').addEventListener('click', closeMemory);
storyEl('story-memory-scrim').addEventListener('click', closeMemory);
storyEl('story-help-open').addEventListener('click', openHelp);
storyEl('story-help-close').addEventListener('click', closeHelp);
storyEl('story-help-scrim').addEventListener('click', closeHelp);
storyEl('story-help').addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeHelp(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...storyEl('story-help').querySelectorAll('button, a[href]')];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
storyEl('mem-save').addEventListener('click', saveMemory);

async function copyOutput(button, doneLabel) {
  if (!activeStory || !activeStory.output) return;
  await navigator.clipboard.writeText(storyEl('story-output-copy').value);
  const span = button.querySelector('span');
  const original = span.textContent;
  span.textContent = doneLabel;
  setTimeout(() => { span.textContent = original; }, 1500);
}
storyEl('copy-story-output').addEventListener('click', () => copyOutput(storyEl('copy-story-output'), 'Copied'));
storyEl('copy-story-output-bottom').addEventListener('click', () => copyOutput(storyEl('copy-story-output-bottom'), 'Copied. Go record it.'));
storyEl('start-another-story').addEventListener('click', showStart);

EEEStudio.initialize(async context => {
  storyContext = context;
  try { await loadMemory(); } catch (error) { memoryProfile = {}; }
  await loadStoryProjects();
});
