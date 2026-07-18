const PROMPT_SUPABASE_URL = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const PROMPT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';
const PROMPT_ADMIN_EMAILS = new Set(['email@davidbee.me', 'davidkamau@live.com']);
const PROMPT_DRAFT_KEY = 'sis_prompt_tester_draft_v1';
const promptSb = supabase.createClient(PROMPT_SUPABASE_URL, PROMPT_SUPABASE_KEY);

const promptState = {
  session: null,
  users: [],
  onboarding: [],
  scripts: [],
  publishedSource: '',
  publishedSha: '',
  publishConfigured: false,
  canUndoPublish: false,
  rawOutput: '',
  finalOutput: '',
  showRaw: false,
  draftHistory: [],
  draftEditBase: null,
  draftHistoryTimer: null,
  autosaveTimer: null
};

function promptEl(id) {
  return document.getElementById(id);
}

async function sendAdminLink(event) {
  event.preventDefault();
  const email = promptEl('admin-email').value.trim().toLowerCase();
  const message = promptEl('auth-message');
  if (!PROMPT_ADMIN_EMAILS.has(email)) {
    message.textContent = 'This email does not have administrator access.';
    message.className = 'message error';
    return;
  }
  message.textContent = 'Sending secure link...';
  message.className = 'message';
  const { error } = await promptSb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + '/admin/seeninseven/prompt-tester' }
  });
  message.textContent = error ? error.message : 'Login link sent.';
  message.className = error ? 'message error' : 'message';
}

async function adminLogout() {
  await promptSb.auth.signOut();
  window.location.reload();
}

promptSb.auth.onAuthStateChange((event, session) => {
  if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
  if (!session || !session.user) return;
  const email = String(session.user.email || '').toLowerCase();
  if (!PROMPT_ADMIN_EMAILS.has(email)) {
    promptEl('auth-message').textContent = 'This account does not have administrator access.';
    promptEl('auth-message').className = 'message error';
    return;
  }
  promptState.session = session;
  promptEl('auth-screen').hidden = true;
  promptEl('tester-app').hidden = false;
  promptEl('admin-user-email').textContent = email;
  setTimeout(async () => {
    try {
      const { error } = await promptSb.rpc('provision_admin_account');
      if (error) throw error;
      await initializePromptTester();
    } catch (error) {
      showBanner(error.message || 'The Prompt Tester could not be initialized.', true);
    }
  }, 0);
});

async function rpcData(name) {
  const { data, error } = await promptSb.rpc(name);
  if (error) throw error;
  return data || [];
}

async function initializePromptTester() {
  const [users, onboarding, scripts] = await Promise.all([
    rpcData('admin_get_users'),
    rpcData('admin_get_onboarding'),
    rpcData('admin_get_scripts'),
    loadPublishedBlueprint()
  ]);
  promptState.users = users;
  promptState.onboarding = onboarding;
  promptState.scripts = scripts.filter(script => script.is_current !== false);
  renderUserOptions();
  initializeEditor();
}

