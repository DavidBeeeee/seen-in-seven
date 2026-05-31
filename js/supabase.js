// ── SUPABASE CLIENT ───────────────────────────────────
const _sb = supabase.createClient(
  'https://zdtkwpzdwnzzmdwrvmka.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE'
);

// Current authenticated user profile (null if not logged in)
let _currentUser = null;

// ── AUTH STATE ────────────────────────────────────────
// Listen for auth changes (magic link click, session restore, sign out)
_sb.auth.onAuthStateChange(async (event, session) => {
  if (session && session.user) {
    _currentUser = await _syncUserProfile(session.user);

    // Flush any saves that happened before auth completed
    await _flushSaveQueue();

    // If we're on the auth waiting screen, advance past it
    const waitScreen = document.getElementById('screen-auth-wait');
    if (waitScreen && waitScreen.classList.contains('active')) {
      await _restoreFromDatabase();
      advancePastAuth();
      return;
    }

    // Update the returning banner if visible and we're on screen-0
    _updateReturningBanner();

  } else {
    _currentUser = null;
  }
});

// ── USER PROFILE SYNC ─────────────────────────────────
// Creates or fetches the public.users row for this auth user
async function _syncUserProfile(authUser) {
  try {
    // Try to get existing profile
    const { data: existing } = await _sb
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .single();

    if (existing) {
      // Update last_active
      await _sb.from('users')
        .update({ last_active: new Date().toISOString() })
        .eq('id', existing.id);
      return existing;
    }

    // Create new profile
    const { data: created } = await _sb
      .from('users')
      .insert({
        auth_id:  authUser.id,
        email:    authUser.email,
        name:     state.name || null,
        level:    state.level || null,
        blocker:  state.blocker || null,
        is_paid:  false
      })
      .select()
      .single();

    return created;
  } catch(e) {
    // Never block the user over a sync failure
    return null;
  }
}

// ── DEFERRED SAVE QUEUE ───────────────────────────────
// Stores saves that happened before authentication completed.
// Flushed automatically when _currentUser becomes available.
const _saveQueue = [];

async function _flushSaveQueue() {
  if (!_currentUser || _saveQueue.length === 0) return;
  const items = [..._saveQueue];
  _saveQueue.length = 0; // clear before processing so re-queues don't duplicate
  for (const item of items) {
    try {
      if (item.type === 'script') {
        await saveScriptToDb(item.videoNumber, item.level, item.content);
      } else if (item.type === 'progress') {
        await saveVideoProgressToDb(item.videoIndex, item.level, item.status);
      } else if (item.type === 'onboarding') {
        await saveOnboardingToDb();
      }
    } catch(e) {
      // Silent
    }
  }
}

// Queue a script save — called from app.js whether or not user is authenticated
function queueScriptSave(videoNumber, level, content) {
  if (_currentUser) {
    saveScriptToDb(videoNumber, level, content);
  } else {
    _saveQueue.push({ type: 'script', videoNumber, level, content });
  }
}

// Queue a progress save
function queueProgressSave(videoIndex, level, status) {
  if (_currentUser) {
    saveVideoProgressToDb(videoIndex, level, status);
  } else {
    _saveQueue.push({ type: 'progress', videoIndex, level, status });
  }
}

// Queue an onboarding save
function queueOnboardingSave() {
  if (_currentUser) {
    saveOnboardingToDb();
  } else {
    _saveQueue.push({ type: 'onboarding' });
  }
}
async function sendMagicLink(email) {
  const { error } = await _sb.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
      shouldCreateUser: true
    }
  });
  if (error) {
    // Surface rate limit errors clearly
    if (error.message && (error.message.includes('rate') || error.status === 429)) {
      throw new Error('Too many attempts — please wait a few minutes before trying again.');
    }
    throw error;
  }
}

// ── GET CURRENT SESSION ───────────────────────────────
async function getCurrentSession() {
  const { data } = await _sb.auth.getSession();
  return data.session;
}

