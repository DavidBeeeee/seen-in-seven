// ── VOICE-TO-TEXT SYSTEM ───────────────────────────────
// Uses the browser's native Web Speech API.
// Wraps every eligible text input/textarea with a mic button.
// Skips: email inputs, hidden inputs, checkboxes, admin fields.
// Uses MutationObserver so dynamically rendered prompt textareas
// (added by renderVideoPrompts) get mic buttons automatically.

(function initVoiceToText() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return; // browser doesn't support — hide everything, nothing breaks

  let activeRecognition = null;
  let activeBtn = null;
  let activeBadge = null;
  let silenceTimer = null;

  function isEligible(el) {
    if (!el || el.dataset.voiceAttached) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      // Skip email, password, hidden, checkbox, number, tel
      return t === 'text' || t === '' || t === 'search';
    }
    return false;
  }

  function shouldSkip(el) {
    // Skip email-related inputs and admin page inputs
    const id = el.id || '';
    const cls = el.className || '';
    const skip = ['email', 'auth-email', 'gate-email', 'settings-email', 'admin'];
    if (skip.some(s => id.toLowerCase().includes(s) || cls.toLowerCase().includes(s))) return true;
    if (el.type === 'email') return true;
    if (el.autocomplete === 'email') return true;
    return false;
  }

  function attachMic(el) {
    if (!isEligible(el) || shouldSkip(el)) return;
    el.dataset.voiceAttached = '1';

    const isTextarea = el.tagName.toLowerCase() === 'textarea';

    // Wrap el in a relative-positioned container
    const parent = el.parentNode;
    if (!parent) return;

    const wrap = document.createElement('div');
    wrap.className = 'voice-input-wrap' + (isTextarea ? ' is-textarea' : '');

    parent.insertBefore(wrap, el);
    wrap.appendChild(el);

    // Mic button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-btn';
    btn.title = 'Click to speak';
    btn.innerHTML = '🎤';
    btn.setAttribute('aria-label', 'Voice input');

    // Listening badge
    const badge = document.createElement('span');
    badge.className = 'voice-listening-badge';
    badge.innerHTML = '<strong>Listening</strong> &nbsp;<em>(tap to stop)</em>';
    badge.style.display = 'none';

    wrap.appendChild(badge);
    wrap.appendChild(btn);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeBtn === btn) {
        stopListening();
      } else {
        startListening(el, btn, badge);
      }
    });
  }

  function startListening(el, btn, badge) {
    // Stop any existing session
    if (activeRecognition) {
      activeRecognition.abort();
      if (activeBtn) { activeBtn.classList.remove('listening'); activeBtn.innerHTML = '🎤'; }
      if (activeBadge) activeBadge.style.display = 'none';
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    activeRecognition = recognition;
    activeBtn = btn;
    activeBadge = badge;

    btn.classList.add('listening');
    btn.innerHTML = '🟢';
    badge.style.display = 'block';

    let finalTranscript = '';

    recognition.onresult = (event) => {
      clearTimeout(silenceTimer);

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t + ' ';
        } else {
          interim = t;
        }
      }

      // Show interim result in field (appended to existing content)
      const existingBase = el.dataset.voiceBase || '';
      el.value = existingBase + finalTranscript + interim;

      // Fire oninput so all existing handlers (state saves, undo, etc) trigger
      el.dispatchEvent(new Event('input', { bubbles: true }));

      // 3-second silence timeout
      silenceTimer = setTimeout(() => stopListening(), 3000);
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        btn.title = 'Microphone access denied';
        btn.innerHTML = '🚫';
        setTimeout(() => { btn.innerHTML = '🎤'; btn.title = 'Click to speak'; }, 3000);
      }
      stopListening(false);
    };

    recognition.onend = () => {
      stopListening(false);
    };

    // Snapshot the current field value as the "base" before speaking
    el.dataset.voiceBase = el.value ? el.value.trimEnd() + ' ' : '';
    finalTranscript = '';

    try {
      recognition.start();
      // Reset silence timer on start
      silenceTimer = setTimeout(() => stopListening(), 10000); // max 10s if no speech detected at all
    } catch(e) {
      stopListening(false);
    }
  }

  function stopListening(cleanupBase = true) {
    clearTimeout(silenceTimer);

    if (activeRecognition) {
      try { activeRecognition.stop(); } catch(e) {}
      activeRecognition = null;
    }
    if (activeBtn) {
      activeBtn.classList.remove('listening');
      activeBtn.innerHTML = '🎤';
      activeBtn = null;
    }
    if (activeBadge) {
      activeBadge.style.display = 'none';
      activeBadge = null;
    }

    // Clean up the voice base snapshots on all fields
    if (cleanupBase) {
      document.querySelectorAll('[data-voice-base]').forEach(el => {
        delete el.dataset.voiceBase;
      });
    }
  }

  // Attach to all existing eligible inputs on load
  function attachAll() {
    document.querySelectorAll('textarea, input[type="text"], input:not([type])').forEach(attachMic);
  }

  // Watch for dynamically added inputs (renderVideoPrompts, etc)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return; // element nodes only
        // Check the node itself
        if (node.matches && node.matches('textarea, input[type="text"], input:not([type])')) {
          attachMic(node);
        }
        // Check descendants
        node.querySelectorAll && node.querySelectorAll('textarea, input[type="text"], input:not([type])').forEach(attachMic);
      });
    });
  });

  // Start observing once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      attachAll();
      observer.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    attachAll();
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();

// ── STATE ──────────────────────────────────────────────
const state = {
  posted:null, blocker:null, history:null, business:null,
  goal:null, minigoal:null, minigoalText:'', name:'',
  level:null, videos:{}, videoStatus:{},
  mvoQ2:null, mvoQ3:null, mvoQ4:null,
  topicFreewrite: '',
  l1VideoStatus: null,
  videoPosted:{},   // { [videoIndex]: { posted:bool, url:string } } — points
  engage:{},        // { sponsor_vubli, sponsor_temu, graduation, call } — points
  phase2: {
    custom:{},
    contentMode:'simple',
    audienceContext:'',
    messageContext:'',
    knowledgeContext:'',
    firstScriptNotes:'',
    contentIntent:null,
    contentIntentTitle:'',
    commitmentPain:null,
    commitmentPainCustom:'',
    commitmentPainTitle:'',
    commitmentPainText:'',
    commitmentPainType:'',
    commitmentDesire:null,
    commitmentDesireCustom:'',
    commitmentDesireTitle:'',
    commitmentDesireText:'',
    commitmentDesireType:'',
    commitmentReasons:[],
    commitmentDeclaration:'',
    missionStatement:'',
    missionGeneratedAt:'',
    mvoMode:'simple'
  }
};

const ONBOARDING_ORDER = ['screen-0','screen-1','screen-3','screen-content-intent','screen-2a','screen-commit-pain','screen-commit-desire','screen-6','screen-recap','screen-checklist','screen-mvo2','screen-7','screen-script','plan-screen'];
let screenOrder = ['screen-0','screen-1'];
let currentIndex = 0;
let currentVideoIndex = 0;
let currentPreviewVideoNum = 1;
let transitioning = false;
let _dashboardShown = false; // prevents double showDashboard during auth race
let editingFromPlan = false;
let mvoQ2Skipped = false;
let maxProgressPct = 0;    // L1 blue bar — never decreases
let maxProgressL2Pct = 0;  // L2 green bar — never decreases

const SAVE_KEY = 'bwb_challenge_v1';
let authScreenMode = 'signin';

// ── THEME ─────────────────────────────────────────────
const THEME_KEY = 'sis_theme_v1';
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-mode', isLight);
  const settingsToggle = document.getElementById('settings-theme-label');
  if (settingsToggle) settingsToggle.textContent = isLight ? 'Dark mode' : 'Light mode';
}
function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch(e) {}
  applyTheme(next);
}
// Apply saved theme immediately on load
(function() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) applyTheme(saved);
  } catch(e) {}
})();

function getOnboardingOrder() {
  return [...ONBOARDING_ORDER];
}

function ensureFullOnboardingOrder() {
  screenOrder = getOnboardingOrder();
}

function resetPhase2() {
  state.phase2 = {
    custom:{},
    contentMode:'simple',
    audienceContext:'',
    messageContext:'',
    knowledgeContext:'',
    firstScriptNotes:'',
    contentIntent:null,
    contentIntentTitle:'',
    commitmentPain:null,
    commitmentPainCustom:'',
    commitmentPainTitle:'',
    commitmentPainText:'',
    commitmentPainType:'',
    commitmentDesire:null,
    commitmentDesireCustom:'',
    commitmentDesireTitle:'',
    commitmentDesireText:'',
    commitmentDesireType:'',
    commitmentReasons:[],
    commitmentDeclaration:'',
    missionStatement:'',
    missionGeneratedAt:'',
    mvoMode:'simple'
  };
  return state.phase2;
}

function ensurePhase2() {
  state.phase2 = Object.assign({
    custom:{},
    contentMode:'simple',
    audienceContext:'',
    messageContext:'',
    knowledgeContext:'',
    firstScriptNotes:'',
    contentIntent:null,
    contentIntentTitle:'',
    commitmentPain:null,
    commitmentPainCustom:'',
    commitmentPainTitle:'',
    commitmentPainText:'',
    commitmentPainType:'',
    commitmentDesire:null,
    commitmentDesireCustom:'',
    commitmentDesireTitle:'',
    commitmentDesireText:'',
    commitmentDesireType:'',
    commitmentReasons:[],
    commitmentDeclaration:'',
    missionStatement:'',
    missionGeneratedAt:'',
    mvoMode:'simple'
  }, state.phase2 || {});
  state.phase2.custom = Object.assign({}, state.phase2.custom || {});
  state.phase2.commitmentReasons = Array.isArray(state.phase2.commitmentReasons) ? state.phase2.commitmentReasons : [];
  return state.phase2;
}

