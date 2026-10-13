const STORY_STARTERS = {
  bold: 'Share one specific insight, story, or hot take you have had recently. It can be casual, uncomfortable, funny, or a position you keep returning to.',
  mini: 'What recent insight, lesson, belief, or idea do you want to turn into a short video?',
  rant: 'Type the raw rant or experience you want to turn into a video. Do not organize it first. Get the real thought out.',
  ugc: 'Enter a product link or details to find a grounded angle and write a creator-led video.'
};
const STORY_MODE_LABELS = { bold: 'Controversial Take', mini: 'Mini-Webinar', rant: '5E Talking Head', ugc: 'UGC / Product Video' };
const STORY_TITLES = { bold: 'New bold script', mini: 'New mini lesson', rant: 'New rant', ugc: 'New UGC script' };

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
let storyRailFilter = 'all'; // 'all' | 'active' | 'filmed'
let storyReturnNotice = null; // WBR-373: the lapse or quiet-week line shown on reopen
const expandedThreads = new Set(); // chats whose earlier turns the member chose to show
const STATES = window.StorySculptStates;

const storyEl = id => document.getElementById(id);

function generateSmartTitle(rawText) {
  if (!rawText) return '';
  let clean = rawText.replace(/[\r\n]+/g, ' ').replace(/[^\w\s'-]/g, ' ').trim();
  const fillerPatterns = [
    /^(?:i\s+(?:want\s+to|would\s+like\s+to|feel\s+like|think|really|just|am\s+thinking\s+about))\s+/i,
    /^(?:can\s+you(?:\s+help\s+me)?|help\s+me)\s+(?:to\s+|with\s+|write\s+(?:a\s+|about\s+)?)?/i,
    /^(?:let'?s\s+(?:talk\s+about|do\s+a|write\s+a))\s+/i,
    /^(?:my\s+(?:rant|topic|idea|thought|take)\s+(?:is|was)(?:\s+(?:about|that))?)\s+/i,
    /^(?:(?:a\s+)?(?:quick\s+)?(?:rant|take)(?:\s+(?:about|on))?)\s+/i,
    /^(?:ranting\s+(?:about|on))\s+/i,
    /^(?:what\s+if|why\s+do\s+people|why\s+(?:do|does|are|is|did)|how\s+come)\s+/i,
    /^(?:write\s+(?:a|about)|talk\s+about)\s+/i,
    /^(?:so\s+(?:i\s+)?(?:was\s+thinking|think|feel|basically))\s+/i,
    /^(?:the\s+thing\s+(?:is|about)|the\s+problem\s+with)\s+/i,
    /^(?:basically|honestly|actually|seriously)\s+/i
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pat of fillerPatterns) {
      if (pat.test(clean)) {
        clean = clean.replace(pat, '').trim();
        changed = true;
      }
    }
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const titleWords = words.slice(0, 4);
  let title = titleWords.map((w, idx) => {
    const lower = w.toLowerCase();
    if (idx > 0 && ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'with', 'in', 'of'].includes(lower)) {
      return lower;
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');

  if (title.length > 28) {
    title = title.slice(0, 28).trim();
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 14) title = title.slice(0, lastSpace);
  }
  return title;
}

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
  const count = storyEl('story-rail-count');
  if (count) count.textContent = storyProjects.length ? String(storyProjects.length) : '';
  const filtered = storyProjects.filter(project => {
    const isFilmed = Boolean(project.intake && project.intake.filmed);
    if (storyRailFilter === 'active') return !isFilmed;
    if (storyRailFilter === 'filmed') return isFilmed;
    return true;
  });

  if (!filtered.length) {
    const emptyMsg = storyRailFilter === 'filmed' ? 'No filmed scripts yet.' : (storyRailFilter === 'active' ? 'No active chats.' : 'No chats yet.');
    list.innerHTML = '<p class="eee-message">' + emptyMsg + '</p>';
    return;
  }

  list.innerHTML = filtered.map(project => {
    const isActive = activeStory && activeStory.id === project.id;
    const isFilmed = Boolean(project.intake && project.intake.filmed);
    const title = project.title || 'Untitled script';
    return '<div class="story-project-item' + (isActive ? ' active' : '') + (isFilmed ? ' filmed' : '') + '">' +
      '<button class="story-project-select" type="button" data-project-id="' + storyEscape(project.id) + '" title="' + storyEscape(title) + '">' +
        '<span class="story-project-title">' + storyEscape(title) + '</span>' +
      '</button>' +
      '<div class="story-project-actions">' +
        '<button class="story-action-btn story-film-btn' + (isFilmed ? ' is-filmed' : '') + '" type="button" data-action="toggle-filmed" data-project-id="' + storyEscape(project.id) + '" title="' + (isFilmed ? 'Mark as not filmed' : 'Mark as filmed') + '" aria-label="' + (isFilmed ? 'Mark as not filmed' : 'Mark as filmed') + '">' +
          '<i data-lucide="' + (isFilmed ? 'check-circle-2' : 'check') + '"></i>' +
        '</button>' +
        '<button class="story-action-btn story-delete-btn" type="button" data-action="delete-project" data-project-id="' + storyEscape(project.id) + '" title="Delete chat" aria-label="Delete chat">' +
          '<i data-lucide="trash-2"></i>' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
  EEEStudio.refreshIcons();
}

async function toggleFilmed(projectId) {
  const project = storyProjects.find(p => p.id === projectId);
  if (!project) return;
  const intake = Object.assign({}, project.intake);
  intake.filmed = !intake.filmed;
  project.intake = intake;
  if (activeStory && activeStory.id === projectId) {
    activeStory.intake = intake;
  }
  renderProjectList();
  try {
    await storyContext.sb.from('storysculpt_projects').update({
      intake,
      updated_at: new Date().toISOString()
    }).eq('id', projectId);
  } catch (err) {
    console.error('Failed to update filmed status', err);
  }
}

async function deleteStoryProjectById(projectId) {
  const project = storyProjects.find(p => p.id === projectId);
  if (!project || !window.confirm('Delete "' + (project.title || 'this chat') + '"?')) return;
  try {
    const { error } = await storyContext.sb.from('storysculpt_projects').delete().eq('id', projectId);
    if (error) throw error;
    storyProjects = storyProjects.filter(p => p.id !== projectId);
    if (activeStory && activeStory.id === projectId) {
      clearTimeout(storySaveTimer); storySaveTimer = null; activeStory = null;
      if (storyProjects.length) showProject(storyProjects[0]); else showStart();
    } else {
      renderProjectList();
    }
  } catch (err) {
    console.error('Failed to delete project', err);
  }
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
    if (activeStory && activeStory.content_type === 'ugc') {
      renderUgcFilmingPlan(activeStory);
    }
  } else {
    editor.classList.remove('has-output');
    output.hidden = true;
    mobileTabs.hidden = true;
    composer.hidden = false;
    genStatus.hidden = false;
    refineBox.hidden = true;
    viewingVersionIndex = -1;
    const filmingPanel = storyEl('ugc-filming-plan-panel');
    if (filmingPanel) filmingPanel.hidden = true;
  }
}

// What the member is being asked to do at each of David's steps, so a choice
// never arrives as an unexplained list (2026-10-08: the open loops "just gave
// an option and assumed I knew what it meant"). Keyed by the server's step.
const LENGTH_GUIDE = { title: 'Choose your length', note: 'About 3 spoken words per second. Tap one or type your own.', replies: ['30 seconds', '60 seconds', '75 seconds', '90 seconds', '2 minutes'] };
const DRAFT_GUIDE = { title: 'Your first draft', note: 'Change anything you like, or move on to the hooks when it feels right.', actions: [['Write the hooks', 'Looks good, go for the hooks'], ['Revise the draft', null]] };
const HOOK_GUIDE = { title: 'Choose your hook', note: 'The first line people hear. It has one job: stop the scroll.', choices: true };
const LOOP_GUIDE = { title: 'Choose your open loop', note: 'The sentence right after your hook that makes people stay to hear the rest.', choices: true };
// 2026-10-12 steps: length, draft (then wait), hooks, open loops, finished
// script. "Regenerate" on any of these replaces the old "Give me 3 different".
const STEP_GUIDE = {
  B2: { title: 'Choose your direction', note: 'Pick the angle this video should take.', choices: true },
  B3: LENGTH_GUIDE, M3: LENGTH_GUIDE, R3: LENGTH_GUIDE,
  R4: { title: 'Choose your tone', note: 'One of the 5 E\'s. Tap one, or type your own style.', replies: ['Entertainment', 'Enragement', 'Epiphany', 'Empathy', 'Education'] },
  B4: DRAFT_GUIDE, M4: DRAFT_GUIDE, R5: DRAFT_GUIDE,
  B5: HOOK_GUIDE, M5: HOOK_GUIDE, R6: HOOK_GUIDE,
  B6: LOOP_GUIDE, M6: LOOP_GUIDE, R7: LOOP_GUIDE
};

function stepGuideMarkup(message, isLatest) {
  const guide = message && message.step && STEP_GUIDE[message.step];
  if (!guide) return { banner: '', actions: '' };
  const banner = '<div class="story-step-banner"><strong>' + storyEscape(guide.title) + '</strong><span>' + storyEscape(guide.note) + '</span></div>';
  if (!isLatest || (activeStory && activeStory.output)) return { banner, actions: '' };
  const buttons = [];
  for (const reply of (guide.replies || [])) buttons.push('<button class="story-quick-btn" type="button" data-quick-reply="' + storyEscape(reply) + '">' + storyEscape(reply) + '</button>');
  if (guide.choices) {
    for (const n of [1, 2, 3]) buttons.push('<button class="story-quick-btn" type="button" data-quick-reply="' + n + '">Use ' + n + '</button>');
    if (guide.more) buttons.push('<button class="story-quick-btn subtle" type="button" data-quick-reply="' + storyEscape(guide.more) + '">' + storyEscape(guide.more) + '</button>');
  }
  for (const [label, reply] of (guide.actions || [])) {
    buttons.push(reply
      ? '<button class="story-quick-btn primary" type="button" data-quick-reply="' + storyEscape(reply) + '"><i data-lucide="sparkles"></i> ' + storyEscape(label) + '</button>'
      : '<button class="story-quick-btn subtle" type="button" data-quick-focus="true">' + storyEscape(label) + '</button>');
  }
  return { banner, actions: '<div class="story-quick-actions">' + buttons.join('') + '</div>' };
}

function sendQuickReply(text) {
  if (!text || !activeStory || activeStory.output) return;
  storyEl('story-answer').value = text;
  sendStoryAnswer();
}

function renderConversation() {
  const conversation = Array.isArray(activeStory && activeStory.conversation) ? activeStory.conversation : [];
  const versions = (activeStory && activeStory.intake && activeStory.intake.versions) || [];

  // WBR-373: a long chat opens on the latest exchange. Earlier turns sit behind
  // "Show earlier"; indices stay absolute so every action finds its message.
  const windowed = STATES.threadWindow(conversation.length, activeStory && expandedThreads.has(activeStory.id));
  const lastAssistant = conversation.map(m => m.role).lastIndexOf('assistant');

  storyEl('story-conversation').innerHTML = STATES.showEarlierMarkup(windowed.hidden) + conversation.map((message, index) => {
    if (index < windowed.start) return '';
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

    const isLatest = index === lastAssistant && index === conversation.length - 1;
    const guide = stepGuideMarkup(message, isLatest);
    // Regenerate (2026-10-12): the latest reply of any generated step can be
    // written again, with an optional note. Every version is kept, and the
    // pager switches between them before the member answers.
    const canRegenerate = isLatest && message.step && !(activeStory && activeStory.output);
    const variants = Array.isArray(message.variants) ? message.variants : [];
    const variantAt = Number.isInteger(message.variantIndex) ? message.variantIndex : variants.length - 1;
    const pager = canRegenerate && variants.length > 1
      ? '<span class="story-variant-pager" aria-label="Versions of this reply">' +
          '<button class="story-msg-btn" type="button" data-action="variant-prev" data-msg-index="' + index + '" aria-label="Previous version"' + (variantAt <= 0 ? ' disabled' : '') + '><i data-lucide="chevron-left"></i></button>' +
          '<span class="story-variant-count">' + (variantAt + 1) + ' / ' + variants.length + '</span>' +
          '<button class="story-msg-btn" type="button" data-action="variant-next" data-msg-index="' + index + '" aria-label="Next version"' + (variantAt >= variants.length - 1 ? ' disabled' : '') + '><i data-lucide="chevron-right"></i></button>' +
        '</span>'
      : '';
    const regenForm = canRegenerate
      ? '<form class="story-regen-form" data-regen-form="' + index + '" hidden>' +
          '<input type="text" maxlength="1000" placeholder="What should be different? (optional)" aria-label="What should be different in the new version">' +
          '<button class="story-quick-btn primary" type="submit"><i data-lucide="refresh-cw"></i> Regenerate</button>' +
        '</form>'
      : '';
    return '<article class="story-message assistant">' +
      '<span class="story-message-role">StorySculpt</span>' +
      guide.banner +
      '<div class="story-message-body">' + storyEscape(message.content) + '</div>' +
      guide.actions +
      regenForm +
      '<div class="story-message-actions">' +
        (canRegenerate ? '<button class="story-msg-btn" type="button" data-action="regen-open" data-msg-index="' + index + '" title="Write this step again"><i data-lucide="refresh-cw"></i><span>Regenerate</span></button>' : '') +
        pager +
        '<button class="story-msg-btn" type="button" data-action="copy-msg" data-msg-index="' + index + '" title="Copy response">' +
          '<i data-lucide="copy"></i><span>Copy</span>' +
        '</button>' +
        '<button class="story-msg-btn promote" type="button" data-action="promote-msg" data-msg-index="' + index + '" title="Open this draft in the script panel">' +
          '<i data-lucide="file-text"></i><span>Use as Script</span>' +
        '</button>' +
      '</div>' +
    '</article>';
  }).join('');

  renderScriptPanel();
  EEEStudio.refreshIcons();
}

function showEarlierTurns() {
  if (!activeStory) return;
  const scroller = storyEl('story-scroll');
  const before = scroller ? scroller.scrollHeight - scroller.scrollTop : 0;
  expandedThreads.add(activeStory.id);
  renderConversation();
  // Keep the member's place: the newly shown turns appear above, not under them.
  if (scroller) scroller.scrollTop = scroller.scrollHeight - before;
}

function renderReturnNotice() {
  const slot = storyEl('story-return-notice');
  if (!slot) return;
  slot.innerHTML = STATES.returnNoticeMarkup(storyReturnNotice);
  slot.hidden = !storyReturnNotice;
  EEEStudio.refreshIcons();
}

function dismissReturnNotice() {
  storyReturnNotice = null;
  renderReturnNotice();
}

async function promoteMessageToScript(msgIndex) {
  if (!activeStory || !activeStory.conversation || !activeStory.conversation[msgIndex]) return;
  const msg = activeStory.conversation[msgIndex];
  const content = msg.content;
  activeStory.output = content;
  ensureVersions(activeStory);
  const nextVerNum = activeStory.intake.versions.length + 1;
  activeStory.intake.versions.push({
    version: nextVerNum,
    note: nextVerNum === 1 ? 'Initial draft' : 'Promoted from chat',
    content: content,
    createdAt: new Date().toISOString()
  });
  viewingVersionIndex = -1;
  await saveActiveStory('Draft moved to script panel');
  renderScriptPanel();
  renderConversation();
  if (window.innerWidth <= 820) {
    switchMobileTab('script');
  } else {
    storyEl('story-output-copy').focus();
  }
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

// UGC Script Builder client-side state machine and rendering (WBR-440)
function generateAnglesClient(research = {}, creatorExperience = {}, salesApproach = 'help-decide') {
  const product = (research && research.product) || {};
  const productName = product.name || 'this product';
  const findings = (research && research.findings) || {};
  const features = findings.features || [];
  const claims = findings.brandClaims || [];
  const customerReports = findings.customerReports || [];
  const used = creatorExperience.used || 'used';
  const sourceRefs = ((research && research.sources) || []).map(s => s.id);

  const approach = salesApproach === 'help-decide'
    ? (used === 'not-yet' ? 'useful' : 'direct')
    : salesApproach;

  const primaryProblem = customerReports[0] || claims[0] || features[0] || 'the everyday problem people buy this to solve';
  const testFeature = features[1] || features[0] || 'the main claimed benefit';
  const contrastPoint = features[2] || customerReports[1] || 'what people usually waste money on instead';

  return [
    {
      id: 'angle-1',
      title: 'The Real Problem Solver',
      approach: approach === 'direct' ? 'Direct recommendation' : 'Useful problem breakdown',
      structure: approach === 'direct' ? 'direct-response' : 'tutorial',
      whyViewerCares: 'Focuses on the exact friction buyers report: ' + primaryProblem.slice(0, 120),
      demonstrationIdea: used === 'not-yet'
        ? 'Demonstrate unboxing and testing whether ' + productName + ' actually addresses this.'
        : 'Show the specific moment where ' + productName + ' replaced the messy old way.',
      evidenceRefs: sourceRefs.slice(0, 2)
    },
    {
      id: 'angle-2',
      title: used === 'not-yet' ? 'The First-Impression Test' : 'The Everyday Routine Fit',
      approach: 'Demonstration and observation',
      structure: used === 'not-yet' ? 'honest-test' : 'lifestyle-broll',
      whyViewerCares: 'Shows realistic use rather than high-pressure selling. Tests: ' + testFeature.slice(0, 120),
      demonstrationIdea: 'Camera captures natural action in real lighting, highlighting practical pros and one honest limitation.',
      evidenceRefs: sourceRefs.slice(0, 2)
    },
    {
      id: 'angle-3',
      title: 'Stop Doing It The Hard Way',
      approach: 'Contrast and advice',
      structure: 'regret',
      whyViewerCares: 'Highlights the wasteful alternative or common mistake: ' + contrastPoint.slice(0, 120),
      demonstrationIdea: 'Side-by-side or quick before/after showing the old habit versus the simpler result with ' + productName + '.',
      evidenceRefs: sourceRefs.slice(0, 2)
    }
  ];
}

function buildFilmingPlanClient(scriptText, options = {}) {
  const format = options.format || 'talking-head';
  const durationSeconds = options.durationSeconds || 60;
  const constraints = options.constraints || '';
  const text = String(scriptText || '').trim();
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  if (!paragraphs.length) return [];

  const totalWords = text.split(/\s+/).filter(Boolean).length;
  const secondsPerWord = durationSeconds / Math.max(1, totalWords);
  let elapsed = 0;

  return paragraphs.map((para, index) => {
    const pWords = para.split(/\s+/).filter(Boolean).length;
    const pSeconds = Math.round(pWords * secondsPerWord);
    const startSec = elapsed;
    const endSec = Math.min(durationSeconds, elapsed + pSeconds);
    elapsed = endSec;

    const formatTime = (s) => '0:' + (s < 10 ? '0' : '') + s;
    const timing = formatTime(startSec) + ' - ' + formatTime(endSec);

    let visualAction = '';
    let filmingNotes = '';

    if (index === 0) {
      visualAction = format === 'voiceover'
        ? 'Close-up B-roll of the product in action or the problem in progress.'
        : 'Direct to camera: eye-level, engaging expression, holding or pointing to the product.';
      filmingNotes = 'Hook pacing: deliver clearly in the first 3 seconds with no long pause.';
    } else if (index === paragraphs.length - 1) {
      visualAction = format === 'text-on-screen'
        ? 'Clean final shot with clear text callout and website/link pointer.'
        : 'Eye contact with camera, showing final result or resting product shot.';
      filmingNotes = 'Hold the end frame for one extra second so the viewer can read or tap.';
    } else {
      visualAction = format === 'voiceover'
        ? 'Hands-on demonstration showing the specific feature mentioned in this line.'
        : 'Cut between speaking to camera and a cutaway of the product being used.';
      filmingNotes = constraints ? 'Work around constraint: ' + constraints.slice(0, 60) : 'Keep lighting even and show real texture/operation.';
    }

    return {
      sceneNumber: index + 1,
      timing,
      spokenSegment: para.trim(),
      visualAction,
      filmingNotes
    };
  });
}

function renderUgcFilmingPlan(project) {
  const panel = storyEl('ugc-filming-plan-panel');
  if (!panel) return;
  const ugcState = (project && project.intake && project.intake.ugc) || {};
  const filming = ugcState.filming || {};
  if (!filming.enabled || !project.output) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const scenesContainer = storyEl('ugc-filming-scenes');
  const plan = Array.isArray(filming.plan) && filming.plan.length ? filming.plan : buildFilmingPlanClient(project.output, {
    format: filming.format || 'talking-head',
    durationSeconds: ugcState.durationSeconds || 60,
    constraints: filming.constraints || ''
  });
  filming.plan = plan;

  if (scenesContainer) {
    scenesContainer.innerHTML = plan.map(scene => '<div class="ugc-scene-card">' +
      '<div class="ugc-scene-head">' +
        '<span class="ugc-scene-timing">Scene ' + scene.sceneNumber + ' (' + storyEscape(scene.timing) + ')</span>' +
        '<span class="ugc-scene-action">' + storyEscape(scene.visualAction) + '</span>' +
      '</div>' +
      '<div class="ugc-scene-script">"' + storyEscape(scene.spokenSegment) + '"</div>' +
      (scene.filmingNotes ? '<div class="ugc-scene-notes">' + storyEscape(scene.filmingNotes) + '</div>' : '') +
    '</div>').join('');
  }

  const staleAlert = storyEl('ugc-filming-stale-alert');
  const updateBtn = storyEl('ugc-update-filming-btn');
  if (staleAlert) staleAlert.hidden = !filming.stale;
  if (updateBtn) updateBtn.hidden = !filming.stale;
  EEEStudio.refreshIcons();
}

function renderUgcProject(project) {
  const ugcFlow = storyEl('story-ugc-flow');
  if (!ugcFlow) return;
  ugcFlow.hidden = false;

  const ugcState = (project && project.intake && project.intake.ugc) || {};
  const hasOutput = Boolean(project && project.output);

  const stepEntry = storyEl('ugc-step-entry');
  const stepExp = storyEl('ugc-step-experience');
  const stepAngles = storyEl('ugc-step-angles');
  const stepReview = storyEl('ugc-step-review');

  if (hasOutput) {
    if (stepEntry) stepEntry.hidden = true;
    if (stepExp) stepExp.hidden = true;
    if (stepAngles) stepAngles.hidden = true;
    if (stepReview) stepReview.hidden = false;

    // Claims review
    const claimsBox = storyEl('ugc-claims-box');
    const issues = (ugcState.review && ugcState.review.issues) || [];
    if (claimsBox) {
      if (issues.length) {
        claimsBox.hidden = false;
        claimsBox.innerHTML = '<strong><i data-lucide="alert-triangle"></i> Review: check these statements before filming</strong>' +
          issues.map(iss => '<div class="ugc-claim-item">' +
            '<span>"' + storyEscape(iss.line) + '"</span>' +
            '<em>' + storyEscape(iss.issue) + ': ' + storyEscape(iss.suggestion) + '</em>' +
          '</div>').join('');
      } else {
        claimsBox.hidden = true;
      }
    }

    // Hooks
    const hooksList = storyEl('ugc-hooks-list');
    const hooks = ugcState.hooks || [];
    if (hooksList) {
      if (hooks.length) {
        hooksList.innerHTML = hooks.map((h, idx) => '<div class="ugc-hook-card">' +
          '<div class="ugc-hook-content">' +
            '<span class="ugc-hook-tag">' + storyEscape(h.kind || ('Hook ' + (idx + 1))) + '</span>' +
            '<div class="ugc-hook-text">' + storyEscape(h.text) + '</div>' +
          '</div>' +
          '<button class="secondary-button ugc-hook-use-btn" type="button" data-use-hook="' + idx + '">Use hook</button>' +
        '</div>').join('');
      } else {
        hooksList.innerHTML = '<p class="eee-message">Hook options ready on next revision.</p>';
      }
    }

    renderUgcFilmingPlan(project);
    EEEStudio.refreshIcons();
    return;
  }

  // Not output yet
  if (stepReview) stepReview.hidden = true;
  const currentStep = ugcState.currentStep || 'entry';

  if (currentStep === 'entry') {
    if (stepEntry) stepEntry.hidden = false;
    if (stepExp) stepExp.hidden = true;
    if (stepAngles) stepAngles.hidden = true;

    const prod = ugcState.product || {};
    storyEl('ugc-product-url').value = prod.url || '';
    storyEl('ugc-product-details').value = prod.userDetails || '';
    storyEl('ugc-brand-brief').value = prod.brief || '';
    storyEl('ugc-filming-toggle').checked = Boolean(ugcState.filming && ugcState.filming.enabled);

    const apprBtns = storyEl('ugc-approach-select').querySelectorAll('.ugc-pill-btn');
    apprBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.approach === (ugcState.salesApproach || 'help-decide')));
  } else if (currentStep === 'experience') {
    if (stepEntry) stepEntry.hidden = true;
    if (stepExp) stepExp.hidden = false;
    if (stepAngles) stepAngles.hidden = true;

    const exp = ugcState.creatorExperience || {};
    const expBtns = storyEl('ugc-experience-select').querySelectorAll('.ugc-pill-btn');
    expBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.exp === (exp.used || 'used')));
    storyEl('ugc-creator-notes').value = exp.observations || '';

    const statusEl = storyEl('ugc-research-status-text');
    const research = ugcState.research || {};
    if (statusEl) {
      if (research.coverage === 'blocked') {
        statusEl.textContent = 'Retail verification active. Using your provided product details.';
      } else if (research.product && research.product.name) {
        statusEl.textContent = 'Product findings ready: ' + research.product.name;
      } else {
        statusEl.textContent = 'Reading product page and brand claims...';
      }
    }
  } else if (currentStep === 'angles') {
    if (stepEntry) stepEntry.hidden = true;
    if (stepExp) stepExp.hidden = true;
    if (stepAngles) stepAngles.hidden = false;

    // Angle options
    const angles = (ugcState.angleOptions && ugcState.angleOptions.length)
      ? ugcState.angleOptions
      : generateAnglesClient(ugcState.research, ugcState.creatorExperience, ugcState.salesApproach);
    ugcState.angleOptions = angles;
    if (!ugcState.selectedAngle) ugcState.selectedAngle = angles[0];

    const grid = storyEl('ugc-angles-grid');
    if (grid) {
      grid.innerHTML = angles.map(a => {
        const isSel = ugcState.selectedAngle && ugcState.selectedAngle.id === a.id;
        return '<div class="ugc-angle-card' + (isSel ? ' active' : '') + '" data-angle-id="' + storyEscape(a.id) + '">' +
          '<div class="ugc-angle-card-head">' +
            '<strong>' + storyEscape(a.title) + '</strong>' +
            '<span class="ugc-angle-tag">' + storyEscape(a.structure) + '</span>' +
          '</div>' +
          '<div class="ugc-angle-why">' + storyEscape(a.whyViewerCares) + '</div>' +
          '<div class="ugc-angle-demo">' + storyEscape(a.demonstrationIdea) + '</div>' +
        '</div>';
      }).join('');
    }

    // What we found
    const findingsEl = storyEl('ugc-findings-content');
    const findings = (ugcState.research && ugcState.research.findings) || {};
    if (findingsEl) {
      const parts = [];
      if (findings.brandClaims && findings.brandClaims.length) {
        parts.push('<div class="ugc-findings-section"><strong>Brand Claims</strong><ul>' + findings.brandClaims.map(c => '<li>' + storyEscape(c) + '</li>').join('') + '</ul></div>');
      }
      if (findings.features && findings.features.length) {
        parts.push('<div class="ugc-findings-section"><strong>Observed Features</strong><ul>' + findings.features.map(f => '<li>' + storyEscape(f) + '</li>').join('') + '</ul></div>');
      }
      if (findings.customerReports && findings.customerReports.length) {
        parts.push('<div class="ugc-findings-section"><strong>Customer Reports</strong><ul>' + findings.customerReports.map(r => '<li>' + storyEscape(r) + '</li>').join('') + '</ul></div>');
      }
      if (ugcState.research && ugcState.research.gaps && ugcState.research.gaps.length) {
        parts.push('<div class="ugc-findings-section"><strong>Access / Evidence Gaps</strong><ul>' + ugcState.research.gaps.map(g => '<li>' + storyEscape(g) + '</li>').join('') + '</ul></div>');
      }
      findingsEl.innerHTML = parts.length ? parts.join('') : '<p>No external claims extracted yet; relying on your product description.</p>';
    }

    // Filming toggle sync
    const filmToggleAngle = storyEl('ugc-filming-toggle-angle');
    if (filmToggleAngle) filmToggleAngle.checked = Boolean(ugcState.filming && ugcState.filming.enabled);
  }

  EEEStudio.refreshIcons();
}

async function runUgcGeneration() {
  if (!activeStory) return;
  const ugcState = (activeStory.intake && activeStory.intake.ugc) || {};
  showThinkingIndicator('Writing your creator-led video script...');
  const genBtn = storyEl('ugc-generate-script-btn');
  if (genBtn) genBtn.disabled = true;

  try {
    const token = EEEStudio.accessToken ? await EEEStudio.accessToken(storyContext.session.access_token) : storyContext.session.access_token;
    const response = await fetch('/api/storysculpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        mode: 'ugc',
        projectId: activeStory.id,
        intent: 'interview',
        projectTitle: storyEl('story-title').value,
        context: composeContext(),
        ugc: ugcState
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      throw new Error((data && data.error) || 'StorySculpt could not complete the script.');
    }

    activeStory.output = data.content;
    activeStory.intake.ugc = data.ugc || ugcState;
    ensureVersions(activeStory);
    const versions = activeStory.intake.versions;
    versions.push({
      version: versions.length + 1,
      note: 'Initial UGC draft',
      content: data.content,
      createdAt: new Date().toISOString()
    });

    adoptScriptTitle(data.title);
    await saveActiveStory('UGC script generated');
    renderScriptPanel();
    renderUgcProject(activeStory);
    if (window.innerWidth <= 820) switchMobileTab('script');
  } catch (error) {
    alert(error.message || 'Script generation could not be completed.');
  } finally {
    hideThinkingIndicator();
    if (genBtn) genBtn.disabled = false;
    EEEStudio.refreshIcons();
  }
}

async function runUgcRevision(note) {
  if (!activeStory || !activeStory.output) return;
  const ugcState = (activeStory.intake && activeStory.intake.ugc) || {};
  showThinkingIndicator('Revising your script...');

  try {
    const token = EEEStudio.accessToken ? await EEEStudio.accessToken(storyContext.session.access_token) : storyContext.session.access_token;
    const response = await fetch('/api/storysculpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        mode: 'ugc',
        projectId: activeStory.id,
        intent: 'refine',
        regenerateNote: note,
        projectTitle: storyEl('story-title').value,
        context: composeContext(),
        ugc: ugcState
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      throw new Error((data && data.error) || 'StorySculpt could not complete the revision.');
    }

    activeStory.output = data.content;
    activeStory.intake.ugc = data.ugc || ugcState;
    ensureVersions(activeStory);
    const versions = activeStory.intake.versions;
    versions.push({
      version: versions.length + 1,
      note: note ? 'Revision: ' + note : 'Revised draft',
      content: data.content,
      createdAt: new Date().toISOString()
    });

    await saveActiveStory('Revised draft saved');
    renderScriptPanel();
    renderUgcProject(activeStory);
    if (window.innerWidth <= 820) switchMobileTab('script');
  } catch (error) {
    alert(error.message || 'Revision could not be completed.');
  } finally {
    hideThinkingIndicator();
    EEEStudio.refreshIcons();
  }
}

async function startAnotherUgcVideo() {
  if (!activeStory || !activeStory.intake || !activeStory.intake.ugc) return;
  const currentUgc = activeStory.intake.ugc;
  const product = currentUgc.product || {};
  const research = currentUgc.research || {};
  const creatorExperience = currentUgc.creatorExperience || {};
  const productName = product.name || (research.product && research.product.name) || 'Product';

  const newProject = await createStoryProject('ugc', {
    ugc: {
      schemaVersion: 1,
      currentStep: 'angles',
      product: { ...product },
      research: { ...research },
      creatorExperience: { ...creatorExperience },
      salesApproach: currentUgc.salesApproach || 'help-decide',
      filming: {
        enabled: Boolean(currentUgc.filming && currentUgc.filming.enabled),
        format: 'talking-head',
        plan: [],
        stale: false
      }
    }
  });

  newProject.title = productName + ' - Video ' + (storyProjects.filter(p => p.content_type === 'ugc').length);
  storyEl('story-title').value = newProject.title;
  await saveActiveStory('New UGC video project ready');
}

function initUgcListeners() {
  const toggleDetailsBtn = storyEl('ugc-toggle-details-btn');
  if (toggleDetailsBtn) {
    toggleDetailsBtn.addEventListener('click', () => {
      const group = storyEl('ugc-details-group');
      if (group) group.hidden = !group.hidden;
    });
  }

  const approachSelect = storyEl('ugc-approach-select');
  if (approachSelect) {
    approachSelect.addEventListener('click', event => {
      const btn = event.target.closest('[data-approach]');
      if (!btn || !activeStory) return;
      approachSelect.querySelectorAll('.ugc-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (!activeStory.intake.ugc) activeStory.intake.ugc = {};
      activeStory.intake.ugc.salesApproach = btn.dataset.approach;
      queueStorySave();
    });
  }

  const filmingToggle = storyEl('ugc-filming-toggle');
  if (filmingToggle) {
    filmingToggle.addEventListener('change', () => {
      if (!activeStory || !activeStory.intake.ugc) return;
      if (!activeStory.intake.ugc.filming) activeStory.intake.ugc.filming = {};
      activeStory.intake.ugc.filming.enabled = filmingToggle.checked;
      const angleToggle = storyEl('ugc-filming-toggle-angle');
      if (angleToggle) angleToggle.checked = filmingToggle.checked;
      queueStorySave();
      if (activeStory.output) renderUgcFilmingPlan(activeStory);
    });
  }

  const filmingToggleAngle = storyEl('ugc-filming-toggle-angle');
  if (filmingToggleAngle) {
    filmingToggleAngle.addEventListener('change', () => {
      if (!activeStory || !activeStory.intake.ugc) return;
      if (!activeStory.intake.ugc.filming) activeStory.intake.ugc.filming = {};
      activeStory.intake.ugc.filming.enabled = filmingToggleAngle.checked;
      const mainToggle = storyEl('ugc-filming-toggle');
      if (mainToggle) mainToggle.checked = filmingToggleAngle.checked;
      queueStorySave();
      if (activeStory.output) renderUgcFilmingPlan(activeStory);
    });
  }

  const startResearchBtn = storyEl('ugc-start-research-btn');
  if (startResearchBtn) {
    startResearchBtn.addEventListener('click', async () => {
      if (!activeStory) return;
      const url = (storyEl('ugc-product-url').value || '').trim();
      const userDetails = (storyEl('ugc-product-details').value || '').trim();
      const brief = (storyEl('ugc-brand-brief').value || '').trim();

      if (!url && !userDetails) {
        alert('Please enter a product link or paste product details.');
        return;
      }

      if (!activeStory.intake.ugc) activeStory.intake.ugc = {};
      activeStory.intake.ugc.product = { url, userDetails, brief };
      activeStory.intake.ugc.currentStep = 'experience';
      await saveActiveStory('Product entered');
      renderUgcProject(activeStory);

      // Start research in background
      try {
        const token = EEEStudio.accessToken ? await EEEStudio.accessToken(storyContext.session.access_token) : storyContext.session.access_token;
        const res = await fetch('/api/storysculpt-research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({
            projectId: activeStory.id,
            productUrl: url,
            userDetails,
            brandBrief: brief
          })
        });
        const data = await res.json().catch(() => null);
        if (data && data.research) {
          activeStory.intake.ugc.research = data.research;
          if (data.research.product && data.research.product.name) {
            activeStory.intake.ugc.product.name = data.research.product.name;
            const currentTitle = (storyEl('story-title').value || '').trim();
            if (!currentTitle || currentTitle === 'New UGC script') {
              activeStory.title = data.research.product.name + ' UGC script';
              storyEl('story-title').value = activeStory.title;
            }
          }
          await saveActiveStory();
          renderUgcProject(activeStory);
        }
      } catch (err) {
        console.error('Research error', err);
      }
    });
  }

  const expSelect = storyEl('ugc-experience-select');
  if (expSelect) {
    expSelect.addEventListener('click', event => {
      const btn = event.target.closest('[data-exp]');
      if (!btn || !activeStory) return;
      expSelect.querySelectorAll('.ugc-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (!activeStory.intake.ugc) activeStory.intake.ugc = {};
      if (!activeStory.intake.ugc.creatorExperience) activeStory.intake.ugc.creatorExperience = {};
      activeStory.intake.ugc.creatorExperience.used = btn.dataset.exp;
      queueStorySave();
    });
  }

  const seeAnglesBtn = storyEl('ugc-see-angles-btn');
  if (seeAnglesBtn) {
    seeAnglesBtn.addEventListener('click', async () => {
      if (!activeStory || !activeStory.intake.ugc) return;
      if (!activeStory.intake.ugc.creatorExperience) activeStory.intake.ugc.creatorExperience = {};
      const obs = (storyEl('ugc-creator-notes').value || '').trim();
      activeStory.intake.ugc.creatorExperience.observations = obs;
      activeStory.intake.ugc.currentStep = 'angles';
      await saveActiveStory('Experience noted');
      renderUgcProject(activeStory);
    });
  }

  const anglesGrid = storyEl('ugc-angles-grid');
  if (anglesGrid) {
    anglesGrid.addEventListener('click', event => {
      const card = event.target.closest('[data-angle-id]');
      if (!card || !activeStory || !activeStory.intake.ugc) return;
      anglesGrid.querySelectorAll('.ugc-angle-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const angleId = card.dataset.angleId;
      const angles = activeStory.intake.ugc.angleOptions || [];
      const found = angles.find(a => a.id === angleId);
      if (found) {
        activeStory.intake.ugc.selectedAngle = found;
        queueStorySave();
      }
    });
  }

  const styleSelect = storyEl('ugc-style-select');
  if (styleSelect) {
    styleSelect.addEventListener('click', event => {
      const btn = event.target.closest('[data-style]');
      if (!btn || !activeStory || !activeStory.intake.ugc) return;
      styleSelect.querySelectorAll('.ugc-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStory.intake.ugc.outputStyle = btn.dataset.style;
      queueStorySave();
    });
  }

  const durationSelect = storyEl('ugc-duration-select');
  if (durationSelect) {
    durationSelect.addEventListener('click', event => {
      const btn = event.target.closest('[data-duration]');
      if (!btn || !activeStory || !activeStory.intake.ugc) return;
      durationSelect.querySelectorAll('.ugc-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStory.intake.ugc.durationSeconds = parseInt(btn.dataset.duration, 10) || 60;
      queueStorySave();
    });
  }

  const generateScriptBtn = storyEl('ugc-generate-script-btn');
  if (generateScriptBtn) {
    generateScriptBtn.addEventListener('click', runUgcGeneration);
  }

  const hooksList = storyEl('ugc-hooks-list');
  if (hooksList) {
    hooksList.addEventListener('click', async event => {
      const btn = event.target.closest('[data-use-hook]');
      if (!btn || !activeStory || !activeStory.output) return;
      const idx = parseInt(btn.dataset.useHook, 10);
      const hooks = (activeStory.intake.ugc && activeStory.intake.ugc.hooks) || [];
      const chosen = hooks[idx];
      if (!chosen) return;

      const currentScript = activeStory.output.trim();
      const firstSentenceMatch = currentScript.match(/^[^.!?]+[.!?]/);
      let newScript = '';
      if (firstSentenceMatch) {
        newScript = chosen.text + currentScript.slice(firstSentenceMatch[0].length);
      } else {
        newScript = chosen.text + '\n\n' + currentScript;
      }

      activeStory.output = newScript;
      storyEl('story-output-copy').value = newScript;
      ensureVersions(activeStory);
      activeStory.intake.versions.push({
        version: activeStory.intake.versions.length + 1,
        note: 'Hook updated: ' + (chosen.kind || 'Option ' + (idx + 1)),
        content: newScript,
        createdAt: new Date().toISOString()
      });

      await saveActiveStory('Hook applied');
      renderScriptPanel();
    });
  }

  const quickRevContainer = storyEl('ugc-quick-rev-btns');
  if (quickRevContainer) {
    quickRevContainer.addEventListener('click', event => {
      const btn = event.target.closest('[data-rev-note]');
      if (btn) runUgcRevision(btn.dataset.revNote);
    });
  }

  const anotherBtn = storyEl('ugc-another-video-btn');
  if (anotherBtn) {
    anotherBtn.addEventListener('click', startAnotherUgcVideo);
  }

  const updateFilmingBtn = storyEl('ugc-update-filming-btn');
  if (updateFilmingBtn) {
    updateFilmingBtn.addEventListener('click', async () => {
      if (!activeStory || !activeStory.output) return;
      const ugcState = (activeStory.intake && activeStory.intake.ugc) || {};
      const filming = ugcState.filming || {};
      const plan = buildFilmingPlanClient(activeStory.output, {
        format: filming.format || 'talking-head',
        durationSeconds: ugcState.durationSeconds || 60,
        constraints: filming.constraints || ''
      });
      filming.plan = plan;
      filming.stale = false;
      await saveActiveStory('Filming plan updated');
      renderUgcFilmingPlan(activeStory);
    });
  }

  const toggleFilmingViewBtn = storyEl('ugc-toggle-filming-view-btn');
  if (toggleFilmingViewBtn) {
    toggleFilmingViewBtn.addEventListener('click', () => {
      const scenes = storyEl('ugc-filming-scenes');
      if (scenes) {
        scenes.hidden = !scenes.hidden;
        toggleFilmingViewBtn.textContent = scenes.hidden ? 'Show scenes' : 'Hide scenes';
      }
    });
  }

  const scriptCopy = storyEl('story-output-copy');
  if (scriptCopy) {
    scriptCopy.addEventListener('input', () => {
      if (activeStory && activeStory.content_type === 'ugc') {
        const filming = activeStory.intake && activeStory.intake.ugc && activeStory.intake.ugc.filming;
        if (filming && filming.enabled) {
          filming.stale = true;
          const staleAlert = storyEl('ugc-filming-stale-alert');
          const updateBtn = storyEl('ugc-update-filming-btn');
          if (staleAlert) staleAlert.hidden = false;
          if (updateBtn) updateBtn.hidden = false;
        }
      }
    });
  }
}

function showProject(project) {
  hideThinkingIndicator();
  hideErrorInConversation();
  activeStory = project;
  viewingVersionIndex = -1;
  ensureVersions(project);
  storyEl('story-start').hidden = true;
  storyEl('story-editor').hidden = false;
  setStoryEditing(true);
  if (isStoryPhone()) setStoryRailOpen(false);
  storyEl('delete-project-button').hidden = false;
  storyEl('story-title').value = project.title || '';
  storyEl('story-mode').value = project.content_type || 'bold';
  storyEl('story-format-badge').textContent = STORY_MODE_LABELS[project.content_type] || 'Controversial Take';
  storyEl('story-context').value = project.intake && project.intake.context || '';
  storyEl('story-save-status').textContent = '';
  storyEl('story-refine-status').textContent = '';
  switchMobileTab('chat');
  renderProjectList();

  if (project.content_type === 'ugc') {
    storyEl('story-scroll').hidden = true;
    storyEl('story-composer').hidden = true;
    storyEl('story-generation-status').hidden = true;
    renderUgcProject(project);
    if (project.output) {
      renderScriptPanel();
      if (window.innerWidth > 820) storyEl('story-refine-note').focus();
    }
  } else {
    storyEl('story-scroll').hidden = false;
    const ugcFlow = storyEl('story-ugc-flow');
    if (ugcFlow) ugcFlow.hidden = true;
    const filmingPanel = storyEl('ugc-filming-plan-panel');
    if (filmingPanel) filmingPanel.hidden = true;
    renderConversation();
    renderScriptPanel();
    scrollThread();
    if (project.output) {
      if (window.innerWidth > 820) storyEl('story-refine-note').focus();
    } else {
      storyEl('story-answer').focus();
    }
  }

  EEEStudio.refreshIcons();
}

function showStart() {
  hideThinkingIndicator();
  hideErrorInConversation();
  // WBR-373: leaving a chat says where it went. Any typed change is flushed now
  // rather than waiting out the save timer.
  const leaving = activeStory;
  const leftNote = storyEl('story-left-note');
  if (leaving) {
    recordStoryWalkaway(leaving);
    if (storySaveTimer) { clearTimeout(storySaveTimer); storySaveTimer = null; saveActiveStory().catch(() => {}); }
    leftNote.textContent = 'Saved. "' + ((storyEl('story-title').value || '').trim() || leaving.title || 'Untitled script') + '" is in your chats whenever you want it.';
    leftNote.hidden = false;
  } else {
    leftNote.hidden = true;
  }
  activeStory = null;
  viewingVersionIndex = -1;
  storyEl('story-start').hidden = false;
  storyEl('story-editor').hidden = true;
  setStoryEditing(false);
  storyEl('delete-project-button').hidden = true;
  storyEl('story-notes').hidden = true;
  const ugcFlow = storyEl('story-ugc-flow');
  if (ugcFlow) ugcFlow.hidden = true;
  const filmingPanel = storyEl('ugc-filming-plan-panel');
  if (filmingPanel) filmingPanel.hidden = true;
  renderProjectList();
}

async function loadStoryProjects() {
  const { data, error } = await storyContext.sb.from('storysculpt_projects').select('*').eq('user_id', storyContext.profile.id).order('updated_at', { ascending: false });
  if (error) throw error;
  storyProjects = data || [];
  // Measured from the saved timestamps before this visit writes anything.
  storyReturnNotice = STATES.returnNotice(storyProjects);
  renderReturnNotice();
  const resume = storyReturnNotice && storyProjects.find(project => project.id === storyReturnNotice.projectId);
  if (resume) showProject(resume); else if (storyProjects.length) showProject(storyProjects[0]); else showStart();
}

async function createStoryProject(mode, initialIntakeOverrides = null) {
  const conversation = [{ role: 'assistant', content: STORY_STARTERS[mode] || STORY_STARTERS.rant }];
  const baseIntake = mode === 'ugc' ? {
    context: '',
    versions: [],
    ugc: {
      schemaVersion: 1,
      currentStep: 'entry',
      salesApproach: 'help-decide',
      creatorExperience: { used: 'used', observations: '' },
      filming: { enabled: false, format: 'talking-head', plan: [], stale: false }
    }
  } : { context: '', versions: [] };
  const intake = initialIntakeOverrides ? { ...baseIntake, ...initialIntakeOverrides } : baseIntake;
  const { data, error } = await storyContext.sb.from('storysculpt_projects').insert({
    user_id: storyContext.profile.id,
    title: STORY_TITLES[mode] || 'New script',
    content_type: mode,
    conversation,
    intake
  }).select().single();
  if (error) throw error;
  storyProjects.unshift(data);
  showProject(data);
  return data;
}

async function saveActiveStory(message) {
  if (!activeStory) return;
  const currentIntake = activeStory.intake || {};
  const updates = {
    title: storyEl('story-title').value.trim() || 'Untitled script',
    intake: {
      ...currentIntake,
      context: storyEl('story-context').value.trim(),
      versions: currentIntake.versions || [],
      filmed: Boolean(currentIntake.filmed),
      ...(currentIntake.current_step ? { current_step: currentIntake.current_step } : {})
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
  storySaveTimer = setTimeout(() => { storySaveTimer = null; return saveActiveStory().catch(() => {
    storyEl('story-save-status').textContent = 'This change could not be saved yet.';
    storyEl('story-save-status').className = 'eee-message error';
  }); }, 500);
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

// Records when a member steps away from an active interview mid-step with no
// error, so incidents can separate member walk-aways from provider failures.
function recordStoryWalkaway(project) {
  try {
    if (!project || project.output || !storyContext || !storyContext.sb) return;
    const conv = Array.isArray(project.conversation) ? project.conversation : [];
    if (conv.length < 2) return;
    storyContext.sb.rpc('record_log_event', {
      p_event_type: 'storysculpt_walkaway',
      p_detail: {
        schema: 1,
        outcome: 'walkaway',
        mode: String(project.content_type || ''),
        failureClass: 'member-walkaway',
        layer: 'walkaway',
        failureKind: 'member-walkaway',
        step: String((project.intake && project.intake.current_step) || ''),
        messageCount: conv.length,
        side: 'browser'
      }
    }).then(() => {}, () => {});
  } catch (_) {
    // Observability never breaks the app.
  }
}

// A finished script's title (sent apart from the script since 2026-10-12)
// names the chat unless the member already named it themselves.
function adoptScriptTitle(title) {
  const clean = String(title || '').trim();
  if (!clean || !activeStory) return;
  const firstAnswer = ((activeStory.conversation || []).find(m => m.role === 'user') || {}).content || '';
  const current = (storyEl('story-title').value || activeStory.title || '').trim();
  const automatic = !current || current.startsWith('New ') || current === 'Untitled script' || current === generateSmartTitle(firstAnswer);
  if (!automatic) return;
  activeStory.title = clean;
  storyEl('story-title').value = clean;
}

// The interview as it stood when the script was first finished: everything
// before the first revision. A fresh script is rebuilt from these answers.
function interviewMessages() {
  const conversation = activeStory.conversation || [];
  const cut = conversation.findIndex(m => m.isScriptDraft || (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('Please revise the script above')));
  return cut === -1 ? conversation : conversation.slice(0, cut);
}

async function regenerateStep(index, note) {
  if (!activeStory || activeStory.output) return;
  const message = activeStory.conversation[index];
  if (!message || message.role !== 'assistant') return;
  hideErrorInConversation();
  showThinkingIndicator('Writing a fresh version of this step...');
  const status = storyEl('story-generation-status');
  const send = storyEl('story-send');
  if (send) send.disabled = true;
  try {
    await runGeneration('regenerate', { target: 'step', note, previous: message.content, messages: activeStory.conversation.slice(0, index), replaceIndex: index });
    hideThinkingIndicator();
    status.textContent = 'New version ready. Your earlier versions are kept; use the arrows to compare.';
    status.classList.remove('error');
  } catch (error) {
    hideThinkingIndicator();
    const cleanMsg = (error && error.message) || 'That version did not finish. The earlier one is still here.';
    status.textContent = cleanMsg;
    status.classList.add('error');
    showErrorInConversation(cleanMsg, () => regenerateStep(index, note));
  } finally {
    if (send) send.disabled = false;
    EEEStudio.refreshIcons();
  }
}

// A fresh finished script from the interview answers (the SeenInSeven
// "Regenerate Full Script" idea), saved as a new version; nothing is lost.
async function regenerateScript() {
  if (!activeStory || !activeStory.output) return;
  const noteEl = storyEl('story-refine-note');
  const note = noteEl.value.trim();
  const status = storyEl('story-refine-status');
  const buttons = [storyEl('story-regenerate-script'), storyEl('story-refine-send'), storyEl('story-regenerate-script-foot')].filter(Boolean);
  buttons.forEach(b => { b.disabled = true; });
  status.textContent = 'Writing a fresh script from your answers' + (note ? ' and your note.' : '.');
  status.className = 'eee-message story-refine-status';
  showThinkingIndicator('Writing a fresh script from your answers...');
  const versions = ensureVersions(activeStory);
  try {
    const data = await runGeneration('regenerate', { target: 'final', note, previous: activeStory.output, messages: interviewMessages() });
    hideThinkingIndicator();
    if (data.final) {
      versions.push({ version: versions.length + 1, note: note ? 'Regenerated: ' + note : 'Regenerated', content: data.content, createdAt: new Date().toISOString() });
      viewingVersionIndex = -1;
      noteEl.value = '';
      autoGrow(noteEl);
      await saveActiveStory('Fresh script saved');
      status.textContent = 'Fresh script ready. Earlier versions are in the version list.';
      status.className = 'eee-message story-refine-status success';
      renderScriptPanel();
      renderConversation();
      if (window.innerWidth <= 820) switchMobileTab('script');
    }
  } catch (error) {
    hideThinkingIndicator();
    const cleanMsg = (error && error.message) || 'The fresh script did not finish. Your current script is unchanged.';
    status.textContent = cleanMsg;
    status.className = 'eee-message story-refine-status error';
    showErrorInConversation(cleanMsg, () => regenerateScript());
  } finally {
    buttons.forEach(b => { b.disabled = false; });
    EEEStudio.refreshIcons();
  }
}

function showVariant(index, step) {
  const message = activeStory && activeStory.conversation[index];
  if (!message || !Array.isArray(message.variants)) return;
  const next = Math.max(0, Math.min(message.variants.length - 1, (Number.isInteger(message.variantIndex) ? message.variantIndex : message.variants.length - 1) + step));
  message.variantIndex = next;
  message.content = message.variants[next];
  renderConversation();
  queueStorySave();
}

// One request path for both a fresh answer and a refine note. It posts the
// current conversation (plus the member's standing profile as context) to the
// unchanged /api/storysculpt endpoint and folds the response back in.
async function runGeneration(intent = 'interview', options = {}) {
  let response;
  try {
    const token = EEEStudio.accessToken ? await EEEStudio.accessToken(storyContext.session.access_token) : storyContext.session.access_token;
    response = await fetch('/api/storysculpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        mode: activeStory.content_type,
        projectId: activeStory.id,
        intent,
        projectTitle: storyEl('story-title').value,
        context: composeContext(),
        messages: options.messages || activeStory.conversation,
        target: options.target,
        regenerateNote: options.note || undefined,
        previous: options.previous || undefined
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
  if (data.final) {
    activeStory.output = data.content;
    adoptScriptTitle(data.title);
  } else if (Number.isInteger(options.replaceIndex) && activeStory.conversation[options.replaceIndex]) {
    const message = activeStory.conversation[options.replaceIndex];
    const variants = Array.isArray(message.variants) && message.variants.length ? message.variants : [message.content];
    variants.push(data.content);
    message.variants = variants;
    message.variantIndex = variants.length - 1;
    message.content = data.content;
    message.step = data.step || message.step;
  } else {
    activeStory.conversation.push({ role: 'assistant', content: data.content, step: data.step || null });
  }
  // Keep the server's position in David's steps. The save below rewrites the
  // whole intake, and until 2026-10-08 it dropped current_step every turn.
  if (data.step) activeStory.intake = Object.assign({}, activeStory.intake, { current_step: data.step });
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

let thinkingInterval = null;

function showThinkingIndicator(initialStage = 'Reading the thread...') {
  hideThinkingIndicator();
  hideErrorInConversation();
  const thread = storyEl('story-conversation');
  if (!thread) return;

  const indicator = document.createElement('article');
  indicator.className = 'story-message assistant story-message-thinking';
  indicator.id = 'story-thinking-indicator';
  indicator.innerHTML =
    '<span class="story-message-role">StorySculpt</span>' +
    '<div class="story-thinking-card">' +
      '<div class="story-thinking-dots" aria-hidden="true">' +
        '<span class="story-thinking-dot"></span>' +
        '<span class="story-thinking-dot"></span>' +
        '<span class="story-thinking-dot"></span>' +
      '</div>' +
      '<div class="story-thinking-content">' +
        '<strong class="story-thinking-title">Thinking</strong>' +
        '<span class="story-thinking-stage" id="story-thinking-stage-text">' + storyEscape(initialStage) + '</span>' +
      '</div>' +
    '</div>';
  thread.appendChild(indicator);
  scrollThread();

  const stages = [
    'Reading every word you wrote...',
    'Shaping it in your voice with the 5E framework...',
    'Polishing it so it sounds like you on your best day...'
  ];
  let stageIdx = 0;
  thinkingInterval = setInterval(() => {
    const stageEl = storyEl('story-thinking-stage-text');
    if (!stageEl) return;
    stageEl.textContent = stages[stageIdx % stages.length];
    stageIdx++;
  }, 4500);
}

function hideThinkingIndicator() {
  if (thinkingInterval) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
  }
  const indicator = storyEl('story-thinking-indicator');
  if (indicator && indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
  }
}

function hideErrorInConversation() {
  const errEl = storyEl('story-error-indicator');
  if (errEl && errEl.parentNode) {
    errEl.parentNode.removeChild(errEl);
  }
}

function showErrorInConversation(message, retryCallback) {
  hideThinkingIndicator();
  hideErrorInConversation();
  const thread = storyEl('story-conversation');
  if (!thread) return;

  // Preserve no em dashes in member-facing copy rule
  const cleanMsg = String(message || 'StorySculpt could not finish this step.')
    .replace(/[—–]/g, ', ');

  const errArticle = document.createElement('article');
  errArticle.className = 'story-message assistant story-message-error';
  errArticle.id = 'story-error-indicator';
  errArticle.innerHTML =
    '<span class="story-message-role" style="color: var(--studio-danger, #f28b82);">Notice</span>' +
    '<div class="story-error-card">' +
      '<div class="story-error-header">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="12" cy="12" r="10"></circle>' +
          '<line x1="12" y1="8" x2="12" y2="12"></line>' +
          '<line x1="12" y1="16" x2="12.01" y2="16"></line>' +
        '</svg>' +
        '<span>Could not finish this step</span>' +
      '</div>' +
      '<p class="story-error-text">' + storyEscape(cleanMsg) + '</p>' +
      (typeof retryCallback === 'function' ? (
        '<div class="story-error-actions">' +
          '<button class="story-msg-btn retry" type="button" id="story-retry-btn">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>' +
            '</svg>' +
            '<span>Try Again</span>' +
          '</button>' +
        '</div>'
      ) : '') +
    '</div>';

  thread.appendChild(errArticle);
  if (typeof retryCallback === 'function') {
    const btn = errArticle.querySelector('#story-retry-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        hideErrorInConversation();
        retryCallback();
      });
    }
  }
  scrollThread();
}

async function retryInterviewGeneration() {
  hideErrorInConversation();
  showThinkingIndicator('Taking another careful pass at this for you...');
  await executeInterviewGeneration();
}

async function executeInterviewGeneration() {
  const button = storyEl('story-send');
  if (button) button.disabled = true;
  const status = storyEl('story-generation-status');
  let failed = false;
  try {
    await saveActiveStory();
    const data = await runGeneration('interview');
    hideThinkingIndicator();
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
    hideThinkingIndicator();
    const cleanMsg = (error && error.message) || 'This step did not finish. Your answers are still saved.';
    status.textContent = cleanMsg;
    status.classList.add('error');
    showErrorInConversation(cleanMsg, () => retryInterviewGeneration());
  } finally {
    if (button) button.disabled = false;
    if (!failed && !activeStory.output) {
      status.textContent = 'StorySculpt saves your chat as you go.';
      status.classList.remove('error');
    }
    EEEStudio.refreshIcons();
  }
}

async function sendStoryAnswer(event) {
  if (event && event.preventDefault) event.preventDefault();
  const answer = storyEl('story-answer').value.trim();
  if (!activeStory || !answer) return;
  if (activeStory.output) {
    storyEl('story-refine-status').textContent = STATES.FINISHED_LINE;
    storyEl('story-refine-note').focus();
    return;
  }

  // Auto-name chat from user's first answer if still on default title
  const defaultTitles = ['New bold script', 'New mini lesson', 'New rant', 'Untitled script'];
  if (!activeStory.title || defaultTitles.includes(activeStory.title.trim()) || activeStory.title.startsWith('New ')) {
    const smart = generateSmartTitle(answer);
    if (smart && smart.length >= 3) {
      activeStory.title = smart;
      storyEl('story-title').value = smart;
    }
  }

  if (storyReturnNotice) dismissReturnNotice();
  const button = storyEl('story-send');
  button.disabled = true;
  storyEl('story-generation-status').textContent = 'Reading the full thread and finding the next useful move.';
  activeStory.conversation = [...(activeStory.conversation || []), { role: 'user', content: answer }];
  storyEl('story-answer').value = '';
  autoGrow(storyEl('story-answer'));
  renderConversation();
  showThinkingIndicator('Reading the thread...');
  scrollThread();

  await executeInterviewGeneration();
}

async function retryRefineGeneration(note) {
  hideErrorInConversation();
  showThinkingIndicator('Retrying script revision...');
  await executeRefineGeneration(note);
}

async function executeRefineGeneration(note) {
  const button = storyEl('story-refine-send');
  if (button) button.disabled = true;
  const status = storyEl('story-refine-status');
  status.textContent = 'Revising your script with that note.';
  status.className = 'eee-message story-refine-status';
  const versions = ensureVersions(activeStory);

  try {
    await saveActiveStory();
    const data = await runGeneration('refine');
    hideThinkingIndicator();

    if (data.final) {
      status.textContent = 'Script revised.';
      status.className = 'eee-message story-refine-status success';

      const nextVerNum = versions.length + 1;
      activeStory.output = data.content;
      versions.push({
        version: nextVerNum,
        note: note || 'Revision',
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
    hideThinkingIndicator();
    const cleanMsg = (error && error.message) || 'That revision did not finish. Your script is still saved.';
    status.textContent = cleanMsg;
    status.className = 'eee-message story-refine-status error';
    showErrorInConversation(cleanMsg, () => retryRefineGeneration(note));
  } finally {
    if (button) button.disabled = false;
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

  storyEl('story-refine-note').value = '';
  autoGrow(storyEl('story-refine-note'));
  renderConversation();
  showThinkingIndicator('Revising your script with that note...');
  scrollThread();

  await executeRefineGeneration(note);
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
    storySaveTimer = null;
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
  clearTimeout(storySaveTimer); storySaveTimer = null; activeStory = null;
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
  const selectBtn = event.target.closest('.story-project-select');
  if (selectBtn) {
    const project = storyProjects.find(item => item.id === selectBtn.dataset.projectId);
    if (project) showProject(project);
    return;
  }
  const filmBtn = event.target.closest('[data-action="toggle-filmed"]');
  if (filmBtn) {
    event.stopPropagation();
    toggleFilmed(filmBtn.dataset.projectId);
    return;
  }
  const delBtn = event.target.closest('[data-action="delete-project"]');
  if (delBtn) {
    event.stopPropagation();
    deleteStoryProjectById(delBtn.dataset.projectId);
    return;
  }
  const button = event.target.closest('[data-project-id]');
  const project = button && storyProjects.find(item => item.id === button.dataset.projectId);
  if (project) showProject(project);
});

const railFilterEl = storyEl('story-rail-filter');
if (railFilterEl) {
  railFilterEl.addEventListener('click', event => {
    const btn = event.target.closest('[data-filter]');
    if (!btn) return;
    storyRailFilter = btn.dataset.filter;
    railFilterEl.querySelectorAll('.story-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === storyRailFilter);
    });
    renderProjectList();
  });
}

storyEl('new-project-button').addEventListener('click', showStart);
storyEl('delete-project-button').addEventListener('click', deleteActiveStory);
storyEl('story-notes-toggle').addEventListener('click', () => {
  storyEl('story-notes').hidden = !storyEl('story-notes').hidden;
});
storyEl('story-title').addEventListener('input', queueStorySave);
storyEl('story-context').addEventListener('input', queueStorySave);
storyEl('story-composer').addEventListener('submit', sendStoryAnswer);
storyEl('story-conversation').addEventListener('click', event => {
  if (event.target.closest('[data-show-earlier]')) { showEarlierTurns(); return; }
  const quick = event.target.closest('[data-quick-reply]');
  if (quick) { sendQuickReply(quick.getAttribute('data-quick-reply')); return; }
  if (event.target.closest('[data-quick-focus]')) storyEl('story-answer').focus();
});
storyEl('story-conversation').addEventListener('submit', event => {
  const form = event.target.closest('[data-regen-form]');
  if (!form) return;
  event.preventDefault();
  regenerateStep(Number(form.dataset.regenForm), form.querySelector('input').value.trim());
});
storyEl('story-answer').addEventListener('input', event => autoGrow(event.target));
storyEl('story-answer').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); storyEl('story-composer').requestSubmit(); }
});

// Artifact panel and version history events
storyEl('story-output-copy').addEventListener('input', queueOutputSave);
storyEl('story-refine-send').addEventListener('click', refineStory);
storyEl('story-regenerate-script').addEventListener('click', regenerateScript);
storyEl('story-regenerate-script-foot').addEventListener('click', regenerateScript);
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
    return;
  }
  const copyBtn = event.target.closest('[data-action="copy-msg"]');
  if (copyBtn && activeStory && activeStory.conversation) {
    const idx = Number(copyBtn.dataset.msgIndex);
    const msg = activeStory.conversation[idx];
    if (msg && msg.content) {
      navigator.clipboard.writeText(msg.content);
      const span = copyBtn.querySelector('span');
      if (span) {
        const orig = span.textContent;
        span.textContent = 'Copied';
        setTimeout(() => { span.textContent = orig; }, 1500);
      }
    }
    return;
  }
  const regenOpen = event.target.closest('[data-action="regen-open"]');
  if (regenOpen) {
    const form = document.querySelector('[data-regen-form="' + regenOpen.dataset.msgIndex + '"]');
    if (form) { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); }
    return;
  }
  const variantBtn = event.target.closest('[data-action="variant-prev"], [data-action="variant-next"]');
  if (variantBtn) {
    showVariant(Number(variantBtn.dataset.msgIndex), variantBtn.dataset.action === 'variant-next' ? 1 : -1);
    return;
  }
  const promoteBtn = event.target.closest('[data-action="promote-msg"]');
  if (promoteBtn && activeStory && activeStory.conversation) {
    const idx = Number(promoteBtn.dataset.msgIndex);
    promoteMessageToScript(idx);
    return;
  }
});