async function loadPublishedBlueprint(preserveDraft) {
  const response = await fetch('/api/prompt-blueprint', { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Published blueprint could not be loaded.');
  promptState.publishedSource = data.source || '';
  promptState.publishedSha = data.sha || '';
  promptState.publishConfigured = data.publishConfigured === true;
  promptState.canUndoPublish = data.canUndo === true;
  const commit = data.latestCommit || {};
  promptEl('published-status').textContent = 'Published ' + shortSha(commit.sha || promptState.publishedSha);
  promptEl('published-status').className = 'status-pill ' + (promptState.publishConfigured ? 'ready' : 'warning');
  promptEl('publish-meta').textContent = promptState.publishConfigured
    ? 'GitHub connected. Last change: ' + (commit.message || 'unknown commit').split('\n')[0]
    : 'Testing is ready. Publishing needs the restricted GitHub credential.';
  promptEl('publish-button').disabled = !promptState.publishConfigured;
  promptEl('undo-publish-button').disabled = !promptState.publishConfigured || !promptState.canUndoPublish;
  if (!preserveDraft) promptEl('blueprint-editor').value = promptState.publishedSource;
  return data;
}

function initializeEditor() {
  const editor = promptEl('blueprint-editor');
  const stored = loadStoredDraft();
  if (stored && stored.source && stored.baseSha === promptState.publishedSha) {
    editor.value = stored.source;
    promptEl('autosave-status').textContent = 'Draft restored from this browser';
  } else {
    editor.value = promptState.publishedSource;
    if (stored && stored.source) showBanner('A draft from an older published blueprint was not restored.');
  }
  editor.addEventListener('beforeinput', captureDraftHistoryBase);
  editor.addEventListener('input', handleBlueprintInput);
  updateDraftMeta();
}

function captureDraftHistoryBase() {
  if (promptState.draftEditBase == null) promptState.draftEditBase = promptEl('blueprint-editor').value;
}

function handleBlueprintInput() {
  clearTimeout(promptState.draftHistoryTimer);
  promptState.draftHistoryTimer = setTimeout(() => {
    if (promptState.draftEditBase != null && promptState.draftEditBase !== promptEl('blueprint-editor').value) {
      promptState.draftHistory.push(promptState.draftEditBase);
      if (promptState.draftHistory.length > 50) promptState.draftHistory.shift();
    }
    promptState.draftEditBase = null;
  }, 700);
  clearTimeout(promptState.autosaveTimer);
  promptEl('autosave-status').textContent = 'Saving draft...';
  promptState.autosaveTimer = setTimeout(saveDraft, 450);
  updateDraftMeta();
}

function saveDraft() {
  const payload = {
    source: promptEl('blueprint-editor').value,
    baseSha: promptState.publishedSha,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(PROMPT_DRAFT_KEY, JSON.stringify(payload));
  promptEl('autosave-status').textContent = 'Draft saved in this browser';
}

function loadStoredDraft() {
  try { return JSON.parse(localStorage.getItem(PROMPT_DRAFT_KEY) || 'null'); }
  catch (error) { return null; }
}

function undoDraftEdit() {
  const previous = promptState.draftHistory.pop();
  if (previous == null) {
    showToast('No earlier draft edit available');
    return;
  }
  promptEl('blueprint-editor').value = previous;
  saveDraft();
  updateDraftMeta();
  showToast('Draft edit undone');
}

function restorePublishedDraft() {
  if (promptEl('blueprint-editor').value === promptState.publishedSource) return;
  if (!window.confirm('Restore the currently published blueprint in this editor? Your browser draft will be replaced.')) return;
  promptState.draftHistory.push(promptEl('blueprint-editor').value);
  promptEl('blueprint-editor').value = promptState.publishedSource;
  saveDraft();
  updateDraftMeta();
}

function updateDraftMeta() {
  const source = promptEl('blueprint-editor').value;
  const changed = source !== promptState.publishedSource;
  promptEl('blueprint-count').textContent = source.length.toLocaleString() + ' characters';
  promptEl('draft-meta').textContent = changed ? 'Unpublished browser draft' : 'Matches published blueprint';
}

function renderUserOptions() {
  const select = promptEl('test-user');
  const sorted = promptState.users.slice().sort((a, b) => displayUser(a).localeCompare(displayUser(b)));
  select.innerHTML = '<option value="">Choose a user</option>' + sorted.map(user =>
    '<option value="' + escapeHtml(user.id) + '">' + escapeHtml(displayUser(user)) + ' | L' + escapeHtml(user.level || '?') + '</option>'
  ).join('');
}

function handleUserChange() {
  const user = selectedUser();
  if (user && (Number(user.level) === 1 || Number(user.level) === 2)) promptEl('test-level').value = String(user.level);
  refreshTestMessage();
}

function selectedUser() {
  const id = promptEl('test-user').value;
  return promptState.users.find(user => String(user.id) === id) || null;
}

function selectedOnboarding(userId) {
  return promptState.onboarding.find(row => String(row.user_id) === String(userId)) || null;
}

function getPhase2(ob) {
  return ob && ob.phase2_context && typeof ob.phase2_context === 'object' ? ob.phase2_context : {};
}

function refreshTestMessage() {
  const user = selectedUser();
  if (!user) {
    promptEl('user-message-editor').value = '';
    promptEl('user-data-meta').textContent = 'Select a user';
    return;
  }
  const video = Number(promptEl('test-video').value || 1);
  const level = Number(promptEl('test-level').value || user.level || 1);
  const ob = selectedOnboarding(user.id);
  promptEl('user-message-editor').value = buildTestUserMessage(user, ob, video, level);
  promptEl('user-data-meta').textContent = displayUser(user) + ' | Video ' + video + ' | Level ' + level;
}

function buildTestUserMessage(user, ob, video, level) {
  const p2 = getPhase2(ob);
  const lines = [
    '- Name: ' + (user.name || '(not provided)'),
    '- Posting experience: ' + valueText(ob && ob.posted || user.posted || '(not provided)'),
    '- Posting history: ' + valueText(ob && ob.history || '(not provided)'),
    '- Blocker: ' + valueText((p2.custom && p2.custom.blocker) || user.blocker || (ob && ob.blocker) || '(not provided)'),
    '- Business stage: ' + valueText(ob && ob.business || user.business_stage || '(not provided)'),
    '- Content intent: ' + valueText(p2.contentIntentTitle || p2.contentIntent || '(not provided)'),
    '- Audience context: ' + valueText(p2.audienceContext || '(not provided)'),
    '- Desired audience reaction: ' + valueText(p2.messageContext || '(not provided)'),
    '- Extra first-script notes: ' + valueText(p2.firstScriptNotes || '(not provided)'),
    '- Commitment: ' + valueText(p2.commitmentDeclaration || (ob && ob.commitment_declaration) || '(not provided)'),
    '- Topic / what they want to talk about: ' + valueText(ob && ob.topic_freewrite || '(not provided)'),
    '- Pasted context / knowledge base: ' + valueText(p2.knowledgeContext || '(not provided)')
  ];
  let message = 'Generate Video ' + video + ' script.\n\nLEVEL: ' + level + '\nVIDEO: ' + video + '\n\nONBOARDING DATA:\n' + lines.join('\n');
  if (video === 1) {
    const name = user.name || '(name not provided)';
    const declaration = level === 1
      ? 'Hi, my name is ' + name + ". I never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me... some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of."
      : "For those of you who don't know me yet, my name is " + name + ". I kinda never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me, some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of. I'm specifically doing this 7 Video Challenge because I have to share my knowledge, my experience, and my lived reality for the specific people I want to help before the world changes forever and I won't have the chance. These 7 videos are how I'm establishing myself as a credible voice in my field, but I'm scared, I'm frustrated, I don't know how it's going to go, but I'm committed to finishing.";
    const stopped = level === 1 ? valueText(ob && ob.mvo_q2) : valueText(ob && ob.mvo_q3);
    const whyNow = level === 1 ? valueText(ob && ob.mvo_q3) : valueText(ob && ob.mvo_q4);
    const who = level === 1 ? valueText(ob && ob.mvo_q4) : valueText(ob && ob.mvo_q2);
    message += '\n\nVIDEO 1 PREFILLED PROMPTS (read-only database copy; edits here are test-only):\n';
    message += '1. Opening declaration (read-only): ' + declaration + '\n';
    message += "2. What's been stopping you from posting until now: " + (stopped || '(not provided)') + '\n';
    message += "3. Why you're doing this challenge right now: " + (whyNow || '(not provided)') + '\n';
    message += "4. Who you're here to reach: " + (who || '(not provided)') + '\n';
    message += '5. Anything else they want to add: ' + valueText(p2.firstScriptNotes || '(not provided)');
    return message;
  }
  const previous = promptState.scripts
    .filter(script => String(script.user_id) === String(user.id) && Number(script.video_number) < video)
    .sort((a, b) => Number(a.video_number) - Number(b.video_number));
  if (previous.length) {
    message += '\n\nPREVIOUS SAVED SCRIPTS:\n\n' + previous.map(script =>
      'Video ' + script.video_number + ':\n' + valueText(script.content || script.script)
    ).join('\n\n---\n\n');
  }
  const current = promptState.scripts.find(script => String(script.user_id) === String(user.id) && Number(script.video_number) === video);
  message += '\n\nCURRENT VIDEO ' + video + ' JOURNAL ENTRY (replace or expand this test-only copy as needed):\n';
  message += current ? 'Use this saved script as source material for a fresh version:\n' + valueText(current.content || current.script) : '[Paste the journal answer for this test here]';
  return message;
}

async function generateTest() {
  const user = selectedUser();
  if (!user) return showBanner('Choose a test user first.', true);
  const source = promptEl('blueprint-editor').value;
  const errors = validateBlueprint(source);
  if (errors.length) return showBanner(errors.join(' '), true);
  const systemPrompt = extractSystemPrompt(source);
  const userMessage = promptEl('user-message-editor').value.trim();
  if (!userMessage) return showBanner('The test user message is empty.', true);
  const button = promptEl('generate-button');
  button.disabled = true;
  button.textContent = 'Generating...';
  promptEl('result-meta').textContent = 'DeepSeek is writing a test. Nothing will be saved to the user.';
  promptEl('test-output').textContent = 'Generating test output...';
  promptEl('test-output').className = 'test-output empty-output';
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemMsg: systemPrompt, userMsg: userMessage })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Test generation failed.');
    const raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!raw) throw new Error('The AI returned an empty test.');
    promptState.rawOutput = raw.trim();
    promptState.finalOutput = buildFinalOutput(raw.trim(), Number(promptEl('test-video').value), Number(promptEl('test-level').value), user);
    promptState.showRaw = false;
    renderTestOutput();
    promptEl('result-meta').textContent = 'Generated ' + new Date().toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) + ' | Read-only test';
    showBanner('Test generated. No user data or saved script was changed.');
  } catch (error) {
    promptEl('test-output').textContent = error.message || 'Test generation failed.';
    promptEl('test-output').className = 'test-output empty-output';
    promptEl('result-meta').textContent = 'Test failed';
    showBanner(error.message || 'Test generation failed.', true);
  } finally {
    button.disabled = false;
    button.textContent = 'Generate Test';
  }
}