function escapeHTML(value) {
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

let _sbTracked = false;
async function trackSession() {
  if (_sbTracked) return;
  _sbTracked = true;
  try {
    await _sb.from('sessions_legacy').insert({
      name:           state.name || null,
      level:          state.level || null,
      blocker:        state.blocker || null,
      history:        state.history || null,
      goal:           state.goal || null,
      business_stage: state.businessStage || null,
      topic:          state.topicFreewrite || null,
      answers: {
        posted:   state.posted,
        blocker:  state.blocker,
        history:  state.history,
        goal:     state.goal,
        phase2:   ensurePhase2(),
        mvoQ2:    state.mvoQ2,
        mvoQ3:    state.mvoQ3,
        mvoQ4:    state.mvoQ4
      },
      completed_videos: Object.keys(state.videoStatus || {}).length,
      user_agent: navigator.userAgent
    });
  } catch(e) {
    // Tracking failure is silent — never block the user
  }
}

// ── SCREEN NAVIGATION ─────────────────────────────────
let _screenAnimTimers = [];

function showScreen(id, direction='forward') {
  const next = document.getElementById(id);
  if (!next) {
    console.warn('[SeenInSeven] showScreen: element not found:', id);
    return;
  }

  // Cancel cosmetic animation timers from any previous call
  _screenAnimTimers.forEach(t => clearTimeout(t));
  _screenAnimTimers = [];

  // SYNCHRONOUS screen swap — never deferred, so a rapid second call
  // can never leave us with no active screen (this was the blank-screen bug).
  document.querySelectorAll('.screen.active').forEach(s => {
    if (s !== next) s.classList.remove('active', 'anim-in', 'anim-out');
  });

  next.classList.remove('anim-out');
  next.classList.add('active', 'anim-in');

  // Only the cosmetic anim-in cleanup is deferred
  const t = setTimeout(() => { next.classList.remove('anim-in'); }, 350);
  _screenAnimTimers.push(t);

  updateProgress(id);
  // Force scroll to top — setTimeout(0) ensures it fires after layout settles on iOS
  setTimeout(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, 0);
}

function goNext() {
  const cur = screenOrder[currentIndex];

  if (cur === 'screen-0') {
    // Expand to full order immediately — default to the new-user path, updated after screen-1.
    ensureFullOnboardingOrder();
    if (typeof logEvent === 'function') logEvent('onboarding_started', {source: 'start_button'});
  }

  if (cur === 'screen-1') {
    // User is going through fresh onboarding — clear any previously restored answers
    // so their new answers always win after the first routing question.
    ensureFullOnboardingOrder();
    state.blocker = null; state.history = null; state.goal = null;
    state.minigoal = null; state.minigoalText = ''; state.business = null;
    state.mvoQ2 = null; state.mvoQ3 = null; state.mvoQ4 = null;
    state.videos = {};
    state.videoStatus = {};
    state.l1VideoStatus = null;
    state.l1Videos = null;
    maxProgressPct = 0;
    maxProgressL2Pct = 0;
    resetPhase2();
  }

  if (cur === 'screen-content-intent') {
    determineLevel();
  }

  currentIndex++;
  if (currentIndex >= screenOrder.length) currentIndex = screenOrder.length-1;
  let nextId = screenOrder[currentIndex];

  if (nextId === 'screen-checklist') {
    // Populate freewrite textarea from state (safe - no template literal in HTML)
    renderTalkContext();
  }
  if (cur === 'screen-checklist' && state.topicFreewrite && typeof logEvent === 'function') {
    logEvent('topic_freewrite_saved', {
      level: state.level || null,
      length: state.topicFreewrite.length
    });
  }
  if (nextId === 'screen-3') renderChoiceGrid(BUSINESS_OPTIONS, 'business', 'business-choice-grid');
  else if (nextId === 'screen-2a') renderChoiceGrid(BLOCKER_OPTIONS, 'blocker', 'blocker-choice-grid');
  else if (nextId === 'screen-content-intent') renderContentIntentGrid();
  else if (nextId === 'screen-commit-pain') renderCommitmentCards('pain');
  else if (nextId === 'screen-commit-desire') renderCommitmentCards('desire');
  else if (nextId === 'screen-6') renderCommitmentDeclaration();
  else if (nextId === 'screen-recap') {
    populateRecap();
    setTimeout(maybeShowSaveProgressOverlay, 450);
  }
  else if (nextId === 'screen-mvo2') renderMvoScreen(2);
  else if (nextId === 'screen-7') {
    currentVideoIndex = 0;
    buildVideoDots('video-dots');
    buildVideoDots('script-dots');
    buildVideoDots('vi-dots');
    renderVideoPrompts(0);
  }
  showScreen(nextId);
}

function goBack() {
  if (currentIndex > 0) {
    currentIndex--;
    const prevId = screenOrder[currentIndex];
    if (prevId === 'screen-checklist') renderTalkContext();
    else if (prevId === 'screen-3') renderChoiceGrid(BUSINESS_OPTIONS, 'business', 'business-choice-grid');
    else if (prevId === 'screen-2a') renderChoiceGrid(BLOCKER_OPTIONS, 'blocker', 'blocker-choice-grid');
    else if (prevId === 'screen-content-intent') renderContentIntentGrid();
    else if (prevId === 'screen-commit-pain') renderCommitmentCards('pain');
    else if (prevId === 'screen-commit-desire') renderCommitmentCards('desire');
    else if (prevId === 'screen-6') renderCommitmentDeclaration();
    else if (prevId === 'screen-mvo2') renderMvoScreen(2);
    showScreen(prevId, 'back');
  }
}


async function goToRecapWithNameCheck() {
  const nameInput = document.getElementById('user-name');
  if (!nameInput.value.trim()) {
    nameInput.style.borderColor = 'var(--teal)';
    nameInput.placeholder = "Just your first name... we use it in your scripts ✨";
    nameInput.focus();
    setTimeout(() => {
      nameInput.style.borderColor = '';
      nameInput.placeholder = "So we can personalize your scripts";
    }, 2500);
    return;
  }
  await goToRecap();
}

async function goToRecap() {
  // If the user went through onboarding fresh (not continuing),
  // clear any previously cached scripts so generation runs fresh
  const hasExistingScripts = Object.keys(state.videos || {}).some(k => k.startsWith('script_v'));
  if (hasExistingScripts) {
    Object.keys(state.videos).forEach(k => {
      if (k.startsWith('script_v') || k.startsWith('sections_v')) {
        delete state.videos[k];
      }
    });
    state.videoStatus = {};
    state.l1VideoStatus = null;
    state.l1Videos = null;
  }
  renderCommitmentDeclaration();
  saveProgress();
  await generateMissionForRecap();
  if (typeof logEvent === 'function') {
    logEvent('onboarding_completed', {
      level: state.level || null,
      posted: state.posted || null
    });
  }
  populateRecap();
  goNext();
}

// ── AUTH FLOW ─────────────────────────────────────────
async function handleEmailSubmit() {
  const input   = document.getElementById('auth-email-input');
  const errEl   = document.getElementById('auth-email-error');
  const btn     = document.getElementById('auth-send-btn');
  const checkEl = document.getElementById('auth-checking');
  const email   = input ? input.value.trim() : '';

  if (!email || !email.includes('@') || !email.includes('.')) {
    if (errEl) { errEl.textContent = 'Please enter a valid email address.'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.textContent = 'Checking...'; btn.disabled = true; }
  if (checkEl) checkEl.style.display = 'block';
  if (errEl) errEl.style.display = 'none';
  if (typeof logEvent === 'function') logEvent('email_submitted', {source: 'screen-email', email: email, mode: authScreenMode});

  try {
    // Check if this email already has an account with data
    // Uses a SECURITY DEFINER RPC to bypass RLS (user isn't authenticated yet)
    const { data: emailCheck } = await _sb
      .rpc('check_email_exists', { lookup_email: email });

    if (emailCheck && emailCheck.has_level) {
      // Existing user — send magic link and show inline confirmation
      sendMagicLink(email).catch(() => {});
      if (typeof logEvent === 'function') logEvent('magic_link_requested', {source: 'returning_user', email: email});
      if (checkEl) checkEl.style.display = 'none';
      if (btn) { btn.textContent = 'Continue →'; btn.disabled = false; }
      const emailScreen = document.getElementById('screen-email');
      if (emailScreen) {
        const existing = emailScreen.querySelector('.email-sent-msg');
        if (!existing) {
          const msg = document.createElement('div');
          msg.className = 'email-sent-msg';
          msg.style.cssText = 'margin-top:16px;padding:16px 18px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:12px;line-height:1.7;';
          msg.innerHTML = `
            <div style="font-size:17px;font-weight:700;color:var(--cream);margin-bottom:6px;">Welcome back! 👋</div>
            <div style="font-size:14px;color:var(--muted);">We recognize you. You've already started your SeenInSeven scripts. Check your inbox for a magic link to get straight back to your dashboard.</div>
            <div style="margin-top:12px;font-size:13px;color:var(--muted);">Wrong email? <button onclick="document.querySelector('.email-sent-msg').remove();document.getElementById('auth-email-input').value='';document.getElementById('auth-email-input').focus();" style="background:none;border:none;color:var(--teal);cursor:pointer;font-size:13px;text-decoration:underline;padding:0;font-family:inherit;">Try a different one →</button></div>`;
          const btnRow = emailScreen.querySelector('.btn-row');
          if (btnRow) btnRow.after(msg);
        }
      }
      return;
    }

    if (authScreenMode === 'signin') {
      if (checkEl) checkEl.style.display = 'none';
      if (btn) { btn.textContent = 'Send Sign-In Link →'; btn.disabled = false; }
      if (errEl) {
        errEl.textContent = 'No saved challenge found for that email yet. Start the challenge first, then we can save your progress.';
        errEl.style.display = 'block';
      }
      return;
    }

    // New user save prompt — send link silently and continue through questions
    sendMagicLink(email).catch(() => {});
    if (typeof logEvent === 'function') logEvent('magic_link_requested', {source: 'new_user', email: email});

  } catch(e) {
    // If check fails, continue anyway
  }

  if (checkEl) checkEl.style.display = 'none';
  if (btn) { btn.textContent = 'Continue →'; btn.disabled = false; }
  goNext();
}

function skipAuth() {
  if (typeof logEvent === 'function') logEvent('auth_skipped', {source: 'screen-email', mode: authScreenMode});
  if (authScreenMode === 'signin') {
    screenOrder = ['screen-0','screen-1'];
    currentIndex = 0;
    showScreen('screen-0');
    return;
  }
  goNext();
}

function showSignInScreen() {
  authScreenMode = 'signin';
  screenOrder = ['screen-0','screen-email'];
  currentIndex = 1;
  resetEmailScreenCopy('Welcome <span class="accent">back.</span>', 'Enter your email and we will send a magic link to your dashboard.', 'Send Sign-In Link →');
  const toggle = document.getElementById('auth-password-toggle');
  if (toggle) toggle.style.display = '';
  showScreen('screen-email');
}

function showSaveEmailScreen() {
  authScreenMode = 'save';
  if (screenOrder.indexOf('screen-email') === -1) {
    screenOrder.splice(Math.max(currentIndex + 1, 1), 0, 'screen-email');
  }
  currentIndex = screenOrder.indexOf('screen-email');
  resetEmailScreenCopy('Save your <span class="accent">progress.</span>', 'Enter your email and we will send a magic link so your challenge can follow you across devices.', 'Save And Continue →');
  showScreen('screen-email');
}

function resetEmailScreenCopy(titleHtml, subText, buttonText) {
  const title = document.querySelector('#screen-email .screen-title');
  const sub = document.querySelector('#screen-email .screen-sub');
  const btn = document.getElementById('auth-send-btn');
  const err = document.getElementById('auth-email-error');
  const msg = document.querySelector('#screen-email .email-sent-msg');
  if (title) title.innerHTML = titleHtml;
  if (sub) sub.textContent = subText;
  if (btn) { btn.textContent = buttonText; btn.disabled = false; btn.onclick = handleEmailSubmit; }
  if (err) err.style.display = 'none';
  if (msg) msg.remove();
  // Reset password mode back to magic-link mode
  const pwWrap = document.getElementById('auth-password-wrap');
  const pwInput = document.getElementById('auth-password-input');
  const hint = document.getElementById('auth-email-hint');
  const toggle = document.getElementById('auth-password-toggle');
  if (pwWrap) pwWrap.style.display = 'none';
  if (pwInput) pwInput.value = '';
  if (hint) hint.style.display = '';
  if (toggle) { toggle.style.display = 'none'; toggle.textContent = 'Have a password? Sign in with it →'; }
}

function togglePasswordSignIn() {
  const pwWrap = document.getElementById('auth-password-wrap');
  const hint = document.getElementById('auth-email-hint');
  const btn = document.getElementById('auth-send-btn');
  const toggle = document.getElementById('auth-password-toggle');
  if (!pwWrap) return;
  const isShowing = pwWrap.style.display !== 'none';
  pwWrap.style.display = isShowing ? 'none' : 'block';
  if (hint) hint.style.display = isShowing ? '' : 'none';
  if (btn) { btn.textContent = isShowing ? 'Send Sign-In Link →' : 'Sign In →'; btn.onclick = isShowing ? handleEmailSubmit : handlePasswordSignIn; }
  if (toggle) toggle.textContent = isShowing ? 'Have a password? Sign in with it →' : 'Use magic link instead →';
  const err = document.getElementById('auth-email-error');
  if (err) err.style.display = 'none';
}

async function handlePasswordSignIn() {
  const emailInput = document.getElementById('auth-email-input');
  const pwInput = document.getElementById('auth-password-input');
  const errEl = document.getElementById('auth-email-error');
  const btn = document.getElementById('auth-send-btn');
  const email = emailInput ? emailInput.value.trim() : '';
  const password = pwInput ? pwInput.value.trim() : '';
  if (!email || !email.includes('@') || !email.includes('.')) {
    if (errEl) { errEl.textContent = 'Please enter a valid email address.'; errEl.style.display = 'block'; }
    return;
  }
  if (!password) {
    if (errEl) { errEl.textContent = 'Please enter your password.'; errEl.style.display = 'block'; }
    return;
  }
  if (btn) { btn.textContent = 'Signing in...'; btn.disabled = true; }
  if (errEl) errEl.style.display = 'none';
  try {
    await signInWithPassword(email, password);
    // onAuthStateChange handles navigation after successful sign-in
  } catch(e) {
    if (errEl) { errEl.textContent = e.message || 'Sign in failed. Try a magic link instead.'; errEl.style.display = 'block'; }
    if (btn) { btn.textContent = 'Sign In →'; btn.disabled = false; }
  }
}

const SAVE_PROGRESS_OVERLAY_KEY = 'sis_save_progress_overlay_seen_v2';

function hasSeenSaveProgressOverlay() {
  try {
    return sessionStorage.getItem(SAVE_PROGRESS_OVERLAY_KEY) === '1';
  } catch(e) {
    return false;
  }
}

function maybeShowSaveProgressOverlay() {
  const isAuthenticated = typeof getCurrentUser === 'function' && getCurrentUser();
  if (isAuthenticated) return;
  if (hasSeenSaveProgressOverlay()) return;
  const overlay = document.getElementById('save-progress-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeSaveProgressOverlay(markSeen = true) {
  if (markSeen) {
    try { sessionStorage.setItem(SAVE_PROGRESS_OVERLAY_KEY, '1'); } catch(e) {}
  }
  const overlay = document.getElementById('save-progress-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function skipSaveProgressOverlay() {
  if (typeof logEvent === 'function') logEvent('auth_skipped', {source: 'save_progress_overlay'});
  closeSaveProgressOverlay(true);
}

async function handleSaveProgressEmail() {
  const input = document.getElementById('save-progress-email');
  const err = document.getElementById('save-progress-error');
  const btn = document.getElementById('save-progress-btn');
  const email = input ? input.value.trim() : '';
  if (!email || !email.includes('@') || !email.includes('.')) {
    if (err) { err.textContent = 'Please enter a valid email address.'; err.style.display = 'block'; }
    return;
  }
  if (err) err.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  try {
    await sendMagicLink(email);
    if (typeof logEvent === 'function') logEvent('magic_link_requested', {source: 'save_progress_overlay', email: email});
    if (btn) btn.textContent = 'Check your inbox';
    setTimeout(() => closeSaveProgressOverlay(true), 900);
  } catch(e) {
    if (err) { err.textContent = 'Something went wrong sending the magic link. You can skip and keep going on this device.'; err.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Send Magic Link'; }
  }
}

function advancePastAuth() {
  // Called by supabase.js when magic link auth completes
  // Ensure screenOrder is fully expanded
  if (screenOrder.length <= 2) {
    ensureFullOnboardingOrder();
  }
  // Save onboarding to DB now that we have a user
  saveOnboardingToDb();
  currentIndex = screenOrder.indexOf('screen-recap');
  populateRecap();
  showScreen('screen-recap');
  window.scrollTo(0, 0);
}

function updateProgress(id) {
  const wrap = document.getElementById('progress-bar-wrap');

  // Update header username and nav visibility
  const usernameEl = document.getElementById('header-username');
  const navEl = document.getElementById('header-nav');
  const dashBtn = document.getElementById('header-dashboard-btn');
  const signInBtn = document.getElementById('header-signin-btn');
  if (usernameEl) usernameEl.textContent = state.name || '';
  // Show nav only when authenticated or on dashboard
  const isAuthenticated = typeof getCurrentUser === 'function' && getCurrentUser();
  const onDashboard = id === 'plan-screen';
  if (navEl) navEl.style.display = (isAuthenticated || onDashboard) ? 'flex' : 'none';
  if (signInBtn) signInBtn.style.display = (!isAuthenticated && id !== 'screen-email' && !onDashboard) ? '' : 'none';
  // Hide Dashboard button when already on dashboard
  if (dashBtn) dashBtn.style.display = onDashboard ? 'none' : '';

  if (wrap.classList.contains('progress-l1-complete') || wrap.classList.contains('progress-l2-complete')) return;

  const videosDone = Object.keys(state.videoStatus).length;
  const fill   = document.getElementById('progress-fill');
  const fillL2 = document.getElementById('progress-fill-l2');

  // Small phase bonus within each video's working cycle
  const phaseBonus = id === 'screen-video-intro' ? 1.5
                   : id === 'screen-7' ? 3.5
                   : id === 'screen-script' ? 6 : 0;

  if (state.level === 2) {
    fill.style.width = '100%';
    let pct2;
    if (videosDone === 0) {
      // Onboarding: green grows 0-15% through the active Phase 2 onboarding screens.
      const screen7idx = Math.max(screenOrder.indexOf('screen-script'), screenOrder.indexOf('screen-mvo2'));
      const startIdx = Math.max(screenOrder.indexOf('screen-content-intent'), 0);
      if (screen7idx > 0 && currentIndex >= startIdx) {
        pct2 = Math.min(((currentIndex - startIdx) / Math.max(screen7idx - startIdx, 1)) * 15, 15);
      } else {
        pct2 = 0;
      }
    } else {
      pct2 = Math.min(15 + (videosDone / 7) * 85 + phaseBonus, 100);
    }
    maxProgressL2Pct = Math.max(maxProgressL2Pct, pct2);
    fillL2.style.width = maxProgressL2Pct + '%';
    fillL2.style.opacity = maxProgressL2Pct > 0 ? '1' : '0';
  } else if (state.level === 1 && videosDone > 0) {
    const pct1 = Math.min((videosDone / 7) * 100 + phaseBonus, 100);
    maxProgressPct = Math.max(maxProgressPct, pct1);
    fill.style.width = maxProgressPct + '%';
  } else {
    // Onboarding phase: blue bar creeps 0→15% from screen-0 to screen-7
    const setupEnd = Math.max(screenOrder.indexOf('screen-script'), screenOrder.indexOf('screen-mvo2'));
    const setupPct = setupEnd > 0 ? Math.min((currentIndex / setupEnd) * 15, 15) : 0;
    maxProgressPct = Math.max(maxProgressPct, setupPct);
    fill.style.width = maxProgressPct + '%';
  }

  document.getElementById('progress-label').textContent = 'YOUR JOURNEY';
}

// ── AUTO-ADVANCE ───────────────────────────────────────
let _autoAdvanceLock = false;
function autoAdvance(el, key, value) {
  if (_autoAdvanceLock) return;
  _autoAdvanceLock = true;
  el.classList.add('selecting');
  state[key] = value;
  saveProgress();
  setTimeout(() => {
    el.classList.remove('selecting');
    goNext();
    _autoAdvanceLock = false;
  }, 300);
}

function selectCardAnswer(el, key, value) {
  if (!el) return;
  const grid = el.closest('.choice-grid');
  if (grid) grid.querySelectorAll('.choice-card').forEach(card => card.classList.remove('selected'));
  el.classList.add('selected');
  state[key] = value;
  saveProgress();
}

// ── LEVEL DETERMINATION + V2 ONBOARDING DATA ──────────
const blockerLabels = {
  ideas:"I don't know what to say.",
  camera:"I don't like how I come across.",
  care:"I'm worried people won't care.",
  procrastinating:"I keep putting it off.",
  custom:'Custom answer'
};
const blockerFullText = {
  ideas:'I stare at the camera and go completely blank.',
  camera:'My voice, face, energy, or delivery makes me dislike my videos.',
  care:"I don't want to post into silence or feel embarrassed.",
  procrastinating:"I've been meaning to start, but life just keeps happening."
};
const historyLabels = {
  no:'No, never.',
  few:'Yes, a few times.',
  felloff:'Yes, but I fell off.',
  consistent:'Yes, consistently before.',
  stops:'Posts sometimes but keeps falling off',
  was:'Was consistent once, took a break'
};
const businessLabels = {
  yes:"I have an active business I'm growing.",
  building:"I'm in the early stages of building something.",
  no:'Not yet... still figuring out my thing.',
  story:"I'm mostly sharing my story and lived experience."
};
const goalLabels = {};
const miniGoalMap = {};

const CONTENT_INTENT_OPTIONS = [
  {e:'🙋', v:'person', t:'Who I am as a person.', s:'My personality, my values, my story. I want people to know me before they know what I do.'},
  {e:'🎯', v:'teach', t:'What I know and can teach.', s:'My expertise, my experience, the specific thing I have spent years getting good at.'},
  {e:'🛤️', v:'journey', t:"Where I've been and where I'm going.", s:'I am in the middle of something real and I want to document the journey as it happens.'},
  {e:'🤷', v:'unsure', t:"I'm not sure yet.", s:'I will figure it out as I go. Help me find my footing first.'}
];

// screen-2a — "what's holding you back from posting" (autoAdvance sets state.blocker)
const BLOCKER_OPTIONS = [
  {e:'🧠', v:'ideas', t:"I don't know what to say.", s:'I stare at the camera and go completely blank.'},
  {e:'😬', v:'camera', t:"I don't like how I come across.", s:'My voice, face, energy, or delivery makes me dislike my videos.'},
  {e:'👀', v:'care', t:"I'm worried people won't care.", s:"I don't want to post into silence or feel embarrassed."},
  {e:'⏰', v:'procrastinating', t:'I keep putting it off.', s:"I've been meaning to start, but life just keeps happening."}
];

// screen-3 — "what are you building toward" (autoAdvance sets state.business)
const BUSINESS_OPTIONS = [
  {e:'🚀', v:'yes', t:"I have an active business I'm growing.", s:'I have clients, an offer, a service, or products I am intentionally selling or sharing.'},
  {e:'🔨', v:'building', t:"I'm in the early stages of building something.", s:"I have a direction but haven't fully launched yet."},
  {e:'🌱', v:'no', t:'Not yet... still figuring out my thing.', s:'I want to start creating but I am still exploring what I want to say.'},
  {e:'🧭', v:'story', t:"I'm mostly sharing my story and lived experience.", s:'I may build something later, but right now I need to show up and be seen with zero agenda.'}
];

const COMMITMENT_COPY = {
  pain: {
    1: [
      {e:'🗣️', v:'l1_loneliness', t:'The loneliness of feeling like I have something real to say but nobody knows I exist.', full:"The thing that weighs on me most is knowing I have a perspective and a story worth sharing, while living like someone who has never said it out loud. It's not that I don't want to be seen. It's that I haven't figured out how to make myself start, and the silence has started to feel permanent."},
      {e:'👀', v:'l1_watching', t:'The frustration of always watching and never participating even though I have something to say.', full:"I have spent more time consuming other people's content than I want to admit, watching people share things I already know, perspectives I already have, stories that aren't more interesting than mine. And I'm still in the audience. That gap between knowing I belong in the conversation and actually being in it is what I'm most tired of living in."},
      {e:'⏳', v:'l1_stuck', t:'The missed opportunities of seeing others keep moving ahead while I stay exactly where I am.', full:"The thing that scares me most isn't failure. It's looking up in another year and realizing I haven't moved. People I started alongside are building audiences, starting conversations, and creating things that matter to real people, while I'm still in the same place I was when I first thought about doing this."},
      {e:'📖', v:'l1_regret', t:"The regret of carrying a story worth telling that I'm not confident enough to share.", full:"There are things I know, things I've lived through, and things I wish someone had told me when I needed it most. And I carry them almost entirely to myself. Not because they don't matter. Because somewhere along the way I convinced myself that I needed to be more ready, more polished, more certain before I had the right to say them out loud."}
    ],
    2: [
      {e:'💼', v:'l2_income', t:"The exhaustion of working this hard while the income still doesn't reflect what I actually know.", full:"The thing that follows me around is knowing how much I've invested in getting good at this, the years, the experience, the results I've produced, and still watching my income not reflect any of that. I'm not lazy. I'm not inexperienced. I just haven't figured out how to make what I know work for me at the scale it should."},
      {e:'📣', v:'l2_louder', t:"The frustration of watching people with less experience get paid more than me because they're louder online.", full:"It's not bitterness, it's just true. There are people in my space with a fraction of my experience who have built audiences, attracted clients, and created income I haven't because they figured out how to show up online and I haven't yet. The difference between us isn't the knowledge or the results. It's the visibility. And I'm tired of letting that be the reason."},
      {e:'🎁', v:'l2_free', t:'The resentment of giving away my best knowledge for free while others monetize the same thing.', full:"I give a lot away. In conversations, in consultations, in the advice I hand out before anyone has paid me a dollar. And somewhere in the back of my mind I know that the same knowledge I'm giving away for free is exactly what other people are building real income around. I want to stop being generous to everyone except myself."},
      {e:'⌛', v:'l2_window', t:"The fear that I've waited too long and the window to build something real is closing.", full:"The thing I don't say out loud is that I'm afraid the timing has passed. That the people who were going to build something already did, and I spent too long watching instead of starting. I know that's probably not true. But the longer I wait the louder that fear gets, and I'm done letting it make my decisions for me."}
    ]
  },
  desire: {
    1: [
      {e:'💛', v:'l1_known', t:'The joy of being known by exactly the right people for exactly who you are.', full:"What I'm actually chasing isn't fame or followers. It's the specific feeling of someone finding me, watching something I made, and thinking 'this is exactly who I was looking for.' To be known not as a version of myself I performed, but as the real one. That's what I want to feel before this is over."},
      {e:'✨', v:'l1_change', t:'The moment you realize your story actually changes something for someone.', full:"Somewhere in these seven videos there's a person who needs to hear exactly what I have to say, at exactly the moment I say it. I don't know who they are yet. But the idea that my story could land at the right moment for the right person, and actually shift something for them, is the reason I'm doing this."},
      {e:'🏁', v:'l1_finish', t:'The identity of being someone who showed up, followed through, and finished.', full:"Honestly, as much as this is about being seen by other people, it's also about what I need to prove to myself. That I'm someone who starts things and finishes them. That when I say I'm going to do something, I actually do it. Seven videos feels like the kind of thing that changes how I see myself, not just how others see me."},
      {e:'🤝', v:'l1_people', t:'The community of people who found you because you finally let them.', full:"What I want on the other side of this is people. Real ones who resonate with my story, who see themselves in what I share, who show up in my comments or my messages because something I said actually mattered to them. I don't want an audience. I want to find my people."}
    ],
    2: [
      {e:'🌅', v:'l2_life', t:'The life that opens up when your expertise finally has the reach it deserves.', full:"What I'm really after isn't just more income. It's what that income represents. The ability to choose my work, my hours, my clients, and my focus. The version of this where my knowledge is working for me even when I'm not in the room. That's the life I've been building toward and content is the thing that finally makes it possible."},
      {e:'🧲', v:'l2_clients', t:'The clients who arrive already convinced, already wanting what you do.', full:"The thing I want more than anything is to stop starting from zero in every conversation. To have people find me already understanding what I do, already believing in my approach, already decided that I'm the right person. Content is how that happens. That's why I'm here."},
      {e:'👑', v:'l2_authority', t:'The authority that makes every conversation start from a completely different place.', full:"There's a version of this where my name carries weight before I say a word. Where people come into a conversation with me already having a sense of who I am and what I stand for. That's not ego. That's what real visibility actually does. And I want to know what it feels like to operate from that place."},
      {e:'🕊️', v:'l2_freedom', t:'The freedom to do only the work you actually want to do.', full:"What I want at the end of this is options. The ability to say no to the wrong clients, the wrong projects, the wrong opportunities, because the right ones are finding me instead. Content is how you stop chasing work and start attracting it. That's the specific freedom I'm building toward."}
    ]
  }
};

const COMMITMENT_REASONS = [
  'to finally be someone who finishes what they start',
  'to get my story out before I talk myself out of it again',
  'to show up for the people who need to hear what I have to say',
  "to prove I'm ready even when I don't feel like it",
  'to stop letting fear make my decisions for me',
  "to build something real that I'm actually proud of"
];

function determineLevel() {
  const p2 = ensurePhase2();
  state.level = (p2.contentIntent === 'teach' && (state.business === 'yes' || state.business === 'building')) ? 2 : 1;
}

function renderContentIntentGrid() {
  const grid = document.getElementById('content-intent-grid');
  if (!grid) return;
  const p2 = ensurePhase2();
  grid.innerHTML = '';
  CONTENT_INTENT_OPTIONS.forEach(o => {
    const c = document.createElement('div');
    c.className = 'choice-card' + (p2.contentIntent === o.v ? ' selected' : '');
    c.onclick = function(){ selectContentIntent(o, this); };
    c.innerHTML = '<span class="card-emoji">' + o.e + '</span><div class="card-title">' + escapeHTML(o.t) + '</div><div class="card-sub">' + escapeHTML(o.s) + '</div>';
    grid.appendChild(c);
  });
}

// Shared renderer for static autoAdvance choice-card screens (screen-2a,
// screen-3). Mirrors renderContentIntentGrid()'s DOM-construction style,
// but wires cards to autoAdvance(this, key, value) instead of a
// select-and-stay handler, since these screens navigate away immediately
// on click and don't need to redraw a "selected" state.
function renderChoiceGrid(options, key, containerId) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = '';
  options.forEach(o => {
    const c = document.createElement('div');
    c.className = 'choice-card';
    c.onclick = function(){ autoAdvance(this, key, o.v); };
    c.innerHTML = '<span class="card-emoji">' + o.e + '</span><div class="card-title">' + escapeHTML(o.t) + '</div><div class="card-sub">' + escapeHTML(o.s) + '</div>';
    grid.appendChild(c);
  });
}

function selectContentIntent(option, el) {
  const p2 = ensurePhase2();
  p2.contentIntent = option.v;
  p2.contentIntentTitle = option.t;
  if (el) el.classList.add('selecting');
  saveProgress();
  setTimeout(goNext, 300);
}

function renderChoiceCustom(key, title, copy, buttonText) {
  const old = document.getElementById(key + '-custom-wrap');
  if (old) old.remove();
  const p2 = ensurePhase2();
  const wrap = document.createElement('div');
  wrap.className = 'choice-custom';
  wrap.id = key + '-custom-wrap';
  wrap.innerHTML =
    '<div class="choice-custom-title">' + escapeHTML(title) + '</div>' +
    '<div class="choice-custom-copy">' + escapeHTML(copy) + '</div>' +
    '<textarea class="text-input" rows="3" maxlength="1000" placeholder="Say it in your own words..." oninput="setCustomAnswer(\'' + key + '\', this.value)">' + escapeHTML(p2.custom[key] || '') + '</textarea>' +
    '<div class="btn-row"><button class="btn-secondary" onclick="useCustomRouteAnswer(\'' + key + '\',\'custom\')">' + escapeHTML(buttonText) + '</button></div>';
  return wrap;
}

function setCustomAnswer(key, value) {
  const p2 = ensurePhase2();
  p2.custom[key] = String(value || '').slice(0, 1000);
  saveProgress();
}

function useCustomRouteAnswer(key, fallbackValue) {
  const p2 = ensurePhase2();
  const text = (p2.custom[key] || '').trim();
  if (!text) return;
  if (key === 'minigoal') {
    state.minigoal = fallbackValue;
    state.minigoalText = text;
    const fill = document.getElementById('commitment-fill');
    if (fill) fill.textContent = text.toLowerCase();
  } else {
    state[key] = fallbackValue;
  }
  saveProgress();
  goNext();
}

function setPhase2Field(key, value) {
  const p2 = ensurePhase2();
  p2[key] = String(value || '').slice(0, key === 'knowledgeContext' ? 12000 : 1200);
  saveProgress();
}

function setTalkContext(value) {
  const p2 = ensurePhase2();
  const text = String(value || '').slice(0, 12000);
  state.topicFreewrite = text;
  p2.knowledgeContext = text;
  const input = document.getElementById('freewrite-input');
  if (input && input.value !== text) input.value = text;
  const count = document.getElementById('knowledge-count');
  if (count) count.textContent = text.length.toLocaleString() + ' / 12,000 characters';
  saveProgress();
}

function setKnowledgeContext(value) {
  const p2 = ensurePhase2();
  p2.knowledgeContext = String(value || '').slice(0, 12000);
  const input = document.getElementById('knowledge-context');
  if (input && input.value !== p2.knowledgeContext) input.value = p2.knowledgeContext;
  const count = document.getElementById('knowledge-count');
  if (count) count.textContent = p2.knowledgeContext.length.toLocaleString() + ' / 12,000 characters';
  saveProgress();
}

function renderContextMode() {
  const p2 = ensurePhase2();
  setContextMode(p2.contentMode || 'simple', false);
}

function setContextMode(mode, persist = true) {
  const p2 = ensurePhase2();
  p2.contentMode = mode === 'extended' ? 'extended' : 'simple';
  const simple = document.getElementById('context-simple-btn');
  const extended = document.getElementById('context-extended-btn');
  const card = document.getElementById('context-mode-card');
  const extendedPrompts = document.getElementById('extended-prompts');
  if (simple) simple.classList.toggle('active', p2.contentMode === 'simple');
  if (extended) extended.classList.toggle('active', p2.contentMode === 'extended');
  if (extendedPrompts) extendedPrompts.style.display = p2.contentMode === 'extended' ? 'block' : 'none';
  if (card) {
    card.textContent = p2.contentMode === 'extended'
      ? 'Extended gives the script builder more of your story, your audience, and your point of view.'
      : 'Simple is fast. We will use the answers you already gave, plus anything you paste below.';
  }
  if (persist) saveProgress();
}

function renderContextDetails() {
  renderTalkContext();
}

function renderTalkContext() {
  const p2 = ensurePhase2();
  const extended = document.getElementById('extended-prompts');
  const audience = document.getElementById('audience-context');
  const message = document.getElementById('message-context');
  const knowledge = document.getElementById('freewrite-input');
  setContextMode(p2.contentMode || 'simple', false);
  if (extended) extended.style.display = p2.contentMode === 'extended' ? 'block' : 'none';
  if (audience) audience.value = p2.audienceContext || '';
  if (message) message.value = p2.messageContext || '';
  if (knowledge) knowledge.value = state.topicFreewrite || p2.knowledgeContext || '';
  setTalkContext(state.topicFreewrite || p2.knowledgeContext || '');
}

function renderCommitmentCards(kind) {
  const p2 = ensurePhase2();
  const isPain = kind === 'pain';
  const grid = document.getElementById(isPain ? 'commit-pain-grid' : 'commit-desire-grid');
  if (!grid) return;
  const level = state.level || 1;
  const cards = COMMITMENT_COPY[kind][level] || COMMITMENT_COPY[kind][1];
  const subtitle = document.getElementById('commit-pain-subtitle');
  if (isPain && subtitle) {
    subtitle.textContent = level === 2
      ? 'What pain would finally be out of your life if your videos actually generated you real income and you were seen as an expert in your industry?'
      : 'What pain would finally be out of your life if you felt genuinely comfortable showing up and were getting massive exposure and increased influence in your community?';
  }
  grid.innerHTML = '';
  cards.forEach(cardData => {
    const card = document.createElement('div');
    const selected = isPain ? p2.commitmentPain === cardData.v : p2.commitmentDesire === cardData.v;
    card.className = 'choice-card' + (selected ? ' selected' : '');
    card.onclick = function(){ selectCommitment(kind, cardData.v, true, this); };
    card.innerHTML = '<span class="card-emoji">' + cardData.e + '</span><div class="card-title">' + escapeHTML(cardData.t) + '</div>';
    grid.appendChild(card);
  });
  grid.after(renderCommitmentCustom(kind));
}

function renderCommitmentCustom(kind) {
  const isPain = kind === 'pain';
  const key = isPain ? 'commitmentPainCustom' : 'commitmentDesireCustom';
  const old = document.getElementById(kind + '-commit-custom');
  if (old) old.remove();
  const p2 = ensurePhase2();
  const wrap = document.createElement('div');
  wrap.className = 'choice-custom';
  wrap.id = kind + '-commit-custom';
  wrap.innerHTML =
    '<div class="choice-custom-title">' + (isPain ? 'If none of these is quite right, say it in your own words.' : 'If none of these is quite right, describe the real thing you want.') + '</div>' +
    '<textarea class="text-input" rows="3" maxlength="1000" placeholder="' + (isPain ? "What's the real pain you're carrying?" : 'What would actually change in your life if this worked?') + '" oninput="setPhase2Field(\'' + key + '\', this.value)">' + escapeHTML(p2[key] || '') + '</textarea>' +
    '<div class="btn-row"><button class="btn-secondary" onclick="selectCommitment(\'' + kind + '\',\'custom\',true)">Use My Words</button></div>';
  return wrap;
}

function selectCommitment(kind, value, advance = false, el = null) {
  const p2 = ensurePhase2();
  if (el) el.classList.add('selecting');
  const cards = COMMITMENT_COPY[kind][state.level || 1] || [];
  const selected = cards.find(card => card.v === value);
  if (kind === 'pain') {
    if (value === 'custom' && !String(p2.commitmentPainCustom || '').trim()) return;
    p2.commitmentPain = value;
    p2.commitmentPainTitle = value === 'custom' ? p2.commitmentPainCustom : (selected ? selected.t : value);
    p2.commitmentPainText = value === 'custom' ? p2.commitmentPainCustom : (selected ? selected.full : value);
    p2.commitmentPainType = value === 'custom' ? 'custom' : 'card';
  } else {
    if (value === 'custom' && !String(p2.commitmentDesireCustom || '').trim()) return;
    p2.commitmentDesire = value;
    p2.commitmentDesireTitle = value === 'custom' ? p2.commitmentDesireCustom : (selected ? selected.t : value);
    p2.commitmentDesireText = value === 'custom' ? p2.commitmentDesireCustom : (selected ? selected.full : value);
    p2.commitmentDesireType = value === 'custom' ? 'custom' : 'card';
  }
  saveProgress();
  if (advance) setTimeout(() => goNext(), 300);
}

function setUserName(value) {
  state.name = String(value || '').trim().slice(0, 80);
  renderCommitmentDeclaration();
  saveProgress();
}

function naturalList(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return list[0] + ' and ' + list[1];
  return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
}

function removeLeadingTo(text) {
  return String(text || '').replace(/^to\s+/i, '');
}

function buildCommitmentDeclaration() {
  const p2 = ensurePhase2();
  const name = state.name || 'I';
  const reasons = naturalList(p2.commitmentReasons);
  const base = 'I, ' + name + ", commit to finishing all 7 videos no matter how long it takes, because this isn't a race or a streak challenge. It's a story I'm sharing with the people who need to hear it. I'm doing this because I want";
  return reasons ? base + ' ' + reasons + '.' : base + '...';
}

let _chipLocked = false;
function toggleCommitmentReason(reason) {
  // Lock prevents layout-shift ghost taps on mobile from registering
  if (_chipLocked) return;
  _chipLocked = true;
  setTimeout(() => { _chipLocked = false; }, 400);

  const p2 = ensurePhase2();
  const current = new Set(p2.commitmentReasons || []);
  if (current.has(reason)) current.delete(reason);
  else current.add(reason);
  p2.commitmentReasons = Array.from(current);
  // Targeted update — avoids rebuilding the chip DOM (prevents scroll jumps on mobile)
  p2.commitmentDeclaration = buildCommitmentDeclaration();
  const text = document.getElementById('commitment-declaration-text');
  if (text) text.textContent = p2.commitmentDeclaration;
  const reasonsEl = document.getElementById('commitment-reasons');
  if (reasonsEl) {
    reasonsEl.querySelectorAll('.commit-reason-chip').forEach(chip => {
      chip.classList.toggle('selected', p2.commitmentReasons.includes(chip.dataset.reason));
    });
  }
  saveProgress();
}

function toggleCommitmentReasonByIndex(index) {
  const reason = COMMITMENT_REASONS[index];
  if (reason) toggleCommitmentReason(reason);
}

function renderCommitmentDeclaration() {
  const p2 = ensurePhase2();
  const input = document.getElementById('user-name');
  if (input && input.value !== (state.name || '')) input.value = state.name || '';
  const title = document.getElementById('commit-title');
  if (title) {
    title.innerHTML = state.name
      ? "Let's make it <span class=\"accent\">real, " + escapeHTML(state.name) + ".</span>"
      : "Let's make it <span class=\"accent\">real.</span>";
  }
  const wrap = document.getElementById('commitment-declaration-wrap');
  const text = document.getElementById('commitment-declaration-text');
  const reasons = document.getElementById('commitment-reasons');
  if (wrap) wrap.style.display = state.name ? 'block' : 'none';
  p2.commitmentDeclaration = buildCommitmentDeclaration();
  if (text) text.textContent = p2.commitmentDeclaration;
  if (reasons) {
    reasons.innerHTML = COMMITMENT_REASONS.map((reason, idx) => {
      const selected = (p2.commitmentReasons || []).includes(reason);
      return '<button type="button" class="commit-reason-chip' + (selected ? ' selected' : '') + '" data-reason="' + escapeHTML(reason) + '" onclick="toggleCommitmentReasonByIndex(' + idx + ')">' + escapeHTML(reason) + '</button>';
    }).join('');
  }
}

const MISSION_SYSTEM_PROMPT = `You are writing a first-person mission statement for someone who just committed to completing a 7-video content challenge. This statement will live on their dashboard and should feel like their own words, not an outside analysis.

Write 3 grounded sentences, 65 to 90 words total.

Requirements:
1. Use first person: I, my, me.
2. Mention the real thing they are done carrying or moving beyond.
3. Mention what they are moving toward.
4. Include why being seen matters to them or to the people they want to reach.
5. End with a simple commitment to finish the 7 videos.

Tone: warm, direct, grounded, human. No corporate language. No buzzwords. No exclamation points. No diagnosis. No second-person analysis. No em dashes. No phrases like "embark on," "journey," or "unlock your potential." Return only the mission statement.`;

function cleanMissionText(text) {
  return String(text || '')
    .replace(/[—–]/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function buildMissionUserMessage() {
  const p2 = ensurePhase2();
  const custom = p2.custom || {};
  const blockerText = custom.blocker || blockerFullText[state.blocker] || blockerLabels[state.blocker] || state.blocker || '';
  return [
    'Name: ' + (state.name || '(not provided)'),
    'Posting history: ' + (historyLabels[state.posted] || state.posted || '(not provided)'),
    'What they are building: ' + (businessLabels[state.business] || state.business || '(not provided)'),
    'How they want to show up: ' + (p2.contentIntentTitle || p2.contentIntent || '(not provided)'),
    'What has been holding them back: ' + (blockerText || '(not provided)') + ' (source: ' + (custom.blocker ? 'custom' : 'card') + ')',
    'The pain they are running from: ' + (p2.commitmentPainText || '(not provided)') + ' (source: ' + (p2.commitmentPainType || 'card') + ')',
    'The vision they are running toward: ' + (p2.commitmentDesireText || '(not provided)') + ' (source: ' + (p2.commitmentDesireType || 'card') + ')',
    'Why they are committing to finish: ' + ((p2.commitmentReasons || []).join('; ') || '(not provided)'),
    'Their level: ' + ((state.level || 1) === 2 ? 'L2 Authority Series' : 'L1 Relatable Hero')
  ].join('\n');
}

function buildMissionFallback() {
  const p2 = ensurePhase2();
  const blocker = (p2.custom && p2.custom.blocker) || blockerFullText[state.blocker] || blockerLabels[state.blocker] || 'waiting until this feels easier';
  const pain = p2.commitmentPainText || blocker;
  const vision = p2.commitmentDesireText || 'becoming someone who follows through';
  const reasons = naturalList(p2.commitmentReasons) || 'finish what you started';
  return cleanMissionText('I am done letting ' + pain.charAt(0).toLowerCase() + pain.slice(1) + ' keep me quiet. I am moving toward ' + vision.charAt(0).toLowerCase() + vision.slice(1) + ', not because I need to perform, but because the right people cannot find the version of me I keep hidden. I am finishing these 7 videos because I want to ' + removeLeadingTo(reasons) + '.');
}

async function generateMissionForRecap() {
  const btn = document.getElementById('commitment-submit-btn');
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Writing your mission...'; }
  let missionText;
  try {
    const mission = await callDeepSeekAPIRaw(MISSION_SYSTEM_PROMPT, buildMissionUserMessage());
    missionText = cleanMissionText(mission) || buildMissionFallback();
  } catch(e) {
    missionText = cleanMissionText(buildMissionFallback());
  }
  const updatedPhase2 = ensurePhase2();
  updatedPhase2.missionStatement = cleanMissionText(missionText);
  updatedPhase2.missionGeneratedAt = new Date().toISOString();
  updatedPhase2.commitmentDeclaration = buildCommitmentDeclaration();
  state.phase2 = updatedPhase2;
  saveProgress();
  if (btn) { btn.disabled = false; btn.textContent = original || "I'm ready. Let's do this."; }
}

const MVO_TOPIC_CARDS = [
  {icon:'🌿',text:'Health, wellness, and feeling your best',
   village_full:'people on a wellness journey who want to feel better in their body, their energy, and their everyday life',
   village_hook:'If you are someone working on your health and how you feel in your own skin'},
  {icon:'💫',text:'Wealth, abundance, and building what is truly yours',
   village_full:'people building their finances or their business who want something real and grounded, not hype',
   village_hook:'If you are building wealth or a business and want someone who speaks plainly about what actually works'},
  {icon:'🌸',text:'Love, relationships, and the connections that matter',
   village_full:'people working on their relationships and the way they show up for the people they love and for themselves',
   village_hook:'If you are someone who wants to feel more connected and more at peace in your relationships'},
  {icon:'✨',text:'Good vibes, stories, and things that light you up',
   village_full:'people who want more joy, laughter, and lightness in their everyday life',
   village_hook:'If you just want more good things in your feed and something genuinely worth stopping to watch'}
];

const MVO_DATA = {
  q2:{
    1:{question:"What's been holding you back from posting?",
       placeholder:"Describe what's actually been in your way...",
       cards:[
         {icon:'😬',text:'Getting on camera feels terrifying',
          before_short:'the camera thing',
          before_full:'I have wanted to do this, but every time I think about filming, something shuts it down. The camera feels like a judgment I am not ready to face.'},
         {icon:'📋',text:'I never know what to say',
          before_short:'not knowing what to say',
          before_full:'I sit down to plan a video and my mind goes completely blank. I know I have something worth sharing. I just cannot seem to get it out.'},
         {icon:'⏳',text:'I do not feel ready yet',
          before_short:'waiting to feel ready',
          before_full:'There is always something that feels like it needs to happen first. More confidence, a better setup, a clearer plan. The readiness never quite arrives.'},
         {icon:'🔄',text:'I keep putting it off',
          before_short:'the endless delay',
          before_full:'I have been meaning to start for longer than I want to admit. Life gets in the way, or I get in the way. It just keeps not happening.'}
       ]},
    2:{question:"What does your audience come to you for?",
       placeholder:"What topic or niche does your content focus on?",
       cards:MVO_TOPIC_CARDS}
  },
  q3:{
    1:{question:"What made you decide today is the day?",
       placeholder:"What actually pushed you to start today?",
       cards:[
         {icon:'👀',text:'I saw someone just like me doing it',
          catalyst_full:'Something shifted when I watched someone who looked just like me, no big following, no fancy setup, just showing up, and it was actually working. If they could do it, the reason I could not was only me.'},
         {icon:'🔥',text:'I got tired of waiting to feel ready',
          catalyst_full:'I realized the feeling of ready is not coming. No amount of planning or consuming more content is going to get me there. The only way forward is to start, and the only day I can start is today.'},
         {icon:'💬',text:'Someone told me I needed to start',
          catalyst_full:'Someone I trust looked at me and said it was time. And somewhere under all my reasons for waiting, I knew they were right. So here I am.'},
         {icon:'⚡',text:'I just decided. No more waiting.',
          catalyst_full:'There was no big moment. I just decided. I looked at where I was heading if I kept waiting and decided that was not the version of this story I wanted to tell.'}
       ]},
    2:{question:"What's the biggest challenge your audience is dealing with?",
       placeholder:"Describe the main challenge your audience faces...",
       cards:[
         {icon:'👤',text:'They feel invisible in their niche',
          before_full:'The people I work with are genuinely good at what they do, but nobody knows they exist. They watch others with less skill get the attention, the clients, the opportunities, and they cannot figure out how to change that.'},
         {icon:'🌊',text:'They feel overwhelmed and stuck',
          before_full:'The people I work with know what they want, but the path there feels impossibly complicated. They are doing everything, nothing is clicking, and the gap between where they are and where they want to be keeps growing.'},
         {icon:'🧱',text:'They know what they want but cannot get there',
          before_full:'The people I work with can see exactly where they want to be. The problem is every time they get close, something blocks them, or they second-guess themselves back to square one.'},
         {icon:'📉',text:'They are undercharging or undervalued',
          before_full:'The people I work with are delivering real results but not getting paid what that is worth. They have to prove themselves over and over to clients who do not see the value they actually provide.'}
       ]}
  },
  q4:{
    1:{question:"What do you want to make videos about?",
       placeholder:"What topic or niche do you want to focus on?",
       cards:MVO_TOPIC_CARDS},
    2:{question:"What makes you the right person to help them?",
       placeholder:"What have you done, built, or lived through that gives you real insight here?",
       cards:[
         {icon:'🗺️',text:'I have been exactly where they are',
          crack_full:'I know this because I have been exactly where they are. I lived through the thing they are dealing with and found a way through it. That is not a pitch. That is why this work matters to me.'},
         {icon:'🔨',text:'I built something that actually works',
          crack_full:'I know this because I built a system that solved it. Not a theory borrowed from someone else, something I put together through years of actual work that produces real results.'},
         {icon:'🤝',text:'I have helped dozens of people through this',
          crack_full:'I know this because I have watched dozens of people work through this problem. I have seen every version of what keeps people stuck and I know what actually moves things forward.'},
         {icon:'🔍',text:'I see the patterns they cannot see',
          crack_full:'I know this because I can see what they cannot see from inside it. When you are stuck in a problem, it looks like a wall. From where I stand, I can see the door. That is what I bring.'}
       ]}
  }
};


const INTRO_COPY = {
  1: {
    L1: {
      label: 'Video 1 of 7: The Origin Signal',
      title: "Let's Start With Why You're Here",
      body: "You're about to build your first script. This is Video 1 of 7, the one that opens the door. We're going to ask you three quick questions, then generate your script from your answers. After this, you get six more. Each one tells a different story: your turning point, your first big realization, how you think differently, where you are now, the thing most people get wrong, and the moment you decided to own your space. Seven videos. A real arc. Proof that you show up. This is where it starts.",
      result: 'Recognition',
      framework: [
        {name:'Hook',                   trigger:'Audience Signal'},
        {name:'Identity',               trigger:'Trust Layer'},
        {name:'The Waiting Struggle',   trigger:'Empathy Lock / Mirror Moment'},
        {name:'The Start Declaration',  trigger:'Open Loop'}
      ],
      triggers: ['Audience Signal','Empathy Lock','Mirror Moment','Contrast Shift','Trust Layer','Open Loop','Relationship Primer']
    },
    L2: {
      label: 'Video 1 of 7: The Origin Signal',
      title: "Let's Start With Why You're Here",
      body: "You're about to build your first expert script. This is Video 1 of 7, the one that signals you're here and you know your space. We'll ask you three questions, then build your script from your answers. What comes next is a full arc: your origin story, your first industry reframe, how you think about the work, what others get wrong, and why your audience should keep coming back. Seven videos. Real authority. A content body that actually does something for your business. Three questions. Let's go.",
      result: 'Recognition',
      framework: [
        {name:'Hook',                     trigger:'Audience Signal'},
        {name:'Expertise',                trigger:'Trust Layer'},
        {name:'The Market Gap',           trigger:'Empathy Lock / Mirror Moment'},
        {name:'The Solution Declaration', trigger:'Open Loop'}
      ],
      triggers: ['Audience Signal','Empathy Lock','Mirror Moment','Contrast Shift','Trust Layer','Open Loop','Relationship Primer']
    }
  },
  2: {
    L1: {
      label: 'Video 2 of 7: The Turning Point',
      title: 'Tell Them What Finally Moved You',
      body: "People don't follow creators because of what they do. They follow them because of why they started. This video gives your audience a reason to root for you. You're not being dramatic. You're being honest about the moment everything shifted. That honesty is what turns a viewer into a follower.",
      result: 'Inspiration',
      framework: [
        {name:'Hook',                        trigger:'Catalyst Moment'},
        {name:'The Internal Conflict',       trigger:'Vulnerability Entry'},
        {name:'The False Solution',          trigger:'Enemy Identification'},
        {name:'The Decision to Show Up',     trigger:'Agency Reclaim / Path Clarity'}
      ],
      triggers: ['Vulnerability Entry','Catalyst Moment','Enemy Identification','Agency Reclaim','Relatable Stakes','Path Clarity','Shared Mission']
    },
    L2: {
      label: 'Video 2 of 7: The Origin Story',
      title: 'Show Them Why You Built This',
      body: "Your audience doesn't just want to buy from you. They want to understand you. This video answers the question they're already asking: why did you build this, and why should I trust you? You're not pitching anything. You're showing them the moment you decided this work mattered.",
      result: 'Inspiration',
      framework: [
        {name:'Hook',                        trigger:'Catalyst Moment'},
        {name:'The Industry Frustration',    trigger:'Vulnerability Entry'},
        {name:'The Broken Method',           trigger:'Enemy Identification'},
        {name:'The Decision to Innovate',    trigger:'Agency Reclaim / Path Clarity'}
      ],
      triggers: ['Vulnerability Entry','Catalyst Moment','Enemy Identification','Agency Reclaim','Relatable Stakes','Path Clarity','Shared Mission']
    }
  },
  3: {
    L1: {
      label: 'Video 3 of 7: The First Epiphany',
      title: "Say The Thing Most People Won't",
      body: "Every person watching you held some version of the belief you're about to challenge. This video isn't about being controversial. It's about being the person who finally said the thing they'd been thinking but never heard out loud. One honest reframe, told through your real experience, is what builds intellectual trust.",
      result: 'Insight',
      framework: [
        {name:'Hook',                             trigger:'Pattern Break'},
        {name:'The Struggle Story',               trigger:'Discovery Arc'},
        {name:'The "Aha" Moment',                 trigger:'Cognitive Reframe'},
        {name:'The Cost of Staying Invisible',    trigger:'Cost Revelation / Simplicity Signal'}
      ],
      triggers: ['Pattern Break','Discovery Arc','Cognitive Reframe','The "Aha" Transfer','Cost Revelation','Simplicity Signal','Authority Anchor']
    },
    L2: {
      label: 'Video 3 of 7: The First Epiphany',
      title: 'Challenge What Your Industry Gets Wrong',
      body: "Your audience has been told things that aren't working for them. This video positions you as someone who sees what others miss. You're not tearing down your industry. You're offering a better lens. One clear reframe, backed by what you've actually seen, is what makes people think: this person gets it.",
      result: 'Insight',
      framework: [
        {name:'Hook',                             trigger:'Pattern Break'},
        {name:'The Research/Work Story',          trigger:'Discovery Arc'},
        {name:'The New Insight',                  trigger:'Cognitive Reframe'},
        {name:'The Cost of the Wrong Method',     trigger:'Cost Revelation / Simplicity Signal'}
      ],
      triggers: ['Pattern Break','Discovery Arc','Cognitive Reframe','The "Aha" Transfer','Cost Revelation','Simplicity Signal','Authority Anchor']
    }
  },
  4: {
    L1: {
      label: 'Video 4 of 7: The Progress Signal',
      title: "Show Them You're Still Doing This",
      body: "Most people disappear after their first few videos. You're still here, and that matters more than you think. This video is proof that you're the kind of person who follows through. You don't have to have everything figured out. You just have to be honest about where you are and why you're still going.",
      result: 'Credibility',
      framework: [
        {name:'Hook',                    trigger:'Momentum Validation'},
        {name:'The Experience So Far',   trigger:'Small Win Proof'},
        {name:'The Reality of the Work', trigger:'Real-Time Transparency'},
        {name:'The Forward Shift',       trigger:'Social Evidence'}
      ],
      triggers: ['Behind-the-Curtain Access','Momentum Validation','Small Win Proof','Expert Ease','Objection Pre-emption','Real-Time Transparency','Social Evidence']
    },
    L2: {
      label: 'Video 4 of 7: The Teaching Moment',
      title: 'Give Them Something They Can Use Right Now',
      body: "This is where you demonstrate real value, not by talking about what you offer, but by actually giving something useful. One insight, explained simply, proves your expertise better than any testimonial. The person watching is already asking: can this person actually help me? Answer it by teaching.",
      result: 'Credibility',
      framework: [
        {name:'Hook',                   trigger:'Momentum Validation'},
        {name:'The Live Demonstration', trigger:'Method / Expert Ease'},
        {name:'The Specific Result',    trigger:'Small Win Proof'},
        {name:'The Client Evidence',    trigger:'Social Evidence'}
      ],
      triggers: ['Behind-the-Curtain Access','Momentum Validation','Small Win Proof','Expert Ease','Objection Pre-emption','Real-Time Transparency','Social Evidence']
    }
  },
  5: {
    L1: {
      label: 'Video 5 of 7: The Second Epiphany',
      title: 'Plant Your Flag',
      body: "You've shown up, shared your story, and kept going. Now it's time to state what you actually believe. This video is about the conviction you hold that most people in your world have backwards. You're not here to convince anyone. You're here to resonate with the people who already feel it too.",
      result: 'Authority',
      framework: [
        {name:'Hook',               trigger:'Sacred Cow Slaughter'},
        {name:'The False Belief',   trigger:'Logic Re-stack'},
        {name:'The New Realization',trigger:'Paradigm Break'},
        {name:'The Future Self',    trigger:'Status Shift / Natural Invitation'}
      ],
      triggers: ['Sacred Cow Slaughter','Logic Re-stack','Emotional Safety','Paradigm Break','Future Pacing','Status Shift','Natural Invitation']
    },
    L2: {
      label: 'Video 5 of 7: The Second Epiphany',
      title: 'Let Them See Your Character',
      body: "By now, your audience has seen you show up, teach, and share your origin. This video is where they get to see your judgment. A mistake you made, the lesson it cost you, and how it changed how you work... that combination creates something testimonials can't: genuine trust in who you are.",
      result: 'Authority',
      framework: [
        {name:'Hook',                    trigger:'Sacred Cow Slaughter'},
        {name:'The Industry Myth',       trigger:'Logic Re-stack'},
        {name:'The Better Way',          trigger:'Paradigm Break'},
        {name:'The Natural Solution',    trigger:'Status Shift / Natural Invitation'}
      ],
      triggers: ['Sacred Cow Slaughter','Logic Re-stack','Emotional Safety','Paradigm Break','Future Pacing','Status Shift','Natural Invitation']
    }
  },
  6: {
    L1: {
      label: 'Video 6 of 7: The Alignment Moment',
      title: 'Connect Your Story To Their Future',
      body: "Your audience is starting to get you. Now they need to understand what you actually want for them. This video connects your journey to their possibility. It's not a pitch. It's an alignment moment. The right person is watching and asking: is this for me? This video answers yes, without pressure.",
      result: 'Alignment',
      framework: [
        {name:'Hook',                  trigger:'Identity Call-to-Arms'},
        {name:'The Internal Values',   trigger:'Shared Values'},
        {name:'Who This Is For',       trigger:'Polarization'},
        {name:'The Personal Mission',  trigger:'Ethical Bridge'}
      ],
      triggers: ['Identity Call-to-Arms','Shared Values','Transformation Story','External Validation','In-Group Belonging','Polarization','Ethical Bridge']
    },
    L2: {
      label: 'Video 6 of 7: The Alignment Moment',
      title: "Walk Them Through What It's Like to Work With You",
      body: "People don't buy outcomes. They buy confidence in the process that gets them there. This video walks your audience through what it actually feels like to work with you, without selling anything. You're showing them the transformation through the experience, not the promise.",
      result: 'Alignment',
      framework: [
        {name:'Hook',                  trigger:'Identity Call-to-Arms'},
        {name:'The Business Values',   trigger:'Shared Values'},
        {name:'Who We Serve',          trigger:'Polarization'},
        {name:'The Industry Mission',  trigger:'Ethical Bridge'}
      ],
      triggers: ['Identity Call-to-Arms','Shared Values','Transformation Story','External Validation','In-Group Belonging','Polarization','Ethical Bridge']
    }
  },
  7: {
    L1: {
      label: 'Video 7 of 7: The Resolution',
      title: 'Close The Arc. Open The Door.',
      body: "This is the final video, and it's the most important one for building loyalty. You started this challenge as someone deciding to show up. You're finishing it as someone who did. That arc is the story. Share what this actually did for you, what surprised you, and leave the right person an honest open door.",
      result: 'Loyalty',
      framework: [
        {name:'Hook',               trigger:'Full Circle Loop'},
        {name:'The Internal Shift', trigger:'New Normal Declaration'},
        {name:'The Final Lesson',   trigger:'Authority Affirmation'},
        {name:'The New Chapter',    trigger:'Unfolding Horizon'}
      ],
      triggers: ['Full Circle Loop','Narrative Satisfaction','New Normal Declaration','Reciprocity','Bridge to Forever','Authority Affirmation','Unfolding Horizon']
    },
    L2: {
      label: 'Video 7 of 7: The Resolution',
      title: 'Reflect On What You Built. Invite The Right Person.',
      body: "Seven videos. That's a full story: your origin, your beliefs, your process, your character. This final video closes the arc. You're reflecting on what you set out to do and what actually happened. And you're leaving one open door for exactly the right person. No hard sell. Just honest intention.",
      result: 'Loyalty',
      framework: [
        {name:'Hook',                      trigger:'Full Circle Loop'},
        {name:'The Business Shift',        trigger:'New Normal Declaration'},
        {name:'The Final Proof',           trigger:'Authority Affirmation'},
        {name:'The Partnership Invitation',trigger:'Unfolding Horizon'}
      ],
      triggers: ['Full Circle Loop','Narrative Satisfaction','New Normal Declaration','Reciprocity','Bridge to Forever','Authority Affirmation','Unfolding Horizon']
    }
  }
};

const VIDEO_EASY_PROMPTS = [
  null, // V1 uses pre-filled fields, no easy mode needed
  // V2 — YOUR ORIGIN
  { label: 'Tell me your origin story', hint: 'How did you become the person you are today, and what shaped the way you see things? Could be one pivotal moment, or just the honest version of your background.', key: 'easyAnswer_v1' },
  // V3 — YOUR EPIPHANY
  { label: 'What\'s a belief you held for a long time that turned out to be wrong?', hint: 'What cracked it open? Walk me through how you arrived at seeing it differently. The journey matters more than the conclusion.', key: 'easyAnswer_v2' },
  // V4 — YOUR REALITY CHECK
  { label: 'What\'s actually been happening since you started?', hint: 'The real version, not the highlight reel. What\'s been harder than expected? What surprised you? What\'s actually working?', key: 'easyAnswer_v3' },
  // V5 — YOUR TRUTH
  { label: 'What do you believe that most people in your situation won\'t say out loud?', hint: 'The thing you\'d say if you weren\'t worried about being judged. A conviction, a truth, a flag you want to plant.', key: 'easyAnswer_v4' },
  // V6 — YOUR CONFESSION
  { label: 'What\'s something you\'ve been avoiding saying out loud?', hint: 'The thing that would make you feel most exposed. Not for shock. For honesty. The thing that would make the right people lean in.', key: 'easyAnswer_v5' },
  // V7 — YOUR ELIXIR
  { label: 'What did doing these 7 videos teach you that you didn\'t know at the start?', hint: 'The honest accounting. What changed? What would you tell yourself at the beginning? What do you want to give your audience?', key: 'easyAnswer_v6' },
];

const videoPromptMode = {};

const SCRIPT_LOADING_MSGS = [
  "The best video you'll make is the honest one.",
  "You don't need perfect. You need real.",
  "Every creator you admire hit record before they were ready.",
  "The script is the easy part. Pressing record is the brave part.",
  "People follow people who show up. You're showing up.",
  "Your voice is the thing no one else can replicate.",
  "The right viewer has been waiting for someone exactly like you.",
  "Done beats perfect every single time.",
  "One video changes nothing. Seven videos changes everything.",
  "You already know what to say. You just need to say it.",
  "The camera doesn't see your nerves. It sees your conviction.",
  "What you share today might be exactly what someone needs.",
  "Clarity comes from doing, not from thinking about doing.",
  "You're not performing. You're connecting.",
  "The version of you that posts this is who you're becoming.",
  "Starting is the hardest part. You already started.",
  "Your story is already inside you. This just helps you say it out loud.",
  "Every great series started with a single video. This is yours.",
];

function phase2ValueText(kind, value, customValue) {
  if (value === 'custom' && customValue) return customValue;
  const data = COMMITMENT_COPY[kind] || {};
  const cards = [].concat(data[1] || [], data[2] || []);
  const found = cards.find(card => card.v === value);
  if (found) return found.full || found.t || value || '';
  return value || '';
}

function buildPhase2ContextLines() {
  const p2 = ensurePhase2();
  const lines = [];
  const custom = p2.custom || {};
  if (custom.blocker) lines.push('- Blocker in their own words: ' + custom.blocker);
  if (p2.contentIntentTitle) lines.push('- Content intent: ' + p2.contentIntentTitle);
  lines.push('- Context mode: ' + (p2.contentMode === 'extended' ? 'Extended' : 'Simple'));
  if (p2.audienceContext) lines.push('- Audience context: ' + p2.audienceContext);
  if (p2.messageContext) lines.push('- Desired audience reaction: ' + p2.messageContext);
  if (p2.firstScriptNotes) lines.push('- Extra first-script notes: ' + p2.firstScriptNotes);
  const pain = p2.commitmentPainText || phase2ValueText('pain', p2.commitmentPain, p2.commitmentPainCustom);
  const desire = p2.commitmentDesireText || phase2ValueText('desire', p2.commitmentDesire, p2.commitmentDesireCustom);
  if (pain) lines.push('- Pain content should help resolve: ' + pain);
  if (desire) lines.push('- Vision they want content to create: ' + desire);
  if (p2.commitmentDeclaration) lines.push('- Commitment declaration: ' + p2.commitmentDeclaration);
  if (p2.missionStatement) lines.push('- Dashboard mission statement: ' + p2.missionStatement);
  return lines;
}

const VIDEO_STORY_LABELS = [
  'YOUR INTRODUCTION',   // V1
  'YOUR ORIGIN',         // V2
  'YOUR EPIPHANY',       // V3
  'YOUR REALITY CHECK',  // V4
  'YOUR TRUTH',          // V5
  'YOUR CONFESSION',     // V6
  'YOUR ELIXIR',         // V7
];

const VIDEO_STORY_BEATS = [
  // V1 — YOUR INTRODUCTION (Audience Signal, Trust Layer, Empathy Lock)
  ['Audience Signal: mirror the universal experience of wanting to start but not starting',
   'Trust Layer: name, one grounding detail, personality through HOW you talk',
   'Empathy Lock: your specific flavor of why you haven\'t been doing this (your blocker)',
   'Open Loop: you\'re doing this challenge, forward motion + uncertainty'],
  // V2 — YOUR ORIGIN (Catalyst, Vulnerability, Enemy Identification, Agency Reclaim)
  ['Catalyst Moment: the surprising/unexpected detail that makes viewers curious about you',
   'Vulnerability Entry: something real about who you are that people wouldn\'t guess',
   'Enemy Identification: the gap between how the world sees you and who you actually are',
   'Agency Reclaim: connecting who you are to why you\'re here, in your own words'],
  // V3 — YOUR EPIPHANY (7-beat structure)
  ['Pattern Break: a familiar experience seen an unfamiliar way (cognitive friction)',
   'Discovery Arc: how you arrived at the insight (the journey, not just the conclusion)',
   'Cognitive Reframe: the old lens cracks; the new one snaps into place',
   '"Aha" Transfer: the viewer receives a tool they can actually use after this video',
   'Cost Revelation: what it costs to not see it this way (honest, not fear-based)',
   'Simplicity Signal: the reframe in one sentence. Screenshot-worthy.',
   'Authority Anchor: viewer associates you with insight without you claiming it'],
  // V4 — YOUR REALITY CHECK (Momentum Validation, Behind-the-Curtain, Objection Pre-emption)
  ['Momentum Validation: acknowledge what\'s actually happened (no inflation, no minimizing)',
   'Behind-the-Curtain Access: show the real texture, not the highlight reel',
   'Small Win Proof: concrete, specific evidence that something is working',
   'Real-Time Transparency: this is happening now, not a polished retrospective',
   'Objection Pre-emption: address the doubt your audience already has'],
  // V5 — YOUR TRUTH (Conviction, Discovery, Cost)
  ['Convicted Belief Challenge: plant a flag: something you believe most people won\'t say',
   'Discovery of the Lie: the moment you realized the old way wasn\'t working',
   'Cost of the Old Way: what it cost you (and costs others) to stay in the old belief',
   'The Reframe: what you believe instead, stated with quiet certainty'],
  // V6 — YOUR CONFESSION (The Unsaid Thing, Root, Internal Battle, Admission)
  ['The Unsaid Thing: name what nobody\'s been saying out loud',
   'The Root: where does this actually come from? The real origin.',
   'The Internal Battle: the back-and-forth said out loud, present tense',
   'The Admission: the thing you finally let yourself say'],
  // V7 — YOUR ELIXIR (Return, Full Circle, The Gift)
  ['The Return with the Elixir: you\'re not the same person who started Video 1',
   'Full Circle: loop back to where you started, the audience feels the arc close',
   'What Changed: not performance of growth, but the actual honest accounting',
   'The Gift: what you want to give your audience, a truth, a permission, a next step'],
];





function populateRecap() {
  const p2 = ensurePhase2();
  const name = state.name || 'You';
  const level = state.level || 1;
  const miniMission = document.getElementById('recap-mini-mission');
  const emojiEl = document.getElementById('recap-level-emoji');
  const headingEl = document.getElementById('recap-hero-heading');
  const nameEl = document.getElementById('recap-level-name');
  const msgEl = document.getElementById('recap-level-message');

  if (miniMission) miniMission.innerHTML = '<span class="recap-mini-mission-label">Mission Statement:</span> ' + escapeHTML(cleanMissionText(p2.missionStatement || buildMissionFallback()));

  if (level === 1) {
    if (emojiEl) emojiEl.textContent = '⭐';
    if (headingEl) headingEl.innerHTML = name !== 'You'
      ? escapeHTML(name) + ", You're<br>The Hero of This Story."
      : "You're The Hero<br>of This Story.";
    if (nameEl) nameEl.textContent = 'LEVEL 1 - THE RELATABLE HERO';
    if (msgEl) msgEl.innerHTML = 'Your 7 videos are about <strong style="color:var(--cream)">you as a person</strong>: who you are, what you believe, and what you have lived through. No business required. No expertise needed. Just your voice, your story, and the willingness to show up.';
  } else {
    if (emojiEl) emojiEl.textContent = '🔥';
    if (headingEl) headingEl.innerHTML = name !== 'You'
      ? escapeHTML(name) + ", You're<br>The Expert in the Room."
      : "You're The Expert<br>in the Room.";
    if (nameEl) nameEl.textContent = 'LEVEL 2 - THE AUTHORITY SERIES';
    if (msgEl) msgEl.innerHTML = 'Your 7 videos position you as the <strong style="color:var(--cream)">go-to person in your space</strong>: your offer, your beliefs, your process, and your point of view. You have something useful to say. Now it gets organized.';
  }

  p2.commitmentDeclaration = p2.commitmentDeclaration || buildCommitmentDeclaration();
}

// ── API SCRIPT ENGINE ────────────────────────────────

async function callDeepSeekAPI(userMessage) {
  return callDeepSeekAPIRaw(SYSTEM_PROMPT, userMessage);
}

// One automatic, silent retry on failure — the user never sees the first
// attempt fail. Only after both attempts fail does the caller's own catch
// block show the error screen. Keeps script generation from dead-ending
// on a single transient hiccup, without silently substituting a template
// (unlike the mission-statement generator, which falls back automatically).
async function callDeepSeekAPIWithRetry(userMessage, retries = 1) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const script = await callDeepSeekAPI(userMessage);
      if (!script) throw new Error('No script returned. Empty response from API.');
      return script;
    } catch(e) {
      lastErr = e;
      if (attempt < retries) {
        window._SIS_log && _SIS_log('gen:retry', {attempt: attempt + 1, error: e.message});
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }
  throw lastErr;
}

async function callDeepSeekAPIRaw(systemMsg, userMsg) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 28000);
  let response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemMsg, userMsg }),
      signal: controller.signal
    });
  } catch(e) {
    if (e.name === 'AbortError') throw new Error('The request took too long and timed out. Please try again.');
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ? err.error : 'API error ' + response.status);
  }
  const data = await response.json();
  return data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content.trim() : null;
}

