// ── SUPABASE CLIENT ───────────────────────────────────
const _sb = supabase.createClient(
  'https://zdtkwpzdwnzzmdwrvmka.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE'
);

let _currentUser = null;

// ── DEFERRED SAVE QUEUE ───────────────────────────────
const _saveQueue = [];

async function _flushSaveQueue() {
  if (!_currentUser || _saveQueue.length === 0) return;
  const items = [..._saveQueue];
  _saveQueue.length = 0;
  for (const item of items) {
    try {
      if (item.type === 'script')     await saveScriptToDb(item.videoNumber, item.level, item.content);
      else if (item.type === 'progress') await saveVideoProgressToDb(item.videoIndex, item.level, item.status);
      else if (item.type === 'onboarding') await saveOnboardingToDb();
    } catch(e) {}
  }
}

function queueScriptSave(videoNumber, level, content) {
  if (_currentUser) { saveScriptToDb(videoNumber, level, content); }
  else { _saveQueue.push({ type: 'script', videoNumber, level, content }); }
}

function queueProgressSave(videoIndex, level, status) {
  if (_currentUser) { saveVideoProgressToDb(videoIndex, level, status); }
  else { _saveQueue.push({ type: 'progress', videoIndex, level, status }); }
}

function queueOnboardingSave() {
  if (_currentUser) { saveOnboardingToDb(); }
  else { _saveQueue.push({ type: 'onboarding' }); }
}

// ── AUTH STATE ────────────────────────────────────────
_sb.auth.onAuthStateChange(async (event, session) => {
  window._SIS_log && _SIS_log('auth:stateChange', {event, hasSession: !!session, hasUser: !!(session && session.user)});
  if (session && session.user) {
    _currentUser = await _syncUserProfile(session.user);
    window._SIS_log && _SIS_log('auth:synced', {userId: _currentUser ? _currentUser.id : null, level: _currentUser ? _currentUser.level : null});
    await _flushSaveQueue();

    const toast = document.getElementById('verify-email-toast');
    if (toast) toast.style.display = 'none';

    // SIGNED_IN fires when magic link is clicked or on new login
    // INITIAL_SESSION fires when an existing session is restored on page load
    // initAuth handles INITIAL_SESSION — we only act here for SIGNED_IN
    if (event === 'SIGNED_IN') {
      await _restoreFromDatabase();
      // Also pull from localStorage in case DB doesn't have everything yet
      _mergeLocalStorage();
      await _flushSaveQueue(); // flush again after restore
      // Go to dashboard if they have data, otherwise let them continue
      if (state.level && typeof showDashboard === 'function') {
        showDashboard();
      }
    }
  } else {
    _currentUser = null;
  }
});

// ── MERGE LOCALSTORAGE INTO STATE ─────────────────────
function _mergeLocalStorage() {
  try {
    const lsRaw = localStorage.getItem('bwb_challenge_v1');
    if (!lsRaw) return;
    const d = JSON.parse(lsRaw);
    if (d.level   && !state.level)   state.level   = d.level;
    if (d.name    && !state.name)    state.name    = d.name;
    if (d.posted  && !state.posted)  state.posted  = d.posted;
    if (d.blocker && !state.blocker) state.blocker = d.blocker;
    if (d.history && !state.history) state.history = d.history;
    if (d.minigoal && !state.minigoal) state.minigoal = d.minigoal;
    if (d.minigoalText && !state.minigoalText) state.minigoalText = d.minigoalText;
    if (d.business && !state.business) state.business = d.business;
    if (d.goal && !state.goal) state.goal = d.goal;
    if (d.mvoQ2 && !state.mvoQ2) state.mvoQ2 = d.mvoQ2;
    if (d.mvoQ3 && !state.mvoQ3) state.mvoQ3 = d.mvoQ3;
    if (d.mvoQ4 && !state.mvoQ4) state.mvoQ4 = d.mvoQ4;
    if (d.topicFreewrite && !state.topicFreewrite) state.topicFreewrite = d.topicFreewrite;
    if (d.videos && Object.keys(state.videos || {}).length === 0) state.videos = d.videos;
    if (d.videoStatus && Object.keys(state.videoStatus || {}).length === 0) state.videoStatus = d.videoStatus;
  } catch(e) {}
}