function buildFinalOutput(raw, video, level, user) {
  if (video !== 1) return raw.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
  const sections = parseSections(raw);
  if (!sections || !sections['OPEN LOOP'] || !sections.MEAT) return raw;
  const name = user.name || '(name not provided)';
  const declaration = level === 1
    ? 'Hi, my name is ' + name + ". I never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me... some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of."
    : "For those of you who don't know me yet, my name is " + name + ". I kinda never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me, some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of. I'm specifically doing this 7 Video Challenge because I have to share my knowledge, my experience, and my lived reality for the specific people I want to help before the world changes forever and I won't have the chance. These 7 videos are how I'm establishing myself as a credible voice in my field, but I'm scared, I'm frustrated, I don't know how it's going to go, but I'm committed to finishing.";
  return [sections.HOOK, sections['OPEN LOOP'], declaration, sections.MEAT, sections.CTA].filter(Boolean).join('\n\n');
}

function parseSections(text) {
  const sections = { HOOK:'', 'OPEN LOOP':'', MEAT:'', CTA:'' };
  const pattern = /\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*([\s\S]*?)(?=\n\s*\[(?:HOOK|OPEN LOOP|MEAT|CTA)\]|$)/g;
  let match;
  while ((match = pattern.exec(text))) sections[match[1]] = match[2].trim();
  return Object.values(sections).some(Boolean) ? sections : null;
}