// Parse [HOOK] / [OPEN LOOP] / [MEAT] / [CTA] sections from AI response
function parseScriptSections(scriptText) {
  if (!scriptText) return null;
  const sections = { HOOK: '', 'OPEN LOOP': '', MEAT: '', CTA: '' };
  const sectionOrder = ['HOOK', 'OPEN LOOP', 'MEAT', 'CTA'];
  // Find each label and extract content between it and the next label (or end)
  for (let i = 0; i < sectionOrder.length; i++) {
    const label = sectionOrder[i];
    const tag = '[' + label + ']';
    const startIdx = scriptText.indexOf(tag);
    if (startIdx === -1) continue;
    const contentStart = startIdx + tag.length;
    // Find the next section tag
    let endIdx = scriptText.length;
    for (let j = i + 1; j < sectionOrder.length; j++) {
      const nextTag = '[' + sectionOrder[j] + ']';
      const nextIdx = scriptText.indexOf(nextTag, contentStart);
      if (nextIdx !== -1 && nextIdx < endIdx) endIdx = nextIdx;
    }
    sections[label] = scriptText.slice(contentStart, endIdx).trim();
  }
  // If no sections were parsed (AI didn't use format), return null to fall back
  const hasContent = Object.values(sections).some(v => v.length > 0);
  return hasContent ? sections : null;
}

// Build full script text from sections object
function sectionsToFullScript(sections) {
  if (!sections) return '';
  return [sections.HOOK, sections['OPEN LOOP'], sections.MEAT, sections.CTA]
    .filter(Boolean).join('\n\n');
}

// Show feedback modal before regenerating — returns promise resolving to feedback string (or null if cancelled)
function showRegenModal(sectionKey) {
  return new Promise(function(resolve) {
    var overlay = document.getElementById('regen-modal-overlay');
    var textarea = document.getElementById('regen-modal-textarea');
    var title = document.getElementById('regen-modal-title');
    var submitBtn = document.getElementById('regen-modal-submit');
    var improveBtn = document.getElementById('regen-modal-improve');

    title.textContent = 'What would you like to change about the ' + sectionKey + '?';
    textarea.value = '';
    overlay.classList.add('show');
    setTimeout(function(){ textarea.focus(); }, 80);

    function cleanup() {
      overlay.classList.remove('show');
      submitBtn.onclick = null;
      improveBtn.onclick = null;
      overlay.onclick = null;
    }

    submitBtn.onclick = function() {
      var feedback = textarea.value.trim();
      cleanup();
      resolve(feedback || 'improve it');
    };

    improveBtn.onclick = function() {
      cleanup();
      resolve('improve it');
    };

    // Dismiss on backdrop click
    overlay.onclick = function(e) {
      if (e.target === overlay) { cleanup(); resolve(null); }
    };

    // Submit on Enter (Shift+Enter = newline)
    textarea.onkeydown = function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var feedback = textarea.value.trim();
        cleanup();
        resolve(feedback || 'improve it');
      }
    };
  });
}

// Regenerate a single section of a script
async function regenerateSection(videoIdx, sectionKey, btnEl) {
  const editKey = 'script_v' + videoIdx;
  const sectionsKey = 'sections_v' + videoIdx;
  // Ask what they'd like to change before doing anything
  const regenFeedback = await showRegenModal(sectionKey);
  if (regenFeedback === null) return; // user dismissed modal

  const originalText = btnEl ? btnEl.textContent : '';
  if (btnEl) { btnEl.textContent = '⏳ Regenerating...'; btnEl.disabled = true; }

  const level = state.level || 1;
  const videoNum = videoIdx + 1;
  const sections = state.videos[sectionsKey] || {};
  const currentScript = state.videos[editKey] || '';

  // Build context from the current script and section
  const sectionSystemMsg = `You are the Script Engine for the 7 Video Challenge by Build With Bee. Your job is to regenerate ONE specific section of an existing video script.

The speaker's full current script is provided. Regenerate ONLY the [${sectionKey}] section.

Rules for ${sectionKey} regeneration:
${sectionKey === 'HOOK' ? '- The hook must stop the scroll in the first 7 words\n- Start mid-thought, no "hey guys" or "in this video"\n- 1-3 sentences\n- Must feel specific, not generic' : ''}
${sectionKey === 'OPEN LOOP' ? '- Creates tension or curiosity between the hook and the main content\n- Signals something important is coming without revealing it\n- 2-4 sentences\n- Should feel like a story being suspended mid-breath' : ''}
${sectionKey === 'MEAT' ? '- The heart of the video — all the structural beats, in the speaker\'s voice\n- 120-160 words\n- Use all the journal answers provided\n- Must flow naturally from the Open Loop' : ''}
${sectionKey === 'CTA' ? '- The forward pull — earns the follow without demanding it\n- 1-3 sentences\n- Conversational, not transactional\n- Must feel like a natural ending to THIS specific video' : ''}

Return ONLY the new ${sectionKey} section text — no label, no other sections, no commentary.`;

  const sectionUserMsg = `VIDEO: ${videoNum}, LEVEL: ${level}

CURRENT FULL SCRIPT (for context):
${currentScript}

FEEDBACK FOR THIS REGENERATION: ${regenFeedback}

Regenerate ONLY the [${sectionKey}] section, applying the feedback above. Return only the new section text.`;

  try {
    const newSectionText = await callDeepSeekAPIRaw(sectionSystemMsg, sectionUserMsg);
    if (!newSectionText) throw new Error('Empty response');

    // Update sections state
    const updatedSections = Object.assign({}, sections);
    updatedSections[sectionKey] = newSectionText.trim();
    state.videos[sectionsKey] = updatedSections;

    // Rebuild full script from updated sections
    state.videos[editKey] = sectionsToFullScript(updatedSections);

    // Also update the editor textarea if visible
    const editor = document.getElementById('script-editor');
    if (editor) editor.value = state.videos[editKey];

    // Update just this section's text in the guided view
    const sectionEl = document.getElementById('sv-section-text-' + sectionKey.replace(' ', '-'));
    if (sectionEl) sectionEl.textContent = newSectionText.trim();

    saveProgress();
    // Push undo snapshot after section regen — but do NOT call queueScriptSave
    // (new DB version is only created via Lock In or Delete & Start Over)
    if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot(videoIdx);
    if (typeof flashSavedIndicator === 'function') flashSavedIndicator();
    if (btnEl) { btnEl.textContent = '✅ Done'; btnEl.disabled = false; setTimeout(() => { if (btnEl) btnEl.textContent = '↺ regenerate'; }, 2000); }
  } catch(err) {
    if (btnEl) { btnEl.textContent = '⚠️ Error'; btnEl.disabled = false; setTimeout(() => { if (btnEl) btnEl.textContent = originalText; }, 3000); }
    console.error('Regenerate section error:', err);
  }
}

function buildAPIUserMessage(videoIdx) {
  const level = state.level || 1;
  const videoNum = videoIdx + 1;
  const sv = state.videos;
  const name = state.name || '';
  const p2 = ensurePhase2();

  // Onboarding data block
  const lines = ['- Name: ' + (name || '(not provided)')];
  lines.push('- Posting experience: ' + (historyLabels[state.posted] || (state.posted === 'no' ? 'No, never' : state.posted || '(not provided)')));
  if (state.history) lines.push('- Posting history: ' + (historyLabels[state.history] || state.history));
  if (state.blocker) lines.push('- Blocker: ' + (blockerLabels[state.blocker] || state.blocker));
  if (state.business) lines.push('- Business stage: ' + (businessLabels[state.business] || state.business));
  const customLines = buildPhase2ContextLines();
  customLines.forEach(line => lines.push(line));
  const commitText = p2.commitmentDeclaration || buildCommitmentDeclaration();
  lines.push('- Commitment: ' + commitText);

  if (state.topicFreewrite) lines.push('- Topic / what they want to talk about: ' + state.topicFreewrite);
  if (p2.knowledgeContext) lines.push('- Pasted context / knowledge base: ' + p2.knowledgeContext);

  let msg = 'Generate Video ' + videoNum + ' script.\n\nLEVEL: ' + level + '\nVIDEO: ' + videoNum + '\n\nONBOARDING DATA:\n' + lines.join('\n');

  // V1: prefilled editable prompts
  if (videoIdx === 0) {
    const q2 = state.mvoQ2 || {};
    const q3 = state.mvoQ3 || {};
    const q4 = state.mvoQ4 || {};
    if (level === 1) {
      const declaration = sv.v0p0 || `Hi, my name is ${name}. I never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me... some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of.`;
      const stopping    = sv.v0p1 || q2.before_full || '';
      const whyNow      = sv.v0p2 || q3.catalyst_full || '';
      const whoReach    = sv.v0p3 || q4.village_full || '';
      const extra       = sv.v0p4 || '';
      msg += '\n\nVIDEO 1 PREFILLED PROMPTS (user may have edited these):\n';
      msg += '1. Opening declaration (read-only): ' + declaration + '\n';
      msg += '2. What\'s been stopping you from posting until now: ' + (stopping || '(not provided)') + '\n';
      msg += '3. Why you\'re doing this challenge right now: ' + (whyNow || commitText) + '\n';
      msg += '4. Who you\'re here to reach: ' + (whoReach || '(not specified)') + '\n';
      if (extra) msg += '5. Anything else they want to add: ' + extra + '\n';
    } else {
      // Level 2 V1 — same 4-answer structure as Level 1, with Authority Series declaration
      // Level 2 MVO field mapping: Q2→village_full, Q3→before_full, Q4→crack_full
      const l2Decl = sv.v0decl || `For those of you who don't know me yet, my name is ${name}. I kinda never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me, some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of. I'm specifically doing this 7 Video Challenge because I have to share my knowledge, my experience, and my lived reality for the specific people I want to help before the world changes forever and I won't have the chance. These 7 videos are how I'm establishing myself as a credible voice in my field, but I'm scared, I'm frustrated, I don't know how it's going to go, but I'm committed to finishing.`;
      const stopping = sv.v0p1 || q3.before_full || '';
      const whyNow   = sv.v0p2 || q4.crack_full  || '';
      const whoReach = sv.v0p3 || q2.village_full || '';
      const extra    = sv.v0p4 || '';
      msg += '\n\nVIDEO 1 PREFILLED PROMPTS (user may have edited these):\n';
      msg += '1. Opening declaration (read-only): ' + l2Decl + '\n';
      msg += '2. What\'s been stopping you from posting until now: ' + (stopping || '(not provided)') + '\n';
      msg += '3. Why you\'re doing this challenge right now: ' + (whyNow || '') + '\n';
      msg += '4. Who you\'re here to reach: ' + (whoReach || '(not specified)') + '\n';
      if (extra) msg += '5. Anything else they want to add: ' + extra + '\n';
    }
    return msg;
  }

  // V2-V7: add previous video answers + scripts
  const videos = getVideos();

  // Voice reference block for videos 3+ — gives AI concrete voice patterns to match
  if (videoIdx >= 2) {
    const voiceScripts = [];
    for (let i = 0; i < Math.min(videoIdx, 3); i++) {
      const s = sv['script_v' + i];
      if (s) voiceScripts.push('Video ' + (i+1) + ':\n' + s.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim());
    }
    if (voiceScripts.length > 0) {
      msg += '\n\nVOICE REFERENCE — These are this speaker\'s actual generated scripts. Study the sentence length, word choice, emotional register, and rhythm. Video ' + videoNum + ' must sound like the same person:\n\n' + voiceScripts.join('\n\n---\n\n');
    }
  }

  for (let i = 0; i < videoIdx; i++) {
    const prevVideo = videos[i];
    let prevBlock = '\n\nVideo ' + (i + 1) + ' prompts:';
    if (i === 0) {
      // V1 answers from prefilled prompts
      const q2 = state.mvoQ2 || {};
      const q3 = state.mvoQ3 || {};
      const q4 = state.mvoQ4 || {};
      if (level === 1) {
        const decl = sv.v0p0 || `Hi, my name is ${name}. I never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me.`;
        prevBlock += '\n1. Opening declaration: ' + decl;
        prevBlock += '\n2. What stopped them: ' + (sv.v0p1 || q2.before_full || '(not provided)');
        prevBlock += '\n3. Why doing this challenge: ' + (sv.v0p2 || q3.catalyst_full || commitText);
        prevBlock += '\n4. Who they\'re reaching: ' + (sv.v0p3 || q4.village_full || '(not specified)');
        if (sv.v0p4) prevBlock += '\n5. Extra context: ' + sv.v0p4;
      } else {
        // Level 2 V1 — 4-answer structure matching V1 prompts
        // Level 2 MVO field mapping: Q2→village_full, Q3→before_full, Q4→crack_full
        const l2DeclPrev = sv.v0decl || `For those of you who don't know me yet, my name is ${name}. I kinda never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me, some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of. I'm specifically doing this 7 Video Challenge because I have to share my knowledge, my experience, and my lived reality for the specific people I want to help before the world changes forever and I won't have the chance. These 7 videos are how I'm establishing myself as a credible voice in my field, but I'm scared, I'm frustrated, I don't know how it's going to go, but I'm committed to finishing.`;
        prevBlock += '\n1. Opening declaration: ' + l2DeclPrev;
        prevBlock += '\n2. What stopped them: ' + (sv.v0p1 || q3.before_full || '(not provided)');
        prevBlock += '\n3. Why doing this challenge: ' + (sv.v0p2 || q4.crack_full  || '');
        prevBlock += '\n4. Who they\'re reaching: ' + (sv.v0p3 || q2.village_full || '(not specified)');
        if (sv.v0p4) prevBlock += '\n5. Extra context: ' + sv.v0p4;
      }
    } else {
      prevVideo.prompts.forEach(function(p, pi) {
        const val = sv[p.key] || '';
        const cleanLabel = p.label.replace(/\s*___\s*$/, '').trim();
        prevBlock += '\n' + (pi + 1) + '. ' + cleanLabel + ': ' + (val || '(no answer)');
      });
    }
    const prevScript = sv['script_v' + i];
    if (prevScript) prevBlock += '\n\nVideo ' + (i + 1) + ' script:\n' + prevScript;
    msg += prevBlock;
  }

  // Current video prompts
  const curVideo = videos[videoIdx];
  const easyDef = VIDEO_EASY_PROMPTS[videoIdx];
  const easyAnswer = easyDef ? (sv[easyDef.key] || '') : '';
  if (easyAnswer && (videoPromptMode[videoIdx] === 'easy' || !videoPromptMode[videoIdx])) {
    // Easy mode: provide the single free-write answer as full context
    msg += '\n\nCURRENT VIDEO ' + videoNum + ' JOURNAL ENTRY (easy mode — use this to infer all story beats):\n' + easyAnswer;
  } else {
    msg += '\n\nCURRENT VIDEO ' + videoNum + ' PROMPTS:';
    curVideo.prompts.forEach(function(p, pi) {
      const val = sv[p.key] || '';
      const cleanLabel = p.label.replace(/\s*___\s*$/, '').trim();
      msg += '\n' + (pi + 1) + '. ' + cleanLabel + ': ' + (val || '(no answer provided)');
    });
    // Also append easy answer as bonus context if they wrote one
    if (easyAnswer) msg += '\n\nAdditional free-write context from user: ' + easyAnswer;
  }
  return msg;
}