// Mobile tab events
// Phone layout (2026-10-12). On a phone the chat list folds into one "Chats"
// bar so the script and the text box get the screen, and the open chat is a
// fixed-height screen sized to what is actually visible, so the keyboard
// pushes the text box up instead of covering it.
function isStoryPhone() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 820px)').matches;
}
function setStoryRailOpen(open) {
  const rail = storyEl('story-projects');
  const toggle = storyEl('story-rail-toggle');
  if (!rail || !toggle || !rail.classList) return;
  rail.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
}
function setStoryEditing(editing) {
  const workspace = storyEl('story-workspace');
  if (workspace && workspace.classList) workspace.classList.toggle('is-editing', editing);
}
function syncStoryViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  document.documentElement.style.setProperty('--story-vvh', Math.round(vv.height) + 'px');
  // iOS scrolls the whole page to show a focused field; the editor already fits
  // the visible area, so put the page back where the header stays in view.
  if (isStoryPhone() && !storyEl('story-editor').hidden && window.scrollY) window.scrollTo(0, 0);
  // Backup for typing mode: the keyboard shrinks the visible area while a
  // field is active, and closing it gives the space back.
  if (typeof setStoryTyping === 'function' && document.activeElement && document.activeElement.matches) {
    storyTallestView = Math.max(storyTallestView, vv.height);
    const fieldActive = document.activeElement.matches(STORY_TYPING_FIELDS);
    if (fieldActive && vv.height < storyTallestView * 0.8) setStoryTyping(true);
    else if (!fieldActive) setStoryTyping(false);
  }
}
let storyTallestView = 0;
// Typing mode (2026-10-12): with the phone keyboard up, the header, chat
// list bar, title row, tabs and status line used most of what was left of the
// screen, so the conversation could not be read. While a field in the editor
// has focus on a phone, those bars hide and the conversation gets the space.
const STORY_TYPING_FIELDS = '#story-answer, #story-refine-note, .story-regen-form input, #story-output-copy, #story-context';
function setStoryTyping(on) {
  if (!document.body || !document.body.classList) return;
  const typing = Boolean(on) && isStoryPhone();
  if (document.body.classList.contains('story-typing') === typing) return;
  document.body.classList.toggle('story-typing', typing);
  syncStoryViewport();
  if (typing) setTimeout(scrollThread, 60);
}
if (typeof document.addEventListener === 'function') {
  document.addEventListener('focusin', event => {
    if (event.target && event.target.matches && event.target.matches(STORY_TYPING_FIELDS)) setStoryTyping(true);
  });
  document.addEventListener('focusout', () => {
    // Wait for focus to land: moving between two fields keeps typing mode.
    setTimeout(() => {
      const active = document.activeElement;
      setStoryTyping(Boolean(active && active.matches && active.matches(STORY_TYPING_FIELDS)));
    }, 120);
  });
}
storyEl('story-rail-toggle').addEventListener('click', () => {
  if (!isStoryPhone()) return;
  setStoryRailOpen(!storyEl('story-projects').classList.contains('is-open'));
});
if (window.visualViewport) {
  // The keyboard resizes the visual viewport; rotation resizes the window.
  window.visualViewport.addEventListener('resize', syncStoryViewport);
  if (typeof window.addEventListener === 'function') window.addEventListener('resize', syncStoryViewport);
  syncStoryViewport();
}

