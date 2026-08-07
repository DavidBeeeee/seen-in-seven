const STORY_STARTERS = {
  bold: 'Share one specific insight, story, or hot take you have had recently. It can be casual, uncomfortable, funny, or a position you keep returning to.',
  mini: 'What recent insight, lesson, belief, or idea do you want to turn into a short video?',
  rant: 'Type the raw rant or experience you want to turn into a video. Do not organize it first. Get the real thought out.'
};

let storyContext = null;
let storyProjects = [];
let activeStory = null;
let storySaveTimer = null;

const storyEl = id => document.getElementById(id);

function storyEscape(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderProjectList() {
  const list = storyEl('story-project-list');
  list.innerHTML = storyProjects.length ? storyProjects.map(project =>
    '<button class="eee-rail-button' + (activeStory && activeStory.id === project.id ? ' active' : '') + '" type="button" data-project-id="' + storyEscape(project.id) + '">' + storyEscape(project.title || 'Untitled script') + '</button>'
  ).join('') : '<p class="eee-message">No projects yet.</p>';
}

function renderConversation() {
  const conversation = Array.isArray(activeStory && activeStory.conversation) ? activeStory.conversation : [];
  storyEl('story-conversation').innerHTML = conversation.map(message =>
    '<article class="story-message ' + (message.role === 'user' ? 'user' : 'assistant') + '"><span class="story-message-role">' + (message.role === 'user' ? 'You' : 'StorySculpt') + '</span>' + storyEscape(message.content) + '</article>'
  ).join('');
  storyEl('story-output').hidden = !activeStory.output;
  storyEl('story-output-copy').textContent = activeStory.output || '';
}

function showProject(project) {
  activeStory = project;
  storyEl('story-mode-grid').hidden = true;
  storyEl('story-editor').hidden = false;
  storyEl('delete-project-button').hidden = false;
  storyEl('story-page-title').textContent = project.title || 'Untitled script';
  storyEl('story-page-copy').textContent = 'Answer one useful question at a time. StorySculpt will hold the thread.';
  storyEl('story-title').value = project.title || '';
  storyEl('story-mode').value = project.content_type || 'bold';
  storyEl('story-context').value = project.intake && project.intake.context || '';
  renderProjectList();
  renderConversation();
  EEEStudio.refreshIcons();
}

function showModePicker() {
  activeStory = null;
  storyEl('story-mode-grid').hidden = false;
  storyEl('story-editor').hidden = true;
  storyEl('delete-project-button').hidden = true;
  storyEl('story-page-title').textContent = 'Choose the kind of script you want to build.';
  storyEl('story-page-copy').textContent = 'The interview asks for one useful decision at a time and keeps the raw details intact.';
  renderProjectList();
}

async function loadStoryProjects() {
  const { data, error } = await storyContext.sb.from('storysculpt_projects').select('*').eq('user_id', storyContext.profile.id).order('updated_at', { ascending: false });
  if (error) throw error;
  storyProjects = data || [];
  if (storyProjects.length) showProject(storyProjects[0]); else showModePicker();
}

async function createStoryProject(mode) {
  const title = mode === 'bold' ? 'New bold script' : mode === 'mini' ? 'New mini lesson' : 'New rant';
  const conversation = [{ role: 'assistant', content: STORY_STARTERS[mode] }];
  const { data, error } = await storyContext.sb.from('storysculpt_projects').insert({ user_id: storyContext.profile.id, title, content_type: mode, conversation }).select().single();
  if (error) throw error;
  storyProjects.unshift(data);
  showProject(data);
  storyEl('story-answer').focus();
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
  storyEl('story-page-title').textContent = updates.title;
  renderProjectList();
  storyEl('story-save-status').textContent = message || 'Saved';
  storyEl('story-save-status').className = 'eee-message success';
}

function queueStorySave() {
  clearTimeout(storySaveTimer);
  storySaveTimer = setTimeout(() => saveActiveStory().catch(() => {
    storyEl('story-save-status').textContent = 'This change could not be saved yet.';
    storyEl('story-save-status').className = 'eee-message error';
  }), 500);
}

async function sendStoryAnswer(event) {
  event.preventDefault();
  const answer = storyEl('story-answer').value.trim();
  if (!activeStory || !answer) return;
  const button = storyEl('story-send');
  button.disabled = true;
  button.querySelector('span').textContent = 'Sculpting...';
  storyEl('story-generation-status').textContent = 'Reading the full thread and finding the next useful move.';
  activeStory.conversation = [...(activeStory.conversation || []), { role: 'user', content: answer }];
  storyEl('story-answer').value = '';
  renderConversation();
  try {
    await saveActiveStory();
    const response = await fetch('/api/storysculpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + storyContext.session.access_token },
      body: JSON.stringify({
        mode: activeStory.content_type,
        projectTitle: storyEl('story-title').value,
        context: storyEl('story-context').value,
        messages: activeStory.conversation
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'StorySculpt could not complete this step.');
    if (data.final) activeStory.output = data.content;
    else activeStory.conversation.push({ role: 'assistant', content: data.content });
    await saveActiveStory(data.final ? 'Finished draft saved' : 'Saved');
    renderConversation();
    if (data.final) storyEl('story-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    storyEl('story-generation-status').textContent = error.message || 'This step did not finish. Your answers are still saved.';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Continue';
    if (!activeStory.output) storyEl('story-generation-status').textContent = 'Your project saves as you go.';
    EEEStudio.refreshIcons();
  }
}

async function deleteActiveStory() {
  if (!activeStory || !window.confirm('Delete this StorySculpt project?')) return;
  const id = activeStory.id;
  const { error } = await storyContext.sb.from('storysculpt_projects').delete().eq('id', id);
  if (error) return;
  storyProjects = storyProjects.filter(project => project.id !== id);
  if (storyProjects.length) showProject(storyProjects[0]); else showModePicker();
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
storyEl('new-project-button').addEventListener('click', showModePicker);
storyEl('delete-project-button').addEventListener('click', deleteActiveStory);
storyEl('story-title').addEventListener('input', queueStorySave);
storyEl('story-context').addEventListener('input', queueStorySave);
storyEl('story-composer').addEventListener('submit', sendStoryAnswer);
storyEl('copy-story-output').addEventListener('click', async () => {
  if (!activeStory || !activeStory.output) return;
  await navigator.clipboard.writeText(activeStory.output);
  storyEl('copy-story-output').querySelector('span').textContent = 'Copied';
  setTimeout(() => { storyEl('copy-story-output').querySelector('span').textContent = 'Copy'; }, 1300);
});

EEEStudio.initialize(async context => {
  storyContext = context;
  await loadStoryProjects();
});