// ── VIDEO DATA ────────────────────────────────────────
const level1Videos = [
  {
    title:"I'm Doing This",
    note:"These are pre-filled from your earlier answers. Edit anything that doesn't sound exactly like you, then generate your script.",
    beats:()=>compileMvoBeats(),
    compile:()=>compileMvoBeats().map(b=>b.text).join('\n\n'),
    prompts:[]
  },
  {
    title:"The Turning Point",
    note:"Your audience doesn't follow creators because of what they know. They follow because of who they are. Video 2 is where you let them in. One surprising detail, something they wouldn't expect, and the thing you actually care about.",
    prompts:[
      {label:"Where are you from, and what's one thing about your background that shaped who you are today?",hint:"Not your whole life story. Just the one detail that if someone knew it, they'd understand you a little better. The town, the household, the experience, the thing that left a mark.",key:"v1p0",ph:"e.g. I grew up in a tiny town where the big Friday night event was the gas station... which sounds like nothing until you understand what it taught me about showing up when nobody's watching"},
      {label:"What's something about you that surprises people when they find out?",hint:"The thing that doesn't match the rest of your story. The unexpected hobby, the weird skill, the career pivot nobody saw coming, the thing you're secretly passionate about that has nothing to do with anything else.",key:"v1p1",ph:"e.g. most people are surprised that I spent three years competing in improv comedy, which probably explains more about how I think than anything on my resume"},
      {label:"What do you actually care about, and why does it feel important enough to talk about publicly?",hint:"Not your job description. The thing underneath it. The reason you light up about certain topics. The thing you wish more people understood or paid attention to.",key:"v1p2",ph:"e.g. what I actually care about is that people stop waiting to feel ready and start trusting that showing up imperfectly is worth more than not showing up at all"}
    ],
    compile:v=>`Where I'm from: ${v.v1p0||'___'}. The thing that surprises people about me: ${v.v1p1||'___'}. What I actually care about: ${v.v1p2||'___'}.`
  },
  {
    title:"The First Epiphany",
    note:"Seven beats, one shift. The audience knows you and likes you after Video 2. Now you give them something they can't unsee. A belief you held, the moment it cracked, the new truth, simple enough to text to a friend.",
    prompts:[
      {label:"What's something you used to believe (about life, success, fear, identity, or how things work) that you held onto for a long time before you realized it wasn't true?",hint:"Not a small preference change. A deep belief, maybe one you built decisions around. Something that felt like bedrock until it cracked.",key:"v2p0",ph:"e.g. I used to believe that if I just worked hard enough and stayed quiet, the right people would eventually notice... and I built years of decisions around that idea"},
      {label:"Tell the story of what happened that made you see it differently. Not when you 'decided to change your mind' but the actual experience. Where were you? What did you see, hear, or feel?",hint:"This is a moment, not a summary. Ground it in a real scene. The more specific and human, the more powerful it becomes.",key:"v2p1",ph:"e.g. I was sitting in my car after a meeting where I'd watched someone say something I'd been thinking for months... and they got all the credit. That was the moment I understood that staying quiet wasn't humility, it was just fear"},
      {label:"Now that you see it differently, what's the new truth? Say it as simply as you can, like you're explaining it to someone you care about.",hint:"One or two sentences. If the old belief was the lens you were wearing, what's the prescription of the new one? The simpler you can make this, the harder it will hit.",key:"v2p2",ph:"e.g. the new truth is that waiting to be discovered is a strategy for staying invisible. The only people who get found are the ones who decide to be seen"},
      {label:"What does it cost someone to keep believing the old way? Not in a dramatic sense. Just honestly, what do they miss or lose without realizing it?",hint:"You can see both sides now. What's the invisible price someone pays when they're still stuck in the old one? It's about caring enough to name what you wish someone had named for you.",key:"v2p3",ph:"e.g. what it costs them is years... years of doing good work that nobody outside their immediate circle ever hears about, wondering why they feel invisible when they've been choosing invisibility"},
      {label:"Why does this matter to you enough to say it out loud on camera?",hint:"You could have kept this to yourself. Why are you sharing it? Maybe because you see other people stuck where you were. That reason is the emotional engine of this video.",key:"v2p4",ph:"e.g. because I spent too long believing I wasn't the kind of person who did things like this, and I watch other people believe that same lie about themselves every day"}
    ],
    compile:v=>`I used to believe ${v.v2p0||'___'}. The moment that changed it: ${v.v2p1||'___'}. The new truth: ${v.v2p2||'___'}. What the old belief costs: ${v.v2p3||'___'}. Why I'm saying this: ${v.v2p4||'___'}.`
  },
  {
    title:"The Progress Signal",
    note:"You showed up again. That alone is the story. Now tell the truth about what this has actually been like: what surprised you, what's shifted, what's still hard. Real-time honesty builds trust faster than any polished content.",
    prompts:[
      {label:"What's surprised you most about doing this so far, something you didn't expect, good or bad?",hint:"Maybe filming was easier than you thought. Maybe it was harder. Maybe people reacted in a way you didn't anticipate. What caught you off guard?",key:"v3p0",ph:"e.g. what surprised me most is how much lighter I feel after each video, like I'm putting something down I didn't realize I was carrying"},
      {label:"What's one small thing that's shifted for you, even if it's subtle? A moment, a feeling, a realization, a reaction from someone?",hint:"It doesn't have to be dramatic. Maybe you noticed you were less nervous on Video 3 than Video 1. Maybe someone sent you a message. Name the small shift.",key:"v3p1",ph:"e.g. someone I hadn't talked to in two years messaged me after Video 2 and said 'I didn't know you felt that way'... and somehow that one message made the whole thing worth it"},
      {label:"What's still hard? What are you still figuring out? Be specific.",hint:"Don't clean this up. The messy middle is where people trust you the most. What's the thing you're wrestling with right now (about this challenge, about yourself, about putting yourself out there)?",key:"v3p2",ph:"e.g. I still hate watching myself back. Like physically uncomfortable. I don't know if that goes away or if you just learn to tolerate it"},
      {label:"What would you tell someone who's watching you do this and thinking about starting themselves?",hint:"Not advice. Not motivation. Just the honest truth from someone who's a few days ahead of them. What do you know now that you didn't know before Video 1?",key:"v3p3",ph:"e.g. I'd tell them the first video is the hardest one, not because of the filming, but because it makes real something you've been keeping theoretical for a long time"}
    ],
    compile:v=>`What's surprised me: ${v.v3p0||'___'}. One small shift: ${v.v3p1||'___'}. What's still hard: ${v.v3p2||'___'}. What I'd tell someone starting: ${v.v3p3||'___'}.`
  },
  {
    title:"The Second Epiphany",
    note:"You've earned the right to say something most people won't. This is your second big reframe: a belief you used to hold, what it cost you, and what opened up when you let it go. The more personal and specific, the more universal it lands.",
    prompts:[
      {label:"What's something you believe that most people around you would disagree with (or at least wouldn't say out loud)?",hint:"Not something designed to be controversial. Something genuinely true for you that goes against what your family, friends, coworkers, or culture treats as obvious.",key:"v4p0",ph:"e.g. I believe that most of what we call 'not being ready' is actually just fear of being judged, and the preparation is usually a delay tactic we've convinced ourselves is responsible"},
      {label:"Where did this belief come from? What did you experience or witness that made you unable to keep believing the popular version?",hint:"There was a before and an after. Something happened (maybe gradually, maybe in a single moment) that made the conventional wisdom impossible to keep holding.",key:"v4p1",ph:"e.g. it came from watching myself get ready for three years. Reading every book, taking every course, building every system. And then watching someone less prepared than me just start... and build something real"},
      {label:"What was it costing you when you still believed the old way? Be specific about what you were doing, tolerating, or missing.",hint:"Before you saw this clearly, you were living inside the old belief. What did that actually look like day to day? What were you putting up with? What were you chasing that turned out to be empty?",key:"v4p2",ph:"e.g. it was costing me time I'll never get back and conversations I kept not having because I kept waiting to feel qualified enough to have them"},
      {label:"What opened up or changed when you let go of the old belief? What became possible that wasn't before?",hint:"The other side. Not a fantasy. Your actual experience of life after the shift. What does the world look like through the new lens?",key:"v4p3",ph:"e.g. what opened up was the ability to act before I felt ready, which sounds simple, but it changed everything about how I show up"},
      {label:"If you could say this to one specific person who's still stuck in the old belief (someone you care about)... what would you say to them?",hint:"Picture one person. Someone you know who's living in the old belief right now. What do you want to say to them through the camera? Not a lecture. A direct, personal message.",key:"v4p4",ph:"e.g. I'd say: you're not getting more ready. Every day you wait, you're not building courage. You're building a bigger story about why you can't start yet"}
    ],
    compile:v=>`Something I believe that most people wouldn't say out loud: ${v.v4p0||'___'}. Where it came from: ${v.v4p1||'___'}. What the old belief cost me: ${v.v4p2||'___'}. What opened up: ${v.v4p3||'___'}. To the person still stuck: ${v.v4p4||'___'}.`
  },
  {
    title:"Why I'm Here",
    note:"You've been carrying something this whole challenge that you haven't said out loud yet. Video 6 is where you say it. The fear, the doubt, the deeper root, and what becomes possible when you name it. This is the video that turns viewers into believers.",
    prompts:[
      {label:"What's the thing you've been carrying through this whole challenge that you haven't said on camera yet? The fear, the doubt, the struggle that's still present even though you keep showing up.",hint:"Not the surface-level stuff. Not 'filming is hard.' The REAL thing. Maybe it's the voice that says nobody cares. Maybe it's the comparison. Say the thing you've been avoiding.",key:"v5p0",ph:"e.g. the thing I've been carrying is the very specific fear that I'll finish all seven videos, put everything into this, and wake up to silence... and that silence will confirm the thing I've been trying to prove wrong"},
      {label:"Where does that come from? Not the logical explanation. The deeper root. When did you first start believing that about yourself?",hint:"This fear or doubt didn't start with the challenge. It was there before. Trace it back. You don't have to go into full detail. Just name the root.",key:"v5p1",ph:"e.g. it goes back further than this challenge. I think it started in the years I spent doing good work that nobody outside my immediate circle ever saw, slowly convincing myself that was fine"},
      {label:"What would it mean to you, really honestly, if you could let go of that? What becomes possible on the other side of this battle?",hint:"Don't make this aspirational fluff. Think about it practically. What would you DO differently? How would you FEEL differently? What would you stop avoiding?",key:"v5p2",ph:"e.g. if I could let go of it, I think I'd stop waiting for proof before I acted. I'd just act. And I'd stop treating my own work like it needs to earn the right to exist before I show it to anyone"},
      {label:"What do you want to say to anyone watching this who's fighting their own version of the same battle?",hint:"You've just told your story. The fear, the root, the possibility. What do you want to leave them with? Not advice. A message. The thing you wish someone had said to you when you were in the middle of the fight.",key:"v5p3",ph:"e.g. I want to say: the fact that you're watching this means part of you already knows. You don't need more proof. Just decide that this thing you're carrying doesn't get to keep making your decisions"}
    ],
    compile:v=>`What I've been carrying: ${v.v5p0||'___'}. Where it comes from: ${v.v5p1||'___'}. What letting go would mean: ${v.v5p2||'___'}. To anyone watching who's in the same battle: ${v.v5p3||'___'}.`
  },
  {
    title:"What I Learned",
    note:"Seven videos. You did it. Now close the arc honestly. What did you think this was going to be? What actually happened? What do you know now that you didn't before? And where are you going next?",
    prompts:[
      {label:"When you filmed Video 1, what did you think this challenge was going to be about? What did you expect to happen?",hint:"Think back to the person who pressed record on day one. What were you bracing for? What did you think would be hard? Be honest about the expectations, even the ones that seem naive now.",key:"v6p0",ph:"e.g. honestly, I thought this challenge was going to be about overcoming camera fear. I figured by Video 7 I'd just feel comfortable on camera. That's not what happened at all"},
      {label:"What actually happened instead? What surprised you most (about the experience, about yourself, about how people responded)?",hint:"The real version. Not the Instagram version. What was harder than expected? What was easier? What completely blindsided you?",key:"v6p1",ph:"e.g. what actually happened is that the camera got comfortable faster than I expected, and what surprised me most is that the videos I almost didn't post were the ones people responded to most"},
      {label:"What's the one thing you know now that you didn't know before Video 1? Not a tip. A truth. Something you can only learn by doing, not by thinking about it.",hint:"The elixir. The thing you're bringing back from this journey. If you could go back and whisper one sentence to the person you were before this challenge, what would it be?",key:"v6p2",ph:"e.g. the one thing I know now is that showing up is the work, not what you show up saying. I kept thinking I needed better ideas. What I needed was just to start"},
      {label:"If someone is watching this right now and they're exactly where you were seven videos ago (scared, uncertain, overthinking it): what do you want to say to them?",hint:"Not advice from a guru. A message from someone who JUST went through it. What's the honest truth from the other side?",key:"v6p3",ph:"e.g. I want to say: it's not going to feel the way you think it will. It's going to feel harder in some ways and easier in others. But the version of you on the other side of Video 7 is worth it"},
      {label:"What's next for you? You don't need a plan, just a direction. What did this challenge open up that you want to keep going with?",hint:"You don't need to have figured out the rest of your life. But this challenge showed you something: a direction, a possibility, a next step. Saying it out loud is the beginning of making it real.",key:"v6p4",ph:"e.g. what's next for me is keeping going, not as a challenge, but because I finally understand that this is what showing up actually looks like, and I want to keep doing it"}
    ],
    compile:v=>`What I expected: ${v.v6p0||'___'}. What actually happened: ${v.v6p1||'___'}. The one truth I know now: ${v.v6p2||'___'}. To someone at the beginning where I was: ${v.v6p3||'___'}. What's next: ${v.v6p4||'___'}.`
  }
];

const level2Videos = [
  {
    title:"I'm Doing This",
    note:"These are pre-filled from your earlier answers. Edit anything that doesn't sound exactly like you, then generate your script.",
    beats:()=>compileMvoBeats(),
    compile:()=>compileMvoBeats().map(b=>b.text).join('\n\n'),
    prompts:[]
  },
  {
    title:"The Origin Story",
    note:"Your audience doesn't just want to know what you do. They want to understand how you became someone who knows this. This video tells the origin: how you got here, what you've seen, and why you can't stop caring about it.",
    prompts:[
      {label:"How did you get into this? Not the professional version. The real story of how you ended up knowing what you know.",hint:"Maybe it was accidental. Maybe you were trying to solve your own problem. Maybe someone else's problem landed in your lap and you realized you were good at this. What actually happened?",key:"v1p0",ph:"e.g. I got into this because my sister was drowning in debt after her divorce and I helped her build a plan that got her out in 18 months. Her friends started asking me for help. Then their friends."},
      {label:"What's the thing you've noticed that most people get wrong about your area of expertise?",hint:"The mistake you see over and over. The bad advice that makes you cringe. The thing you wish you could shake people and tell them. You don't need to name names. Just describe what you see happening.",key:"v1p1",ph:"e.g. everyone thinks the problem is discipline. It's not. Most people's money problems aren't math problems. They're emotional regulation problems wearing a math costume."},
      {label:"Why does this matter to you personally (not professionally)?",hint:"Strip away the business angle entirely. Why do you CARE about this? What's the deeper reason this topic or this work gets under your skin in a way you can't ignore?",key:"v1p2",ph:"e.g. because I grew up watching money destroy my parents' marriage and I know it doesn't have to be like that."}
    ],
    compile:v=>`How I got into this: ${v.v1p0||'___'}. What most people get wrong: ${v.v1p1||'___'}. Why it matters personally: ${v.v1p2||'___'}.`
  },
  {
    title:"The First Epiphany",
    note:"Seven beats, one shift. You're not sharing a hot take. You're sharing a genuine paradigm shift. Something 'everyone knows' in your field that you've come to believe is wrong, the moment you saw the cracks, and the reframe that changes everything.",
    prompts:[
      {label:"What's something that 'everyone knows' in your field or area of expertise that you've come to believe is wrong, incomplete, or actually harmful?",hint:"The advice that gets passed around like gospel. The method everyone defaults to. The first thing a beginner is told that a veteran knows is oversimplified. You've been close enough to see the cracks in it. What is it?",key:"v2p0",ph:"e.g. everyone says 'make a budget and stick to it'... the discipline narrative. I've watched hundreds of people make perfect budgets and fail completely within three weeks."},
      {label:"Tell the story of when you first saw the cracks. What actually happened (the specific moment, client, project, or experience) that made you go 'wait, this doesn't work the way everyone says it does'?",hint:"A real story. Not 'I gradually realized over time.' A SCENE. The client who succeeded by doing the opposite. The project that failed despite following the playbook perfectly.",key:"v2p1",ph:"e.g. I had a client, smart woman, good job, made great money. She'd done every budget app, every system. Nothing stuck. An hour of conversation revealed she wasn't overspending from lack of discipline. She was overspending because spending was the only way she knew how to soothe herself after a bad day."},
      {label:"What's actually true instead? Say it as plainly as you can, like you're letting someone in on something the industry doesn't want to admit.",hint:"The reframe. The new lens. If the old belief is the map everyone's using, your reframe shows them the map is wrong and the real terrain looks different. Make it feel inevitable. Not clever, not contrarian. Just true.",key:"v2p2",ph:"e.g. money problems are almost never math problems. They're emotional regulation problems wearing a math costume. Until you address why someone spends, no spreadsheet on earth will save them."},
      {label:"What happens to people who keep following the conventional wisdom? What does it cost them that they don't even realize?",hint:"You've watched people go down this path. What do they sacrifice, waste, or miss because they're following a map that doesn't match the territory? Be specific. Not 'they fail' but HOW they fail, what it looks like from the inside.",key:"v2p3",ph:"e.g. they keep failing at budgets and thinking THEY'RE broken. They're not broken. The approach is broken. They just keep getting more ashamed every time they 'fail' at something that was never designed to work for them."},
      {label:"Why do you feel like this needs to be said? What's at stake if people in your space keep getting this wrong?",hint:"This is where your passion lives. The reason you can't just let this go. Maybe people are wasting years. Maybe the shame spiral is costing people their relationships. Why does this matter enough to put on camera?",key:"v2p4",ph:"e.g. because the shame spiral is killing people. Financial stress is the number one cause of relationship problems and one of the top causes of anxiety and depression. And we're out here telling people to track their lattes."}
    ],
    compile:v=>`What 'everyone knows' that I think is wrong: ${v.v2p0||'___'}. When I first saw the cracks: ${v.v2p1||'___'}. What's actually true: ${v.v2p2||'___'}. What it costs people to follow the old way: ${v.v2p3||'___'}. Why this needs to be said: ${v.v2p4||'___'}.`
  },
  {
    title:"The Progress Signal",
    note:"You're in the middle of this challenge. Report honestly from there. Not a performance of progress. Actual progress. What surprised you, what's working, what's still hard, and what you're starting to understand.",
    prompts:[
      {label:"What's surprised you about trying to communicate your expertise on camera? What's different about it than you expected?",hint:"Maybe you realized how hard it is to be simple. Maybe you discovered that the thing you thought was your main message isn't actually what resonates. Maybe doing this publicly is teaching you something about your own expertise that you didn't see before.",key:"v3p0",ph:"e.g. I assumed the hard part would be the camera. It's not. The hard part is figuring out what to leave out. I know too much and I'm still learning how to be concise without losing the point."},
      {label:"What's one moment or result so far that made you think 'okay, this is actually working,' even if it was small?",hint:"A comment from the right kind of person. A conversation that started because of a video. A moment where you explained something and it landed better than you expected. Something that showed you there's traction here.",key:"v3p1",ph:"e.g. someone I've never met messaged me after Video 2 to say they'd been thinking about what I said for two days. That was the moment I stopped wondering if this was worth doing."},
      {label:"What's still hard about this? What are you still wrestling with (about the content, about showing up, about putting your knowledge out there?",hint:"The real friction. Maybe it's the vulnerability of being visible. Maybe it's the gap between what you know and how to say it concisely. Maybe it's imposter syndrome showing up even though you KNOW you're good at this. Name it.",key:"v3p2",ph:"e.g. the thing I'm still wrestling with is the gap between how clearly I can think through this with a client and how fuzzy it feels when I try to say it into a camera in two minutes."},
      {label:"What are you starting to understand about your audience, your message, or yourself that you didn't understand before this challenge?",hint:"A few days of putting yourself out there teaches you things that years of planning never could. What's becoming clearer? About who responds to you, about what you actually want to say, about how this could grow into something real?",key:"v3p3",ph:"e.g. I'm starting to understand that the people who need me most aren't the ones I was picturing — they're quieter, more self-aware, and they're looking for permission to trust what they already know, not more information."}
    ],
    compile:v=>`What surprised me about doing this: ${v.v3p0||'___'}. One moment traction showed up: ${v.v3p1||'___'}. What's still hard: ${v.v3p2||'___'}. What I'm learning about my audience, message, or myself: ${v.v3p3||'___'}.`
  },
  {
    title:"The Second Epiphany",
    note:"Deeper. More personal. More convicted. The biggest myth in your field: not a tip, but a genuine paradigm shift earned through doing the work. You're not sharing an opinion, you're sharing what you can't unsee.",
    prompts:[
      {label:"What's the biggest myth or most overused piece of advice in your field that you've come to believe is actually wrong — or even harmful?",hint:"The sacred cow. The thing every guru says. The advice that gets repeated so often nobody questions it anymore. You question it. You've seen what happens when people follow it. What is it?",key:"v4p0",ph:"e.g. the biggest myth in my field is that consistency is the answer. Post every day, show up every day, grind every day. I've watched people burn out following that advice and then blame themselves for failing."},
      {label:"Tell the story of your own relationship with this belief. Did you used to follow it? Teach it? What happened that made you turn against it?",hint:"The most powerful version of this is when YOU were a believer first. You followed the playbook. You recommended it to others. And then something happened that made you see it was broken. That personal journey from believer to heretic is what makes this credible, not preachy.",key:"v4p1",ph:"e.g. I used to tell my clients this. I believed in it. I built my own routine around it. And then I watched my most dedicated client — someone who followed every rule — completely crater her mental health in pursuit of consistency and end up taking six months off."},
      {label:"What's the actual truth — the thing that works but nobody talks about because it's less sexy, less simple, or threatens the established way of doing things?",hint:"The real answer. The thing you've figured out through doing the work, not reading about the work. It might be simpler than the myth. It might be harder. But it's TRUE, and you can back it up with your own experience and results.",key:"v4p2",ph:"e.g. depth beats volume every time. One video that changes how someone thinks is worth more than thirty that they half-watch. The people winning aren't the ones posting most. They're the ones saying the most true thing."},
      {label:"What happens to people who keep following the myth? What have you watched it cost your peers, your clients, or people in your space?",hint:"Be specific. Not 'they fail.' HOW do they fail? What does it look like? The wasted money, the wasted time, the frustration, the quitting.",key:"v4p3",ph:"e.g. they burn out. They create for months, see no results, decide they're not interesting enough, and quit. The myth told them consistency would compound. Nobody told them they also needed to have something worth saying."},
      {label:"Who specifically needs to hear this, and what would change for them if they actually believed you?",hint:"Picture one specific person. A client, a peer, someone who asked you for advice last week. If THEY got this — really got it — what would shift for them? That's the emotional engine. That's why you're saying this out loud instead of keeping it to yourself.",key:"v4p4",ph:"e.g. this is for the expert who's been posting dutifully for months with nothing to show for it and is starting to think the problem is them. It's not them. They just got sold a system designed for content farms, not humans with something to say."}
    ],
    compile:v=>`The biggest myth in my field: ${v.v4p0||'___'}. My own journey with this belief: ${v.v4p1||'___'}. What's actually true: ${v.v4p2||'___'}. What it costs people who keep following the myth: ${v.v4p3||'___'}. Who specifically needs to hear this: ${v.v4p4||'___'}.`
  },
  {
    title:"Why I'm Still Here",
    note:"This is the video most people skip because it feels too vulnerable. That's exactly why it's the most important one. The internal battle about claiming your expertise publicly — said out loud, on camera — is what makes every other video retroactively believable.",
    prompts:[
      {label:"What's the internal battle you're fighting about putting yourself out there as someone with real expertise? The thing that makes you hesitate even though you KNOW you're good at this.",hint:"Imposter syndrome. Comparison. The fear of being 'that person' who promotes themselves. The voice that says your experience doesn't count because you don't have the right credentials, the right following, the right whatever. What's YOUR version of that battle?",key:"v5p0",ph:"e.g. my version of this is the credential question — I don't have letters after my name. I learned everything I know from fifteen years of doing this work with real people. But the voice still shows up asking who I think I am."},
      {label:"What's the specific fear? If you imagine fully owning your expertise publicly — being visible, being known for what you know — what's the worst thing that could happen? Say it out loud.",hint:"Sometimes the fear is concrete: 'people from my old life will judge me.' Sometimes it's abstract: 'what if I put myself out there and nobody cares.' Sometimes it's deeper: 'what if I'm not actually as good as I think I am.' Name the actual fear. Not the category — the specific thought.",key:"v5p1",ph:"e.g. the specific fear is that someone I respect will watch one of these videos and think 'she's overreaching.' That one imaginary judgment has cost me more than two years of staying quiet."},
      {label:"What's it been costing you to stay small? Not in money, but in impact, in fulfillment, in the people you could be helping but aren't because you've been hiding.",hint:"You know there are people who need what you know. You've probably met some of them. What happens to them because you haven't stepped into this fully? And what happens to YOU... what are you leaving on the table by playing it safe?",key:"v5p2",ph:"e.g. what it's been costing me is harder to name than money. There are people right now making the exact mistakes I know how to prevent, and I haven't shown up for them because I've been waiting to feel ready."},
      {label:"Despite all of that... why are you still here? Why haven't you quit? What's the thing that keeps pulling you forward even when the doubt is loud?",hint:"Something is stronger than the fear. A purpose, a person, a vision, a stubborn refusal to let the doubt win. That thing — whatever it is — is the real engine underneath everything you've built so far. Name it.",key:"v5p3",ph:"e.g. I'm still here because I keep meeting people who are stuck in the exact place I was stuck in. And when I talk to them — even for twenty minutes — something shifts. That shift is what I'm here for. The doubt is just the admission fee."}
    ],
    compile:v=>`The internal battle I'm fighting: ${v.v5p0||'___'}. The specific fear: ${v.v5p1||'___'}. What staying small has cost me: ${v.v5p2||'___'}. Why I'm still here despite the doubt: ${v.v5p3||'___'}.`
  },
  {
    title:"What I Learned",
    note:"Seven videos. A complete arc. Close it honestly: what you set out to prove, what you actually learned, what you'd tell someone at the beginning, and one open door for the right person.",
    prompts:[
      {label:"When you filmed Video 1, what were you trying to prove — to yourself, to your audience, to your industry? Did you prove it?",hint:"Go back to the beginning. You had an intention — maybe it was clear, maybe it was vague. What was it? And now, seven videos later — did the challenge deliver what you expected? Or did it deliver something else entirely?",key:"v6p0",ph:"e.g. I started this wanting to prove I could show up consistently without a perfect strategy in place. Did I prove it? Sort of. What I actually proved was more interesting — that the strategy becomes obvious once you start."},
      {label:"What did this challenge teach you about your own expertise that you didn't know before? Not about content or filming. About the actual WORK you do and who you do it for.",hint:"Putting your knowledge on camera forces a kind of clarity that nothing else does. You had to simplify. You had to choose what matters. What did that process reveal about what you actually know and what you actually care about?",key:"v6p1",ph:"e.g. this challenge taught me that I know far more than I realize, and I've been gatekeeping it behind a fear of saying something imperfect. The act of saying it imperfectly taught me more about my expertise than a year of preparation would have."},
      {label:"What's the one thing you'd tell someone in your field who's been hiding behind their work instead of putting themselves out there?",hint:"You were that person seven videos ago. Now you're not. What do you know from the inside that they can't see from the outside? Not motivational fluff. The real, practical, emotional truth about what it takes and what it gives back.",key:"v6p2",ph:"e.g. I'd tell them: the fear doesn't go away before you start. It goes away because you started. There's no version of this where you feel ready first."},
      {label:"What do you still need? Be honest. What did this challenge show you about where you need to grow, what support you need, or what's missing from your next chapter?",hint:"You just did something real. You proved something. And in the process, you probably saw clearly what the next level requires. Maybe it's help with systems. Maybe it's community. Maybe it's accountability. Whatever it is — naming it isn't weakness. It's the most strategic thing you can do.",key:"v6p3",ph:"e.g. what I still need is a real framework for turning this visibility into actual conversations with the right people. The videos are working. I don't yet have a clear path from 'someone watches' to 'someone reaches out.'"},
      {label:"If the right person is watching this — the exact person you've been making these videos for — what's your invitation to them? Not a pitch. An open door.",hint:"You've spent seven videos showing this person who you are, what you know, and what you believe. They trust you. So what do you want to say to them? The specific person, the specific problem, the specific next step. That's it. That's enough.",key:"v6p4",ph:"e.g. if you're a consultant or coach who knows you're good at what you do but keeps struggling to get visible in a way that feels authentic — reach out. Not to pitch you anything. Just to talk about what's actually in the way."}
    ],
    compile:v=>`What I was trying to prove + did I: ${v.v6p0||'___'}. What the challenge taught me about my expertise: ${v.v6p1||'___'}. What I'd tell someone still hiding: ${v.v6p2||'___'}. What I still need: ${v.v6p3||'___'}. My invitation to the right person: ${v.v6p4||'___'}.`
  }
];

function getVideos(){ return state.level===1 ? level1Videos : level2Videos; }

// ── VIDEO JOURNAL — TWO PHASE ─────────────────────────
// Phase A: prompts screen (screen-7)
// Phase B: generated editable script (screen-script)

function startVideos() {
  currentVideoIndex = 0;
  buildVideoDots('video-dots');
  buildVideoDots('script-dots');
  buildVideoDots('vi-dots');
  renderVideoPrompts(0);
  showScreen('screen-7');
  // sync currentIndex to screen-7 position
  currentIndex = screenOrder.indexOf('screen-7');
}

function buildVideoDots(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = document.createElement('div');
    const st = state.videoStatus[i];
    if (st === 'filmed') {
      d.className = 'vdot filmed';
      d.textContent = '✓';
    } else if (st === 'skipped') {
      d.className = 'vdot skipped';
      d.textContent = '✕';
    } else {
      d.className = 'vdot' + (i === 0 ? ' active' : '');
    }
    d.id = containerId + '-dot-' + i;
    wrap.appendChild(d);
  }
}

function updateDots(idx) {
  ['video-dots','script-dots','vi-dots'].forEach(cid => {
    for (let i = 0; i < 7; i++) {
      const d = document.getElementById(cid + '-dot-' + i);
      if (!d) continue;
      const st = state.videoStatus[i];
      if (st === 'filmed') {
        d.className = 'vdot filmed';
        d.textContent = '✓';
      } else if (st === 'skipped') {
        d.className = 'vdot skipped';
        d.textContent = '✕';
      } else if (i < idx) {
        d.className = 'vdot done';
        d.textContent = '';
      } else if (i === idx) {
        d.className = 'vdot active';
        d.textContent = '';
      } else {
        d.className = 'vdot';
        d.textContent = '';
      }
    }
  });
  document.getElementById('video-eyebrow').textContent = `Video ${idx+1} of 7: Journal Prompts`;
  document.getElementById('script-eyebrow').textContent = `Video ${idx+1} of 7: Your Script`;
}

// ── EASY PROMPT — single journal question per video (Easy mode) ──

// Per-video prompt mode: 'easy' or 'extended'

function setVideoPromptMode(idx, mode) {
  videoPromptMode[idx] = mode;
  const easyBtn = document.getElementById('prompt-easy-btn-' + idx);
  const extBtn = document.getElementById('prompt-ext-btn-' + idx);
  const easySection = document.getElementById('prompt-easy-section-' + idx);
  const extSection = document.getElementById('prompt-ext-section-' + idx);
  if (easyBtn) easyBtn.classList.toggle('active', mode === 'easy');
  if (extBtn) extBtn.classList.toggle('active', mode === 'extended');
  if (easySection) easySection.style.display = mode === 'easy' ? '' : 'none';
  if (extSection) extSection.style.display = mode === 'extended' ? '' : 'none';
}

// ── PHASE A: PROMPTS ──────────────────────────────────
function renderVideoPrompts(idx) {
  currentVideoIndex = idx;
  if (typeof logEvent === 'function') {
    logEvent('prompt_screen_viewed', {
      video_number: idx + 1,
      level: state.level || 1
    });
  }
  updateDots(idx);
  renderVideoTracker('prompts');
  const videos = getVideos();
  const v = videos[idx];
  const container = document.getElementById('video-journal-content');

  container.classList.add('slide-out');
  setTimeout(() => {
    container.classList.remove('slide-out');
    container.innerHTML = '';
    _buildPromptsContent(container, v, idx);
    container.classList.add('slide-in');
    setTimeout(() => container.classList.remove('slide-in'), 300);
  }, 220);
}

function _buildPromptsContent(container, v, idx) {
  const card = document.createElement('div');
  card.className = 'journal-card';

  let promptsHTML = '';
  if (v.beats) {
    // V1 — show editable prompts pre-filled from MVO answers
    const sv = state.videos;
    const level = state.level || 1;
    const q2 = state.mvoQ2 || {};
    const q3 = state.mvoQ3 || {};
    const q4 = state.mvoQ4 || {};
    // Build the intro declaration (read-only for V1)
    const introDeclaration = `Hi, my name is ${state.name || '(your name)'}. I never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me... some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of.`;

    // Level 2 declaration (for Authority Series)
    const l2Declaration = `For those of you who don't know me yet, my name is ${state.name || '(your name)'}. I kinda never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me, some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of. I'm specifically doing this 7 Video Challenge because I have to share my knowledge, my experience, and my lived reality for the specific people I want to help before the world changes forever and I won't have the chance. These 7 videos are how I'm establishing myself as a credible voice in my field, but I'm scared, I'm frustrated, I don't know how it's going to go, but I'm committed to finishing.`;

    const v0Prompts = level === 1
      ? [
          {key:'v0p1', label:"What's been stopping you from posting until now?",
           hint:'Edit to match how you\'d actually say it in your own words.',
           def: q2.before_full || ''},
          {key:'v0p2', label:"Why you're doing this challenge right now?",
           hint:'What shifted? Adjust to sound like you.',
           def: q3.catalyst_full || ''},
          {key:'v0p3', label:"Who are you here to reach?",
           hint:'Who is watching this? Who do you want to show up for?',
           def: q4.village_full || ''},
          {key:'v0p4', label:"Anything else you'd like to add?",
           hint:'A detail that makes you uniquely you: a background, a personality trait, something surprising. The AI will weave it in.',
           def: ''}
        ]
      : [
          // Level 2 MVO field mapping differs from Level 1:
          //   Q2 → village_full (who to reach)
          //   Q3 → before_full  (what stopped them)
          //   Q4 → crack_full   (why now / catalyst)
          {key:'v0p1', label:"What's been stopping you from posting until now?",
           hint:'Edit to match how you\'d actually say it in your own words.',
           def: q3.before_full || ''},
          {key:'v0p2', label:"Why you're doing this challenge right now?",
           hint:'What shifted? Adjust to sound like you.',
           def: q4.crack_full || ''},
          {key:'v0p3', label:"Who are you here to reach?",
           hint:'Who is watching this? Who do you want to show up for?',
           def: q2.village_full || ''},
          {key:'v0p4', label:"Anything else you'd like to add?",
           hint:'A detail that makes you uniquely you: a background, a personality trait, something surprising. The AI will weave it in.',
           def: ''}
        ];
    // Pre-populate from MVO defaults on first load
    v0Prompts.forEach(p => { if (!sv[p.key] && p.def) sv[p.key] = p.def; });

    if (level === 1) {
      // Read-only declaration at top + editable fields below
      promptsHTML = `
        <div class="input-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <label class="input-label" style="margin-bottom:0;">Your opening declaration</label>
            <span style="font-size:10px;color:var(--muted);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;letter-spacing:.06em;">READ ONLY</span>
          </div>
          <span class="input-hint" style="font-size:10px;opacity:0.65;">Pre-filled from your onboarding. You can edit on the next page.</span>
          <div style="background:rgba(45,212,191,0.06);border:1px solid rgba(45,212,191,0.18);border-radius:10px;padding:12px 14px;font-size:14px;color:var(--soft);line-height:1.7;margin-top:6px;font-style:italic;">"${introDeclaration}"</div>
        </div>` +
        v0Prompts.map(p => `
          <div class="input-group">
            <label class="input-label">${p.label}</label>
            <span class="input-hint" style="font-size:10px;opacity:0.65;">${p.hint}</span>
            <textarea class="text-input" rows="2" placeholder="e.g. I have a background in healthcare but I've never talked about it on camera. Mention that I'm nervous but committed"
              oninput="state.videos['${p.key}']=this.value">${sv[p.key] || p.def}</textarea>
          </div>`).join('');
      // Also store the declaration in state so API can use it
      if (!sv.v0p0) sv.v0p0 = introDeclaration;
    } else {
      // Level 2: Read-only declaration + editable fields
      promptsHTML = `
        <div class="input-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <label class="input-label" style="margin-bottom:0;">Your Authority Series declaration</label>
            <span style="font-size:10px;color:var(--muted);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;letter-spacing:.06em;">READ ONLY</span>
          </div>
          <span class="input-hint" style="font-size:10px;opacity:0.65;">Pre-filled from your onboarding. You can edit on the next page.</span>
          <div style="background:rgba(45,212,191,0.06);border:1px solid rgba(45,212,191,0.18);border-radius:10px;padding:12px 14px;font-size:14px;color:var(--soft);line-height:1.7;margin-top:6px;font-style:italic;">"${l2Declaration}"</div>
        </div>` +
        v0Prompts.map(p => {
          const val = sv[p.key] || p.def || '';
          if (p.key === 'v0p4') {
            // "Anything else" stays editable — feeds the API but user can add freely
            return `
          <div class="input-group">
            <label class="input-label">${p.label}</label>
            <span class="input-hint" style="font-size:10px;opacity:0.65;">${p.hint}</span>
            <textarea class="text-input" rows="2" placeholder="Add any extra context, a story, or anything else for the AI..."
              oninput="state.videos['${p.key}']=this.value">${sv[p.key] || ''}</textarea>
          </div>`;
          } else {
            // Pre-filled answers — read-only display, editable on next page
            return `
          <div class="input-group">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <label class="input-label" style="margin-bottom:0;">${p.label}</label>
              <span style="font-size:10px;color:var(--muted);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;letter-spacing:.06em;">PRE-FILLED</span>
            </div>
            <span class="input-hint" style="font-size:10px;opacity:0.65;">${p.hint}</span>
            <div style="background:rgba(45,212,191,0.04);border:1px solid rgba(45,212,191,0.15);border-radius:10px;padding:12px 14px;font-size:14px;color:var(--soft);line-height:1.7;margin-top:6px;">${val || '<em style="color:var(--muted);font-style:italic;">Not provided. You can add on the next page.</em>'}</div>
          </div>`;
          }
        }).join('');
      // Store declaration in a dedicated key — NOT v0p0 (which feeds the beats/village logic)
      if (!sv.v0decl) sv.v0decl = l2Declaration;
    }
  } else if (v.prebuilt) {
    // show the pre-written script right on the prompts screen
    const prebuiltScript = v.script();
    promptsHTML = `
      <div class="info-box" style="margin-bottom:16px;">
        ✅ This one is already written for you — no prompts needed.
      </div>
      <div class="script-box">
        <div class="script-label">Your Script, Ready to Go</div>
        <div class="script-text">"${prebuiltScript}"</div>
      </div>`;
  } else {
    const easyPrompt = VIDEO_EASY_PROMPTS[idx];
    const defaultMode = videoPromptMode[idx] || 'easy';
    const extHTML = v.prompts.map(p => `
      <div class="input-group">
        <label class="input-label">${p.label}</label>
        <span class="input-hint">${p.hint}</span>
        <textarea class="text-input" rows="2" placeholder="${p.ph}"
          oninput="state.videos['${p.key}']=this.value">${state.videos[p.key] || ''}</textarea>
      </div>`).join('');

    if (easyPrompt) {
      const easyAnswerVal = state.videos[easyPrompt.key] || '';
      const easyHTML = `
        <div class="input-group">
          <label class="input-label">${easyPrompt.label}</label>
          <span class="input-hint">${easyPrompt.hint}</span>
          <textarea class="text-input" rows="4" placeholder="Write whatever comes naturally. You can always add more later."
            oninput="state.videos['${easyPrompt.key}']=this.value">${easyAnswerVal}</textarea>
        </div>`;

      promptsHTML = `
        <div class="prompt-mode-toggle" style="display:flex;gap:8px;margin-bottom:18px;align-items:center;">
          <span style="font-size:13px;color:var(--muted);margin-right:4px;">Prompt style:</span>
          <button id="prompt-easy-btn-${idx}" class="sv-toggle-btn ${defaultMode==='easy'?'active':''}" onclick="setVideoPromptMode(${idx},'easy')" style="font-size:13px;padding:5px 14px;">Easy</button>
          <button id="prompt-ext-btn-${idx}" class="sv-toggle-btn ${defaultMode==='extended'?'active':''}" onclick="setVideoPromptMode(${idx},'extended')" style="font-size:13px;padding:5px 14px;">Extended</button>
        </div>
        <div id="prompt-easy-section-${idx}" style="display:${defaultMode==='easy'?'':'none'};">${easyHTML}</div>
        <div id="prompt-ext-section-${idx}" style="display:${defaultMode==='extended'?'':'none'};">${extHTML}</div>`;
    } else {
      promptsHTML = extHTML;
    }
  }

  card.innerHTML = `
    <div class="journal-header">
      <div class="video-badge">VIDEO ${idx+1}</div>
      <div class="video-title-text">${v.title}</div>
    </div>
    <div class="video-note">${v.note}</div>
    ${promptsHTML}
  `;
  container.appendChild(card);

  // Generate Script button
  const btnWrap = document.createElement('div');
  btnWrap.className = 'btn-row';
  btnWrap.style.cssText = 'flex-direction:column;align-items:flex-start;';

  const genBtn = document.createElement('button');
  genBtn.className = 'btn-primary';
  genBtn.style.fontSize = '20px';
  genBtn.textContent = v.prebuilt ? '✨ Edit & Personalize This Script' : '✨ Generate My Script';
  genBtn.onclick = () => { window._SIS_log && _SIS_log('genBtn:click', {idx}); showScriptView(idx); };
  btnWrap.appendChild(genBtn);

  const skipGenBtn = document.createElement('button');
  skipGenBtn.className = 'btn-skip';
  skipGenBtn.style.cssText = 'font-size:16px;margin-top:4px;';
  skipGenBtn.textContent = idx < 6 ? 'Skip for now, next video →' : 'Skip, see my full plan →';
  skipGenBtn.onclick = () => afterFilmed(idx, 'skipped');
  btnWrap.appendChild(skipGenBtn);

  if (idx > 0) {
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-back';
    backBtn.style.marginTop = '10px';
    backBtn.textContent = '← Previous Video';
    backBtn.onclick = () => {
      const prevIdx = idx - 1;
      currentVideoIndex = prevIdx;
      if (state.videos['script_v' + prevIdx]) {
        // Previous video has a script — go to the script view
        editingFromPlan = false;
        showScriptView(prevIdx, true);
      } else {
        // No script yet — go to that video's prompts
        showScreen('screen-7');
        currentIndex = screenOrder.indexOf('screen-7');
        renderVideoPrompts(prevIdx);
        window.scrollTo(0, 0);
      }
    };
    btnWrap.appendChild(backBtn);
  }

  // Skip to end — always shown
  const skipEnd = document.createElement('button');
  skipEnd.className = 'btn-to-dashboard';
  skipEnd.style.cssText = 'margin-top:14px;';
  skipEnd.textContent = '→ Dashboard';
  skipEnd.onclick = () => skipToEnd();
  btnWrap.appendChild(skipEnd);

  container.appendChild(btnWrap);
}

