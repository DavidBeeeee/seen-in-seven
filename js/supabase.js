// ── SUPABASE CLIENT ───────────────────────────────────
const _sb = supabase.createClient(
  'https://zdtkwpzdwnzzmdwrvmka.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE'
);

let _currentUser = null;
const PREAUTH_SESSION_KEY = 'sis_preauth_session_v1';

function getPreauthSessionId() {
  try {
    let id = localStorage.getItem(PREAUTH_SESSION_KEY);
    if (!id) {
      const rand = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'anon-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      id = 'sis-' + rand;
      localStorage.setItem(PREAUTH_SESSION_KEY, id);
    }
    return id;
  } catch(e) {
    return 'sis-memory-' + Date.now().toString(36);
  }
}

function preauthSnapshot(eventType) {
  if (typeof state === 'undefined') return {};
  const p2 = typeof ensurePhase2 === 'function' ? ensurePhase2() : (state.phase2 || {});
  const base = {
    name: state.name || '',
    level: state.level || null,
    posted: state.posted || null,
    blocker: state.blocker || null,
    history: state.history || null,
    business: state.business || null,
    goal: state.goal || null,
    mini_goal: state.minigoal || null,
    mini_goal_text: state.minigoalText || '',
    content_intent: p2.contentIntentTitle || p2.contentIntent || null,
    auth_mode: typeof authScreenMode !== 'undefined' ? authScreenMode : null
  };
  if (eventType === 'onboarding_completed') {
    base.onboarding_snapshot = {
      name: state.name || '',
      level: state.level || null,
      posted: state.posted || null,
      blocker: state.blocker || null,
      history: state.history || null,
      business: state.business || null,
      goal: state.goal || null,
      mini_goal: state.minigoal || null,
      mini_goal_text: state.minigoalText || '',
      topic_freewrite: state.topicFreewrite || '',
      mvo_q2: state.mvoQ2 || null,
      mvo_q3: state.mvoQ3 || null,
      mvo_q4: state.mvoQ4 || null,
      phase2: p2
    };
  }
  return base;
}

async function recordPreauthEvent(eventType, detail = {}) {
  try {
    const merged = Object.assign({}, preauthSnapshot(eventType), detail || {});
    await _sb.rpc('record_preauth_event', {
      p_anon_session_id: getPreauthSessionId(),
      p_event_type: eventType,
      p_detail: merged,
      p_email: merged.email || null,
      p_page_path: window.location.pathname + window.location.search,
      p_user_agent: navigator.userAgent || ''
    });
  } catch(e) {
    // Pre-auth visibility is useful, but it should never block the app.
  }
}

// ── DEFERRED SAVE QUEUE ───────────────────────────────
const _saveQueue = [];

async function _flushSaveQueue() {
  if (!_currentUser || _saveQueue.length === 0) return;
  const items = [..._saveQueue];
  _saveQueue.length = 0;
  for (const item of items) {
    try {
      if (item.type === 'script')     await saveScriptToDb(item.videoNumber, item.level, item.content, item.finalContent, item.promptVersion);
      else if (item.type === 'progress') await saveVideoProgressToDb(item.videoIndex, item.level, item.status);
      else if (item.type === 'onboarding') await saveOnboardingToDb();
      else if (item.type === 'lock')   await saveVideoLockToDb(item.videoIndex, item.level);
      else if (item.type === 'posted') await savePostedToDb(item.videoIndex, item.level, item.posted, item.postUrl);
    } catch(e) {}
  }
}

function queueScriptSave(videoNumber, level, content, finalContent, promptVersion) {
  if (_currentUser) { saveScriptToDb(videoNumber, level, content, finalContent, promptVersion); }
  else { _saveQueue.push({ type: 'script', videoNumber, level, content, finalContent, promptVersion }); }
}

function queueProgressSave(videoIndex, level, status) {
  if (_currentUser) { saveVideoProgressToDb(videoIndex, level, status); }
  else { _saveQueue.push({ type: 'progress', videoIndex, level, status }); }
}

function queueOnboardingSave() {
  if (_currentUser) { saveOnboardingToDb(); }
  else { _saveQueue.push({ type: 'onboarding' }); }
}

function queueLockSave(videoIndex, level) {
  if (_currentUser) { saveVideoLockToDb(videoIndex, level); }
  else { _saveQueue.push({ type: 'lock', videoIndex, level }); }
}

function queuePostedSave(videoIndex, level, posted, postUrl) {
  if (_currentUser) { savePostedToDb(videoIndex, level, posted, postUrl); }
  else { _saveQueue.push({ type: 'posted', videoIndex, level, posted, postUrl }); }
}

