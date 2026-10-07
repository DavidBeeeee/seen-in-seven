const STORY_STARTERS = {
  bold: 'Share one specific insight, story, or hot take you have had recently. It can be casual, uncomfortable, funny, or a position you keep returning to.',
  mini: 'What recent insight, lesson, belief, or idea do you want to turn into a short video?',
  rant: 'Type the raw rant or experience you want to turn into a video. Do not organize it first. Get the real thought out.'
};
const STORY_MODE_LABELS = { bold: 'Controversial Take', mini: 'Mini-Webinar', rant: '5E Talking Head' };
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
let viewingVersionIndex = -1; // -1 means viewing active/latest draft
let mobileActiveTab = 'chat'; // 'chat' or 'script'

const storyEl = id => document.getElementById(id);

function storyEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

function updateWordCount(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 130 * 10) / 10);
  const countEl = storyEl('story-word-count');
  if (countEl) {
    countEl.textContent = words === 1 ? '1 word (~1 min)' : words + ' words (~' + minutes + ' min)';
  }
}

function ensureVersions(project) {
  if (!project) return [];
  if (!project.intake) project.intake = {};
  if (!Array.isArray(project.intake.versions)) {
    project.intake.versions = [];
  }
  if (project.output && project.intake.versions.length === 0) {
    const drafts = [];
    if (Array.isArray(project.conversation)) {
      for (let i = 0; i < project.conversation.length; i++) {
        const msg = project.conversation[i];
        if (msg && msg.role === 'assistant') {
          const next = project.conversation[i + 1];
          if (next && next.role === 'user' && typeof next.content === 'string' && next.content.startsWith('Please revise the script above')) {
            const noteMatch = next.content.replace('Please revise the script above. Keep what works and change this: ', '').trim();
            drafts.push({
              version: drafts.length + 1,
              note: drafts.length === 0 ? 'Initial draft' : (noteMatch || 'Revision'),
              content: msg.content,
              createdAt: project.created_at || new Date().toISOString()
            });
          }
        }
      }
    }
    drafts.push({
      version: drafts.length + 1,
      note: drafts.length > 0 ? 'Latest revision' : 'Initial draft',
      content: project.output,
      createdAt: project.updated_at || new Date().toISOString()
    });
    project.intake.versions = drafts;
  }
  return project.intake.versions;
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

function renderVersionPills() {
  const pillsContainer = storyEl('story-version-pills');
  if (!pillsContainer || !activeStory) return;
  const versions = ensureVersions(activeStory);
  if (versions.length === 0) {
    pillsContainer.innerHTML = '';
    return;
  }
  pillsContainer.innerHTML = versions.map((v, idx) => {
    const isLatest = idx === versions.length - 1;
    const isSelected = viewingVersionIndex === -1 ? isLatest : viewingVersionIndex === idx;
    const label = 'v' + v.version + (isLatest ? ' (latest)' : '');
    return '<button class="story-version-pill' + (isSelected ? ' active' : '') + '" type="button" data-ver-index="' + idx + '" title="' + storyEscape(v.note || '') + '">' + storyEscape(label) + '</button>';
  }).join('');

  const badge = storyEl('story-tab-version-badge');
  if (badge) badge.textContent = 'v' + versions.length;

  const banner = storyEl('story-version-banner');
  const bannerText = storyEl('story-version-banner-text');
  if (banner && bannerText) {
    const isOlder = viewingVersionIndex !== -1 && viewingVersionIndex < versions.length - 1;
    banner.hidden = !isOlder;
    if (isOlder) {
      const v = versions[viewingVersionIndex];
      bannerText.textContent = 'Viewing Version ' + v.version + (v.note ? ' (' + v.note + ')' : '');
    }
  }
}

function renderScriptPanel() {
  const hasOutput = Boolean(activeStory && activeStory.output);
  const editor = storyEl('story-editor');
  const output = storyEl('story-output');
  const mobileTabs = storyEl('story-mobile-tabs');
  const composer = storyEl('story-composer');
  const refineBox = storyEl('story-refine-box');
  const genStatus = storyEl('story-generation-status');

  if (hasOutput) {
    editor.classList.add('has-output');
    output.hidden = false;
    mobileTabs.hidden = false;
    composer.hidden = true;
    genStatus.hidden = true;
    refineBox.hidden = false;

    renderVersionPills();

    const versions = ensureVersions(activeStory);
    const contentToShow = (viewingVersionIndex !== -1 && versions[viewingVersionIndex])
      ? versions[viewingVersionIndex].content
      : (activeStory.output || '');

    const copyEl = storyEl('story-output-copy');
    if (document.activeElement !== copyEl && copyEl.value !== contentToShow) {
      copyEl.value = contentToShow;
    }
    copyEl.readOnly = viewingVersionIndex !== -1;
    updateWordCount(contentToShow);
  } else {
    editor.classList.remove('has-output');
    output.hidden = true;
    mobileTabs.hidden = true;
    composer.hidden = false;
    genStatus.hidden = false;
    refineBox.hidden = true;
    viewingVersionIndex = -1;
  }
}

function renderConversation() {
  const conversation = Array.isArray(activeStory && activeStory.conversation) ? activeStory.conversation : [];
  const versions = (activeStory && activeStory.intake && activeStory.intake.versions) || [];

  storyEl('story-conversation').innerHTML = conversation.map((message, index) => {
    if (message.role === 'user') {
      const isRefine = message.refineNote || (typeof message.content === 'string' && message.content.startsWith('Please revise the script above. Keep what works and change this: '));
      if (isRefine) {
        const note = message.refineNote || message.content.replace('Please revise the script above. Keep what works and change this: ', '').trim();
        return '<article class="story-message user story-message-refine">' +
          '<span class="story-message-role">You</span>' +
          '<div class="story-message-body"><span class="story-refine-badge"><i data-lucide="wand-sparkles"></i> Revision note</span><p class="story-refine-text">' + storyEscape(note) + '</p></div>' +
        '</article>';
      }
      return '<article class="story-message user">' +
        '<span class="story-message-role">You</span>' +
        '<div class="story-message-body">' + storyEscape(message.content) + '</div>' +
      '</article>';
    }

    const isScript = message.isScriptDraft ||
      (index + 1 < conversation.length && conversation[index + 1].role === 'user' && typeof conversation[index + 1].content === 'string' && conversation[index + 1].content.startsWith('Please revise the script above')) ||
      (activeStory && activeStory.output && message.content === activeStory.output);

    if (isScript) {
      const ver = versions.find(v => v.content === message.content);
      const verLabel = ver ? ('Version ' + ver.version) : 'Working draft';
      const verNote = ver && ver.note ? ver.note : 'Draft moved to script panel';
      return '<article class="story-message assistant story-message-artifact-chip">' +
        '<span class="story-message-role">StorySculpt</span>' +
        '<div class="story-artifact-chip">' +
          '<div class="story-artifact-chip-icon"><i data-lucide="file-text"></i></div>' +
          '<div class="story-artifact-chip-content">' +
            '<strong>' + storyEscape(verLabel) + '</strong>' +
            '<small>' + storyEscape(verNote) + '</small>' +
          '</div>' +
          '<button class="story-artifact-chip-view" type="button" data-view-script="true">View in panel →</button>' +
        '</div>' +
      '</article>';
    }

    return '<article class="story-message assistant">' +
      '<span class="story-message-role">StorySculpt</span>' +
      '<div class="story-message-body">' + storyEscape(message.content) + '</div>' +
    '</article>';
  }).join('');

  renderScriptPanel();
  EEEStudio.refreshIcons();
}

function scrollThread() {
  const thread = storyEl('story-scroll');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function switchMobileTab(tab) {
  mobileActiveTab = tab;
  const chatPane = storyEl('story-pane-chat');
  const scriptPane = storyEl('story-output');
  const btnChat = storyEl('tab-btn-chat');
  const btnScript = storyEl('tab-btn-script');

  if (tab === 'chat') {
    if (btnChat) btnChat.classList.add('active');
    if (btnScript) btnScript.classList.remove('active');
    if (chatPane) chatPane.classList.remove('mobile-hidden');
    if (scriptPane) scriptPane.classList.add('mobile-hidden');
    scrollThread();
  } else {
    if (btnScript) btnScript.classList.add('active');
    if (btnChat) btnChat.classList.remove('active');
    if (scriptPane) scriptPane.classList.remove('mobile-hidden');
    if (chatPane) chatPane.classList.add('mobile-hidden');
  }
}

function selectVersion(index) {
  const versions = ensureVersions(activeStory);
  if (index < 0 || index >= versions.length || index === versions.length - 1) {
    viewingVersionIndex = -1;
  } else {
    viewingVersionIndex = index;
  }
  const content = viewingVersionIndex === -1 ? (activeStory.output || '') : versions[viewingVersionIndex].content;
  const copyEl = storyEl('story-output-copy');
  copyEl.value = content;
  copyEl.readOnly = viewingVersionIndex !== -1;
  updateWordCount(content);
  renderVersionPills();
  EEEStudio.refreshIcons();
}

async function restoreOlderVersion() {
  if (!activeStory || viewingVersionIndex === -1) return;
  const versions = ensureVersions(activeStory);
  const target = versions[viewingVersionIndex];
  if (!target) return;
  const nextVerNum = versions.length + 1;
  const note = 'Restored from v' + target.version;
  activeStory.output = target.content;
  versions.push({
    version: nextVerNum,
    note: note,
    content: target.content,
    createdAt: new Date().toISOString()
  });
  viewingVersionIndex = -1;
  const copyEl = storyEl('story-output-copy');
  copyEl.value = target.content;
  copyEl.readOnly = false;
  await saveActiveStory('Restored version ' + target.version);
  renderScriptPanel();
  renderConversation();
}

function showProject(project) {
  activeStory = project;
  viewingVersionIndex = -1;
  ensureVersions(project);
  storyEl('story-start').hidden = true;
  storyEl('story-editor').hidden = false;
  storyEl('delete-project-button').hidden = false;
  storyEl('story-title').value = project.title || '';
  storyEl('story-mode').value = project.content_type || 'bold';
  storyEl('story-format-badge').textContent = STORY_MODE_LABELS[project.content_type] || 'Controversial Take';
  storyEl('story-context').value = project.intake && project.intake.context || '';
  storyEl('story-save-status').textContent = '';
  storyEl('story-refine-status').textContent = '';
  switchMobileTab('chat');
  renderProjectList();
  renderConversation();
  EEEStudio.refreshIcons();
  scrollThread();
  if (project.output) {
    if (window.innerWidth > 820) storyEl('story-refine-note').focus();
  } else {
    storyEl('story-answer').focus();
  }
}

function showStart() {
  activeStory = null;
  viewingVersionIndex = -1;
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
  const { data, error } = await storyContext.sb.from('storysculpt_projects').insert({
    user_id: storyContext.profile.id,
    title: STORY_TITLES[mode],
    content_type: mode,
    conversation,
    intake: { context: '', versions: [] }
  }).select().single();
  if (error) throw error;
  storyProjects.unshift(data);
  showProject(data);
}

async function saveActiveStory(message) {
  if (!activeStory) return;
  const updates = {
    title: storyEl('story-title').value.trim() || 'Untitled script',
    intake: {
      context: storyEl('story-context').value.trim(),
      versions: (activeStory.intake && activeStory.intake.versions) || []
    },
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
    storyEl('story-refine-status').textContent = 'Your script is finished. Use Revise to change it.';
    storyEl('story-refine-note').focus();
    return;
  }

  // Auto-name chat from user's first answer if still on default title
  const defaultTitles = ['New bold script', 'New mini lesson', 'New rant', 'Untitled script'];
  if (!activeStory.title || defaultTitles.includes(activeStory.title.trim()) || activeStory.title.startsWith('New ')) {
    const cleanAnswer = answer.replace(/[\r\n]+/g, ' ').replace(/[^\w\s'-]/g, '').trim();
    if (cleanAnswer) {
      const words = cleanAnswer.split(/\s+/).slice(0, 6).join(' ');
      const candidate = words.charAt(0).toUpperCase() + words.slice(1);
      if (candidate.length >= 3) {
        activeStory.title = candidate.slice(0, 50);
        storyEl('story-title').value = activeStory.title;
      }
    }
  }

  const button = storyEl('story-send');
  button.disabled = true;
  storyEl('story-generation-status').textContent = 'Reading the full thread and finding the next useful move.';
  activeStory.conversation = [...(activeStory.conversation || []), { role: 'user', content: answer }];
  storyEl('story-answer').value = '';
  autoGrow(storyEl('story-answer'));
  renderConversation();
  scrollThread();

  const status = storyEl('story-generation-status');
  let failed = false;
  try {
    await saveActiveStory();
    const data = await runGeneration('interview');
    if (data.final) {
      ensureVersions(activeStory);
      if (activeStory.intake.versions.length === 0) {
        activeStory.intake.versions.push({
          version: 1,
          note: 'Initial draft',
          content: data.content,
          createdAt: new Date().toISOString()
        });
      }
      viewingVersionIndex = -1;
      await saveActiveStory('Initial draft saved');
      renderScriptPanel();
      if (window.innerWidth <= 820) {
        switchMobileTab('script');
      } else {
        storyEl('story-output-copy').focus();
      }
    }
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
  status.className = 'eee-message story-refine-status';

  const currentScript = storyEl('story-output-copy').value.trim();
  activeStory.output = currentScript;

  const versions = ensureVersions(activeStory);
  if (versions.length > 0) {
    versions[versions.length - 1].content = currentScript;
  }

  activeStory.conversation = [
    ...(activeStory.conversation || []),
    { role: 'assistant', content: currentScript, isScriptDraft: true },
    { role: 'user', content: 'Please revise the script above. Keep what works and change this: ' + note, refineNote: note }
  ];

  renderConversation();
  scrollThread();

  try {
    await saveActiveStory();
    const data = await runGeneration('refine');
    storyEl('story-refine-note').value = '';
    autoGrow(storyEl('story-refine-note'));

    if (data.final) {
      status.textContent = 'Script revised.';
      status.className = 'eee-message story-refine-status success';

      const nextVerNum = versions.length + 1;
      activeStory.output = data.content;
      versions.push({
        version: nextVerNum,
        note: note,
        content: data.content,
        createdAt: new Date().toISOString()
      });

      viewingVersionIndex = -1;
      await saveActiveStory('Revised draft saved');
      renderScriptPanel();
      renderConversation();

      if (window.innerWidth <= 820) {
        switchMobileTab('script');
      }
    } else {
      status.textContent = 'StorySculpt asked a question before revising. See the chat above.';
      status.className = 'eee-message story-refine-status';
      renderConversation();
    }
  } catch (error) {
    status.textContent = error.message || 'That revision did not finish. Your script is still saved.';
    status.className = 'eee-message story-refine-status error';
  } finally {
    button.disabled = false;
    EEEStudio.refreshIcons();
  }
}

// Inline edits to the finished script save straight to the project.
function queueOutputSave() {
  if (!activeStory) return;
  const val = storyEl('story-output-copy').value;
  activeStory.output = val;

  const versions = ensureVersions(activeStory);
  if (versions.length > 0 && (viewingVersionIndex === -1 || viewingVersionIndex === versions.length - 1)) {
    versions[versions.length - 1].content = val;
  }
  updateWordCount(val);

  const saveStatusEl = storyEl('story-script-save-status');
  if (saveStatusEl) saveStatusEl.textContent = 'Saving...';

  clearTimeout(storySaveTimer);
  storySaveTimer = setTimeout(() => {
    saveActiveStory().then(() => {
      if (saveStatusEl) saveStatusEl.textContent = 'Saves as you type';
    }).catch(() => {
      if (saveStatusEl) saveStatusEl.textContent = 'Connection error. Retrying...';
    });
  }, 600);
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

// Artifact panel and version history events
storyEl('story-output-copy').addEventListener('input', queueOutputSave);
storyEl('story-refine-send').addEventListener('click', refineStory);
storyEl('story-refine-note').addEventListener('input', event => autoGrow(event.target));
storyEl('story-refine-note').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); refineStory(); }
});

storyEl('story-version-pills').addEventListener('click', event => {
  const btn = event.target.closest('[data-ver-index]');
  if (btn) selectVersion(Number(btn.dataset.verIndex));
});
storyEl('story-version-restore-btn').addEventListener('click', restoreOlderVersion);

storyEl('story-conversation').addEventListener('click', event => {
  const btn = event.target.closest('[data-view-script]');
  if (btn) {
    if (window.innerWidth <= 820) switchMobileTab('script');
    else storyEl('story-output-copy').focus();
  }
});

// Mobile tab events
storyEl('tab-btn-chat').addEventListener('click', () => switchMobileTab('chat'));
storyEl('tab-btn-script').addEventListener('click', () => switchMobileTab('script'));

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
  const copyEl = storyEl('story-output-copy');
  await navigator.clipboard.writeText(copyEl.value);
  const span = button.querySelector('span');
  if (span) {
    const original = span.textContent;
    span.textContent = doneLabel;
    setTimeout(() => { span.textContent = original; }, 1500);
  }
}
storyEl('copy-story-output').addEventListener('click', () => copyOutput(storyEl('copy-story-output'), 'Copied'));
storyEl('copy-story-output-bottom').addEventListener('click', () => copyOutput(storyEl('copy-story-output-bottom'), 'Copied. Go record it.'));
storyEl('start-another-story').addEventListener('click', showStart);

EEEStudio.initialize(async context => {
  storyContext = context;
  try { await loadMemory(); } catch (error) { memoryProfile = {}; }
  await loadStoryProjects();
});