// ── PHASE B: GENERATED SCRIPT ─────────────────────────

// ── LOADING MESSAGE BANK ──────────────────────────────
const LOADING_MESSAGES_BANK = [
  "I used to think the people who posted every day were just more confident than me.",
  "Turns out they weren't. They just had something to say before they hit record.",
  "The embarrassment you feel before pressing record? That's not weakness. That's evidence you care.",
  "The hardest video to make is always the first one. After that, it just feels normal.",
  "Nobody starts with an audience. They start with a decision to show up anyway.",
  "You don't need to be an expert. You need to be honest. Those are not the same thing.",
  "The person watching your video isn't judging you. They're quietly hoping you'll say something real.",
  "Perfectionism isn't about quality. It's about fear wearing a very convincing costume.",
  "The version of you that films this is already more than the version that was waiting.",
  "Content that sounds polished gets scrolled past. Content that sounds real gets saved.",
  "Your story doesn't need an audience to be worth telling. But an audience needs your story.",
  "You've been having this conversation in your head for a while. It's time to have it on camera.",
  "The gap between 'I'm not ready' and 'I'm doing it anyway' is exactly one video.",
  "Most people are waiting for permission. You're already past that part.",
  "Something you say in the next 7 videos is going to change how someone sees themselves.",
  "The people who need to hear this don't need it to be perfect. They need it to be true.",
  "Every person you admire started with a video nobody watched. That's not a problem. That's the process.",
  "The thing stopping you from hitting record isn't ability. It's the lie that you're not ready yet.",
  "One authentic video does more work than a hundred polished posts.",
  "You've been workshopping this in your head long enough. Say it out loud.",
  "The person who needs to hear your story the most is exactly one scroll away.",
  "Vulnerability isn't weakness on camera. It's the thing that makes people stay.",
  "Real doesn't mean raw and messy. Real means you mean it.",
  "You're not making content. You're starting a conversation that might change someone's week.",
  "The biggest mistake isn't posting the wrong thing. It's never posting at all.",
  "Confidence on camera isn't something you build before you film. It's something you build by filming.",
  "The algorithm doesn't pick you. Your honesty does.",
  "A small audience paying close attention is worth more than a big audience half-listening.",
  "Your hesitation has a name. It's called caring. And it means you're doing this right.",
  "The people who follow you eventually are looking for someone exactly like you. Right now.",
  "Not every video has to be your best. Every video has to be yours.",
  "There is a version of this story only you can tell. That's not a cliché. It's literally true.",
  "The camera captures what you say. The edit captures what you mean. Your audience hears what they need.",
  "You've talked yourself out of posting a hundred times. This time, let the script do the talking.",
  "Showing up without an audience takes more courage than showing up to one. That's the rep you're building.",
  "The feeling before filming isn't something you overcome. It's something you do it anyway through.",
  "Your first video is not a performance. It's a handshake with the person watching.",
  "The gap between who you are and who you think you need to be to post? That gap is imaginary.",
  "No one is watching and critiquing you the way you're watching and critiquing yourself.",
  "The people who feel most seen by your content are the ones quietly thinking 'finally, someone said it.'",
  "You know something that took you years to learn. There's someone who needs to learn it in 90 seconds.",
  "The content that changes people isn't the most produced. It's the most honest.",
  "Every creator you respect has a video they're embarrassed by. They posted it anyway. That's why you know them.",
  "You don't have to be brave to hit record. You just have to be slightly more tired of waiting than you are afraid.",
  "The camera doesn't make you look different. It just makes you stop hiding.",
  "Seven videos from now, you'll look back at this moment and know exactly what it cost you to start.",
  "There's a version of you six videos from now who is deeply grateful you did this one.",
  "Some people have been waiting to hear from someone exactly like you for a very long time.",
  "The first video is the one that proves to yourself that you're someone who does this.",
  "You've already done the hard part: deciding. This part is just saying what you've already thought.",
  "Real connection doesn't come from a perfect take. It comes from a real one.",
  "The story you've been carrying around in your head is lighter after you say it out loud.",
  "You're not building an audience. You're finding the people who already needed you.",
  "The critics in your head are louder before filming than they ever are after.",
  "Ready is a myth. The people posting every day know that. You're about to know it too.",
  "There's no version of this that requires you to be someone you're not.",
  "The world has enough polished voices. It's almost out of honest ones.",
  "The reason you keep putting this off isn't lack of time. It's excess of fear. The script helps.",
  "Something you say offhand in one of these videos will be the exact thing someone screenshots and saves.",
  "You're not trying to go viral. You're trying to be found. Those are completely different goals.",
  "The hesitation you feel is proportional to how much this matters to you. Let that be fuel, not a stop sign.",
  "People don't remember perfect delivery. They remember when someone looked them in the eye through a screen.",
  "Your story is not too small. It's exactly the right size for the person who needs it.",
  "The best camera is the one you have. The best script is the one you're about to get.",
  "There's a reason you came this far in this app. Trust that reason. It knows something.",
  "Posting is not the scary part. Keeping your story to yourself forever is the scary part.",
  "You're going to film this, and it's going to feel awkward, and then it's going to be done, and that's the win.",
  "The only wrong version of this is the one you never made.",
  "The first take doesn't have to be good. It just has to prove that you can start.",
  "Something shifts the first time you see yourself saying something real on camera. Prepare for that.",
  "You have more than enough to say. The script is just the permission slip.",
  "The person scrolling right now who could use exactly what you're about to say — they're out there.",
  "You're building a record of who you were at this exact moment. That's worth something, with or without views.",
  "The difference between the people posting and the people watching is one decision. You're in the middle of making it.",
  "Your voice sounds different on camera than in your head. That's okay. That's actually the point.",
  "Nervousness and excitement feel identical in the body. You get to choose which story you tell yourself.",
  "Some of the best things ever put on camera looked terrible in the first second after filming.",
  "The idea that everyone is watching and judging you assumes you're way more interesting to strangers than you are. (You will be. But not yet.)",
  "The 7-video structure exists because starting is hard and finishing is hard. Everything in between is just momentum.",
  "You are exactly who you need to be to make this video. Future-you doesn't have to show up. Present-you does.",
  "The best thing about hitting record is that you can't un-do having done it.",
  "One year from now, the question isn't 'was the first video good?' It's 'did you make it?' Make it.",
  "The days you almost didn't do it are the ones that define the result. This is one of those days.",
  "There's a whole version of your story that only happens if you start right now.",
  "Nothing you've read, watched, or planned so far has moved things forward. This will.",
  "The people in your life who see your content will see you differently. Start with that.",
  "You're not posting for the algorithm. You're posting for the person who searches for exactly what you know.",
  "Every day you wait is a day someone else fills the space you were supposed to fill.",
  "Being afraid of how you look and pressing record anyway is one of the most human things you can do.",
  "Your message will land differently for everyone who hears it. That's a feature, not a bug.",
  "The version of you that films this is not the version that was waiting. That's a character arc. Lean in.",
  "Seven videos is not a lot. Seven videos is everything.",
];

function startLoadingAnimation() {
  // Pick 4 random unique messages from the bank
  const bank = [...LOADING_MESSAGES_BANK];
  const picks = [];
  for (let i = 0; i < 4; i++) {
    const ri = Math.floor(Math.random() * bank.length);
    picks.push(bank.splice(ri, 1)[0]);
  }

  const ids = ['sl-ep1','sl-ep2','sl-ep3','sl-ep4','sl-ep5'];
  const epiphanyWrap = document.getElementById('script-loading-epiphany');

  ids.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = i < 4 ? picks[i] : 'Yours is almost ready.';
      el.classList.remove('visible');
    }
  });
  if (epiphanyWrap) epiphanyWrap.style.display = '';

  // Slightly longer delays for 5 messages
  const delays = [450, 2000, 3600, 5200, 6800];
  ids.forEach((id, i) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.classList.add('visible');
    }, delays[i]);
  });
}

async function showScriptView(idx, skipLoading) {
  const editKey = 'script_v' + idx;
  // If already has script — just show it (skip loading screen)
  if (skipLoading || (editingFromPlan && state.videos[editKey])) {
    _doShowScriptView(idx);
    return;
  }
  // Generate the script if it doesn't exist yet
  if (!state.videos[editKey]) {
    const msgEl = document.getElementById('script-loading-msg');
    const loadingWrap = document.querySelector('#screen-script-loading .v1-loading-wrap');
    const loadingLabel = document.getElementById('script-loading-label');
    const errorSection = document.getElementById('script-error-section');
    const epiphanyWrap = document.getElementById('script-loading-epiphany');

    // Hide static msg, show epiphany animation
    if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; }
    if (loadingLabel) loadingLabel.textContent = 'Writing your script...';
    if (loadingWrap) loadingWrap.style.display = '';
    if (errorSection) errorSection.style.display = 'none';
    showScreen('screen-script-loading');
    // Start rotating epiphany phrases from the bank
    startLoadingAnimation();

    try {
      window._SIS_log && _SIS_log('gen:start', {idx, level:state.level, mvoQ2:!!state.mvoQ2, topicFreewrite:!!state.topicFreewrite});
      if (typeof logEvent === 'function') {
        logEvent('script_generation_started', {
          video_number: idx + 1,
          level: state.level || 1
        });
      }
      const userMessage = buildAPIUserMessage(idx);
      window._SIS_log && _SIS_log('gen:built-message', {len: userMessage ? userMessage.length : 0});
      const script = await callDeepSeekAPIWithRetry(userMessage, 1);
      window._SIS_log && _SIS_log('gen:got-response', {len: script ? script.length : 0});
      state.videos[editKey] = script;
      saveProgress();
      trackSession();
      queueScriptSave(idx + 1, state.level || 1, script);
      if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot(idx);
      if (typeof logEvent === 'function') logEvent('script_generated', {video_number: idx + 1, level: state.level || 1});
      _doShowScriptView(idx);
      // Show the legacy verification gate only if the newer save-progress overlay never appeared.
      if (typeof getCurrentUser === 'function' && !getCurrentUser()) {
        if (idx === 0) {
          if (!hasSeenSaveProgressOverlay()) setTimeout(() => showVerifyGate(), 1200);
        } else {
          const toast = document.getElementById('verify-email-toast');
          if (toast) toast.style.display = 'flex';
        }
      }
    } catch(err) {
      if (loadingWrap) loadingWrap.style.display = 'none';
      if (epiphanyWrap) epiphanyWrap.style.display = 'none';
      if (msgEl) { msgEl.textContent = ''; msgEl.style.display = ''; }
      if (errorSection) errorSection.style.display = '';
      const errorMsg = document.getElementById('script-error-msg');
      const retryBtn = document.getElementById('script-error-retry');
      const fallbackBtn = document.getElementById('script-error-fallback');
      const errText = err && err.message ? err.message : String(err);
      console.error('[SeenInSeven] Script generation error:', errText);
      if (typeof logEvent === 'function') {
        logEvent('script_failed', {
          video_number: idx + 1,
          level: state.level || 1,
          error: errText
        });
      }
      if (errorMsg) {
        errorMsg.textContent = 'Error: ' + errText;
        errorMsg.style.whiteSpace = 'pre-wrap';
        errorMsg.style.fontSize = '14px';
        errorMsg.style.textAlign = 'left';
      }
      if (retryBtn) retryBtn.onclick = () => showScriptView(idx);
      if (fallbackBtn) fallbackBtn.onclick = () => {
        const videos = getVideos();
        const v = videos[idx];
        if (v.compile) state.videos[editKey] = v.compile(state.videos);
        else if (v.beats) state.videos[editKey] = v.beats().map(b=>b.text).join('\n\n');
        if (typeof logEvent === 'function') {
          logEvent('template_fallback_used', {
            video_number: idx + 1,
            level: state.level || 1
          });
        }
        _doShowScriptView(idx);
      };
    }
    return;
  }

  // Script already exists — use motivational loading message
  const msgs = SCRIPT_LOADING_MSGS;
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  const msgEl = document.getElementById('script-loading-msg');
  const loadingWrap = document.querySelector('#screen-script-loading .v1-loading-wrap');
  const loadingLabel = document.getElementById('script-loading-label');
  const errorSection = document.getElementById('script-error-section');
  const epiphanyWrap = document.getElementById('script-loading-epiphany');
  if (msgEl) { msgEl.textContent = msg; msgEl.style.display = ''; }
  if (loadingWrap) loadingWrap.style.display = '';
  if (loadingLabel) loadingLabel.textContent = 'Building your script...';
  if (errorSection) errorSection.style.display = 'none';
  if (epiphanyWrap) epiphanyWrap.style.display = 'none';
  showScreen('screen-script-loading');
  setTimeout(() => _doShowScriptView(idx), 1000);
}

// Psychological rationale text per video (shown above guided view)
// Per-video label for the story section (replaces generic "MEAT")

// Per-video psychological sub-elements for the story section

const VIDEO_RATIONALE = [
  // V1 — Still in the Ordinary World
  'WHERE WE ARE: The very first step of the Hero\'s Journey, still in the Ordinary World. The hero hasn\'t crossed the threshold yet. This is the moment before everything changes. Your audience sees themselves in you because you haven\'t become anything yet. You\'re just starting, exactly like they want to.',
  // V2 — Crossing the Threshold / Meeting the Mentor
  'WHERE WE ARE: Crossing the Threshold. The audience said yes to following you in Video 1. Now they need to know who they actually said yes to. This is where the bond forms, not through impressiveness, but through specificity. The more real the details, the more they feel like they know you.',
  // V3 — The Road of Trials (First Epiphany)
  'WHERE WE ARE: The Road of Trials, the crown jewel. The hero has entered a new world and faces their first real challenge: the challenge of a stuck belief. This video doesn\'t teach. It restructures how your audience sees something they thought they already understood. This is the one that gets shared.',
  // V4 — Approaching the Innermost Cave
  'WHERE WE ARE: Approaching the Innermost Cave. The hero is deep in the journey now, past the easy part, not yet at the breakthrough. This video is where trust compounds. Showing the real texture of what\'s happening (not a highlight reel) builds more credibility than any success story could.',
  // V5 — The Ordeal
  'WHERE WE ARE: The Ordeal, the darkest moment before the breakthrough. The hero confronts the central lie or false belief that\'s been holding them back. This is where conviction replaces performance. Your audience needs to see you mean what you say, not just say what sounds good.',
  // V6 — The Inmost Cave (The Confession)
  'WHERE WE ARE: The Inmost Cave. The deepest point of the journey, where the hero faces the thing they\'ve been avoiding. This is the most vulnerable video in the challenge, and the most powerful. What you say here is what people remember. The unsaid thing, finally said.',
  // V7 — The Road Back / Return with the Elixir
  'WHERE WE ARE: The Road Back. The Hero returns changed, carrying the Elixir. The circle closes. Your audience has watched a transformation happen in real time, and this video is where they feel it complete. The CTA here isn\'t about the next video. It\'s about the next chapter.',
];

function _doShowScriptView(idx) {
  window._SIS_log && _SIS_log('_doShowScriptView', {idx, hasScript: !!(state.videos && state.videos['script_v'+idx])});
  try {
    _doShowScriptViewInner(idx);
  } catch(e) {
    console.error('[SeenInSeven] _doShowScriptView threw at video ' + idx + ': ' + e.message + ' | ' + (e.stack||'').split('\n')[1]);
    showScreen('screen-script');
    currentIndex = screenOrder.indexOf('screen-script');
  }
}

function _doShowScriptViewInner(idx) {
  const videos = getVideos();
  const v = videos[idx];
  if (!v) { console.error('[SeenInSeven] _doShowScriptView: no video at idx ' + idx + ' (videos.length=' + videos.length + ')'); return; }

  // compile fallback script from beats/compile
  let compiled = '';
  if (v.beats) {
    compiled = v.beats().map(b=>b.text).join('\n\n');
  } else if (v.compile) {
    compiled = v.compile(state.videos);
  }

  // For V1: get declaration text to inject between OPEN LOOP and MEAT in the output
  const isV1 = idx === 0;
  const declText = isV1
    ? (state.level === 2
        ? (state.videos.v0decl || '')
        : (state.videos.v0p0 || ''))
    : '';

  // store the edited script (keyed so edits persist per video)
  const editKey = 'script_v' + idx;
  const sectionsKey = 'sections_v' + idx;

  // If we have an AI script, try to parse it into sections
  if (state.videos[editKey]) {
    const existingSections = state.videos[sectionsKey];
    if (!existingSections) {
      // Try to parse for the first time
      const parsed = parseScriptSections(state.videos[editKey]);
      if (parsed) state.videos[sectionsKey] = parsed;
    }
  } else if (compiled) {
    state.videos[editKey] = compiled;
  }

  // populate the script screen
  window._SIS_log && _SIS_log('dsv:populate', {hasBadge: !!document.getElementById('sv-badge'), hasTitle: !!document.getElementById('sv-title')});
  document.getElementById('sv-badge').textContent = 'VIDEO ' + (idx + 1);
  document.getElementById('sv-title').textContent = v.title;

  // Set psychological rationale text
  const rationaleEl = document.getElementById('sv-rationale-text');
  if (rationaleEl) rationaleEl.textContent = VIDEO_RATIONALE[idx] || '';

  // Populate guided view (HOOK / OPEN LOOP / story section / CTA)
  const storyLabel = VIDEO_STORY_LABELS[idx] || 'YOUR STORY';
  const storyBeats = VIDEO_STORY_BEATS[idx] || [];
  const beatsEl = document.getElementById('sv-beats');
  if (beatsEl) {
    const sections = state.videos[sectionsKey];
    if (sections && (sections.HOOK || sections['OPEN LOOP'] || sections.MEAT || sections.CTA)) {
      // AI-generated script with parsed sections — show sections with psychological labels
      const sectionDefs = [
        { key: 'HOOK',       label: 'HOOK',       desc: 'Stops the scroll in the first 7 words. Grabs attention before anything else.' },
        { key: 'OPEN LOOP',  label: 'OPEN LOOP',  desc: 'Creates tension or curiosity. Signals something important is coming.' },
        ...(isV1 && declText ? [{ key: 'DECLARATION', label: 'DECLARATION', desc: 'Your commitment, out loud. Say this close to verbatim. It signals trust and sets up everything that follows.', fixed: true, fixedText: declText }] : []),
        { key: 'MEAT',       label: storyLabel,    desc: null, beats: storyBeats },
        { key: 'CTA',        label: 'CTA',         desc: 'The forward pull. Earns the next watch without demanding it.' },
      ];
      beatsEl.innerHTML = sectionDefs.map(s => {
        const safeKey = s.key.replace(' ', '-');
        if (s.fixed) {
          // Fixed (verbatim) section — no regenerate button, show declaration text directly
          const fixedHtml = (s.fixedText || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          return `<div class="sv-beat">` +
            `<div class="sv-beat-label" style="display:flex;justify-content:space-between;align-items:center;">` +
            `<span>${s.label}</span>` +
            `<span style="font-size:11px;color:var(--muted);font-family:sans-serif;font-weight:400;letter-spacing:0.03em;">VERBATIM</span>` +
            `</div>` +
            (s.desc ? `<div class="sv-beat-desc">${s.desc}</div>` : '') +
            `<p class="sv-beat-text" id="sv-section-text-${safeKey}" style="white-space:pre-wrap;">${fixedHtml}</p>` +
            `</div>`;
        }
        const text = (sections[s.key] || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const beatsHtml = (s.beats && s.beats.length)
          ? `<ul class="sv-psych-beats">${s.beats.map(b => `<li>${b}</li>`).join('')}</ul>`
          : (s.desc ? `<div class="sv-beat-desc">${s.desc}</div>` : '');
        return `<div class="sv-beat">` +
          `<div class="sv-beat-label" style="display:flex;justify-content:space-between;align-items:center;">` +
          `<span>${s.label}</span>` +
          `<button class="sv-regen-link" id="sv-regen-${safeKey}" onclick="regenerateSection(${idx},'${s.key}',this)" style="background:none;border:none;cursor:pointer;color:var(--teal);font-size:13px;padding:2px 6px;">↺ regenerate</button>` +
          `</div>` +
          beatsHtml +
          `<p class="sv-beat-text" id="sv-section-text-${safeKey}">${text || '<em style="color:var(--muted);font-style:italic;">Section not yet generated</em>'}</p>` +
          `</div>`;
      }).join('');
    } else if (v.beats) {
      // V1 template fallback (compileMvoBeats)
      const beatsData = v.beats();
      beatsEl.innerHTML = beatsData.map(b => {
        const safeLabel = b.label.replace(/\s+/g,'-').toLowerCase();
        return `<div class="sv-beat">` +
          `<div class="sv-beat-label" style="display:flex;justify-content:space-between;align-items:center;">` +
          `<span>${b.label}</span>` +
          `</div>` +
          (b.desc ? `<div class="sv-beat-desc">${b.desc}</div>` : '') +
          `<p class="sv-beat-text">${b.text}</p>` +
          `</div>`;
      }).join('');
    } else {
      // Plain text fallback — split by paragraphs
      const txt = state.videos[editKey] || compiled;
      beatsEl.innerHTML = txt.split('\n\n').map(p =>
        `<p class="sv-beat-text" style="margin-bottom:20px;">${p.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`
      ).join('');
    }
  }

  // Populate clean (editable) view — strip [HOOK][OPEN LOOP][MEAT][CTA] labels, inject DECLARATION for V1
  const editor = document.getElementById('script-editor');
  if (editor) {
    const rawScript = state.videos[editKey] || '';
    let cleanScript = rawScript.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
    // For V1: inject the declaration text between the OPEN LOOP content and the MEAT content
    if (isV1 && declText) {
      const sections = state.videos[sectionsKey];
      if (sections && sections['OPEN LOOP'] && sections.MEAT) {
        // Build a clean version with declaration injected between OPEN LOOP and MEAT
        const hookPart      = (sections.HOOK || '').trim();
        const openLoopPart  = (sections['OPEN LOOP'] || '').trim();
        const meatPart      = (sections.MEAT || '').trim();
        const ctaPart       = (sections.CTA || '').trim();
        cleanScript = [hookPart, openLoopPart, declText.trim(), meatPart, ctaPart].filter(Boolean).join('\n\n');
      } else if (cleanScript && !cleanScript.includes(declText.trim().slice(0, 40))) {
        // Fallback: we don't have parsed sections yet — just append declaration after first paragraph
        const paras = cleanScript.split('\n\n');
        if (paras.length >= 2) {
          paras.splice(2, 0, declText.trim());
          cleanScript = paras.join('\n\n');
        }
      }
    }
    editor.value = cleanScript;
    let _editSaveTimer = null;
    editor.oninput = () => {
      state.videos[editKey] = editor.value;
      const reParsed = parseScriptSections(editor.value);
      if (reParsed) state.videos[sectionsKey] = reParsed;
      clearTimeout(_editSaveTimer);
      _editSaveTimer = setTimeout(() => {
        saveScriptEditToDb(idx + 1, state.level || 1, editor.value);
        if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot(idx);
        if (typeof flashSavedIndicator === 'function') flashSavedIndicator();
      }, 2000);
    };
  }

  // Default to guided view; scroll to top first
  window._SIS_log && _SIS_log('dsv:beats-rendered', {beatsLen: (document.getElementById('sv-beats')||{}).innerHTML ? document.getElementById('sv-beats').innerHTML.length : 0});
  window.scrollTo(0, 0);
  setScriptView('guided');
  // Update lock state UI and undo/redo buttons
  if (typeof _updateLockUI === 'function') _updateLockUI(idx);
  if (typeof _refreshUndoButtons === 'function') _refreshUndoButtons(idx);

  // wire up I Filmed It / Done Editing
  const filmedBtn = document.getElementById('btn-filmed-main');
  const skipBtn = document.getElementById('btn-filmed-skip');

  const alreadyFilmed = state.videoStatus[idx] === 'filmed';

  function _backToDashboard() {
    editingFromPlan = false;
    updateProgress('screen-script');
    buildPlan();
    showScreen('plan-screen');
    currentIndex = screenOrder.indexOf('plan-screen');
    window.scrollTo(0, 0);
  }

  if (editingFromPlan) {
    if (alreadyFilmed) {
      // Already filmed — just offer to go back, no status changes
      filmedBtn.textContent = '✅ Done, Back to Dashboard';
      filmedBtn.onclick = _backToDashboard;
      skipBtn.textContent = '← Back to Dashboard';
      skipBtn.onclick = _backToDashboard;
    } else {
      // Not yet filmed — offer to mark filmed or just return
      filmedBtn.textContent = '✅ Mark Filmed → Back to Dashboard';
      filmedBtn.onclick = () => {
        state.videoStatus[idx] = 'filmed';
        saveProgress();
        queueProgressSave(idx, state.level || 1, 'filmed');
        launchConfetti();
        _backToDashboard();
      };
      skipBtn.textContent = '← Back to Dashboard without filming';
      skipBtn.onclick = _backToDashboard;
    }
  } else {
    // Normal flow — filmed is handled by the checkbox, skip needs to be wired
    if (skipBtn) {
      skipBtn.style.display = 'block';
      skipBtn.textContent = idx < 6 ? 'Skip for now → Next Video' : 'Skip → See My Full Plan';
      skipBtn.onclick = () => afterFilmed(idx, 'skipped');
    }
  }

  // Video 1 first-time reveal: show Epiphany Bridge loading animation
  const isFirstV1 = idx === 0 && !state.videos['_v1_seen'];
  const loadingEl = document.getElementById('v1-loading');
  const mainContent = document.getElementById('script-main-content');

  if (isFirstV1) {
    state.videos['_v1_seen'] = true;
    if (loadingEl) loadingEl.style.display = 'block';
    if (mainContent) mainContent.style.display = 'none';

    showScreen('screen-script');
    currentIndex = screenOrder.indexOf('screen-script');
    updateDots(0);
    window.scrollTo(0, 0);

    // Stagger epiphany lines
    const ep1 = document.getElementById('ep1');
    const ep2 = document.getElementById('ep2');
    const ep3 = document.getElementById('ep3');
    [ep1, ep2, ep3].forEach(e => { if (e) e.classList.remove('visible'); });
    setTimeout(() => { if (ep1) ep1.classList.add('visible'); }, 350);
    setTimeout(() => { if (ep2) ep2.classList.add('visible'); }, 1000);
    setTimeout(() => { if (ep3) ep3.classList.add('visible'); }, 1700);

    setTimeout(() => {
      if (loadingEl) loadingEl.style.display = 'none';
      if (mainContent) mainContent.style.display = '';
      _addV1Tracker();
    }, 2500);
  } else {
    // Ensure loading is hidden and content visible for all other visits
    if (loadingEl) loadingEl.style.display = 'none';
    if (mainContent) mainContent.style.display = '';
    renderVideoTracker('script');
    showScreen('screen-script');
    currentIndex = screenOrder.indexOf('screen-script');
    updateDots(idx);
    window.scrollTo(0, 0);
  }

  // Reset feedback buttons for this video
  const upBtn   = document.getElementById('sv-fb-up');
  const downBtn = document.getElementById('sv-fb-down');
  const thanks  = document.getElementById('sv-fb-thanks');
  if (upBtn)   upBtn.className = 'fb-btn';
  if (downBtn) downBtn.className = 'fb-btn';
  if (thanks)  thanks.classList.remove('show');

  // Load previous versions (async — non-blocking)
  loadScriptVersions(idx);
}

function afterFilmed(idx, status) {
  // Record status ('filmed' or 'skipped')
  // Never downgrade a filmed video to skipped
  let shouldPersistStatus = false;
  if (status) {
    if (status === 'skipped' && state.videoStatus[idx] === 'filmed') {
      // Already filmed — don't overwrite, just navigate forward
    } else {
      state.videoStatus[idx] = status;
      shouldPersistStatus = true;
    }
    updateDots(idx + 1 < 7 ? idx + 1 : idx);
    saveProgress(); // persist after every video completion
    if (shouldPersistStatus && status === 'skipped' && typeof logEvent === 'function') {
      logEvent('video_skipped', {
        video_number: idx + 1,
        level: state.level || 1
      });
    }
    // Queue DB save — fires immediately if authenticated, deferred if not
    if (shouldPersistStatus) queueProgressSave(idx, state.level || 1, status);
  }

  if (idx < 6) {
    renderVideoIntro(idx + 2); // video numbers are 1-based, idx is 0-based; next video = idx+2
    showScreen('screen-video-intro');
    // screen-video-intro is used out-of-band for V2-7; park currentIndex at screen-7
    currentIndex = screenOrder.indexOf('screen-7');
    window.scrollTo(0, 0);
  } else {
    // Last video done — trigger level complete
    triggerLevelComplete();
    buildPlan();
    showScreen('plan-screen');
    currentIndex = screenOrder.indexOf('plan-screen');
    window.scrollTo(0, 0);
  }
}

function backFromVideoIntro() {
  if (currentPreviewVideoNum <= 1) {
    goToMvoScreen();
  } else {
    // Go back to the script screen for the previous video
    const prevIdx = currentPreviewVideoNum - 2;
    currentVideoIndex = prevIdx;
    showScriptView(prevIdx, true); // skip loading on back-navigation
  }
  window.scrollTo(0, 0);
}

// Skip a video directly from its preface screen
function skipFromPreface(idx) {
  afterFilmed(idx, 'skipped');
}

// ── VIDEO TRACKER ──────────────────────────────────────
function renderVideoTracker(context) {
  context = context || 'prompts';
  const videos = getVideos();
  const slots = ['tracker-slot-vi','tracker-slot-journal','tracker-slot-script'];
  const html = _buildTrackerHTML(videos, context);
  slots.forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.innerHTML = html;
  });
}

function _buildTrackerHTML(videos, context) {
  context = context || 'prompts';
  const labels = videos ? videos.map((v,i) => 'V'+(i+1)) : ['V1','V2','V3','V4','V5','V6','V7'];

  // Current level row (L2 gets glowing purple)
  const currentRow = labels.map((label, i) => {
    const st = state.videoStatus[i];
    const isLocked = !!state.videos['locked_v' + i];
    const hasScript = !!state.videos['script_v' + i];
    let cls, status;

    if (st === 'filmed') {
      cls = 'vt-done'; status = '✓';
    } else if (isLocked) {
      cls = 'vt-locked-in'; status = '🔒';
    } else if (i === currentVideoIndex) {
      // Current video being worked on
      cls = 'vt-next';
      status = (context === 'preface') ? '→' : '↑';
    } else if (st === 'skipped' && hasScript) {
      cls = 'vt-ready'; status = '✎';
    } else if (st === 'skipped') {
      cls = 'vt-skipped'; status = '✕';
    } else if (hasScript) {
      cls = 'vt-ready'; status = '✎';
    } else if (context === 'script' && i === currentVideoIndex + 1) {
      cls = 'vt-locked'; status = '–';
    } else if (i < currentVideoIndex) {
      cls = 'vt-locked'; status = '–';
    } else {
      cls = 'vt-locked'; status = '–';
    }
    const l2Class = state.level === 2 ? ' vt-l2-item' : '';
    return `<div class="vt-item${l2Class} ${cls}"><div class="vt-label">${label}</div><div class="vt-status">${status}</div></div>`;
  }).join('');

  // If Level 2 and we have L1 status, show L1 row above (grayed out)
  if (state.level === 2 && state.l1VideoStatus) {
    const l1Status = state.l1VideoStatus;
    const l1Row = labels.map((label, i) => {
      const st = l1Status[i];
      let cls, status;
      if (st === 'filmed') { cls = 'vt-done'; status = '✓'; }
      else if (st === 'skipped') { cls = 'vt-skipped'; status = '✕'; }
      else { cls = 'vt-locked'; status = '–'; }
      return `<div class="vt-item vt-l1-ghost ${cls}"><div class="vt-label">${label}</div><div class="vt-status">${status}</div></div>`;
    }).join('');
    return `<div class="vt-dual-wrap">` +
      `<div class="vt-row-label">L1</div><div class="vt-row">${l1Row}</div>` +
      `<div class="vt-row-label vt-l2-label">L2</div><div class="vt-row">${currentRow}</div>` +
      `</div>`;
  }

  return currentRow;
}