// ── USER PROFILE SYNC ─────────────────────────────────
async function _syncUserProfile(authUser) {
  try {
    const { data: existing } = await _sb
      .from('users').select('*').eq('auth_id', authUser.id).single();
    if (existing) {
      await _sb.from('users').update({ last_active: new Date().toISOString() }).eq('id', existing.id);
      return existing;
    }
    const { data: created } = await _sb.from('users').insert({
      auth_id: authUser.id, email: authUser.email,
      name: state.name || null, level: state.level || null,
      blocker: state.blocker || null, is_paid: false
    }).select().single();
    return created;
  } catch(e) { return null; }
}

// ── SEND MAGIC LINK ───────────────────────────────────
async function sendMagicLink(email) {
  const { error } = await _sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: true }
  });
  if (error) {
    if (error.message && (error.message.includes('rate') || error.status === 429))
      throw new Error('Too many attempts — please wait a few minutes before trying again.');
    throw error;
  }
}

async function getCurrentSession() {
  const { data } = await _sb.auth.getSession();
  return data.session;
}

// ── SAVE ONBOARDING TO DB ─────────────────────────────
async function saveOnboardingToDb() {
  if (!_currentUser) return;
  try {
    await _sb.from('users').update({
      name: state.name || null, level: state.level || null,
      blocker: state.blocker || null, business_stage: state.business || null
    }).eq('id', _currentUser.id);

    const { data: existing } = await _sb.from('onboarding').select('id').eq('user_id', _currentUser.id).maybeSingle();
    const onboardingData = {
      user_id: _currentUser.id,
      posted: state.posted || null, history: state.history || null,
      goal: state.goal || null, mini_goal: state.minigoal || null,
      mini_goal_text: state.minigoalText || null, business: state.business || null,
      mvo_q2: state.mvoQ2 || null, mvo_q3: state.mvoQ3 || null, mvo_q4: state.mvoQ4 || null,
      topic_freewrite: state.topicFreewrite || null
    };
    if (existing) { await _sb.from('onboarding').update(onboardingData).eq('id', existing.id); }
    else { await _sb.from('onboarding').insert(onboardingData); }
  } catch(e) {}
}

// ── SAVE SCRIPT TO DB ─────────────────────────────────
async function saveScriptToDb(videoNumber, level, content) {
  if (!_currentUser) return;
  try {
    const { error } = await _sb.from('scripts').insert({
      user_id: _currentUser.id, video_number: videoNumber, level, content
    });
    if (error) console.warn('[SeenInSeven] Script save error:', error.message, error.code);
  } catch(e) { console.warn('[SeenInSeven] Script save exception:', e.message); }
}

// ── SAVE SCRIPT EDIT TO DB ────────────────────────────
async function saveScriptEditToDb(videoNumber, level, content) {
  if (!_currentUser) return;
  try {
    await _sb.from('scripts').update({ content, edited_at: new Date().toISOString() })
      .eq('user_id', _currentUser.id).eq('video_number', videoNumber)
      .eq('level', level).eq('is_current', true);
  } catch(e) {}
}

// ── SAVE THUMBS UP/DOWN ───────────────────────────────
async function saveScriptFeedback(videoNumber, level, thumbsUp) {
  if (!_currentUser) return;
  try {
    await _sb.from('scripts').update({ thumbs_up: thumbsUp })
      .eq('user_id', _currentUser.id).eq('video_number', videoNumber)
      .eq('level', level).eq('is_current', true);
  } catch(e) {}
}

// ── SAVE VIDEO PROGRESS TO DB ─────────────────────────
async function saveVideoProgressToDb(videoIndex, level, status) {
  if (!_currentUser) return;
  try {
    await _sb.from('video_progress').upsert({
      user_id: _currentUser.id, video_index: videoIndex, level, status,
      filmed_at: status === 'filmed' ? new Date().toISOString() : null
    }, { onConflict: 'user_id,video_index,level' });
  } catch(e) {}
}