// ── AUTH STATE ────────────────────────────────────────
// Track page load time to distinguish initial auth from token refreshes
const _pageLoadTime = Date.now();

_sb.auth.onAuthStateChange((event, session) => {
  window._SIS_log && _SIS_log('auth:stateChange', {event, hasSession: !!session, hasUser: !!(session && session.user)});
  if (session && session.user) {
    const u = session.user;
    setTimeout(async () => {
      try {
        _currentUser = await _syncUserProfile(u);
        window._SIS_log && _SIS_log('auth:synced', {userId: _currentUser ? _currentUser.id : null, level: _currentUser ? _currentUser.level : null});
        await _flushSaveQueue();
        try { await _sb.rpc('attach_preauth_session', { p_anon_session_id: getPreauthSessionId() }); } catch(e) {}

        const toast = document.getElementById('verify-email-toast');
        if (toast) toast.style.display = 'none';
        const navEl = document.getElementById('header-nav');
        if (navEl) navEl.style.display = 'flex';

        if (event === 'SIGNED_IN') {
          // Only route to dashboard if this is from the initial page load (within 8 seconds)
          // or if the user is currently on screen-0 (not mid-flow)
          const isInitialLoad = (Date.now() - _pageLoadTime) < 8000;
          const screen0 = document.getElementById('screen-0');
          const onScreen0 = screen0 && screen0.classList.contains('active');
          const planScreen = document.getElementById('plan-screen');
          const onDashboard = planScreen && planScreen.classList.contains('active');
          const emailScreen = document.getElementById('screen-email');
          const onEmailScreen = emailScreen && emailScreen.classList.contains('active');

          if (!isInitialLoad && !onScreen0 && !onDashboard && !onEmailScreen) {
            // Token refresh mid-flow — just update auth state silently, don't interrupt the user
            window._SIS_log && _SIS_log('auth:token-refresh-mid-flow', 'skipping navigation');
            await _restoreFromDatabase();
            await _flushSaveQueue();
            return;
          }

          // Clear any previous user's localStorage before restoring the new session
          try { localStorage.removeItem('bwb_challenge_v1'); } catch(e) {}
          const banner = document.getElementById('returning-banner');
          if (banner) banner.classList.remove('visible');
          await _restoreFromDatabase();
          _mergeLocalStorage();
          await _flushSaveQueue();
          _syncPointsStateToDb();
          fetchPointsConfig();
          window._SIS_log && _SIS_log('auth:after-restore', {level: state.level, name: state.name});
          if (typeof logEvent === 'function') logEvent('auth_completed', {level: state.level});
          if (typeof _dashboardShown !== 'undefined') _dashboardShown = false;
          if (state.level && typeof showDashboard === 'function') {
            showDashboard();
          } else {
            window._SIS_log && _SIS_log('auth:no-dashboard', {level: state.level});
            if (typeof showScreen === 'function') showScreen('screen-0');
          }
        }
      } catch(e) {
        console.error('[SeenInSeven] onAuthStateChange handler error: ' + e.message);
      }
    }, 0);
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
    if (d.phase2) state.phase2 = Object.assign({}, state.phase2 || {}, d.phase2);
    if (typeof ensurePhase2 === 'function') ensurePhase2();
    if (d.topicFreewrite && !state.topicFreewrite) state.topicFreewrite = d.topicFreewrite;
    if (d.videoAnswersByLevel) {
      state.videoAnswersByLevel = Object.assign({}, d.videoAnswersByLevel, state.videoAnswersByLevel || {});
    }
    // Merge videos additively — DB scripts take priority,
    // but localStorage-only keys (locked_v*, _undo_v*, v0p*, etc.) are preserved
    if (d.videos) {
      if (!state.videos) state.videos = {};
      Object.keys(d.videos).forEach(k => {
        // Don't overwrite DB-sourced scripts, but keep all other video state
        if (k.startsWith('script_v') && state.videos[k]) return;
        state.videos[k] = d.videos[k];
      });
    }
    if (d.videoStatus && Object.keys(state.videoStatus || {}).length === 0) state.videoStatus = d.videoStatus;
    if (d.l1Videos) state.l1Videos = d.l1Videos;
    if (d.l1VideoStatus) state.l1VideoStatus = d.l1VideoStatus;
    // Points state — merge additively, DB-restored entries win
    if (d.videoPosted) {
      state.videoPosted = Object.assign({}, d.videoPosted, state.videoPosted || {});
    }
    if (d.engage) {
      state.engage = Object.assign({}, d.engage, state.engage || {});
    }
  } catch(e) {}
}

// ── USER PROFILE SYNC ─────────────────────────────────
async function _syncUserProfile(authUser) {
  try {
    window._SIS_log && _SIS_log('sync:start', {authId: authUser.id});
    const { data: existing, error: selErr } = await _sb
      .from('users').select('*').eq('auth_id', authUser.id).maybeSingle();
    if (selErr) { window._SIS_log && _SIS_log('sync:selErr', selErr.message); }

    if (existing) {
      window._SIS_log && _SIS_log('sync:found', {id: existing.id, level: existing.level});
      _sb.from('users').update({ last_active: new Date().toISOString() }).eq('id', existing.id).then(()=>{});
      return existing;
    }

    window._SIS_log && _SIS_log('sync:creating', {});
    const { data: created, error: insErr } = await _sb.from('users').insert({
      auth_id: authUser.id, email: authUser.email,
      name: state.name || null, level: state.level || null,
      blocker: state.blocker || null, is_paid: false
    }).select().maybeSingle();
    if (insErr) {
      window._SIS_log && _SIS_log('sync:insErr', insErr.message);
      // Race: another call may have inserted it — fetch again
      const { data: retry } = await _sb.from('users').select('*').eq('auth_id', authUser.id).maybeSingle();
      return retry || null;
    }
    window._SIS_log && _SIS_log('sync:created', {id: created ? created.id : null});
    return created;
  } catch(e) {
    window._SIS_log && _SIS_log('sync:exception', e.message);
    return null;
  }
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

async function signInWithPassword(email, password) {
  const { error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('invalid email or password'))
      throw new Error('Wrong email or password. Try again, or use a magic link instead.');
    if (msg.includes('email not confirmed'))
      throw new Error('Please confirm your email address first. Check your inbox for a confirmation link.');
    if (msg.includes('rate') || error.status === 429)
      throw new Error('Too many attempts — please wait a few minutes before trying again.');
    throw new Error('Sign in failed. Please try a magic link instead.');
  }
}

async function setUserPassword(newPassword) {
  const { error } = await _sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

async function getCurrentSession() {
  const { data } = await _sb.auth.getSession();
  return data.session;
}

// ── SAVE ONBOARDING TO DB ─────────────────────────────
async function saveOnboardingToDb() {
  if (!_currentUser) return;
  try {
    // Update the users table
    const { error: userErr } = await _sb.from('users').update({
      name:           state.name     || null,
      level:          state.level    || null,
      blocker:        state.blocker  || null,
      business_stage: state.business || null
    }).eq('id', _currentUser.id);
    if (userErr) console.warn('[SeenInSeven] saveOnboardingToDb users error:', userErr.message);

    // Upsert onboarding — unique constraint on user_id prevents duplicates.
    // phase2_context is attempted when the schema supports it, then gracefully
    // retried without it for older databases.
    const baseOnboarding = {
      user_id:          _currentUser.id,
      posted:           state.posted         || null,
      history:          state.history        || null,
      goal:             state.goal           || null,
      mini_goal:        state.minigoal       || null,
      mini_goal_text:   state.minigoalText   || null,
      business:         state.business       || null,
      mvo_q2:           state.mvoQ2          || null,
      mvo_q3:           state.mvoQ3          || null,
      mvo_q4:           state.mvoQ4          || null,
      topic_freewrite:  state.topicFreewrite || null,
      updated_at:       new Date().toISOString()
    };
    const phase2Context = typeof ensurePhase2 === 'function' ? ensurePhase2() : (state.phase2 || null);
    const videoAnswers = typeof captureVideoAnswersByLevel === 'function'
      ? captureVideoAnswersByLevel()
      : (state.videoAnswersByLevel || {});
    const richOnboarding = Object.assign({}, baseOnboarding, {
      phase2_context: phase2Context,
      mission_statement: phase2Context && phase2Context.missionStatement ? phase2Context.missionStatement : null,
      mission_generated_at: phase2Context && phase2Context.missionGeneratedAt ? phase2Context.missionGeneratedAt : null,
      commitment_declaration: phase2Context && phase2Context.commitmentDeclaration ? phase2Context.commitmentDeclaration : null,
      commitment_reasons: phase2Context && Array.isArray(phase2Context.commitmentReasons) ? phase2Context.commitmentReasons : [],
      video_answers: videoAnswers
    });
    let { error: obErr } = await _sb.from('onboarding').upsert(richOnboarding, { onConflict: 'user_id' });
    if (obErr && obErr.message && /video_answers/i.test(obErr.message)) {
      const withoutVideoAnswers = Object.assign({}, richOnboarding);
      delete withoutVideoAnswers.video_answers;
      const retry = await _sb.from('onboarding').upsert(withoutVideoAnswers, { onConflict: 'user_id' });
      obErr = retry.error;
    }
    if (obErr && obErr.message && /phase2_context|mission_statement|mission_generated_at|commitment_declaration|commitment_reasons/i.test(obErr.message)) {
      const baseRetry = await _sb.from('onboarding').upsert(baseOnboarding, { onConflict: 'user_id' });
      obErr = baseRetry.error;
    }
    if (obErr) console.warn('[SeenInSeven] saveOnboardingToDb onboarding error:', obErr.message);
  } catch(e) {
    console.warn('[SeenInSeven] saveOnboardingToDb exception:', e.message);
  }
}

// ── SAVE SCRIPT TO DB ─────────────────────────────────
async function saveScriptToDb(videoNumber, level, content, finalContent, promptVersion) {
  if (!_currentUser) return;
  try {
    const { error } = await _sb.from('scripts').insert({
      user_id: _currentUser.id,
      video_number: videoNumber,
      level,
      content,
      final_content: finalContent || content,
      prompt_version: promptVersion || null
    });
    if (error) console.warn('[SeenInSeven] Script save error:', error.message, error.code);
  } catch(e) { console.warn('[SeenInSeven] Script save exception:', e.message); }
}

// ── SAVE SCRIPT EDIT TO DB ────────────────────────────
async function saveScriptEditToDb(videoNumber, level, content, finalContent) {
  if (!_currentUser) return;
  try {
    await _sb.from('scripts').update({ content, final_content: finalContent || content, edited_at: new Date().toISOString() })
      .eq('user_id', _currentUser.id).eq('video_number', videoNumber)
      .eq('level', level).eq('is_current', true);
  } catch(e) {}
}

async function clearCurrentScriptForRegeneration(videoNumber, level) {
  if (!_currentUser) return;
  try {
    await _sb.from('scripts').update({ is_current: false })
      .eq('user_id', _currentUser.id)
      .eq('video_number', videoNumber)
      .eq('level', level)
      .eq('is_current', true);
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

// ── SAVE LOCK STATE TO DB (points: first lock per video) ──────────────
// Upsert touches only its own columns, so it never clobbers status/posted
// on an existing row. locked_at is set once and never cleared — matching
// the points rule that only the FIRST lock per video counts.
async function saveVideoLockToDb(videoIndex, level) {
  if (!_currentUser) return;
  try {
    await _sb.from('video_progress').upsert({
      user_id: _currentUser.id, video_index: videoIndex, level,
      locked_at: new Date().toISOString()
    }, { onConflict: 'user_id,video_index,level' });
  } catch(e) {}
}

// ── SAVE POSTED STATE TO DB (points: posted + optional URL bonus) ─────
async function savePostedToDb(videoIndex, level, posted, postUrl) {
  if (!_currentUser) return;
  try {
    await _sb.from('video_progress').upsert({
      user_id: _currentUser.id, video_index: videoIndex, level,
      posted: !!posted,
      posted_at: posted ? new Date().toISOString() : null,
      post_url: (postUrl || '').trim().slice(0, 500) || null
    }, { onConflict: 'user_id,video_index,level' });
  } catch(e) {}
}

// ── FETCH TUNABLE POINTS CONFIG ───────────────────────
// points_config is world-readable by design (cosmetic values). Called
// post-auth and on load; anonymous/offline users fall back to the
// baked-in POINTS_RULES in js/points.js.
async function fetchPointsConfig() {
  try {
    const { data } = await _sb.from('points_config').select('version, rules').eq('id', 1).maybeSingle();
    if (data && data.rules && typeof applyPointsConfig === 'function') {
      applyPointsConfig(data.rules, data.version);
    }
  } catch(e) {}
}

// ── RECONCILE LOCAL POINTS STATE TO DB ────────────────
// Pushes lock/posted state that only exists locally (earned while
// anonymous in an earlier session, so it never went through the save
// queue) up to video_progress. Skips indexes the DB already knows
// (tracked during _restoreFromDatabase) so original timestamps survive.
// Idempotent; points rules are booleans per video, so nothing inflates.
const _dbLockedIdx = new Set();
const _dbPostedIdx = new Set();

async function _syncPointsStateToDb() {
  if (!_currentUser) return;
  const level = state.level || 1;
  try {
    for (let i = 0; i < 7; i++) {
      if (state.videos && state.videos['locked_v' + i] && !_dbLockedIdx.has(i)) {
        await saveVideoLockToDb(i, level);
        _dbLockedIdx.add(i);
      }
      const p = state.videoPosted && state.videoPosted[i];
      if (p && (p.posted || p.url) && !_dbPostedIdx.has(i)) {
        await savePostedToDb(i, level, p.posted, p.url);
        _dbPostedIdx.add(i);
      }
    }
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
    if (user.name)    state.name    = user.name;
    if (user.level)   state.level   = user.level;
    if (user.blocker) state.blocker = user.blocker;
    const activeLevel = user.level || state.level || 1;
    const { data: scripts } = await _sb.from('scripts').select('*').eq('user_id', _currentUser.id).eq('is_current', true).eq('level', activeLevel).order('video_number');
    const { data: progress } = await _sb.from('video_progress').select('*').eq('user_id', _currentUser.id).eq('level', activeLevel);

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
      if (onboarding.video_answers && typeof onboarding.video_answers === 'object') {
        state.videoAnswersByLevel = onboarding.video_answers;
        const savedAnswers = onboarding.video_answers[String(activeLevel)];
        if (savedAnswers && typeof savedAnswers === 'object') {
          Object.keys(savedAnswers).forEach(key => {
            if (state.videos[key] == null || state.videos[key] === '') state.videos[key] = savedAnswers[key];
          });
        }
      }
      if (onboarding.phase2_context)  state.phase2         = onboarding.phase2_context;
      if (typeof ensurePhase2 === 'function') ensurePhase2();
      if (onboarding.mission_statement) {
        state.phase2.missionStatement = onboarding.mission_statement;
        state.phase2.missionGeneratedAt = onboarding.mission_generated_at || state.phase2.missionGeneratedAt || '';
      }
      if (onboarding.commitment_declaration) state.phase2.commitmentDeclaration = onboarding.commitment_declaration;
      if (Array.isArray(onboarding.commitment_reasons)) state.phase2.commitmentReasons = onboarding.commitment_reasons;
    }

    if (scripts && scripts.length) {
      scripts.forEach(s => {
        const index = s.video_number - 1;
        state.videos['script_v' + index] = s.content;
        if (s.prompt_version) state.videos['prompt_version_v' + index] = s.prompt_version;
      });
    }
    if (progress && progress.length) {
      progress.forEach(p => {
        if (p.status === 'filmed' || p.status === 'skipped') state.videoStatus[p.video_index] = p.status;
        // Points state: locked + posted live on the same rows. Remember which
        // indexes the DB already knows so _syncPointsStateToDb only pushes
        // genuinely local-only state (preserves original timestamps).
        if (p.locked_at) {
          state.videos['locked_v' + p.video_index] = true;
          _dbLockedIdx.add(p.video_index);
        }
        if (p.posted || p.post_url) {
          if (!state.videoPosted) state.videoPosted = {};
          state.videoPosted[p.video_index] = { posted: !!p.posted, url: p.post_url || '' };
          _dbPostedIdx.add(p.video_index);
        }
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
    const { data } = await _sb.from('scripts').select('id, content, final_content, prompt_version, version, generated_at, is_current, thumbs_up')
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

async function deleteScriptVersion(scriptId) {
  if (!_currentUser) return false;
  try {
    const { data } = await _sb.from('scripts').select('is_current').eq('id', scriptId).single();
    if (data && data.is_current) return false;
    await _sb.from('scripts').delete().eq('id', scriptId).eq('user_id', _currentUser.id);
    return true;
  } catch(e) { return false; }
}

// ── EVENT LOGGING ─────────────────────────────────────
// Call this at key moments to write a row to the logs table.
// Events include: 'app_loaded', 'onboarding_started', 'email_submitted',
// 'magic_link_requested', 'auth_skipped', 'onboarding_completed',
// 'topic_freewrite_saved', 'mvo_completed', 'prompt_screen_viewed',
// 'script_generation_started', 'script_generated', 'script_failed',
// 'template_fallback_used', 'script_copied', 'all_scripts_copied',
// 'pdf_exported', 'script_locked', 'video_filmed', 'video_skipped',
// 'dashboard_viewed', 'settings_opened', 'start_over_confirmed',
// 'level_switched', 'script_feedback', 'auth_completed', 'error'
async function logEvent(eventType, detail = {}) {
  recordPreauthEvent(eventType, detail);
  if (!_currentUser) return;
  try {
    await _sb.from('logs').insert({
      user_id:    _currentUser.id,
      event_type: eventType,
      detail:     detail
    });
  } catch(e) {
    // Logging should never break the app — fail silently
  }
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
      _syncPointsStateToDb();
      fetchPointsConfig();

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