function triggerLevelComplete() {
  const wrap   = document.getElementById('progress-bar-wrap');
  const fill   = document.getElementById('progress-fill');
  const fillL2 = document.getElementById('progress-fill-l2');
  if (state.level === 2) {
    fill.style.width   = '100%';
    fillL2.style.width = '100%';
    fillL2.style.opacity = '1';
    maxProgressL2Pct = 100;
    wrap.classList.add('progress-l2-complete');
    wrap.classList.remove('progress-l1-complete');
    document.getElementById('progress-label').innerHTML =
      '<span class="progress-level-label l2">LEVEL 2 COMPLETE 🎉</span>';
    // Both levels complete — show dual-complete celebration overlay
    if (state.l1VideoStatus) {
      setTimeout(() => {
        const overlay = document.getElementById('dual-complete-overlay');
        if (overlay) overlay.classList.add('show');
      }, 600);
    } else {
      launchConfetti();
    }
  } else {
    fill.style.width = '100%';
    maxProgressPct = 100;
    wrap.classList.add('progress-l1-complete');
    document.getElementById('progress-label').innerHTML =
      '<span class="progress-level-label l1">LEVEL 1 COMPLETE ✓</span>';
  }
}

function skipToEnd() {
  buildPlan();
  showScreen('plan-screen');
  currentIndex = screenOrder.indexOf('plan-screen');
  window.scrollTo(0, 0);
}