// ── RESTORE STATE FROM DATABASE ───────────────────────
async function _restoreFromDatabase() {
  window._SIS_log && _SIS_log('restore:start', {hasUser: !!_currentUser});
  if (!_currentUser) return false;
  try {
    const { data: user } = await _sb.from('users').select('*').eq('id', _currentUser.id).single();
    if (!user) return false;

    const { data: onboarding } = await _sb.from('onboarding').select('*').eq('user_id', _currentUser.id).maybeSingle();
    const { data: scripts } = await _sb.from('scripts').select('*').eq('user_id', _currentUser.id).eq('is_current', true).order('video_number');
    const { data: progress } = await _sb.from('video_progress').select('*').eq('user_id', _currentUser.id);

    if (user.name)    state.name    = user.name;
    if (user.level)   state.level   = user.level;
    if (user.blocker) state.blocker = user.blocker;

    if (onboarding) {
      if (onboarding.posted)          state.posted         = onboarding.posted;
      if (onboarding.history)         state.history        = onboarding.history;
      if (onboarding.goal)            state.goal           = onboarding.goal;
      if (onboarding.mini_goal)       state.minigoal       = onboarding.mini_goal;
      if (onboarding.mini_goal_text)  state.minigoalText   = onboarding.mini_goal_text;
      if (onboarding.business)        state.business       = onboarding.business;
      if (onboarding.mvo_q2)          state.mvoQ2          = onboarding.mvo_q2;
      if (onboarding.mvo_q3)          state.mvoQ3          = onboarding.mvo_q3;
      if (onboarding.mvo_q4)          state.mvoQ4          = onboarding.mvo_q4;
      if (onboarding.topic_freewrite) state.topicFreewrite = onboarding.topic_freewrite;
    }

    if (scripts && scripts.length) {
      scripts.forEach(s => { state.videos['script_v' + (s.video_number - 1)] = s.content; });
    }
    if (progress && progress.length) {
      progress.forEach(p => {
        if (p.status === 'filmed' || p.status === 'skipped') state.videoStatus[p.video_index] = p.status;
      });
    }

    saveProgress();
    return !!(user.level || user.name);
  } catch(e) { return false; }
}

// ── UPDATE RETURNING BANNER ───────────────────────────
function _updateReturningBanner() {
  if (!_currentUser) return;
  const banner = document.getElementById('returning-banner');
  const nameEl = document.getElementById('rb-name-display');
  if (!banner || !nameEl) return;
  const displayName = _currentUser.name || state.name || '';
  nameEl.textContent = displayName ? displayName + ' 👋' : '👋';
  banner.classList.add('visible');
}

function userIsPaid() { return _currentUser && _currentUser.is_paid === true; }
function getCurrentUser() { return _currentUser; }

// ── FETCH SCRIPT VERSIONS ─────────────────────────────
async function fetchScriptVersions(videoNumber, level) {
  if (!_currentUser) return [];
  try {
    const { data } = await _sb.from('scripts').select('id, content, version, generated_at, is_current, thumbs_up')
      .eq('user_id', _currentUser.id).eq('video_number', videoNumber).eq('level', level)
      .order('version', { ascending: false });
    return data || [];
  } catch(e) { return []; }
}

// ── RESTORE SCRIPT VERSION ────────────────────────────
async function restoreScriptVersion(scriptId, videoNumber, level, content) {
  if (!_currentUser) return;
  try {
    await _sb.from('scripts').update({ is_current: false })
      .eq('user_id', _currentUser.id).eq('video_number', videoNumber).eq('level', level);
    await _sb.from('scripts').update({ is_current: true }).eq('id', scriptId);
  } catch(e) {}
  state.videos['script_v' + (videoNumber - 1)] = content;
  saveProgress();
}

// ── INIT: CHECK FOR EXISTING SESSION ─────────────────
async function initAuth() {
  window._SIS_log && _SIS_log('initAuth:start', {path: window.location.pathname, hash: window.location.hash.substring(0,30)});
  try {
    const session = await getCurrentSession();
    window._SIS_log && _SIS_log('initAuth:session', {hasSession: !!session, hasUser: !!(session && session.user)});
    if (session && session.user) {
      _currentUser = await _syncUserProfile(session.user);
      window._SIS_log && _SIS_log('initAuth:profile', {level: _currentUser ? _currentUser.level : null, id: _currentUser ? _currentUser.id : null});
      await _restoreFromDatabase();
      _mergeLocalStorage();
      await _flushSaveQueue();

      if (state.level && typeof showDashboard === 'function') {
        if (typeof _dashboardShown !== 'undefined' && _dashboardShown) {
          // Already shown by loadProgress — just refresh
          try { buildPlan(); } catch(e) {}
        } else {
          showDashboard();
        }
        return 'dashboard';
      } else if (_currentUser) {
        _updateReturningBanner();
      }
    }
  } catch(e) {}
  return 'normal';
}