function renderTestOutput() {
  const output = promptState.showRaw ? promptState.rawOutput : promptState.finalOutput;
  promptEl('test-output').textContent = output || 'No test generated.';
  promptEl('test-output').className = 'test-output' + (promptState.showRaw ? ' raw' : '');
}

function toggleRawOutput() {
  if (!promptState.rawOutput) return;
  promptState.showRaw = !promptState.showRaw;
  renderTestOutput();
}

async function copyTestOutput() {
  const output = promptState.showRaw ? promptState.rawOutput : promptState.finalOutput;
  if (!output) return showToast('No test output to copy');
  await navigator.clipboard.writeText(output);
  showToast('Test output copied');
}

function extractSystemPrompt(source) {
  const prefix = 'const SYSTEM_PROMPT = `';
  const start = source.indexOf(prefix);
  const end = source.lastIndexOf('`;');
  return start === 0 && end > prefix.length ? source.slice(prefix.length, end) : '';
}

function validateBlueprint(source) {
  const errors = [];
  if (source.length < 10000 || source.length > 200000) errors.push('Blueprint length is outside the expected range.');
  if (!/^const SYSTEM_PROMPT = `[^]*`;\s*$/.test(source)) errors.push('The file must contain only the SYSTEM_PROMPT template.');
  if ((source.match(/`/g) || []).length !== 2) errors.push('Backticks are not allowed inside the prompt text.');
  if (source.includes('${')) errors.push('JavaScript interpolation syntax is not allowed inside the prompt text.');
  ['<core_rules>', '<level_context>', '<video_1_blueprint>', '<video_2_blueprint>', '<video_3_blueprint>', '<video_4_blueprint>', '<video_5_blueprint>', '<video_6_blueprint>', '<video_7_blueprint>', '<script_generation_instructions>', '<quality_standards>', '[HOOK]', '[OPEN LOOP]', '[MEAT]', '[CTA]'].forEach(marker => {
    if (!source.includes(marker)) errors.push('Missing ' + marker + '.');
  });
  return errors;
}

function openPublishReview() {
  const source = promptEl('blueprint-editor').value;
  const errors = validateBlueprint(source);
  const validation = promptEl('validation-summary');
  validation.textContent = errors.length ? errors.join('\n') : 'Blueprint structure passed all required checks.';
  validation.className = 'validation-summary' + (errors.length ? ' error' : '');
  promptEl('change-summary').textContent = describeChanges(promptState.publishedSource, source);
  promptEl('review-confirmed').checked = false;
  promptEl('continue-confirm-button').disabled = true;
  promptEl('continue-confirm-button').dataset.valid = errors.length ? 'false' : 'true';
  promptEl('confirm-step-one').hidden = false;
  promptEl('confirm-step-two').hidden = true;
  promptEl('publish-modal').hidden = false;
}

function describeChanges(before, after) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const changed = [];
  const total = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < total; index++) {
    if (beforeLines[index] !== afterLines[index]) changed.push(index + 1);
  }
  if (!changed.length) return 'No differences from the currently published blueprint.';
  const preview = changed.slice(0, 12).join(', ') + (changed.length > 12 ? ', ...' : '');
  return changed.length + ' changed line' + (changed.length === 1 ? '' : 's') + '\nChanged line numbers: ' + preview + '\nCharacter change: ' + signedNumber(after.length - before.length);
}

function updateFirstConfirmation() {
  const valid = promptEl('continue-confirm-button').dataset.valid === 'true';
  promptEl('continue-confirm-button').disabled = !valid || !promptEl('review-confirmed').checked || promptEl('blueprint-editor').value === promptState.publishedSource;
}

function showFinalConfirmation() {
  promptEl('confirm-step-one').hidden = true;
  promptEl('confirm-step-two').hidden = false;
  promptEl('publish-phrase').value = '';
  promptEl('apply-blueprint-button').disabled = true;
  promptEl('publish-phrase').focus();
}

function backToPublishReview() {
  promptEl('confirm-step-two').hidden = true;
  promptEl('confirm-step-one').hidden = false;
}

function updateFinalConfirmation() {
  promptEl('apply-blueprint-button').disabled = promptEl('publish-phrase').value !== 'APPLY BLUEPRINT';
}

function closePublishModal() {
  promptEl('publish-modal').hidden = true;
}

async function publishBlueprint() {
  const button = promptEl('apply-blueprint-button');
  button.disabled = true;
  button.textContent = 'Applying...';
  try {
    const data = await promptApi({
      action: 'publish',
      source: promptEl('blueprint-editor').value,
      expectedSha: promptState.publishedSha,
      reviewConfirmed: promptEl('review-confirmed').checked,
      confirmation: promptEl('publish-phrase').value
    });
    closePublishModal();
    showBanner(data.message || 'Blueprint committed.');
    localStorage.removeItem(PROMPT_DRAFT_KEY);
    await loadPublishedBlueprint(true);
    promptState.publishedSource = promptEl('blueprint-editor').value;
    updateDraftMeta();
  } catch (error) {
    showBanner(error.message || 'Blueprint could not be published.', true);
  } finally {
    button.textContent = 'Apply Blueprint';
    updateFinalConfirmation();
  }
}

async function requestPublishUndo() {
  if (!window.confirm('Restore the blueprint version from immediately before the last Prompt Tester publish? This creates a new reversal commit.')) return;
  const button = promptEl('undo-publish-button');
  button.disabled = true;
  button.textContent = 'Undoing...';
  try {
    const data = await promptApi({ action:'undo', expectedSha:promptState.publishedSha, confirmation:'UNDO BLUEPRINT' });
    showBanner(data.message || 'Previous blueprint restored.');
    localStorage.removeItem(PROMPT_DRAFT_KEY);
    await loadPublishedBlueprint(false);
    promptEl('blueprint-editor').value = promptState.publishedSource;
    updateDraftMeta();
  } catch (error) {
    showBanner(error.message || 'The last publish could not be undone.', true);
  } finally {
    button.textContent = 'Undo Last Publish';
    button.disabled = !promptState.publishConfigured || !promptState.canUndoPublish;
  }
}

async function promptApi(body) {
  const { data: sessionData } = await promptSb.auth.getSession();
  const token = sessionData && sessionData.session && sessionData.session.access_token;
  if (!token) throw new Error('Your admin session expired. Sign in again.');
  const response = await fetch('/api/prompt-blueprint', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token },
    body:JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Prompt blueprint request failed.');
  return data;
}

function displayUser(user) {
  return user.name || user.email || ('User ' + String(user.id || '').slice(0, 8));
}

function valueText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'object') return value.before_full || value.catalyst_full || value.village_full || value.crack_full || value.text || JSON.stringify(value);
  return String(value);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shortSha(value) {
  return value ? String(value).slice(0, 7) : 'unknown';
}

function signedNumber(value) {
  return value > 0 ? '+' + value : String(value);
}

function showBanner(message, isError) {
  const banner = promptEl('page-message');
  banner.textContent = message;
  banner.className = 'banner' + (isError ? ' error' : '');
  banner.hidden = false;
}

function showToast(message) {
  const toast = promptEl('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}