// ── SAVE ONBOARDING TO DB ─────────────────────────────
async function saveOnboardingToDb() {
  if (!_currentUser) return;
  try {
    // Update user profile with latest onboarding data
    await _sb.from('users').update({
      name:           state.name || null,
      level:          state.level || null,
      blocker:        state.blocker || null,
      business_stage: state.businessStage || null
    }).eq('id', _currentUser.id);

    // Upsert onboarding answers
    const { data: existing } = await _sb
      .from('onboarding')
      .select('id')
      .eq('user_id', _currentUser.id)
      .single();

    const onboardingData = {
      user_id:        _currentUser.id,
      posted:         state.posted || null,
      history:        state.history || null,
      goal:           state.goal || null,
      mini_goal:      state.minigoal || null,
      mini_goal_text: state.minigoalText || null,
      business:       state.business || null,
      mvo_q2:         state.mvoQ2 || null,
      mvo_q3:         state.mvoQ3 || null,
      mvo_q4:         state.mvoQ4 || null,
      topic_freewrite: state.topicFreewrite || null
    };

    if (existing) {
      await _sb.from('onboarding').update(onboardingData).eq('id', existing.id);
    } else {
      await _sb.from('onboarding').insert(onboardingData);
    }
  } catch(e) {
    // Silent — never block the user
  }
}

// ── SAVE SCRIPT TO DB ─────────────────────────────────
async function saveScriptToDb(videoNumber, level, content) {
  if (!_currentUser) return;
  try {
    await _sb.from('scripts').insert({
      user_id:      _currentUser.id,
      video_number: videoNumber,
      level:        level,
      content:      content
    });
  } catch(e) {
    // Silent
  }
}

// ── SAVE SCRIPT EDIT TO DB ────────────────────────────
async function saveScriptEditToDb(videoNumber, level, content) {
  if (!_currentUser) return;
  try {
    await _sb.from('scripts')
      .update({ content: content, edited_at: new Date().toISOString() })
      .eq('user_id', _currentUser.id)
      .eq('video_number', videoNumber)
      .eq('level', level)
      .eq('is_current', true);
  } catch(e) {
    // Silent
  }
}

// ── SAVE THUMBS UP/DOWN ───────────────────────────────
async function saveScriptFeedback(videoNumber, level, thumbsUp) {
  if (!_currentUser) return;
  try {
    await _sb.from('scripts')
      .update({ thumbs_up: thumbsUp })
      .eq('user_id', _currentUser.id)
      .eq('video_number', videoNumber)
      .eq('level', level)
      .eq('is_current', true);
  } catch(e) {
    // Silent
  }
}

// ── SAVE VIDEO PROGRESS TO DB ─────────────────────────
async function saveVideoProgressToDb(videoIndex, level, status) {
  if (!_currentUser) return;
  try {
    await _sb.from('video_progress').upsert({
      user_id:     _currentUser.id,
      video_index: videoIndex,
      level:       level,
      status:      status,
      filmed_at:   status === 'filmed' ? new Date().toISOString() : null
    }, { onConflict: 'user_id,video_index,level' });
  } catch(e) {
    // Silent
  }
}