function confirmStartVideoOver() {
  // Show a warning before wiping answers and going back to questions
  let overlay = document.getElementById('start-video-over-confirm');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'start-video-over-confirm';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9200;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = `
      <div style="background:#0a1f1f;border:1px solid var(--border);border-radius:16px;padding:32px 28px;max-width:400px;width:100%;text-align:center;">
        <div style="font-family:'Oswald',sans-serif;font-size:22px;color:var(--cream);margin-bottom:12px;">Redo this script?</div>
        <div style="font-size:15px;color:var(--muted);line-height:1.7;margin-bottom:28px;">This clears your current script and answers for this video and takes you back to the questions. Your other videos are unaffected.</div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button onclick="document.getElementById('start-video-over-confirm').remove()" style="background:var(--card);border:1.5px solid var(--border);border-radius:8px;padding:10px 24px;color:var(--soft);font-size:15px;cursor:pointer;font-family:'Nunito',sans-serif;">Cancel</button>
          <button onclick="document.getElementById('start-video-over-confirm').remove();startVideoOver();" style="background:#ef4444;border:none;border-radius:8px;padding:10px 24px;color:white;font-size:15px;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;">Yes, Start Over</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
}

function startVideoOver() {
  const idx = currentVideoIndex;
  // Push snapshot before wiping so undo can recover
  if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot(idx);
  const videos = getVideos();
  const v = videos[idx];
  delete state.videos['script_v' + idx];
  if (v.beats) {
    state.mvoQ2 = null; state.mvoQ3 = null; state.mvoQ4 = null;
    mvoQ2Skipped = false;
    delete state.videos['_v1_seen'];
    delete state.videos['v0p0'];
    delete state.videos['v0p1'];
    delete state.videos['v0p2'];
    goToMvoScreen();
  } else {
    if (v.prompts) { v.prompts.forEach(p => { delete state.videos[p.key]; }); }
    renderVideoPrompts(idx);
    showScreen('screen-7');
    currentIndex = screenOrder.indexOf('screen-7');
  }
  window.scrollTo(0, 0);
}

// Backward-compat alias (old onclick handlers may still call redoScript)
function redoScript() { confirmStartVideoOver(); }

// ── SCRIPT VIEW FEEDBACK (inline thumbs) ─────────────
async function handleScriptViewFeedback(thumbsUp) {
  const upBtn   = document.getElementById('sv-fb-up');
  const downBtn = document.getElementById('sv-fb-down');
  const thanks  = document.getElementById('sv-fb-thanks');

  if (upBtn)   { upBtn.classList.toggle('active-up', thumbsUp); upBtn.classList.toggle('active-down', false); }
  if (downBtn) { downBtn.classList.toggle('active-down', !thumbsUp); downBtn.classList.toggle('active-up', false); }
  if (thanks)  { thanks.classList.add('show'); setTimeout(() => thanks.classList.remove('show'), 2500); }

  await saveScriptFeedback(currentVideoIndex + 1, state.level || 1, thumbsUp);
  if (typeof logEvent === 'function') {
    logEvent('script_feedback', {
      video_number: currentVideoIndex + 1,
      level: state.level || 1,
      thumbs_up: !!thumbsUp
    });
  }
}

// Store for version content (avoids escaping issues with inline onclick)
const _versionStore = {};

async function loadScriptVersions(idx) {
  const versionsEl  = document.getElementById('sv-versions');
  const versionsList = document.getElementById('sv-versions-list');
  if (!versionsEl || !versionsList) return;

  const user = getCurrentUser();
  if (!user) { versionsEl.style.display = 'none'; return; }

  const versions = await fetchScriptVersions(idx + 1, state.level || 1);
  const previous = versions.filter(v => !v.is_current);
  if (previous.length === 0) { versionsEl.style.display = 'none'; return; }

  versionsEl.style.display = '';

  // Store content by id to avoid escaping issues
  previous.forEach(v => { _versionStore[v.id] = v.content; });

  versionsList.innerHTML = previous.map(v => {
    const clean = v.content.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
    const preview = clean.substring(0, 120) + (clean.length > 120 ? '...' : '');
    const date = new Date(v.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `
      <div class="version-item">
        <div class="version-header">
          <span class="version-label">Version ${v.version} &middot; ${date}</span>
          <button class="version-restore" onclick="handleRestoreVersion('${v.id}', ${idx})">Restore →</button>
        </div>
        <div class="version-preview">${preview}</div>
      </div>`;
  }).join('');
}

async function handleRestoreVersion(scriptId, idx) {
  const content = _versionStore[scriptId];
  if (!content) return;
  const level = state.level || 1;
  await restoreScriptVersion(scriptId, idx + 1, level, content);
  _doShowScriptView(idx);
  loadScriptVersions(idx);
}

function editScript(idx) {
  editingFromPlan = true;
  currentVideoIndex = idx;
  updateDots(idx);
  // Go directly to the script view — user sees their script immediately
  // They can regenerate from within the script view if they want
  showScriptView(idx, true); // skipLoading=true since script already exists
}

function markFilmedFromPlan(idx) {
  state.videoStatus[idx] = 'filmed';
  saveProgress();
  queueProgressSave(idx, state.level || 1, 'filmed');
  if (typeof logEvent === 'function') logEvent('video_filmed', {video_number: idx + 1, level: state.level || 1, source: 'dashboard'});
  launchConfetti();
  // Update card immediately so it feels instant
  const card = document.getElementById('dbcard-' + idx);
  if (card) {
    card.classList.remove('card-ready', 'card-pending');
    card.classList.add('card-filmed');
    const statusIcon = card.querySelector('.dbc-status-icon');
    const statusLabel = card.querySelector('.dbc-status-label');
    if (statusIcon) statusIcon.textContent = '✓';
    if (statusLabel) statusLabel.textContent = 'Filmed';
    const actionsDiv = card.querySelector('.dbc-links');
    if (actionsDiv) {
      const markBtn = actionsDiv.querySelector('button[onclick*="markFilmedFromPlan"]');
      if (markBtn) markBtn.replaceWith(Object.assign(document.createElement('span'), {
        className: 'dbc-filmed-badge', textContent: '✓ filmed'
      }));
    }
  }
  // Update ring in hero
  buildPlan();
}

function runItAgain() {
  // Level 1 completers graduate to Level 2
  if (state.level === 1) {
    state.level = 2;
    // update the badge while we're at it
    const badge = document.getElementById('plan-level-badge');
    if (badge) badge.textContent = '🔥 LEVEL 2 — THE AUTHORITY SERIES';
  }
  // Save L1 video status + scripts before wiping so dual tracker and plan page can show them
  state.l1VideoStatus = { ...state.videoStatus };
  state.l1Videos = { ...state.videos };
  // Wipe only video answers, keep name/goal/minigoal
  state.videos = {};
  state.videoStatus = {};
  state.mvoQ2 = null;
  state.mvoQ3 = null;
  state.mvoQ4 = null;
  state.topicFreewrite = '';
  mvoQ2Skipped = false;
  currentVideoIndex = 0;
  currentPreviewVideoNum = 1;
  // Reset progress bar for L2 run
  maxProgressL2Pct = 0;
  maxProgressPct = 100; // L1 was 100% done
  const pbWrap2 = document.getElementById('progress-bar-wrap');
  if (pbWrap2) {
    pbWrap2.classList.remove('progress-l1-complete','progress-l2-complete');
  }
  const pfill2  = document.getElementById('progress-fill');
  const pfillL2b = document.getElementById('progress-fill-l2');
  if (pfill2)   pfill2.style.width   = '100%'; // L1 stays complete
  if (pfillL2b) { pfillL2b.style.width = '0%'; pfillL2b.style.opacity = '0'; }
  document.getElementById('progress-label').textContent = 'YOUR JOURNEY';
  buildVideoDots('video-dots');
  buildVideoDots('script-dots');
  buildVideoDots('vi-dots');
  goToMvoScreen();
  window.scrollTo(0, 0);
}

function _addV1Tracker() {
  renderVideoTracker('script');
}

function goBackToPrompts() {
  const idx = currentVideoIndex;
  if (idx > 0) {
    // Go to the previous video's script view (normal back-navigation, not dashboard editing)
    const prevIdx = idx - 1;
    currentVideoIndex = prevIdx;
    editingFromPlan = false; // normal flow — keep Next Video footer, not dashboard footer
    showScriptView(prevIdx, true);
  } else {
    // Video 1 now uses the combined script prep screen.
    goToMvoScreen();
    window.scrollTo(0, 0);
  }
}

// ── CHECKLIST ─────────────────────────────────────────
function toggleCheck(el){
  el.classList.toggle('checked');
  el.querySelector('.check-box').textContent=el.classList.contains('checked')?'✓':'';
}

// ── EMAIL VERIFICATION GATE ───────────────────────────
function showVerifyGate() {
  const gate = document.getElementById('verify-gate-overlay');
  if (gate) gate.style.display = 'flex';
}

function dismissVerifyGate() {
  const gate = document.getElementById('verify-gate-overlay');
  if (gate) gate.style.display = 'none';
  // Show persistent toast instead so they still see the warning
  const toast = document.getElementById('verify-email-toast');
  if (toast) toast.style.display = 'flex';
}

async function handleGateEmailSubmit() {
  const input = document.getElementById('gate-email-input');
  const errEl = document.getElementById('gate-email-error');
  const email = input ? input.value.trim() : '';

  if (!email || !email.includes('@') || !email.includes('.')) {
    if (errEl) { errEl.textContent = 'Please enter a valid email address.'; errEl.style.display = 'block'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';

  try {
    await sendMagicLink(email);
    const gate = document.getElementById('verify-gate-overlay');
    if (gate) {
      gate.querySelector('button[onclick*="handleGateEmailSubmit"]').textContent = '✓ Link sent! Check your inbox.';
      gate.querySelector('button[onclick*="handleGateEmailSubmit"]').disabled = true;
      setTimeout(() => { gate.style.display = 'none'; }, 2500);
    }
  } catch(e) {
    if (errEl) { errEl.textContent = 'Something went wrong. Try again.'; errEl.style.display = 'block'; }
  }
}

// ── UNDO/REDO SYSTEM ──────────────────────────────────
// Per-video undo stacks. Each video has its own history.
// state.videos['_undo_v' + idx] = { stack: [], pointer: 0 }
// The stack contains script text snapshots, pointer is the current index.

function _undoKey(idx) { return '_undo_v' + idx; }

function _getUndoState(idx) {
  const k = _undoKey(idx);
  if (!state.videos[k]) state.videos[k] = { stack: [], pointer: -1 };
  return state.videos[k];
}

function pushUndoSnapshot(idx) {
  const script = state.videos['script_v' + idx];
  if (!script) return;
  const u = _getUndoState(idx);
  // Don't push duplicate consecutive snapshots
  if (u.pointer >= 0 && u.stack[u.pointer] === script) return;
  // Truncate forward history if we're not at the top
  if (u.pointer < u.stack.length - 1) u.stack = u.stack.slice(0, u.pointer + 1);
  u.stack.push(script);
  // Cap stack at 50 entries to avoid memory bloat
  if (u.stack.length > 50) { u.stack.shift(); u.pointer = u.stack.length - 1; }
  else u.pointer = u.stack.length - 1;
  saveProgress();
  _refreshUndoButtons(idx);
}

function undoScript() {
  const idx = currentVideoIndex;
  const u = _getUndoState(idx);
  if (u.pointer <= 0) return;
  u.pointer--;
  _applyUndoSnapshot(idx, u.stack[u.pointer]);
  _refreshUndoButtons(idx);
}

function redoScriptStep() {
  const idx = currentVideoIndex;
  const u = _getUndoState(idx);
  if (u.pointer >= u.stack.length - 1) return;
  u.pointer++;
  _applyUndoSnapshot(idx, u.stack[u.pointer]);
  _refreshUndoButtons(idx);
}

function _applyUndoSnapshot(idx, text) {
  state.videos['script_v' + idx] = text;
  saveProgress();

  const clean = text.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();

  // Always switch to Edit tab — undo/redo is most visible and reliable there
  if (typeof setScriptView === 'function') setScriptView('clean');

  const editor = document.getElementById('script-editor');
  if (editor) {
    editor.value = clean;
    // Briefly highlight the textarea to show something changed
    editor.style.transition = 'background 0.2s ease';
    editor.style.background = 'rgba(50,184,184,0.10)';
    setTimeout(() => { editor.style.background = ''; }, 600);
    editor.focus();
  }

  // Also update structured view in background
  const sectionsKey = 'sections_v' + idx;
  const parsed = typeof parseScriptSections === 'function' ? parseScriptSections(text) : null;
  if (parsed) {
    state.videos[sectionsKey] = parsed;
    Object.entries(parsed).forEach(([key, val]) => {
      const el = document.getElementById('sv-section-text-' + key.replace(' ', '-'));
      if (el) el.textContent = val.trim();
    });
  }
}

function _refreshUndoButtons(idx) {
  const u = _getUndoState(idx);
  const undoBtn = document.getElementById('sv-undo');
  const redoBtn = document.getElementById('sv-redo');
  if (undoBtn) {
    const canUndo = u.pointer > 0;
    undoBtn.disabled = !canUndo;
    undoBtn.style.opacity = canUndo ? '1' : '0.4';
    undoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
  }
  if (redoBtn) {
    const canRedo = u.pointer < u.stack.length - 1;
    redoBtn.disabled = !canRedo;
    redoBtn.style.opacity = canRedo ? '1' : '0.4';
    redoBtn.style.cursor = canRedo ? 'pointer' : 'not-allowed';
  }
}

// Global keyboard shortcuts for undo/redo on script view
document.addEventListener('keydown', (e) => {
  const scriptScreen = document.getElementById('screen-script');
  if (!scriptScreen || !scriptScreen.classList.contains('active')) return;
  // Don't intercept when typing in textarea/input (browser handles native undo there)
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'input') return;
  const cmd = e.ctrlKey || e.metaKey;
  if (cmd && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoScript(); }
  else if ((cmd && e.key === 'z' && e.shiftKey) || (cmd && e.key === 'y')) { e.preventDefault(); redoScriptStep(); }
});

function handleFilmedCheckbox(checkbox) {
  const idx = currentVideoIndex;
  const boxEl   = document.getElementById('filmed-checkbox-box');
  const labelEl = document.getElementById('btn-filmed-main');

  if (checkbox.checked) {
    state.videoStatus[idx] = 'filmed';
    saveProgress();
    queueProgressSave(idx, state.level || 1, 'filmed');
    if (typeof logEvent === 'function') logEvent('video_filmed', {video_number: idx + 1, level: state.level || 1});
    if (boxEl) boxEl.textContent = '☑';
    if (labelEl) { labelEl.textContent = 'Filmed ✓'; labelEl.style.color = 'var(--green)'; }
    launchConfetti();
    // Auto-lock if not already locked — filming implies commitment
    if (!state.videos['locked_v' + idx]) {
      lockInScript();
    } else {
      _updateLockUI(idx);
    }
    const card = document.getElementById('dbcard-' + idx);
    if (card) {
      card.classList.remove('card-ready', 'card-pending');
      card.classList.add('card-filmed');
    }
  } else {
    delete state.videoStatus[idx];
    saveProgress();
    if (boxEl) boxEl.textContent = '☐';
    if (labelEl) { labelEl.textContent = 'I Filmed It'; labelEl.style.color = ''; }
    _updateLockUI(idx);
  }
}

function skipFilmedBtn() {
  const skipBtn = document.getElementById('btn-filmed-skip');
  if (skipBtn && typeof skipBtn.onclick === 'function') skipBtn.onclick();
}

// ── LOCK IN SCRIPT ────────────────────────────────────
function lockInScript() {
  const idx = currentVideoIndex;
  state.videos['locked_v' + idx] = true;
  saveProgress();
  // Persist lock server-side (points: first lock per video). Queued if
  // anonymous, flushed after auth.
  if (typeof queueLockSave === 'function') queueLockSave(idx, state.level || 1);
  if (typeof logEvent === 'function') {
    logEvent('script_locked', {
      video_number: idx + 1,
      level: state.level || 1
    });
  }

  // Animate the lock button
  const btn = document.getElementById('btn-lock-main');
  if (btn) {
    btn.textContent = '🔒 Locked In ✓';
    btn.style.background = 'rgba(74,222,128,0.18)';
    btn.style.color = 'var(--green)';
  }
  setTimeout(() => _updateLockUI(idx), 400);
}

function _updateLockUI(idx) {
  const locked = !!state.videos['locked_v' + idx];
  const filmed = state.videoStatus[idx] === 'filmed';
  const lockBtn = document.getElementById('btn-lock-main');
  const titleEl = document.getElementById('lock-card-title');
  const subEl   = document.getElementById('lock-card-sub');
  const iconEl  = document.querySelector('.filmed-card .filmed-icon');

  // Restore filmed checkbox state + resize based on lock state
  const checkbox = document.getElementById('filmed-checkbox');
  const boxEl = document.getElementById('filmed-checkbox-box');
  const labelEl = document.getElementById('btn-filmed-main');
  const checkRow = document.getElementById('filmed-checkbox-row');
  if (filmed) {
    if (checkbox) checkbox.checked = true;
    if (boxEl) boxEl.textContent = '☑';
    if (labelEl) labelEl.textContent = 'Filmed ✓';
  } else {
    if (checkbox) checkbox.checked = false;
    if (boxEl) boxEl.textContent = '☐';
    if (labelEl) labelEl.textContent = 'I Filmed It';
  }

  // When locked: filmed row becomes a big prominent button-like element
  // When unlocked: it shrinks back to the subtle checkbox row
  if (checkRow) {
    checkRow.classList.toggle('locked', locked);
    checkRow.classList.toggle('is-filmed', filmed);
  }

  // Remove any previously injected next-video button
  const existing = document.getElementById('btn-next-video');
  if (existing) existing.remove();

  if (locked) {
    if (lockBtn) {
      lockBtn.className = 'btn-skip';
      lockBtn.style.cssText = 'font-size:13px;color:var(--muted);';
      lockBtn.textContent = '🔓 Unlock to edit again';
      lockBtn.onclick = () => unlockScript();
    }
    if (titleEl) titleEl.textContent = filmed ? 'This one\'s done.' : 'Script locked. Time to film.';
    if (subEl) subEl.textContent = filmed
      ? 'Move on to the next one.'
      : 'Film it, then tap the toggle below when you\'re back.';
    if (iconEl) iconEl.textContent = filmed ? '✅' : '🎬';

    // Add "Next Video" button below the filmed toggle (only if not last video and not editingFromPlan)
    const videos = getVideos();
    const isLastVideo = idx >= videos.length - 1;
    const filmedRow = document.getElementById('filmed-checkbox-row');
    if (filmedRow && filmedRow.parentNode) {
      const nextBtn = document.createElement('button');
      nextBtn.id = 'btn-next-video';
      nextBtn.className = 'btn-filmed btn-next-video';
      nextBtn.style.marginTop = '12px';
      if (editingFromPlan) {
        nextBtn.textContent = '← Back to Dashboard';
        nextBtn.onclick = () => {
          editingFromPlan = false;
          updateProgress('screen-script');
          buildPlan();
          showScreen('plan-screen');
          currentIndex = screenOrder.indexOf('plan-screen');
          window.scrollTo(0, 0);
        };
      } else if (isLastVideo) {
        nextBtn.textContent = '🎉 See Your Full Dashboard →';
        nextBtn.onclick = () => { showDashboard(); };
      } else {
        nextBtn.textContent = 'Next Video →';
        nextBtn.onclick = () => {
          currentPreviewVideoNum = idx + 2;
          currentVideoIndex = idx + 1;
          const videos2 = getVideos();
          const nextVid = videos2[idx + 1];
          if (state.videos['script_v' + (idx + 1)]) {
            editingFromPlan = false;
            showScriptView(idx + 1, true);
          } else if (idx + 1 === 0 || (nextVid && nextVid.beats)) {
            goToMvoScreen();
          } else {
            // Standard video intro
            renderVideoIntro(idx + 2); // 1-based: next video number = idx + 2
            showScreen('screen-video-intro');
            currentIndex = screenOrder.indexOf('screen-7');
          }
          window.scrollTo(0, 0);
        };
      }
      filmedRow.parentNode.insertBefore(nextBtn, filmedRow.nextSibling);
    }
  } else {
    if (lockBtn) {
      lockBtn.className = 'btn-filmed';
      lockBtn.style.cssText = '';
      lockBtn.textContent = '🔒 Lock In This Script';
      lockBtn.onclick = () => lockInScript();
    }
    if (titleEl) titleEl.textContent = 'Happy with this script?';
    if (subEl) subEl.textContent = 'Lock it in when you\'re ready to film. You can always edit it after.';
    if (iconEl) iconEl.textContent = '🔒';
  }
}

function unlockScript() {
  const idx = currentVideoIndex;
  delete state.videos['locked_v' + idx];
  saveProgress();
  _updateLockUI(idx);
}

// ── DELETE & START OVER ───────────────────────────────
function confirmDeleteAndStartOver() {
  const el = document.getElementById('delete-start-over-confirm');
  if (el) el.style.display = 'flex';
}

async function deleteAndStartOver() {
  const idx = currentVideoIndex;
  const el = document.getElementById('delete-start-over-confirm');
  if (el) el.style.display = 'none';
  if (typeof logEvent === 'function') {
    logEvent('start_over_confirmed', {
      source: 'video_restart',
      video_number: idx + 1,
      level: state.level || 1
    });
  }
  // The current script is already saved as a version in the DB via queueScriptSave on initial generation.
  // We just need to wipe local state and go back to prompts. The DB row stays as a historical version.
  // First, ensure the current script is persisted in DB before wiping (in case of unsaved edits)
  const currentScript = state.videos['script_v' + idx];
  if (currentScript && typeof saveScriptEditToDb === 'function') {
    await saveScriptEditToDb(idx + 1, state.level || 1, currentScript);
  }
  // Clear the script and its undo history and lock state
  delete state.videos['script_v' + idx];
  delete state.videos['sections_v' + idx];
  delete state.videos['_undo_v' + idx];
  delete state.videos['locked_v' + idx];
  // Clear prompt answers for this video so they can answer fresh
  const videos = getVideos();
  const v = videos[idx];
  if (v && v.prompts) v.prompts.forEach(p => { delete state.videos[p.key]; });
  // For V1 (idx 0), also reset the MVO answers and topic freewrite
  if (idx === 0) {
    state.mvoQ2 = null; state.mvoQ3 = null; state.mvoQ4 = null;
    state.topicFreewrite = '';
    mvoQ2Skipped = false;
    delete state.videos['_v1_seen'];
    delete state.videos['v0p0']; delete state.videos['v0p1'];
    delete state.videos['v0p2']; delete state.videos['v0p3']; delete state.videos['v0p4'];
  }
  saveProgress();
  // Send back to prompts
  if (idx === 0) {
    goToMvoScreen();
  } else {
    renderVideoPrompts(idx);
    showScreen('screen-7');
    currentIndex = screenOrder.indexOf('screen-7');
  }
  window.scrollTo(0, 0);
}

// ── FULLSCREEN PREVIEW ────────────────────────────────
function openFullscreenPreview() {
  const idx = currentVideoIndex;
  const videos = getVideos();
  const v = videos[idx];
  if (!v) return;
  const script = state.videos['script_v' + idx] || '';
  const clean = script.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
  const titleEl = document.getElementById('fullscreen-preview-title');
  const contentEl = document.getElementById('fullscreen-preview-content');
  if (titleEl) titleEl.textContent = 'Video ' + (idx + 1) + ' · ' + v.title;
  if (contentEl) contentEl.textContent = clean;
  const overlay = document.getElementById('fullscreen-preview');
  if (overlay) overlay.style.display = 'block';
}

function closeFullscreenPreview() {
  const overlay = document.getElementById('fullscreen-preview');
  if (overlay) overlay.style.display = 'none';
}

// Esc key closes fullscreen
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('fullscreen-preview');
    if (overlay && overlay.style.display === 'block') closeFullscreenPreview();
  }
});

// ── DASHBOARD VERSION MODAL ───────────────────────────
async function openVersionModal(idx) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user) {
    alert('Sign in to view version history.');
    return;
  }
  const videos = getVideos();
  const v = videos[idx];
  if (!v) return;
  const versions = await fetchScriptVersions(idx + 1, state.level || 1);
  if (!versions || versions.length === 0) return;

  // Build the modal
  let modal = document.getElementById('version-modal-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'version-modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9400;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;padding:24px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = '';
  const inner = document.createElement('div');
  inner.style.cssText = 'background:#0a1f1f;border:1px solid var(--border);border-radius:16px;max-width:680px;width:100%;max-height:88vh;overflow-y:auto;padding:28px;';
  inner.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-family:'Oswald',sans-serif;font-size:22px;color:var(--cream);letter-spacing:0.04em;">Video ${idx + 1}: Version History</div>
      <button onclick="closeVersionModal()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:22px;padding:4px 8px;">✕</button>
    </div>
    <div style="font-size:14px;color:var(--muted);margin-bottom:24px;font-style:italic;">${v.title}</div>
    <div id="version-modal-list"></div>`;
  modal.appendChild(inner);

  const listEl = document.getElementById('version-modal-list');
  versions.forEach(ver => {
    _versionStore[ver.id] = ver.content;
    const clean = ver.content.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
    const date = new Date(ver.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const isCurrent = ver.is_current;
    const item = document.createElement('div');
    item.style.cssText = `border:1px solid ${isCurrent ? 'rgba(50,184,184,0.4)' : 'var(--border)'};border-radius:10px;padding:16px;margin-bottom:14px;background:${isCurrent ? 'rgba(50,184,184,0.05)' : 'transparent'};`;
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-family:'Space Mono',monospace;font-size:11px;letter-spacing:0.12em;color:${isCurrent ? 'var(--teal)' : 'var(--muted)'};text-transform:uppercase;">
          Version ${ver.version} · ${date} ${isCurrent ? '· CURRENT' : ''}
        </div>
        <div style="display:flex;gap:14px;align-items:center;">
          <button class="dbc-link" onclick="copyVersion('${ver.id}', this)">Copy</button>
          <button class="dbc-link" onclick="printVersion('${ver.id}', ${idx})">Print</button>
          ${!isCurrent ? `<button class="dbc-link primary" onclick="restoreVersion('${ver.id}', ${idx})">Restore</button>` : ''}
          ${!isCurrent ? `<button class="dbc-link" style="color:rgba(239,68,68,0.6);" onclick="deleteVersion('${ver.id}', ${idx}, this)">Delete</button>` : ''}
        </div>
      </div>
      <div style="font-family:'Lora',serif;font-style:italic;font-size:14px;line-height:1.7;color:var(--cream);white-space:pre-wrap;max-height:200px;overflow-y:auto;padding:8px 0;border-top:1px solid var(--border);">${clean}</div>`;
    listEl.appendChild(item);
  });

  modal.style.display = 'flex';
}

function closeVersionModal() {
  const modal = document.getElementById('version-modal-overlay');
  if (modal) modal.style.display = 'none';
}

function copyVersion(scriptId, btn) {
  const content = _versionStore[scriptId];
  if (!content) return;
  const clean = content.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
  navigator.clipboard && navigator.clipboard.writeText(clean).then(() => {
    if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = orig, 1500); }
  });
}

function printVersion(scriptId, idx) {
  const content = _versionStore[scriptId];
  if (!content) return;
  const videos = getVideos();
  const v = videos[idx];
  const clean = content.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Video ${idx + 1} — ${v.title}</title>
    <style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 24px;color:#111;line-height:1.8;}
    h1{font-size:22px;margin-bottom:4px;}h2{font-size:14px;color:#555;font-weight:normal;margin-bottom:32px;}
    p{white-space:pre-wrap;font-size:16px;}</style></head>
    <body><h1>Video ${idx + 1} — ${v.title}</h1>
    <h2>SeenInSeven · ${state.name || ''}</h2>
    <p>${clean}</p></body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

async function restoreVersion(scriptId, idx) {
  await handleRestoreVersion(scriptId, idx);
  closeVersionModal();
  buildPlan();
}

async function deleteVersion(scriptId, idx, btn) {
  if (!confirm('Delete this version permanently? This cannot be undone.')) return;
  const ok = await deleteScriptVersion(scriptId);
  if (ok) {
    delete _versionStore[scriptId];
    const item = btn.closest('[style*="border:1px"]') || btn.closest('div');
    if (item) item.remove();
    // Re-open modal to refresh the list
    closeVersionModal();
    await openVersionModal(idx);
  } else {
    if (btn) { btn.textContent = '⚠ Can\'t delete'; setTimeout(() => btn.textContent = 'Delete', 2000); }
  }
}

// ── TRUST INDICATOR: "Saved" flash ─────────────────────
function flashSavedIndicator() {
  // Use the in-card saved indicator (bottom right of script card)
  const el = document.getElementById('saved-indicator');
  if (!el) return;
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

// ── LOGOUT ────────────────────────────────────────────
async function logOut() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('sis_returned');
    _dashboardShown = false;
    if (typeof _sb !== 'undefined') await _sb.auth.signOut();
  } catch(e) {}
  Object.keys(state).forEach(k => state[k] = k === 'videos' || k === 'videoStatus' ? {} : null);
  state.name = ''; state.minigoalText = ''; state.topicFreewrite = '';
  screenOrder = ['screen-0','screen-1'];
  currentIndex = 0; currentVideoIndex = 0;
  showScreen('screen-0');
}

// ── CONFIRM START OVER ────────────────────────────────
function confirmStartOver() {
  const el = document.getElementById('start-over-confirm');
  if (el) el.style.display = 'flex';
}

// ── TOAST MANAGEMENT ─────────────────────────────────
let _toastDismissCount = 0;
let _toastReshowTimer = null;

function dismissVerifyToast() {
  const toast = document.getElementById('verify-email-toast');
  if (toast) toast.style.display = 'none';
  _toastDismissCount++;
  if (_toastDismissCount < 3) {
    clearTimeout(_toastReshowTimer);
    _toastReshowTimer = setTimeout(() => {
      if (typeof getCurrentUser === 'function' && !getCurrentUser()) {
        const t = document.getElementById('verify-email-toast');
        if (t) t.style.display = 'flex';
      }
    }, 5 * 60 * 1000);
  }
}

function showEmailScreenFromToast() {
  const toast = document.getElementById('verify-email-toast');
  if (toast) toast.style.display = 'none';
  const input = document.getElementById('auth-email-input');
  if (input) input.value = '';
  showSaveEmailScreen();
}

// ── COPY SINGLE SCRIPT ────────────────────────────────
function copyScriptFromDashboard(idx, btn) {
  const script = state.videos['script_v' + idx] || '';
  const clean = script.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
  if (!clean) return;
  if (typeof logEvent === 'function') {
    logEvent('script_copied', {
      video_number: idx + 1,
      level: state.level || 1,
      source: 'dashboard'
    });
  }
  navigator.clipboard && navigator.clipboard.writeText(clean).then(() => {
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  });
}

// ── EXPORT SINGLE SCRIPT PDF ──────────────────────────
function exportSinglePDF(idx) {
  const videos = getVideos();
  const v = videos[idx];
  const script = state.videos['script_v' + idx] || '';
  if (!script || !v) return;
  const clean = script.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Video ${idx + 1} — ${v.title}</title>
    <style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 24px;color:#111;line-height:1.8;}
    h1{font-size:22px;margin-bottom:4px;}h2{font-size:14px;color:#555;font-weight:normal;margin-bottom:32px;}
    p{white-space:pre-wrap;font-size:16px;}</style></head>
    <body><h1>Video ${idx + 1} — ${v.title}</h1>
    <h2>SeenInSeven · ${state.name || ''}</h2>
    <p>${clean}</p></body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

// ── PAGE PROTECTION ───────────────────────────────────
// Warn if user tries to close/refresh while a script is generating
window.addEventListener('beforeunload', (e) => {
  const loadingScreen = document.getElementById('screen-script-loading');
  if (loadingScreen && loadingScreen.classList.contains('active')) {
    e.preventDefault();
    e.returnValue = 'Your script is still generating. Are you sure you want to leave?';
  }
});

// Prevent visibility changes (switching apps/windows) from interrupting the script flow
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // User came back — check if we're on a script screen and do nothing
    const scriptScreen = document.getElementById('screen-script');
    const loadingScreen = document.getElementById('screen-script-loading');
    const promptsScreen = document.getElementById('screen-7');
    const onScriptFlow = (scriptScreen && scriptScreen.classList.contains('active'))
      || (loadingScreen && loadingScreen.classList.contains('active'))
      || (promptsScreen && promptsScreen.classList.contains('active'));
    if (onScriptFlow) {
      // Don't let auth state changes interrupt — the supabase handler already guards this
      window._SIS_log && _SIS_log('visibility:returned-to-script', 'staying put');
    }
  }
});
setInterval(async () => {
  if (typeof getCurrentUser !== 'function' || !getCurrentUser()) return;
  try {
    const { data } = await _sb.auth.getSession();
    if (!data || !data.session) {
      const plan = document.getElementById('plan-screen');
      if (plan && plan.classList.contains('active')) {
        const toast = document.getElementById('verify-email-toast');
        if (toast) toast.style.display = 'flex';
      }
    }
  } catch(e) {}
}, 5 * 60 * 1000);

// ── SETTINGS PANEL ────────────────────────────────────
function openSettings() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;
  if (typeof logEvent === 'function') {
    logEvent('settings_opened', {level: state.level || null});
  }

  // Populate with current state
  const nameInput = document.getElementById('settings-name');
  const emailDisplay = document.getElementById('settings-email-display');
  const levelDisplay = document.getElementById('settings-level-display');

  if (nameInput) nameInput.value = state.name || '';
  if (emailDisplay) {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    emailDisplay.textContent = (user && user.email) ? user.email : 'Not saved yet';
  }
  if (levelDisplay) {
    levelDisplay.textContent = state.level === 1
      ? 'Level 1: The Relatable Hero'
      : state.level === 2
        ? 'Level 2 — The Authority Series'
        : 'Not set';
  }

  // Clear messages
  const emailMsg = document.getElementById('settings-email-msg');
  const levelMsg = document.getElementById('settings-level-msg');
  if (emailMsg) emailMsg.textContent = '';
  if (levelMsg) levelMsg.textContent = '';

  // Sync theme toggle label
  const settingsThemeLabel = document.getElementById('settings-theme-label');
  if (settingsThemeLabel) {
    const isLight = document.body.classList.contains('light-mode');
    settingsThemeLabel.textContent = isLight ? 'Dark mode' : 'Light mode';
  }

  // Reset password form to idle state
  cancelSetPassword();

  // Only show password section when authenticated
  const pwSection = document.getElementById('settings-password-section');
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (pwSection) pwSection.style.display = user ? '' : 'none';

  panel.classList.add('open');
}

function closeSettings() {
  const panel = document.getElementById('settings-panel');
  if (panel) panel.classList.remove('open');
}

async function saveSettings() {
  const nameInput = document.getElementById('settings-name');
  const newName = nameInput ? nameInput.value.trim() : '';

  if (newName && newName !== state.name) {
    state.name = newName;
    saveProgress();
    // Update DB immediately if authenticated
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user && typeof _sb !== 'undefined') {
      await _sb.from('users').update({ name: newName }).eq('id', user.id);
    }
    // Update dashboard header
    const dbName = document.getElementById('db-name');
    if (dbName) dbName.textContent = newName;
    buildPlan();
  }

  closeSettings();

  // Brief success indicator on the settings gear button
  const settingsBtn = document.querySelector('.header-nav-btn.icon');
  if (settingsBtn) {
    const orig = settingsBtn.textContent;
    settingsBtn.textContent = '✓';
    setTimeout(() => { settingsBtn.textContent = orig; }, 1500);
  }
}

async function sendSettingsEmailChange() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const emailMsg = document.getElementById('settings-email-msg');
  if (!user || !user.email) {
    if (emailMsg) emailMsg.textContent = 'No email on file — go through onboarding to add one.';
    return;
  }
  try {
    await sendMagicLink(user.email);
    if (emailMsg) {
      emailMsg.textContent = 'Link sent to ' + user.email + ' — click it to re-verify.';
      emailMsg.style.color = 'var(--teal)';
    }
  } catch(e) {
    if (emailMsg) {
      emailMsg.textContent = 'Could not send — try again in a moment.';
      emailMsg.style.color = '#ef4444';
    }
  }
}

function showSetPasswordForm() {
  const form = document.getElementById('settings-password-form');
  const idle = document.getElementById('settings-password-idle');
  if (form) form.style.display = 'block';
  if (idle) idle.style.display = 'none';
  const pwInput = document.getElementById('settings-password-input');
  if (pwInput) pwInput.focus();
}

function cancelSetPassword() {
  const form = document.getElementById('settings-password-form');
  const idle = document.getElementById('settings-password-idle');
  const msg = document.getElementById('settings-password-msg');
  const pwInput = document.getElementById('settings-password-input');
  const pwConfirm = document.getElementById('settings-password-confirm');
  if (form) form.style.display = 'none';
  if (idle) idle.style.display = '';
  if (msg) { msg.textContent = ''; }
  if (pwInput) pwInput.value = '';
  if (pwConfirm) pwConfirm.value = '';
}

async function saveSettingsPassword() {
  const pwInput = document.getElementById('settings-password-input');
  const pwConfirm = document.getElementById('settings-password-confirm');
  const msg = document.getElementById('settings-password-msg');
  const btn = document.querySelector('#settings-password-form .settings-btn-primary');
  const pw = pwInput ? pwInput.value.trim() : '';
  const confirm = pwConfirm ? pwConfirm.value.trim() : '';
  if (pw.length < 6) {
    if (msg) { msg.textContent = 'Password must be at least 6 characters.'; msg.style.color = '#ef4444'; }
    return;
  }
  if (pw !== confirm) {
    if (msg) { msg.textContent = 'Passwords do not match.'; msg.style.color = '#ef4444'; }
    return;
  }
  if (btn) { btn.textContent = 'Setting...'; btn.disabled = true; }
  if (msg) msg.textContent = '';
  try {
    await setUserPassword(pw);
    if (msg) { msg.textContent = 'Password set. You can now sign in with email and password.'; msg.style.color = 'var(--teal)'; }
    if (pwInput) pwInput.value = '';
    if (pwConfirm) pwConfirm.value = '';
  } catch(e) {
    if (msg) { msg.textContent = e.message || 'Could not set password. Try again.'; msg.style.color = '#ef4444'; }
  }
  if (btn) { btn.textContent = 'Set Password'; btn.disabled = false; }
}

function showLevelChangeConfirm() {
  const levelMsg = document.getElementById('settings-level-msg');
  const currentLevel = state.level;
  const otherLevel = currentLevel === 1 ? 2 : 1;
  const otherLabel = otherLevel === 1 ? 'Level 1 (Relatable Hero)' : 'Level 2 (Authority Series)';

  if (levelMsg) {
    levelMsg.innerHTML = 'Switch to ' + otherLabel + '? Your current scripts will be kept. '
      + '<button onclick="confirmLevelChange(' + otherLevel + ')" style="background:none;border:none;color:var(--teal);cursor:pointer;font-weight:700;font-size:12px;padding:0;">Yes, switch →</button>';
    levelMsg.style.color = 'var(--cream)';
  }
}

async function confirmLevelChange(newLevel) {
  const oldLevel = state.level;
  if (oldLevel === newLevel) return;

  // Archive scripts properly to avoid scrambling
  // If switching FROM L1 → L2 and L1 has scripts: stash them in l1Videos
  // If switching FROM L2 → L1 and l1Videos has scripts: restore them
  if (oldLevel === 1 && newLevel === 2) {
    // Stash current L1 scripts before clearing
    const hasL1Scripts = Object.keys(state.videos || {}).some(k => k.startsWith('script_v'));
    if (hasL1Scripts) {
      state.l1Videos = { ...state.videos };
      state.l1VideoStatus = { ...state.videoStatus };
    }
    state.videos = {};
    state.videoStatus = {};
  } else if (oldLevel === 2 && newLevel === 1) {
    // Restore L1 scripts if we have them stashed; otherwise just clear
    if (state.l1Videos && Object.keys(state.l1Videos).length > 0) {
      state.videos = { ...state.l1Videos };
      state.videoStatus = { ...(state.l1VideoStatus || {}) };
      state.l1Videos = null;
      state.l1VideoStatus = null;
    } else {
      state.videos = {};
      state.videoStatus = {};
    }
  }

  state.level = newLevel;
  saveProgress();
  if (typeof logEvent === 'function') {
    logEvent('level_switched', {
      from_level: oldLevel || null,
      to_level: newLevel
    });
  }
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (user && typeof _sb !== 'undefined') {
    await _sb.from('users').update({ level: newLevel }).eq('id', user.id);
  }
  const levelDisplay = document.getElementById('settings-level-display');
  if (levelDisplay) {
    levelDisplay.textContent = newLevel === 1
      ? 'Level 1: The Relatable Hero'
      : 'Level 2 — The Authority Series';
  }
  const levelMsg = document.getElementById('settings-level-msg');
  if (levelMsg) {
    levelMsg.textContent = 'Switched. Your dashboard will update.';
    levelMsg.style.color = 'var(--teal)';
  }
  buildPlan();
}

function rerunOnboarding() {
  closeSettings();
  // Use a styled inline confirmation rather than the browser dialog
  let overlay = document.getElementById('rerun-onboarding-confirm');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rerun-onboarding-confirm';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = `
      <div style="background:#0a1f1f;border:1px solid var(--border);border-radius:16px;padding:32px 28px;max-width:420px;width:100%;text-align:center;">
        <div style="font-family:'Oswald',sans-serif;font-size:22px;color:var(--cream);margin-bottom:12px;">Re-run onboarding?</div>
        <div style="font-size:15px;color:var(--muted);line-height:1.7;margin-bottom:28px;">This clears your answers and takes you back to the questions. Your scripts will be kept exactly as they are.</div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button onclick="document.getElementById('rerun-onboarding-confirm').remove()" style="background:var(--card);border:1.5px solid var(--border);border-radius:8px;padding:10px 24px;color:var(--soft);font-size:15px;cursor:pointer;font-family:'Nunito',sans-serif;">Cancel</button>
          <button onclick="_doRerunOnboarding()" style="background:var(--teal);border:none;border-radius:8px;padding:10px 24px;color:#0D2828;font-size:15px;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;">Yes, Re-run</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
}

function _doRerunOnboarding() {
  const overlay = document.getElementById('rerun-onboarding-confirm');
  if (overlay) overlay.remove();
  state.blocker = null; state.history = null; state.goal = null;
  state.minigoal = null; state.minigoalText = ''; state.business = null;
  state.mvoQ2 = null; state.mvoQ3 = null; state.mvoQ4 = null;
  state.topicFreewrite = ''; state.posted = null;
  resetPhase2();
  saveProgress();
  ensureFullOnboardingOrder();
  currentIndex = screenOrder.indexOf('screen-1');
  showScreen('screen-1');
}

// Close settings when clicking outside the panel
document.addEventListener('click', function(e) {
  const panel = document.getElementById('settings-panel');
  if (panel && panel.classList.contains('open')) {
    // Don't close if click was on the settings toggle button itself (any variant)
    const isToggleBtn = e.target.closest('.db-settings-btn') ||
                        e.target.closest('.header-nav-btn');
    if (!panel.contains(e.target) && !isToggleBtn) {
      closeSettings();
    }
  }
});

function buildMissionManifesto(name, miniText) {
  const p2 = ensurePhase2();
  return escapeHTML(cleanMissionText(p2.missionStatement || buildMissionFallback()));
}

function hasScriptAt(idx) {
  return !!state.videos['script_v' + idx];
}

function getNextScriptIndex(videos) {
  // Skip videos the user explicitly skipped — the dashboard CTA should never
  // route someone back into a video they chose to pass on. They can still
  // return to a skipped video from its own card.
  return videos.findIndex((_, i) => !hasScriptAt(i) && state.videoStatus[i] !== 'skipped');
}

function getNextUnfilmedIndex(videos) {
  return videos.findIndex((_, i) => state.videoStatus[i] !== 'filmed');
}

function hasFirstScriptPrep() {
  const level = state.level || 1;
  const p2 = ensurePhase2();
  if (level === 1) {
    return !!(state.mvoQ2 || state.mvoQ3 || state.mvoQ4 || state.topicFreewrite || p2.knowledgeContext);
  }
  return !!(state.mvoQ2 || state.mvoQ3 || state.mvoQ4 || p2.firstScriptNotes);
}

function buildPlan(){
  const name = state.name || 'You';
  const p2 = ensurePhase2();
  const commitmentText = p2.commitmentDeclaration || buildCommitmentDeclaration();
  const videos = getVideos();
  const videoStatus = state.videoStatus || {};
  const filmedCount = Object.values(videoStatus).filter(s => s === 'filmed').length;
  const totalVideos = videos.length;
  const nextScriptIdx = getNextScriptIndex(videos);
  const nextUnfilmedIdx = getNextUnfilmedIndex(videos);

  // ── Dashboard header ──────────────────────────────────
  const dbName = document.getElementById('db-name');
  const dbPill = document.getElementById('db-level-pill');
  const dbSummary = document.getElementById('db-progress-summary');
  const dbActions = document.getElementById('db-actions');
  const dbGreeting = document.querySelector('.db-greeting');

  if (dbName) dbName.textContent = name !== 'You' ? name : 'Your Dashboard';
  // First visit vs returning — check localStorage flag
  if (dbGreeting) {
    const hasReturned = localStorage.getItem('sis_returned');
    if (!hasReturned) {
      dbGreeting.textContent = filmedCount > 0 ? 'Welcome back' : 'Welcome';
    } else {
      dbGreeting.textContent = 'Welcome back';
    }
    localStorage.setItem('sis_returned', '1');
  }
  const levelLabel = state.level === 1 ? 'Level 1 — Relatable Hero' : 'Level 2 — Authority Series';
  if (dbPill) dbPill.textContent = levelLabel;
  if (dbSummary) dbSummary.textContent = '';
  if (dbActions) dbActions.innerHTML = '';

  const output = document.getElementById('plan-output');
  output.innerHTML = '';

  // ── HERO — progress ring + CTA ────────────────────────
  const pct = Math.round((filmedCount / totalVideos) * 100);
  const circumference = 2 * Math.PI * 40;
  const dash = (filmedCount / totalVideos) * circumference;
  const gap = circumference - dash;

  const resumeLabel = filmedCount === totalVideos
    ? 'Review All Scripts'
    : nextScriptIdx >= 0
      ? (nextScriptIdx === 0 ? 'Build Script 1 →' : 'Build Script ' + (nextScriptIdx + 1) + ' →')
      : nextUnfilmedIdx < 0
        ? 'Review Your Scripts'
        : 'Film Video ' + (nextUnfilmedIdx + 1) + ' →';

  const heroStatusLine = filmedCount === totalVideos
    ? '🎉 All ' + totalVideos + ' videos filmed. You did it.'
    : nextScriptIdx >= 0
      ? (nextScriptIdx === 0 ? 'Start by building Script 1.' : 'Next up: build Script ' + (nextScriptIdx + 1) + '.')
    : filmedCount === 0
      ? 'Scripts ready. Time to film.'
      : filmedCount + ' of ' + totalVideos + ' filmed — keep going.';

  const hero = document.createElement('div');
  hero.className = 'db-hero';
  hero.innerHTML = `
    <div class="db-hero-ring">
      <svg viewBox="0 0 100 100" width="120" height="120">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(50,184,184,0.12)" stroke-width="8"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--teal)" stroke-width="8"
          stroke-dasharray="${dash} ${gap}"
          stroke-dashoffset="${circumference / 4}"
          stroke-linecap="round"
          style="transition:stroke-dasharray 0.6s ease;"/>
        <text x="50" y="46" text-anchor="middle" fill="var(--cream)"
          style="font-family:'Oswald',sans-serif;font-size:20px;font-weight:600;">${filmedCount}</text>
        <text x="50" y="62" text-anchor="middle" fill="var(--muted)"
          style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.1em;">OF ${totalVideos}</text>
      </svg>
    </div>
    <div class="db-hero-content">
      <div class="db-hero-status">${heroStatusLine}</div>
      <button class="db-hero-cta" onclick="resumeFromDashboard()">${resumeLabel}</button>

    </div>`;
  output.appendChild(hero);

  // ── MISSION — collapsed by default ────────────────────
  const missionLine = buildMissionManifesto(name, commitmentText);

  const missionEl = document.createElement('div');
  missionEl.className = 'db-mission-collapsed';
  missionEl.id = 'db-mission-block';
  missionEl.innerHTML = `
    <button class="db-mission-toggle" onclick="toggleMissionBlock()">
      <span class="db-mission-eyebrow">Your Mission</span>
      <span id="db-mission-arrow" class="db-mission-arrow">▼</span>
    </button>
    <div class="db-mission-body" id="db-mission-body" style="display:none;">
      <div class="db-mission-line">${missionLine}</div>
      <div class="db-mission-commit">
        ${escapeHTML(commitmentText)}
      </div>
    </div>`;
  output.appendChild(missionEl);

  // ── VIDEO GRID — compact cards ────────────────────────
  const gridLabel = document.createElement('div');
  gridLabel.className = 'db-grid-label';
  gridLabel.innerHTML = `<span>Your ${totalVideos} Scripts</span>`;
  output.appendChild(gridLabel);

  const grid = document.createElement('div');
  grid.className = 'db-video-grid';

  videos.forEach((v, i) => {
    const filmed = videoStatus[i] === 'filmed';
    const skipped = videoStatus[i] === 'skipped';
    const hasScript = !!state.videos['script_v' + i];
    const isLocked = !!state.videos['locked_v' + i];
    const script = state.videos['script_v' + i] || '';
    const clean = script.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
    const preview = clean ? clean.substring(0, 90) + (clean.length > 90 ? '…' : '') : 'Script not yet generated';

    const statusClass = filmed ? 'card-filmed' : hasScript ? 'card-ready' : 'card-pending';
    const statusIcon = filmed ? '✓' : isLocked ? '🔒' : hasScript ? '✎' : skipped ? '✕' : '–';
    const statusLabel = filmed ? 'Filmed' : isLocked ? 'Locked' : hasScript ? 'Draft' : skipped ? 'Skipped' : 'Pending';

    // Skipped videos are never locked — the user chose to pass and can return anytime.
    const card = document.createElement('div');
    card.className = 'db-video-card ' + statusClass + (!hasScript && !skipped && i !== nextScriptIdx ? ' card-locked' : '');
    card.id = 'dbcard-' + i;
    card.innerHTML = `
      <div class="dbc-header">
        <div class="dbc-num">0${i + 1}</div>
        <div class="dbc-title">${v.title}</div>
        <div class="dbc-status">
          <span class="dbc-status-icon">${statusIcon}</span>
          <span class="dbc-status-label">${statusLabel}</span>
        </div>
      </div>
      <div class="dbc-preview">${preview}</div>
      <div class="dbc-links">
        ${hasScript
          ? `<button class="dbc-link primary" onclick="editScript(${i})">View →</button>`
          : (i === nextScriptIdx || skipped)
            ? `<button class="dbc-link primary" onclick="resumeToVideo(${i})">Generate →</button>`
            : `<span class="dbc-pending-label">Complete earlier scripts first</span>`}
        ${filmed
          ? `<span class="dbc-filmed-badge">✓ filmed</span>`
          : hasScript
            ? `<button class="dbc-link" onclick="markFilmedFromPlan(${i})">Mark Filmed</button>`
            : ''}
        ${hasScript ? `<button class="dbc-link" onclick="copyScriptFromDashboard(${i}, this)">Copy</button> <button class="dbc-link" onclick="exportSinglePDF(${i})">PDF</button> <button class="dbc-link" onclick="openVersionModal(${i})">Versions</button>` : ''}
      </div>`;
    grid.appendChild(card);
  });

  output.appendChild(grid);

  // ── L1 archive (L2 users) ─────────────────────────────
  if (state.level === 2 && state.l1Videos && Object.keys(state.l1Videos).length > 0) {
    const l1label = document.createElement('div');
    l1label.className = 'db-grid-label';
    l1label.innerHTML = '<span class="db-l1-archive-label">✓ Level 1 — Relatable Hero (Archive)</span>';
    output.appendChild(l1label);

    const l1grid = document.createElement('div');
    l1grid.className = 'db-video-grid';
    level1Videos.forEach((v, i) => {
      const script = state.l1Videos['script_v' + i] || '';
      const clean = script.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
      const preview = clean ? clean.substring(0, 90) + '…' : '';
      const card = document.createElement('div');
      card.className = 'db-video-card card-filmed db-l1-card';
      card.innerHTML = `
        <div class="dbc-header">
          <div class="dbc-num db-l1-num">0${i + 1}</div>
          <div class="dbc-title db-l1-title">${v.title}</div>
          <div class="dbc-status"><span class="dbc-status-icon">✓</span></div>
        </div>
        <div class="dbc-preview">${preview}</div>
        <div class="dbc-links">
          ${clean ? `<button class="dbc-link primary" onclick="showL1ScriptModal(${i})">View →</button>` : '<span class="dbc-pending-label">No script saved</span>'}
        </div>`;
      l1grid.appendChild(card);
    });
    output.appendChild(l1grid);
  }

  // ── Tracker, affiliates, mission card ─────────────────
  buildPlanTracker();
  updatePartnerVisibility();

  if (state.level === 1) {
    document.getElementById('mission-label').textContent = filmedCount === totalVideos ? '🎉 Level 1 Complete' : '⭐ In Progress';
    document.getElementById('mission-title').textContent = filmedCount === totalVideos ? 'YOU SHOWED UP. NOW LEVEL UP.' : 'KEEP GOING.';
    document.getElementById('mission-cta').innerHTML = filmedCount === totalVideos ? `
      You just completed <strong style="color:var(--teal)">Level 1: The Relatable Hero</strong>.
      That's the foundation — most people never build it.<br><br>
      <strong>Your next move:</strong> Level 2 — The Authority Series.<br><br>
      <button onclick="runItAgain()" style="background:var(--teal);color:#0f172a;font-family:'Oswald',sans-serif;font-size:18px;letter-spacing:0.1em;padding:13px 34px;border:none;border-radius:8px;cursor:pointer;margin-top:8px;">
        Start Level 2 — Skip the Setup →
      </button>` : `
      You have ${totalVideos - filmedCount} video${totalVideos - filmedCount !== 1 ? 's' : ''} left to film.
      Your scripts are ready. The camera is the only thing between you and done.<br><br>
      <button onclick="resumeFromDashboard()" style="background:var(--teal);color:#0f172a;font-family:'Oswald',sans-serif;font-size:18px;letter-spacing:0.1em;padding:13px 34px;border:none;border-radius:8px;cursor:pointer;margin-top:8px;">
        Resume Challenge →
      </button>`;
  } else {
    const l2Done = filmedCount === totalVideos;
    document.getElementById('mission-label').textContent = l2Done ? '🔥 Level 2 Complete' : '🔥 Authority Series';
    document.getElementById('mission-title').textContent = l2Done ? 'YOU JUST PROVED YOUR VOICE WORKS.' : 'KEEP BUILDING.';
    document.getElementById('mission-cta').innerHTML = l2Done ? `
      <strong style="color:var(--cream)">Now let's build the business you deserve.</strong><br><br>
      The Exscalator Engine gives you unlimited unique scripts, a daily entrepreneurial roadmap, and live support — forever.<br><br>
      <a href="https://content.coloradomastermind.com/yeees" target="_blank"
        style="display:inline-block;background:var(--green);color:#0f172a;font-family:'Oswald',sans-serif;font-size:18px;letter-spacing:0.1em;padding:13px 34px;border-radius:8px;text-decoration:none;margin-top:8px;">
        Continue →
      </a>` : `
      You have ${totalVideos - filmedCount} video${totalVideos - filmedCount !== 1 ? 's' : ''} left to film.<br><br>
      <button onclick="resumeFromDashboard()" style="background:var(--teal);color:#0f172a;font-family:'Oswald',sans-serif;font-size:18px;letter-spacing:0.1em;padding:13px 34px;border:none;border-radius:8px;cursor:pointer;margin-top:8px;">
        Resume →
      </button>`;
  }
}

function toggleMissionBlock() {
  const body = document.getElementById('db-mission-body');
  const arrow = document.getElementById('db-mission-arrow');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
}

function resumeToVideo(idx) {
  currentVideoIndex = idx;
  const videos = getVideos();
  buildVideoDots('vi-dots');
  if (idx === 0 && !state.videos['script_v0']) {
    if (hasFirstScriptPrep()) {
      editingFromPlan = false;
      showScriptView(0);
      return;
    }
    goToMvoScreen();
    window.scrollTo(0, 0);
    return;
  }
  renderVideoPrompts(idx);
  showScreen('screen-7');
  currentIndex = screenOrder.indexOf('screen-7');
  window.scrollTo(0, 0);
}

function togglePlanRow(i){
  const row=document.getElementById('pvrow-'+i);
  row.classList.toggle('open');
  const arrow=document.getElementById('arrow-'+i);
  if(arrow) arrow.style.transform = row.classList.contains('open') ? 'rotate(180deg)' : '';
}

function toggleL1PlanRow(i){
  const row=document.getElementById('l1pvrow-'+i);
  if(row) row.classList.toggle('open');
  const arrow=document.getElementById('l1arrow-'+i);
  if(arrow) arrow.style.transform = row && row.classList.contains('open') ? 'rotate(180deg)' : '';
}

// Build the plan-page tracker (top slot):
// filmed → green ✓   |   script ready → gold ✎   |   not started → dim   |   skipped → red ✕
function buildPlanTracker() {
  const el = document.getElementById('tracker-slot-plan');
  if (!el) return;
  const videos = getVideos();
  const labels = videos.map((_,i) => 'V'+(i+1));

  function makeItem(label, st, hasScript, isL2, idx, isL1Ghost) {
    const isLocked = idx !== null && !!state.videos['locked_v' + idx];
    let cls, statusIcon;
    if (st === 'filmed') {
      cls = 'vt-done'; statusIcon = '✓';
    } else if (isLocked) {
      // Locked takes priority over skipped — user came back to this video
      cls = 'vt-locked-in'; statusIcon = '🔒';
    } else if (hasScript && st !== 'skipped') {
      cls = 'vt-ready'; statusIcon = '✎';
    } else if (st === 'skipped' && !hasScript) {
      cls = 'vt-skipped'; statusIcon = '✕';
    } else if (st === 'skipped' && hasScript) {
      // Skipped but now has a script — show as ready (user generated after skipping)
      cls = 'vt-ready'; statusIcon = '✎';
    } else {
      cls = 'vt-locked'; statusIcon = '–';
    }
    const l2Class    = isL2      ? ' vt-l2-item vt-plan-l2' : '';
    const ghostClass = isL1Ghost ? ' vt-l1-ghost' : '';
    const clickable  = (idx !== null && hasScript) ? ' vt-clickable' : '';
    const clickAttr  = (idx !== null && hasScript)
      ? ` onclick="editScript(${idx})" title="Jump to Video ${idx+1}"`
      : '';
    return `<div class="vt-item${l2Class}${ghostClass}${clickable} ${cls}"${clickAttr}>`+
      `<div class="vt-label">${label}</div>`+
      `<div class="vt-status">${statusIcon}</div>`+
      `</div>`;
  }

  let html = '';
  if (state.level === 2 && state.l1VideoStatus) {
    const l1Row = labels.map((lbl,i) =>
      makeItem(lbl, state.l1VideoStatus[i], !!state.l1Videos?.['script_v'+i], false, null, true)
    ).join('');
    const l2Row = labels.map((lbl,i) =>
      makeItem(lbl, state.videoStatus[i], !!state.videos['script_v'+i], true, i, false)
    ).join('');
    html = `<div class="vt-dual-wrap">`+
      `<div class="vt-row-label">L1 — RELATABLE HERO</div><div class="vt-row">${l1Row}</div>`+
      `<div class="vt-row-label vt-l2-label">L2 — AUTHORITY SERIES</div><div class="vt-row">${l2Row}</div>`+
      `</div>`;
  } else {
    html = labels.map((lbl,i) => {
      const isL2 = state.level === 2;
      return makeItem(lbl, state.videoStatus[i], !!state.videos['script_v'+i], isL2, i, false);
    }).join('');
  }
  el.innerHTML = html;
}

// ── L1 ARCHIVE SCRIPT VIEWER ─────────────────────────
function showL1ScriptModal(idx) {
  const script = state.l1Videos && state.l1Videos['script_v' + idx] || '';
  const clean = script.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
  if (!clean) return;
  const videos = level1Videos || [];
  const title = (videos[idx] && videos[idx].title) ? videos[idx].title : 'Script ' + (idx + 1);
  let modal = document.getElementById('l1-script-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'l1-script-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9800;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(2,10,10,0.7);backdrop-filter:blur(5px);';
    modal.innerHTML = '<div id="l1-script-modal-inner" style="width:min(680px,100%);max-height:82vh;overflow:auto;background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,0.4);">' +
      '<div style="position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;background:var(--card);border-bottom:1px solid var(--border);">' +
      '<div id="l1-modal-title" style="font-family:\'Oswald\',sans-serif;font-size:17px;letter-spacing:0.04em;color:var(--teal);"></div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button onclick="copyL1Script()" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--muted);font-size:12px;cursor:pointer;font-family:\'Nunito\',sans-serif;">Copy</button>' +
      '<button onclick="closeL1ScriptModal()" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;color:var(--muted);font-size:12px;cursor:pointer;font-family:\'Nunito\',sans-serif;">Close</button>' +
      '</div></div>' +
      '<div id="l1-modal-body" style="padding:20px 22px;font-family:\'Lora\',serif;font-style:italic;font-size:18px;line-height:1.85;color:var(--cyan);white-space:pre-wrap;"></div>' +
      '</div>';
    modal.addEventListener('click', e => { if (e.target === modal) closeL1ScriptModal(); });
    document.body.appendChild(modal);
  }
  document.getElementById('l1-modal-title').textContent = 'L1 — Video ' + (idx + 1) + ': ' + title;
  document.getElementById('l1-modal-body').textContent = clean;
  modal.style.display = 'flex';
  modal._scriptText = clean;
}
function closeL1ScriptModal() {
  const modal = document.getElementById('l1-script-modal');
  if (modal) modal.style.display = 'none';
}
function copyL1Script() {
  const modal = document.getElementById('l1-script-modal');
  if (!modal || !modal._scriptText) return;
  navigator.clipboard && navigator.clipboard.writeText(modal._scriptText).catch(() => {});
}

// ── DASHBOARD HELPERS ─────────────────────────────────

// Resume from dashboard — jump to the next script that still needs to be created.
function resumeFromDashboard() {
  const videos = getVideos();
  let nextIdx = getNextScriptIndex(videos);
  if (nextIdx < 0) {
    nextIdx = getNextUnfilmedIndex(videos);
    if (nextIdx < 0) { showDashboard(); return; }
  }
  currentVideoIndex = nextIdx;
  buildVideoDots('video-dots');
  buildVideoDots('script-dots');
  buildVideoDots('vi-dots');

  if (state.videos['script_v' + nextIdx]) {
    editingFromPlan = false;
    showScriptView(nextIdx, true);
  } else if (nextIdx === 0) {
    if (hasFirstScriptPrep()) {
      editingFromPlan = false;
      showScriptView(0);
      window.scrollTo(0, 0);
      return;
    }
    goToMvoScreen();
  } else {
    renderVideoPrompts(nextIdx);
    showScreen('screen-7');
    currentIndex = screenOrder.indexOf('screen-7');
  }
  window.scrollTo(0, 0);
}

// Thumbs feedback handler
// Conditional affiliate visibility
function updatePartnerVisibility() {
  const filmedCount = Object.values(state.videoStatus || {}).filter(s => s === 'filmed').length;
  const partnerSection = document.getElementById('partner-section');
  const vubli = document.getElementById('partner-vubli');
  const temu  = document.getElementById('partner-temu');

  if (!partnerSection) return;

  const hasAnyScript = Object.keys(state.videos || {}).some(k => k.startsWith('script_v') && state.videos[k]);
  if (filmedCount >= 1 || hasAnyScript) {
    partnerSection.removeAttribute('data-locked');
    if (vubli) vubli.style.display = '';
  }
  if (filmedCount >= 3) {
    if (temu) temu.style.display = '';
  }
}

// ── PDF EXPORT ────────────────────────────────────────
function showPdfModal() {
  document.getElementById('pdf-modal-overlay').classList.add('show');
}
function hidePdfModal() {
  document.getElementById('pdf-modal-overlay').classList.remove('show');
}

// Brand colors mirrored from css/app.css :root — keep these two in sync with
// --ink and --teal there. exportPDF() prints on a white background, so it
// intentionally does not reuse the rest of the dark-mode palette.
const PDF_BRAND = { ink: '#0D2828', teal: '#32B8B8' };

function exportPDF(mode) {
  hidePdfModal();
  if (typeof logEvent === 'function') {
    logEvent('pdf_exported', {
      mode: mode || 'all',
      level: state.level || null
    });
  }
  const name = state.name || 'Your';
  const videos = getVideos();
  const levelLabel = state.level === 1 ? 'Level 1: The Relatable Hero' : 'Level 2 — The Authority Series';

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>${name}'s Scripts — SeenInSeven</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;1,400;1,700&family=Oswald:wght@500;600&family=Space+Mono&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Georgia, serif; background:#fff; color:#111; padding:48px 56px; max-width:720px; margin:0 auto; }
    .doc-header { border-bottom:2px solid ${PDF_BRAND.ink}; padding-bottom:20px; margin-bottom:36px; }
    .doc-title { font-family:'Oswald',sans-serif; font-size:32px; color:${PDF_BRAND.ink}; letter-spacing:0.04em; margin-bottom:6px; }
    .doc-sub { font-family:'Space Mono',monospace; font-size:11px; color:${PDF_BRAND.teal}; letter-spacing:0.16em; text-transform:uppercase; }
    .section-label { font-family:'Space Mono',monospace; font-size:9px; letter-spacing:0.2em; text-transform:uppercase; color:#999; margin-bottom:6px; }
    .video-block { page-break-inside:avoid; margin-bottom:44px; padding-bottom:36px; border-bottom:1px solid #e5e5e5; }
    .video-block:last-child { border-bottom:none; }
    .video-num { font-family:'Oswald',sans-serif; font-size:13px; letter-spacing:0.1em; color:${PDF_BRAND.teal}; margin-bottom:4px; }
    .video-title { font-family:'Oswald',sans-serif; font-size:24px; color:${PDF_BRAND.ink}; margin-bottom:16px; }
    .script-text { font-family:'Lora',serif; font-style:italic; font-size:17px; line-height:2.0; color:#222; white-space:pre-wrap; }
    .status-badge { display:inline-block; font-family:'Space Mono',monospace; font-size:9px; letter-spacing:0.12em; text-transform:uppercase; padding:3px 10px; border-radius:4px; margin-bottom:12px; }
    .status-filmed { background:#dcfce7; color:#166534; }
    .status-pending { background:#fef9c3; color:#854d0e; }
    .archive-header { font-family:'Oswald',sans-serif; font-size:18px; color:#166534; margin:48px 0 20px; padding-top:32px; border-top:2px solid #dcfce7; }
    @media print { body { padding:32px 40px; } }
  </style>
  </head><body>
  <div class="doc-header">
    <div class="doc-title">${name}'s Video Scripts</div>
    <div class="doc-sub">SeenInSeven · ${levelLabel}</div>
  </div>`;

  // Current level scripts
  videos.forEach((v, i) => {
    let script = state.videos['script_v'+i] || '';
    if (!script) {
      if(v.beats) script = v.beats().map(b=>b.text).join('\n\n');
      else if(v.compile) script = v.compile(state.videos);
    }
    const clean = script.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
    const filmed = state.videoStatus[i] === 'filmed';
    const statusHtml = filmed
      ? `<span class="status-badge status-filmed">✓ Filmed</span>`
      : `<span class="status-badge status-pending">Not filmed yet</span>`;
    html += `
    <div class="video-block">
      <div class="video-num">VIDEO ${i+1} OF ${videos.length}</div>
      <div class="video-title">${v.title}</div>
      ${statusHtml}
      <div class="script-text">${clean}</div>
    </div>`;
  });

  // L1 archive if mode === 'all'
  if (mode === 'all' && state.l1Videos && Object.keys(state.l1Videos).length > 0) {
    html += `<div class="archive-header">Level 1 Scripts — The Relatable Hero</div>`;
    level1Videos.forEach((v, i) => {
      let script = state.l1Videos['script_v'+i] || '';
      if (!script && v.beats) script = v.beats().map(b=>b.text).join('\n\n');
      const clean = script.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
      html += `
      <div class="video-block">
        <div class="video-num">L1 VIDEO ${i+1} OF 7</div>
        <div class="video-title">${v.title}</div>
        <div class="script-text">${clean}</div>
      </div>`;
    });
  }

  html += `</body></html>`;

  // Open in a new tab and trigger print
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ── SHOW DASHBOARD DIRECTLY (authenticated returning users) ───
function showDashboard() {
  window._SIS_log && _SIS_log('showDashboard:start', { level: state.level, name: state.name });
  _dashboardShown = true;
  if (typeof logEvent === 'function') {
    logEvent('dashboard_viewed', {level: state.level || null});
  }

  if (screenOrder.length <= 2) {
    ensureFullOnboardingOrder();
  }

  try { buildPlan(); } catch(e) {
    console.error('[SeenInSeven] buildPlan threw: ' + e.message);
  }
  // Bypass showScreen's 200ms animation — activate plan-screen synchronously
  // to eliminate races with the async auth flow (onAuthStateChange + initAuth
  // both calling showDashboard can leave the animation timer in a bad state).
  transitioning = false;
  document.querySelectorAll('.screen.active, .screen.anim-out, .screen.anim-in').forEach(s => {
    s.classList.remove('active', 'anim-out', 'anim-in');
  });
  const _planEl = document.getElementById('plan-screen');
  if (_planEl) _planEl.classList.add('active');

  currentIndex = screenOrder.indexOf('plan-screen');
  window.scrollTo(0, 0);
  window._SIS_log && _SIS_log('showDashboard:done', 'plan-screen activated synchronously');

  // Update header username and show nav
  const _usernameEl = document.getElementById('header-username');
  if (_usernameEl) _usernameEl.textContent = state.name || '';
  const _navEl = document.getElementById('header-nav');
  if (_navEl) _navEl.style.display = 'flex';
  const _dashBtn = document.getElementById('header-dashboard-btn');
  if (_dashBtn) _dashBtn.style.display = 'none';
  const _signInBtn = document.getElementById('header-signin-btn');
  if (_signInBtn) _signInBtn.style.display = 'none';

  if (typeof getCurrentUser === 'function' && !getCurrentUser()) {
    const toast = document.getElementById('verify-email-toast');
    if (toast) toast.style.display = 'flex';
  }
}

// ── RESTART ───────────────────────────────────────────
function restartWizard(){
  // Use the styled confirmation overlay
  const overlay = document.getElementById('start-over-confirm');
  if (overlay) { overlay.style.display = 'none'; }
  if (typeof logEvent === 'function') {
    logEvent('start_over_confirmed', {
      source: 'full_restart',
      level: state.level || null
    });
  }

  // Clear scripts and onboarding from state
  state.videos       = {};
  state.videoStatus  = {};
  state.videoPosted  = {};  // server rows are deleted below, keep points in parity
  state.l1Videos     = null;
  state.l1VideoStatus= null;
  state.posted       = null;
  state.blocker      = null;
  state.history      = null;
  state.goal         = null;
  state.minigoal     = null;
  state.minigoalText = '';
  state.business     = null;
  state.mvoQ2        = null;
  state.mvoQ3        = null;
  state.mvoQ4        = null;
  state.topicFreewrite = '';
  resetPhase2();
  mvoQ2Skipped = false;
  maxProgressPct = 0;
  maxProgressL2Pct = 0;

  // Save cleared state to localStorage
  saveProgress();

  // Clear from DB if authenticated (fire and forget)
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (user && typeof _sb !== 'undefined') {
    _sb.from('scripts').delete().eq('user_id', user.id).then(() => {});
    _sb.from('video_progress').delete().eq('user_id', user.id).then(() => {});
    _sb.from('onboarding').delete().eq('user_id', user.id).then(() => {});
    _sb.from('users').update({
      level: state.level, // keep level
      blocker: null, business_stage: null
    }).eq('id', user.id).then(() => {});
  }

  // Reset progress bar
  const pbWrap = document.getElementById('progress-bar-wrap');
  if (pbWrap) pbWrap.classList.remove('progress-l1-complete','progress-l2-complete');
  const pfill = document.getElementById('progress-fill');
  const pfillL2 = document.getElementById('progress-fill-l2');
  if (pfill) pfill.style.width = '0%';
  if (pfillL2) { pfillL2.style.width = '0%'; pfillL2.style.opacity = '0'; }

  // Stay on dashboard — rebuild it fresh
  buildPlan();
  updateProgress('plan-screen');
}

// ── MVO MINI-WIZARD ───────────────────────────────────


// ── AUTO-POPULATE MVO Q2 FROM ONBOARDING DATA ────────
function autoPopulateMvoQ2FromOnboarding() {
  if (state.mvoQ2 && state.mvoQ2.before_full) return;
  const customBlocker = ensurePhase2().custom && ensurePhase2().custom.blocker;
  if (customBlocker) {
    state.mvoQ2 = {
      before_short: customBlocker.split(' ').slice(0,5).join(' '),
      before_full: customBlocker
    };
    mvoQ2Skipped = true;
    return;
  }
  const blockerMap = {
    camera: {
      before_short: 'the camera thing',
      before_full: 'I have wanted to do this, but every time I think about filming, something shuts it down. The camera feels like a judgment I am not ready to face.'
    },
    ideas: {
      before_short: 'not knowing what to say',
      before_full: 'I sit down to plan a video and my mind goes completely blank. I know I have something worth sharing. I just cannot seem to get it out.'
    },
    procrastinating: {
      before_short: 'the endless delay',
      before_full: 'I have been meaning to start for longer than I want to admit. Life gets in the way, or I get in the way. It just keeps not happening.'
    },
    care: {
      before_short: 'worrying people will not care',
      before_full: 'I have wanted to post, but part of me keeps wondering if anyone will actually care. I do not want to put something real out there and feel embarrassed by the silence.'
    },
    nothing: {
      before_short: 'not being sure what my thing is',
      before_full: 'I have been holding off because I was not sure I had anything worth saying yet. What to talk about, who would care, whether I was the right person to even do this.'
    }
  };
  const historyMap = {
    few: {
      before_short: 'never finding consistency',
      before_full: 'I have posted before, but it never stuck. A video or two, feel weird about it, quietly stop. The pattern kept repeating and nothing ever changed.'
    },
    stops: {
      before_short: 'always falling off',
      before_full: 'I know the pattern well. Start strong, something happens, disappear for months. I have done it enough times that starting again feels like setting myself up to fail again.'
    },
    was: {
      before_short: 'losing the rhythm I had',
      before_full: 'I used to have a rhythm. Something broke it and I just never came back. It has been sitting in the back of my mind ever since, this thing I know I let slip away.'
    }
  };
  if (state.blocker && blockerMap[state.blocker]) {
    state.mvoQ2 = blockerMap[state.blocker];
    mvoQ2Skipped = true;
  } else if (state.history && historyMap[state.history]) {
    state.mvoQ2 = historyMap[state.history];
    mvoQ2Skipped = true;
  }
}

function renderMvoScreen() {
  const level = state.level || 1;
  const p2 = ensurePhase2();
  const mode = p2.mvoMode || 'simple';
  const title = document.getElementById('mvo2-question');
  const subtitle = document.getElementById('mvo2-subtitle');
  const simpleBtn = document.getElementById('mvo-simple-btn');
  const extendedBtn = document.getElementById('mvo-extended-btn');
  const container = document.getElementById('mvo2-cards');
  if (!container) return;
  if (title) title.textContent = level === 2 ? "Let's get your expert script ready." : "Let's get your script ready.";
  if (subtitle) subtitle.textContent = level === 2 ? 'Three questions. Your answers become the foundation of your first script.' : 'Answer what feels relevant. The more you add, the more the script sounds like you.';
  if (simpleBtn) simpleBtn.classList.toggle('active', mode === 'simple');
  if (extendedBtn) extendedBtn.classList.toggle('active', mode === 'extended');

  if (level === 1) {
    autoPopulateMvoQ2FromOnboarding();
    const questions = mode === 'extended' ? [2,3,4] : [3];
    container.innerHTML = questions.map(qNum => renderMvoQuestion(qNum, level, mode)).join('');
  } else {
    container.innerHTML = [2,3,4].map(qNum => renderMvoQuestion(qNum, level, mode)).join('') +
      (mode === 'extended' ? renderMvoAnythingElse() : '');
  }
}

function setMvoMode(mode) {
  const p2 = ensurePhase2();
  p2.mvoMode = mode === 'extended' ? 'extended' : 'simple';
  saveProgress();
  renderMvoScreen();
}

// Navigate to screen-mvo2, rendering its content and syncing currentIndex.
// Callers that also need window.scrollTo(0,0) still call it themselves right after —
// this helper only replaces the 3-line render/show/index pattern, not scroll behavior.
function goToMvoScreen() {
  renderMvoScreen();
  showScreen('screen-mvo2');
  currentIndex = screenOrder.indexOf('screen-mvo2');
}

function renderMvoQuestion(qNum, level, mode) {
  const data = MVO_DATA['q'+qNum][level];
  const selected = state['mvoQ'+qNum] || {};
  const isExtendedL2 = level === 2 && mode === 'extended';
  const showFreewrite = level === 1 || isExtendedL2;
  const sub = getMvoSubtitle(qNum, level, mode);
  const chips = '<div class="mvo-chip-grid">' + data.cards.map(card => {
    const active = mvoCardMatches(selected, card);
    return '<button type="button" class="mvo-chip' + (active ? ' selected' : '') + '" onclick="selectMvoBriefCard(' + qNum + ',' + level + ',\'' + safeMvoCardKey(card.text) + '\')">' + card.icon + ' ' + escapeHTML(card.text) + '</button>';
  }).join('') + '</div>';
  const currentText = mvoAnswerText(qNum, level);
  const freewrite = showFreewrite
    ? '<div class="mvo-freewrite-wrap"><label class="input-label">' + getMvoFreewriteLabel(qNum, level, mode) + '</label><textarea class="text-input" rows="3" placeholder="' + escapeHTML(getMvoPlaceholder(qNum, level, mode)) + '" oninput="setMvoFreewrite(' + qNum + ',' + level + ', this.value)">' + escapeHTML(currentText) + '</textarea></div>'
    : '';
  return '<div class="mvo-brief-question"><div class="mvo-brief-title">' + escapeHTML(data.question) + '</div><div class="mvo-brief-sub">' + escapeHTML(sub) + '</div>' + chips + freewrite + '</div>';
}

function renderMvoAnythingElse() {
  const p2 = ensurePhase2();
  return '<div class="mvo-brief-question"><div class="mvo-brief-title">Anything else you would like to add?</div><div class="mvo-brief-sub">Add any detail that would help this first script feel more accurate, specific, or useful.</div><div class="mvo-freewrite-wrap"><label class="input-label">Use your words.</label><textarea class="text-input" rows="3" maxlength="1200" placeholder="Anything else we should know before building this first script?" oninput="setMvoFirstScriptNotes(this.value)">' + escapeHTML(p2.firstScriptNotes || '') + '</textarea></div></div>';
}

function safeMvoCardKey(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getMvoCard(qNum, level, text) {
  const data = MVO_DATA['q'+qNum][level];
  return (data.cards || []).find(card => card.text === text);
}

function mvoCardMatches(selected, card) {
  if (!selected || !card) return false;
  const keys = ['text', 'village_full', 'before_full', 'catalyst_full', 'crack_full'];
  return keys.some(key => selected[key] && card[key] && selected[key] === card[key]);
}

function selectMvoBriefCard(qNum, level, text) {
  const card = getMvoCard(qNum, level, text);
  if (!card) return;
  state['mvoQ'+qNum] = card;
  saveProgress();
  renderMvoScreen();
}

function setMvoFreewrite(qNum, level, value) {
  const text = String(value || '').slice(0, 2000);
  const custom = { custom_text: text };
  if (qNum === 2 && level === 1) { custom.text = text; custom.before_short = text.split(' ').slice(0,5).join(' '); custom.before_full = text; }
  else if (qNum === 2 && level === 2) { custom.text = text; custom.village_full = text; custom.village_hook = 'If you are someone who needs ' + text; }
  else if (qNum === 3 && level === 1) { custom.text = text; custom.catalyst_full = text; }
  else if (qNum === 3 && level === 2) { custom.text = text; custom.before_full = text; }
  else if (qNum === 4 && level === 1) { custom.text = text; custom.village_full = text; custom.village_hook = 'If you are someone looking for ' + text; }
  else if (qNum === 4 && level === 2) { custom.text = text; custom.crack_full = text; }
  state['mvoQ'+qNum] = custom;
  saveProgress();
}

function setMvoFirstScriptNotes(value) {
  const p2 = ensurePhase2();
  p2.firstScriptNotes = String(value || '').slice(0, 1200);
  saveProgress();
}

function mvoAnswerText(qNum, level) {
  const answer = state['mvoQ'+qNum] || {};
  const mode = ensurePhase2().mvoMode || 'simple';
  if (answer.custom_text) return answer.custom_text;
  if (level === 1 && mode === 'extended') {
    if (qNum === 2) return answer.before_full || '';
    if (qNum === 3) return answer.catalyst_full || '';
    if (qNum === 4) return answer.village_full || '';
  }
  if (level === 1) return '';
  if (qNum === 2 && level === 2) return answer.village_full || '';
  if (qNum === 3 && level === 2) return answer.before_full || '';
  if (qNum === 4 && level === 2) return answer.crack_full || '';
  return '';
}

function getMvoSubtitle(qNum, level, mode) {
  if (level === 1 && mode === 'simple') return "Pick the one that's closest, then add anything the buttons don't quite capture.";
  if (level === 1 && qNum === 2) return 'Pick the closest one.';
  if (level === 1 && qNum === 3) return 'Pick the closest one.';
  if (level === 1 && qNum === 4) return 'Pick the closest one, or describe it below in your own words.';
  if (level === 2 && mode === 'simple') return 'Pick one.';
  return 'Use your own words if you want to give the script builder more context.';
}

function getMvoFreewriteLabel(qNum, level, mode) {
  if (level === 1 && mode === 'simple') return 'Add anything else that brought you here.';
  if (level === 2 && mode === 'extended') return 'Use your words.';
  return 'Say it your way.';
}

function getMvoPlaceholder(qNum, level, mode) {
  if (qNum === 2 && level === 1) return "What's actually been making this hard?";
  if (qNum === 3 && level === 1) return 'What finally made this feel like the right time?';
  if (qNum === 4 && level === 1) return "Describe what you want to talk about, who it's for, and why it matters to you.";
  return 'Describe this in your own words.';
}

function completeMvoBrief() {
  const level = state.level || 1;
  if (level === 1) {
    autoPopulateMvoQ2FromOnboarding();
    if (!state.mvoQ4 || !mvoAnswerText(4, 1)) {
      const topic = state.topicFreewrite || ensurePhase2().knowledgeContext || '';
      if (topic) setMvoFreewrite(4, 1, topic);
    }
  }
  if (typeof logEvent === 'function') {
    logEvent('mvo_completed', {
      level: level,
      source: ensurePhase2().mvoMode || 'simple'
    });
  }
  currentVideoIndex = 0;
  showScriptView(0);
}

// ── VIDEO INTRO COPY ─────────────────────────────────

function renderFrameworkHTML(framework) {
  if (!framework || !framework.length) return '';
  const beats = framework.map((b, i) => {
    const arrow = i < framework.length - 1 ? '<span class="vi-arrow">→</span>' : '';
    return `<div class="vi-beat"><span class="vi-beat-name">${b.name}</span><span class="vi-beat-trigger">${b.trigger}</span></div>${arrow}`;
  }).join('');
  return `<div class="vi-framework"><div class="vi-framework-title">Script Framework</div><div class="vi-beats-row">${beats}</div></div>`;
}

function renderTriggersHTML(triggers) {
  if (!triggers || !triggers.length) return '';
  const tags = triggers.map(t => `<span class="vi-trigger-tag">${t}</span>`).join('');
  return `<div class="vi-triggers-section"><div class="vi-triggers-label">Psychological Triggers Active</div><div class="vi-triggers">${tags}</div></div>`;
}

function renderResultBadgeHTML(result) {
  if (!result) return '';
  return `<div class="vi-result-badge"><span>Result:</span>${result}</div>`;
}

function renderVideoIntro(videoNum) {
  const lv  = state.level || 1;
  const key = lv === 1 ? 'L1' : 'L2';
  const data = INTRO_COPY[videoNum] && INTRO_COPY[videoNum][key];
  if (!data) return;
  currentPreviewVideoNum = videoNum;
  currentVideoIndex = videoNum - 1;
  buildVideoDots('vi-dots');  // rebuild dots fresh so updateDots has elements to update
  // dots: active on current video (0-based index = videoNum - 1)
  updateDots(videoNum - 1);
  renderVideoTracker('preface');
  const labelEl  = document.getElementById('vi-label');
  const titleEl  = document.getElementById('vi-title');
  const bodyEl   = document.getElementById('vi-body');
  const badgeEl  = document.getElementById('vi-result-badge');
  const fwEl     = document.getElementById('vi-framework');
  const trigEl   = document.getElementById('vi-triggers');
  const btn      = document.getElementById('vi-ready-btn');
  if (labelEl)  labelEl.textContent  = data.label;
  if (titleEl)  titleEl.textContent  = data.title;
  if (bodyEl)   bodyEl.textContent   = data.body;
  if (badgeEl)  badgeEl.innerHTML    = renderResultBadgeHTML(data.result);
  if (fwEl)     fwEl.innerHTML       = renderFrameworkHTML(data.framework);
  if (trigEl)   trigEl.innerHTML     = renderTriggersHTML(data.triggers);
  if (btn)      btn.onclick = () => readyForVideo(videoNum - 1);
}

function readyForVideo(idx) {
  showScreen('screen-7');
  currentIndex = screenOrder.indexOf('screen-7');
  renderVideoPrompts(idx);
  window.scrollTo(0, 0);
}

// ── MVO BEAT COMPILER ─────────────────────────────────
function compileMvoBeats() {
  const level = state.level || 1;
  const name  = state.name || 'me';
  let q2 = state.mvoQ2 || {};
  let q3 = state.mvoQ3 || {};
  let q4 = state.mvoQ4 || {};
  // Apply any edits the user made on the V1 journal-prompts screen
  const sv = state.videos;
  if (level === 1) {
    if (sv.v0p0) q2 = Object.assign({}, q2, {before_full: sv.v0p0});
    if (sv.v0p1) q3 = Object.assign({}, q3, {catalyst_full: sv.v0p1});
    if (sv.v0p2) q4 = Object.assign({}, q4, {village_full: sv.v0p2, village_hook: 'If you are someone looking for '+sv.v0p2});
  } else {
    if (sv.v0p0) q2 = Object.assign({}, q2, {village_full: sv.v0p0, village_hook: 'If you are someone who values '+sv.v0p0});
    if (sv.v0p1) q3 = Object.assign({}, q3, {before_full: sv.v0p1});
    if (sv.v0p2) q4 = Object.assign({}, q4, {crack_full: sv.v0p2});
  }
  if (level === 1) {
    const isComeback = state.posted === 'consistent' || state.history === 'was';
    const hookText = isComeback
      ? 'Hey, I\'m ' + name + '. I\'m back. And I want to be honest with you about the fact that I was here before — and I stopped.'
      : 'Hey, I\'m ' + name + '. And I\'m doing something that honestly scares me a little bit.';
    const commitText = isComeback
      ? 'My name is ' + name + '. I was here before and I stopped. That is the honest truth. But I am back, and this time I have seven specific videos to get through — seven commitments I am making to myself right now.'
      : 'My name is ' + name + '. I am not promising forever. I am committing to seven videos. Seven videos to let you see who I am, what I care about, and whether anything I share is actually worth your time. That starts right now.';
    const forYouText = (q4.village_hook ? q4.village_hook + '... I am really glad you found this.' : 'I am making these for ' + (q4.village_full || 'people who are right where I was') + '. If that is you, I am really glad you found this.') + ' Stay with me for the next six.';
    return [
      {label:'HOOK',                    desc:'Grabs attention in the first two seconds — gives the viewer a reason to keep watching before you say anything else.',
                                        text: hookText},
      {label:'IDENTITY',                desc:'Opens with language that makes your exact viewer feel seen — signals who you are and who this is for.',
                                        text: q2.before_full || 'Something has been making it hard to take that first step.'},
      {label:'THE WAITING STRUGGLE',    desc:'Acknowledges the real frustration before offering anything — the internal tension that held you back.',
                                        text: q3.catalyst_full || 'Something finally made it clear that today was the day.'},
      {label:'THE START DECLARATION',   desc:'Closes the open loop — your commitment and the invitation for the right person to stay.',
                                        text: commitText + ' ' + forYouText}
    ];
  } else {
    const commitL2 = 'My name is '+name+'. Over these next seven videos, I want to share some things in a way you probably have not heard them before. Things that will actually help, whether you have been following me for a while or you just found this today.';
    const inviteL2 = 'If you have been here for a while, thank you for still being here. If you are brand new, I am so glad you landed on this. Follow along with me for the next six because what comes next is worth your time.';
    return [
      {label:'HOOK',                      desc:'Grabs attention in the first two seconds — gives the viewer a reason to keep watching before you say anything else.',
                                          text:(q2.village_hook||'If you know something needs to change')+'... I want to talk to you.'},
      {label:'EXPERTISE',                 desc:'Establishes who you serve and the core problem you solve — signals why you\'re the right expert for this.',
                                          text:'The people I am here for are '+(q2.village_full||'people ready to take the next step')+'. And the thing most of them are working through right now is this: '+(q3.before_full||'there is a real challenge standing between where they are and where they want to be.')},
      {label:'THE MARKET GAP',            desc:'Grounds your credibility in lived experience — shows the gap in the market you\'re here to fill.',
                                          text:q4.crack_full||'I have spent years working through this exact problem.'},
      {label:'THE SOLUTION DECLARATION',  desc:'Closes the open loop — your commitment and the invitation for the right person to stay.',
                                          text: commitL2 + ' ' + inviteL2}
    ];
  }
}

function copyAllScripts(btn) {
  const videos = getVideos();
  let allText = '';
  videos.forEach(function(v, i) {
    var script = state.videos['script_v'+i] || '';
    if (!script) {
      if (v.beats) { script = v.beats().map(function(b){return b.text;}).join('\n\n'); }
      else if (v.compile) { script = v.compile(state.videos); }
      else if (v.prebuilt) { script = v.script(); }
    }
    var cleanScript = script.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
    if (cleanScript) {
      allText += 'VIDEO ' + (i+1) + ' — ' + v.title + '\n\n' + cleanScript + '\n\n—\n\n';
    }
  });
  allText = allText.trim();
  if (!allText) {
    if (btn) { btn.textContent = '⚠️ No scripts yet'; setTimeout(function(){ btn.textContent='📋 Copy All 7 Scripts'; }, 2000); }
    return;
  }
  if (typeof logEvent === 'function') {
    logEvent('all_scripts_copied', {level: state.level || null});
  }
  var copied = function() {
    if (btn) { btn.textContent = '✅ All 7 Copied!'; }
    setTimeout(function() { if (btn) btn.textContent = '📋 Copy All 7 Scripts'; }, 2500);
  };
  navigator.clipboard.writeText(allText).then(copied).catch(function() {
    var ta = document.createElement('textarea');
    ta.value = allText; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    copied();
  });
}

// ── SCRIPT VIEW HELPERS ────────────────────────────────
function setScriptView(view) {
  const beats     = document.getElementById('sv-beats');
  const clean     = document.getElementById('sv-clean');
  const gBtn      = document.getElementById('sv-guided-btn');
  const cBtn      = document.getElementById('sv-clean-btn');
  const rationale = document.getElementById('sv-rationale');

  if (view === 'guided') {
    // Sync: if user edited the textarea, update the structured view before showing it
    const editor = document.getElementById('script-editor');
    if (editor && editor.value) {
      const idx = currentVideoIndex;
      const editKey = 'script_v' + idx;
      const sectionsKey = 'sections_v' + idx;
      const currentEditorText = editor.value;
      // Only sync if it differs from stored (user actually typed something)
      const stored = state.videos[editKey] || '';
      const storedClean = stored.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
      if (currentEditorText.trim() !== storedClean) {
        state.videos[editKey] = currentEditorText;
        const reParsed = typeof parseScriptSections === 'function' ? parseScriptSections(currentEditorText) : null;
        if (reParsed) {
          state.videos[sectionsKey] = reParsed;
          // Update each beat section text in the structured view
          Object.entries(reParsed).forEach(([key, val]) => {
            const el = document.getElementById('sv-section-text-' + key.replace(' ', '-'));
            if (el) el.textContent = val.trim();
          });
        }
      }
    }
    if (beats)     beats.style.display = 'block';
    if (clean)     clean.style.display = 'none';
    if (gBtn)      gBtn.classList.add('active');
    if (cBtn)      cBtn.classList.remove('active');
    if (rationale) rationale.style.display = 'block';
  } else {
    if (beats)     beats.style.display = 'none';
    if (clean)     clean.style.display = 'block';
    if (gBtn)      gBtn.classList.remove('active');
    if (cBtn)      cBtn.classList.add('active');
    if (rationale) rationale.style.display = 'none';
  }
}

function copyScript(btn) {
  // Get text from state (source of truth) — not the textarea which may be stale or hidden
  const raw = state.videos['script_v' + currentVideoIndex] || '';
  const text = raw.replace(/\[(HOOK|OPEN LOOP|MEAT|CTA)\]\s*/g, '').trim();
  // Also sync textarea value in case user expects it to match
  const editor = document.getElementById('script-editor');
  if (editor && !editor.value.trim() && text) editor.value = text;
  if (!text) return;
  if (typeof logEvent === 'function') {
    logEvent('script_copied', {
      video_number: currentVideoIndex + 1,
      level: state.level || 1,
      source: 'script_view'
    });
  }
  const showCopyTip = function() {
    var tip = document.getElementById('script-copy-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'script-copy-tip';
      tip.className = 'copy-tip';
      tip.textContent = '✏️  Now paste it into your teleprompter app and hit record.';
      var svCopyBtn = document.getElementById('sv-copy-btn');
      if (svCopyBtn && svCopyBtn.parentNode) svCopyBtn.parentNode.appendChild(tip);
      else if (btn && btn.parentNode) btn.parentNode.appendChild(tip);
    }
    tip.style.display = 'block';
    setTimeout(function() { if (tip) tip.style.display = 'none'; }, 5000);
  };
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { btn.textContent = '✅ Copied!'; btn.classList.add('copied'); }
    showCopyTip();
    setTimeout(() => { if (btn) { btn.textContent = '📋 Copy Script'; btn.classList.remove('copied'); } }, 2000);
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    if (btn) { btn.textContent = '✅ Copied!'; btn.classList.add('copied'); }
    showCopyTip();
    setTimeout(() => { if (btn) { btn.textContent = '📋 Copy Script'; btn.classList.remove('copied'); } }, 2000);
  });
}

// ── LOCAL STORAGE / RETURNING USER ────────────────────

function saveProgress() {
  const data = {
    name:          state.name          || '',
    level:         state.level         || '',
    posted:        state.posted        || '',
    history:       state.history       || '',
    blocker:       state.blocker       || '',
    minigoal:      state.minigoal      || '',
    minigoalText:  state.minigoalText  || '',
    business:      state.business      || '',
    goal:          state.goal          || '',
    videoStatus:   state.videoStatus   || {},
    videos:        state.videos        || {},
    l1VideoStatus: state.l1VideoStatus || null,
    l1Videos:      state.l1Videos      || null,
    topicFreewrite:state.topicFreewrite|| '',
    mvoQ2:         state.mvoQ2         || null,
    mvoQ3:         state.mvoQ3         || null,
    mvoQ4:         state.mvoQ4         || null,
    phase2:        ensurePhase2(),
    videoPosted:   state.videoPosted   || {},
    engage:        state.engage        || {},
    savedAt:       Date.now()
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch(e) {}
  // Queue DB sync — fires immediately if authenticated, deferred if not
  queueOnboardingSave();
}

function loadProgress() {
  // If there's a valid Supabase auth token in the hash, step aside —
  // onAuthStateChange will handle routing once it processes the token.
  // But don't skip on error hashes like #error=access_denied
  const hash = window.location.hash;
  if (hash && hash.includes('access_token') && !hash.includes('error')) return;

  // If there's an auth error in the hash, clear it and show screen-0 normally
  if (hash && hash.includes('error=')) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    // Expire after 30 days
    if (Date.now() - data.savedAt > 30 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SAVE_KEY);
      return;
    }
    if (data.name || data.level) {
      // Restore state
      if (data.name)        state.name        = data.name;
      if (data.level)       state.level       = data.level;
      if (data.posted)      state.posted      = data.posted;
      if (data.history)     state.history     = data.history;
      if (data.blocker)     state.blocker     = data.blocker;
      if (data.minigoal)    state.minigoal    = data.minigoal;
      if (data.minigoalText) state.minigoalText = data.minigoalText;
      if (data.business)    state.business    = data.business;
      if (data.goal)        state.goal        = data.goal;
      if (data.videoStatus) state.videoStatus = data.videoStatus;
      if (data.videos)      state.videos      = data.videos;
      if (data.mvoQ2)         state.mvoQ2         = data.mvoQ2;
      if (data.mvoQ3)         state.mvoQ3         = data.mvoQ3;
      if (data.mvoQ4)         state.mvoQ4         = data.mvoQ4;
      if (data.phase2)        state.phase2        = data.phase2;
      ensurePhase2();
      if (data.l1VideoStatus) state.l1VideoStatus = data.l1VideoStatus;
      if (data.l1Videos)      state.l1Videos      = data.l1Videos;
      if (data.topicFreewrite)state.topicFreewrite= data.topicFreewrite;
      if (data.videoPosted)   state.videoPosted   = data.videoPosted;
      if (data.engage)        state.engage        = data.engage;
      if (data.mvoQ2 && (data.blocker || data.history)) mvoQ2Skipped = true;

      // If they have a level — go straight to dashboard, no banner needed
      if (data.level && typeof showDashboard === 'function') {
        showDashboard();
        return;
      }

      // Has name but no level (partial onboarding) — show the banner
      const banner = document.getElementById('returning-banner');
      const nameEl = document.getElementById('rb-name-display');
      if (banner && nameEl) {
        banner.classList.add('visible');
        nameEl.textContent = data.name ? data.name + ' 👋' : '👋';
      }
    }
  } catch(e) {}
}

function continueSession() {
  document.getElementById('returning-banner').classList.remove('visible');
  // If they completed onboarding (level known), resume at the right place
  if (state.level) {
    ensureFullOnboardingOrder();
    resumeFromDashboard();
    window.scrollTo(0, 0);
  } else {
    goNext();
  }
}

function dismissBanner() {
  // Just hide the banner and let them start fresh locally
  // Don't sign out — they may want to keep their account
  localStorage.removeItem(SAVE_KEY);
  Object.keys(state).forEach(k => state[k] = k === 'videos' || k === 'videoStatus' ? {} : null);
  state.name = ''; state.minigoalText = ''; state.topicFreewrite = '';
  resetPhase2();
  document.getElementById('returning-banner').classList.remove('visible');
}

// ── CONFETTI ──────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#4ade80','#22d3ee','#f9a8d4','#fbbf24','#818cf8','#67e8f9','#a3e635'];
  const particles = [];
  for (let i = 0; i < 160; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: Math.random() * 4 - 2,
      vy: Math.random() * 4 + 3,
      angle: Math.random() * Math.PI * 2,
      spin: Math.random() * 0.2 - 0.1,
      opacity: 1
    });
  }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.angle += p.spin;
      if (frame > 80) p.opacity -= 0.015;
      if (p.y < canvas.height + 20 && p.opacity > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      }
    });
    frame++;
    if (alive && frame < 200) {
      requestAnimationFrame(draw);
    } else {
      canvas.style.display = 'none';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  draw();
}

// ── SUPABASE SESSION TRACKING ─────────────────────────
// Legacy anonymous tracking — kept for backwards compatibility during transition

// ── INIT ──────────────────────────────────────────────
(async () => {
  const s0 = document.getElementById('screen-0');
  if (s0) s0.style.visibility = 'hidden';

  let initResult = 'normal';
  try {
    initResult = await initAuth();
  } catch(e) {
    console.warn('[SeenInSeven] initAuth error:', e);
  }

  // If dashboard was shown, don't reveal screen-0 (it's already hidden behind plan-screen).
  // Only restore visibility when staying on the onboarding flow.
  if (initResult !== 'dashboard') {
    if (s0) s0.style.visibility = '';
  }

  const hash = window.location.hash;
  const hasMagicToken = hash && hash.includes('access_token') && !hash.includes('error=');

  if (window.location.pathname === '/dashboard') {
    if (initResult === 'dashboard') {
      // Already there
    } else if (state.level) {
      showDashboard();
    } else {
      window.history.replaceState(null, '', '/');
      loadProgress();
    }
  } else if (initResult !== 'dashboard') {
    if (hasMagicToken) {
      // Magic link — show a loading state while onAuthStateChange processes the token
      s0.classList.add('active');
      const s0inner = s0.querySelector('.screen-inner') || s0;
      const loadDiv = document.createElement('div');
      loadDiv.style.cssText = 'padding:60px 24px;text-align:center;';
      loadDiv.innerHTML = '<div style="font-family:\'Space Mono\',monospace;font-size:11px;letter-spacing:0.2em;color:var(--teal);text-transform:uppercase;margin-bottom:12px;">Signing you in...</div>';
      s0inner.prepend(loadDiv);
    } else {
      loadProgress();
    }
  }

  if (typeof logEvent === 'function') {
    logEvent('app_loaded', {source: 'init'});
  }
  const activeScreen = document.querySelector('.screen.active');
  updateProgress(activeScreen ? activeScreen.id : 'screen-0');
})();