storyEl('tab-btn-chat').addEventListener('click', () => switchMobileTab('chat'));
storyEl('tab-btn-script').addEventListener('click', () => switchMobileTab('script'));

storyEl('story-open-memory').addEventListener('click', openMemory);
if (storyEl('story-open-memory-top')) storyEl('story-open-memory-top').addEventListener('click', openMemory);
if (storyEl('menu-story-profile')) storyEl('menu-story-profile').addEventListener('click', openMemory);
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
// UX 37: export exactly what the panel shows, as a text file named for the chat.
function downloadScript() {
  if (!activeStory || !activeStory.output) return;
  const text = storyEl('story-output-copy').value;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = STATES.exportFileName(storyEl('story-title').value || activeStory.title);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
storyEl('download-story-output').addEventListener('click', downloadScript);
storyEl('copy-story-output').addEventListener('click', () => copyOutput(storyEl('copy-story-output'), 'Copied'));
storyEl('copy-story-output-bottom').addEventListener('click', () => copyOutput(storyEl('copy-story-output-bottom'), 'Copied. Go record it.'));
storyEl('start-another-story').addEventListener('click', showStart);
storyEl('story-finished-new').addEventListener('click', showStart);
storyEl('story-return-notice').addEventListener('click', event => {
  if (event.target.closest('[data-return-dismiss]')) dismissReturnNotice();
});
// Leaving the page with a typed change still on the save timer: send it now.
window.addEventListener('pagehide', () => {
  if (storySaveTimer && activeStory) { clearTimeout(storySaveTimer); storySaveTimer = null; saveActiveStory().catch(() => {}); }
});

EEEStudio.initialize(async context => {
  storyContext = context;
  try { await loadMemory(); } catch (error) { memoryProfile = {}; }
  initUgcListeners();
  await loadStoryProjects();
});