// ── RESTORE STATE FROM DATABASE ───────────────────────
// Called when a returning authenticated user lands on the app
async function _restoreFromDatabase() {
  if (!_currentUser) return false;
  try {
    // Fetch user profile
    const { data: user } = await _sb
      .from('users')
      .select('*')
      .eq('id', _currentUser.id)
      .single();

    if (!user) return false;

    // Fetch onboarding — use maybeSingle() to avoid error when row doesn't exist
    const { data: onboarding } = await _sb
      .from('onboarding')
      .select('*')
      .eq('user_id', _currentUser.id)
      .maybeSingle();

    // Fetch current scripts
    const { data: scripts } = await _sb
      .from('scripts')
      .select('*')
      .eq('user_id', _currentUser.id)
      .eq('is_current', true)
      .order('video_number');

    // Fetch video progress
    const { data: progress } = await _sb
      .from('video_progress')
      .select('*')
      .eq('user_id', _currentUser.id);

    // Restore state — user table is the primary source
    if (user.name)           state.name           = user.name;
    if (user.level)          state.level          = user.level;
    if (user.blocker)        state.blocker        = user.blocker;

    // Onboarding may not exist yet for brand-new users who just authenticated
    if (onboarding) {
      if (onboarding.posted)          state.posted          = onboarding.posted;
      if (onboarding.history)         state.history         = onboarding.history;
      if (onboarding.goal)            state.goal            = onboarding.goal;
      if (onboarding.mini_goal)       state.minigoal        = onboarding.mini_goal;
      if (onboarding.mini_goal_text)  state.minigoalText    = onboarding.mini_goal_text;
      if (onboarding.business)        state.business        = onboarding.business;
      if (onboarding.mvo_q2)          state.mvoQ2           = onboarding.mvo_q2;
      if (onboarding.mvo_q3)          state.mvoQ3           = onboarding.mvo_q3;
      if (onboarding.mvo_q4)          state.mvoQ4           = onboarding.mvo_q4;
      if (onboarding.topic_freewrite) state.topicFreewrite  = onboarding.topic_freewrite;
    }

    // Restore scripts into state.videos
    if (scripts && scripts.length) {
      scripts.forEach(s => {
        const idx = s.video_number - 1;
        state.videos['script_v' + idx] = s.content;
      });
    }

    // Restore video status
    if (progress && progress.length) {
      progress.forEach(p => {
        if (p.status === 'filmed' || p.status === 'skipped') {
          state.videoStatus[p.video_index] = p.status;
        }
      });
    }

    // Also save to localStorage as fallback
    saveProgress();

    // Return true only if user has meaningful data to show on dashboard
    return !!(user.level || user.name);

  } catch(e) {
    return false;
  }
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

// ── CHECK IF USER IS PAID ─────────────────────────────
function userIsPaid() {
  return _currentUser && _currentUser.is_paid === true;
}

// ── FETCH SCRIPT VERSIONS ─────────────────────────────
// Returns all versions for a video in descending order (newest first)
async function fetchScriptVersions(videoNumber, level) {
  if (!_currentUser) return [];
  try {
    const { data } = await _sb
      .from('scripts')
      .select('id, content, version, generated_at, is_current, thumbs_up')
      .eq('user_id', _currentUser.id)
      .eq('video_number', videoNumber)
      .eq('level', level)
      .order('version', { ascending: false });
    return data || [];
  } catch(e) {
    return [];
  }
}

// ── RESTORE SCRIPT VERSION ────────────────────────────
// Marks a specific version as current, all others as not
async function restoreScriptVersion(scriptId, videoNumber, level, content) {
  if (!_currentUser) return;
  try {
    // Mark all versions for this video as not current
    await _sb.from('scripts')
      .update({ is_current: false })
      .eq('user_id', _currentUser.id)
      .eq('video_number', videoNumber)
      .eq('level', level);
    // Mark the selected version as current
    await _sb.from('scripts')
      .update({ is_current: true })
      .eq('id', scriptId);
  } catch(e) {
    // Silent
  }
  // Restore in state immediately regardless of DB result
  const idx = videoNumber - 1;
  state.videos['script_v' + idx] = content;
  saveProgress();
}

// ── INIT: CHECK FOR EXISTING SESSION ─────────────────
// Runs on page load — restores session if user already authenticated
async function initAuth() {
  try {
    const session = await getCurrentSession();
    if (session && session.user) {
      _currentUser = await _syncUserProfile(session.user);
      const restored = await _restoreFromDatabase();

      // Check both DB state and localStorage for level
      // (magic link returns to a fresh page load where DB restore runs before localStorage)
      let effectiveLevel = state.level;
      if (!effectiveLevel) {
        try {
          const lsRaw = localStorage.getItem('bwb_challenge_v1');
          if (lsRaw) {
            const lsData = JSON.parse(lsRaw);
            effectiveLevel = lsData.level || null;
            // If found in localStorage but not DB, restore it to state
            if (effectiveLevel && !state.level) {
              state.level   = lsData.level;
              state.name    = lsData.name    || state.name;
              state.posted  = lsData.posted  || state.posted;
              state.blocker = lsData.blocker || state.blocker;
              state.history = lsData.history || state.history;
              state.videos  = lsData.videos  || state.videos;
              state.videoStatus = lsData.videoStatus || state.videoStatus;
              state.mvoQ2   = lsData.mvoQ2   || state.mvoQ2;
              state.mvoQ3   = lsData.mvoQ3   || state.mvoQ3;
              state.mvoQ4   = lsData.mvoQ4   || state.mvoQ4;
              state.topicFreewrite = lsData.topicFreewrite || state.topicFreewrite;
              state.minigoal = lsData.minigoal || state.minigoal;
              state.minigoalText = lsData.minigoalText || state.minigoalText;
            }
          }
        } catch(e) {}
      }

      if (effectiveLevel && _currentUser) {
        // Authenticated user with completed onboarding — flush any queued saves then go to dashboard
        await _flushSaveQueue();
        if (typeof showDashboard === 'function') {
          showDashboard();
        }
        return;
      } else if (_currentUser) {
        // Authenticated but hasn't completed onboarding yet
        await _flushSaveQueue();
        _updateReturningBanner();
      }
    }
  } catch(e) {
    // Silent — fall through to normal localStorage load
  }
}
