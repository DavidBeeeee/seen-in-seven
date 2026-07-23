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
  level:null, videos:{}, videoStatus:{}, videoAnswersByLevel:{},
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

// ── ENGAGEMENT LINKS ──────────────────────────────────
// David Bee: paste the real URLs here when ready. While a URL is empty,
// its dashboard card stays hidden — nothing broken shows to users.
const ENGAGE_LINKS = {
  graduation: '',   // Graduation Event page/replay URL
  schedule: ''      // 1-1 call scheduling URL
};

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
    if (typeof recordPreauthEvent === 'function') await recordPreauthEvent('first_script_generated', {
      level: state.level || null,
      completed_videos: Object.keys(state.videoStatus || {}).length
    });
  } catch(e) {
    // Tracking failure is silent — never block the user
  }
}

// ── SCREEN NAVIGATION ─────────────────────────────────
let _screenAnimTimers = [];
let scriptEditSaveTimer = null;

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
      {e:'🧠', v:'l2_income', t:'The frustration of knowing this deeply while almost nobody knows I am the person to ask.', full:"I have spent years learning this through work, experience, mistakes, and paying attention. People close to me know they can ask me about it, but almost none of that knowledge exists publicly. I am tired of carrying something useful as though it only counts in private conversations."},
      {e:'📣', v:'l2_louder', t:'The frustration of watching shallow advice shape the conversation while my perspective stays private.', full:"I keep seeing confident advice spread through my field even when it leaves out the part that matters most. I can see the missing context from experience, yet I have mostly watched from the edge instead of adding my own perspective. I am tired of letting volume decide which ideas get heard."},
      {e:'🎁', v:'l2_free', t:'The regret of giving my best guidance privately without building anything people can return to.', full:"I explain this in conversations, messages, meetings, and moments when someone needs help, then the insight disappears when the conversation ends. I want to create a public body of thought that the right person can find, use, and return to even when I am not there to explain it again."},
      {e:'⌛', v:'l2_window', t:'The fear that I will keep waiting for permission while the work I could contribute remains invisible.', full:"I have spent too long treating public visibility as something I will earn after one more achievement, credential, plan, or burst of confidence. Waiting has kept my perspective out of conversations where it could matter, and I am ready to stop asking an imaginary gatekeeper for permission."}
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
      {e:'🌅', v:'l2_life', t:'The reach that lets useful expertise travel farther than one private conversation.', full:"I want what I have learned to reach people I may never meet in person. The right story or explanation can help someone recognize a problem, make a better decision, or feel less alone in what they are trying to understand. I want my knowledge to keep doing useful work after I stop speaking."},
      {e:'🧲', v:'l2_clients', t:'The right people finding me already understanding how I think.', full:"I want the right people to encounter my perspective before we ever speak. Whether that leads to a conversation, an opportunity, a collaboration, or simply a follow, I want them to arrive with a real sense of what I notice, what I care about, and how I approach the work."},
      {e:'👑', v:'l2_authority', t:'The earned authority that comes from giving people a lens they can use.', full:"I want to become known for making difficult ideas clearer and helping people notice what they were missing. That kind of authority comes from being consistently useful in public, which means letting people experience how I think instead of asking them to trust a title."},
      {e:'🕊️', v:'l2_freedom', t:'The freedom that comes from publicly owning what I know and where I stand.', full:"I want the freedom to choose the work, questions, people, and ideas that deserve my energy. Building a visible body of thought gives me more ways to contribute and more chances for the right opportunities to find me, whether or not I have a formal business today."}
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
  state.level = p2.contentIntent === 'teach' ? 2 : 1;
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
    const mission = await callGenerationAPI({
      mode: 'mission',
      userContext: buildMissionUserMessage()
    });
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
    2:{question:"Who needs what you know, and what part of life or work are they trying to understand?",
       placeholder:"Describe the people you want to reach and what they need help seeing...",
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
    2:{question:"What has kept you from making what you know visible until now?",
       placeholder:"Describe the specific expert visibility blocker you keep running into...",
       cards:[
         {icon:'🧠',text:'I know too much and struggle to make it simple',
          before_full:'I understand the subject deeply, which makes it hard to know where to begin or what to leave out. Every short explanation feels incomplete, so I keep waiting until I can say everything instead of publishing the clearest useful piece.'},
         {icon:'📣',text:'Talking about my expertise feels self-promotional',
          before_full:'I am comfortable doing the work and helping someone who asks, but publicly saying what I know feels like claiming attention I have not earned. I keep confusing visibility with bragging, which makes staying behind the work feel safer.'},
         {icon:'📜',text:'I keep thinking my experience does not count yet',
          before_full:'I have real experience, but I keep comparing it with someone who has a bigger title, longer resume, larger audience, or more formal credentials. That comparison gives me a permanent reason to wait before speaking with confidence.'},
         {icon:'🫥',text:'I have been hiding behind the work itself',
          before_full:'I have let the work, referrals, private conversations, or people around me speak on my behalf. Putting my own face and voice beside what I know feels like a separate skill, and it is the part I have kept avoiding.'}
       ]}
  },
  q4:{
    1:{question:"What do you want to make videos about?",
       placeholder:"What topic or niche do you want to focus on?",
       cards:MVO_TOPIC_CARDS},
    2:{question:"Why does sharing this now matter enough for you to begin?",
       placeholder:"What made staying quiet stop feeling acceptable?",
       cards:[
         {icon:'💬',text:'People keep asking me about this privately',
          crack_full:'People already come to me with these questions in private, and I keep giving answers that disappear when the conversation ends. I am starting now because the same perspective could help someone I will never meet unless I make it public.'},
         {icon:'⚠️',text:'I keep watching incomplete advice create avoidable problems',
          crack_full:'I keep seeing advice spread without the context that makes it useful, and I know from experience what gets missed. Staying silent has started to feel like choosing not to contribute when I have something honest and practical to add.'},
         {icon:'🚪',text:'I am done waiting for permission to claim what I know',
          crack_full:'I have treated visibility like something another achievement or credential would eventually grant me. I am starting now because the permission was never coming from outside me, and waiting longer would only make my knowledge harder to find.'},
         {icon:'🧭',text:'The right person needs this perspective now',
          crack_full:'There is someone trying to solve a problem I recognize, and the usual explanations are leaving out what they most need to see. I am starting now because my perspective can give that person a clearer next decision.'}
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
      body: "You're about to build your first expert script. This is Video 1 of 7, where you step out from behind what you know and let people see why your voice belongs in the conversation. You do not need a business, clients, or a polished public identity. You need real experience, something you care about, and the willingness to begin.",
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
      label: "Video 2 of 7: Here's Who I Am",
      title: 'Let Them Meet The Real You',
      body: "Before people care where your story goes, they need to know the person living it. Share the background that shaped you, something people may not expect, and the thing you naturally keep caring about. You are not explaining the lesson yet. You are giving them a human reason to stay.",
      result: 'Recognition',
      framework: [
        {name:'Hook',                 trigger:'Pattern Interrupt'},
        {name:'Your Background',      trigger:'Human Context'},
        {name:'The Unexpected Detail',trigger:'Identity Contrast'},
        {name:'What You Care About',  trigger:'Recognition'}
      ],
      triggers: ['Pattern Interrupt','Human Context','Identity Contrast','Recognition','Curiosity']
    },
    L2: {
      label: 'Video 2 of 7: How I Got Here',
      title: 'Show Them What Formed Your Perspective',
      body: "Before people trust what you know, they need to understand how you came to know it. Share the real path, including the detour or unlikely chapter that shaped your perspective, what you resisted about claiming it, and why the work matters to you personally.",
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
      label: 'Video 3 of 7: What I Used To Think Was True',
      title: 'Show Them What Changed Your Mind',
      body: "Start with something you used to think was true and let the audience watch the old idea stop making sense. The script will build the realization from the experience and cost you describe, so the new truth feels discovered instead of announced.",
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
      label: 'Video 3 of 7: What I See Differently',
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
      label: "Video 4 of 7: Here's What It's Actually Been Like",
      title: 'Tell The Truth From The Middle',
      body: "The middle of a challenge is rarely a victory speech. Compare what you expected with what has actually happened, give one detail people can picture, and be honest about what is changing, what is still difficult, and why you are continuing.",
      result: 'Trust',
      framework: [
        {name:'Expected vs. Actual',       trigger:'Behavioral Contrast'},
        {name:'The Real Detail',           trigger:'Concrete Proof'},
        {name:'What Is Changing',          trigger:'Small Win Proof'},
        {name:'What Is Still Hard',        trigger:'Real-Time Transparency'}
      ],
      triggers: ['Behavioral Contrast','Small Win Proof','Objection Pre-emption','Real-Time Transparency','Midpoint Orientation']
    },
    L2: {
      label: 'Video 4 of 7: What The Work Looks Like',
      title: 'Let Your Expertise Be Tested In Public',
      body: "Your first professional realization sounded good in theory. Now the audience needs to see what happened when you used your voice in public. Show one real collision between your expert instincts and this new visibility, what surprised you, and what remains difficult. Authority emerges through how you interpret the experience, not through a lesson or a claim.",
      result: 'Trust',
      framework: [
        {name:'The Expert Pattern',      trigger:'Behavioral Contrast'},
        {name:'The Public Test',         trigger:'Small Win Proof'},
        {name:'What Is Still Hard',      trigger:'Real-Time Transparency'},
        {name:'What The Trial Reveals',  trigger:'Expert Ease'}
      ],
      triggers: ['Behavioral Contrast','Small Win Proof','Expert Ease','Real-Time Transparency','Midpoint Orientation']
    }
  },
  5: {
    L1: {
      label: 'Video 5 of 7: The Hardest Part',
      title: 'Tell The Fall That Almost Ruined You',
      body: "Return to the larger story you have been telling. This is the failure or loss that felt capable of destroying your life, identity, future, or reason to continue. Your own choice or blind spot helped cause it, every way back seemed to fail, and recovery did not feel guaranteed. Do not give the lesson yet.",
      result: 'Trust',
      framework: [
        {name:'Evidence Of Defeat', trigger:'Charged Evidence'},
        {name:'Your Responsibility',trigger:'Causal Responsibility'},
        {name:'The Actual Loss',    trigger:'Human Stakes'},
        {name:'The Failed Recovery',trigger:'Unresolved Tension'}
      ],
      triggers: ['Charged Evidence','Causal Responsibility','Human Stakes','Failed Recovery','Ethical Bridge']
    },
    L2: {
      label: 'Video 5 of 7: The Hardest Part',
      title: 'Tell The Failure That Nearly Ended It',
      body: "Return to the larger work, craft, calling, or expertise story you have been telling. This is the failure that seemed capable of destroying what you had built or hoped to build. Your own decision or blind spot helped cause it, what you knew did not save you, and recovery did not feel guaranteed. Do not give the lesson yet.",
      result: 'Trust',
      framework: [
        {name:'Evidence Of Defeat', trigger:'Charged Evidence'},
        {name:'Your Responsibility',trigger:'Causal Responsibility'},
        {name:'The Actual Loss',    trigger:'Professional Stakes'},
        {name:'The Failed Recovery',trigger:'Unresolved Tension'}
      ],
      triggers: ['Charged Evidence','Causal Responsibility','Professional Stakes','Failed Recovery','Ethical Bridge']
    }
  },
  6: {
    L1: {
      label: 'Video 6 of 7: What I See Differently Now',
      title: 'Share The Bigger Realization',
      body: "Now reveal what the hardest part eventually taught you. This realization should deepen the first one, not repeat it. Show how it became clear, how it changed your understanding of yourself, and what became different because you lived it.",
      result: 'Authority',
      framework: [
        {name:'Hook',                  trigger:'Earned Reversal'},
        {name:'How It Became Clear',   trigger:'Discovery Arc'},
        {name:'The Bigger Realization',trigger:'Cognitive Reframe'},
        {name:'What Changed',          trigger:'Simplicity Signal'}
      ],
      triggers: ['Earned Reversal','Discovery Arc','Cognitive Reframe','Aha Transfer','Cost Revelation','Simplicity Signal','Natural Invitation']
    },
    L2: {
      label: 'Video 6 of 7: What The Hardest Part Taught Me',
      title: 'Name The Larger Truth You Earned',
      body: "After owning the failure, show what the aftermath made impossible to ignore. This larger professional truth must grow from that defeat, deepen your first realization, change something observable in your work, and give the audience a lens they can use.",
      result: 'Authority',
      framework: [
        {name:'Hook',                    trigger:'Earned Evidence'},
        {name:'What The Failure Exposed',trigger:'Discovery Arc'},
        {name:'The Larger Truth',        trigger:'Cognitive Reframe'},
        {name:'The Useful Lens',         trigger:'Authority Through Value'}
      ],
      triggers: ['Earned Evidence','Discovery Arc','Cognitive Reframe','Usable Lens','Stakes and Possibility','Clear Professional Truth','Earned Perspective']
    }
  },
  7: {
    L1: {
      label: 'Video 7 of 7: What I Learned',
      title: 'Show Who You Are Now',
      body: "Bring the larger story home. Compare who you were before both realizations with who you are now, name what is still unfinished, and share what telling this story across seven videos helped you finally understand. Close this chapter without pretending the rest of your story is finished.",
      result: 'Loyalty',
      framework: [
        {name:'Hook',               trigger:'Full Circle Loop'},
        {name:'Who You Were',       trigger:'Identity Contrast'},
        {name:'Who You Are Now',    trigger:'New Normal Declaration'},
        {name:'What Remains',       trigger:'Honest Reflection'},
        {name:'The New Chapter',    trigger:'Unfolding Horizon'}
      ],
      triggers: ['Full Circle Loop','Narrative Satisfaction','New Normal Declaration','Reciprocity','Bridge to Forever','Authority Affirmation','Unfolding Horizon']
    },
    L2: {
      label: 'Video 7 of 7: What I Carry Forward',
      title: 'Show What You Own Now',
      body: "Bring the larger expert story home. Compare your earlier relationship to your knowledge and visibility with who you are now, acknowledge what remains unfinished, and name what telling this story clarified about your work and the people you understand. The final invitation is relational: give the right viewer a reason to keep following your perspective.",
      result: 'Loyalty',
      framework: [
        {name:'Hook',                      trigger:'Full Circle Loop'},
        {name:'What Changed',              trigger:'New Normal Declaration'},
        {name:'What Remains',              trigger:'Honest Authority'},
        {name:'What Continues',            trigger:'Unfolding Horizon'}
      ],
      triggers: ['Full Circle Loop','Narrative Satisfaction','New Normal Declaration','Reciprocity','Bridge to Forever','Authority Affirmation','Unfolding Horizon']
    }
  }
};

const VIDEO_EASY_PROMPTS = {
  1: [
    null,
    { label: 'What should someone know about your background, what makes you unexpected, and what you naturally care about?', hint: 'Share whatever feels most important. The AI will organize it into the story.', key: 'easyAnswer_v1' },
    { label: 'What is one thing you used to think was true that is not true?', hint: 'Explain how it shaped you, what made you question it, and why the old way of thinking matters.', key: 'easyAnswer_v2' },
    { label: 'What has making these videos actually been like so far?', hint: 'Compare it with what you expected, share one real detail, and include what is changing, what is still difficult, and why you are continuing.', key: 'easyAnswer_v3' },
    { label: 'In the part of your life you have been discussing, what failure, loss, or period was so devastating that you thought it might ruin you or that you might never recover? What did you do, avoid, refuse to see, or get completely wrong that made it your fault?', hint: 'Tell us what collapsed, what you believed might be gone forever, and why you could not see a way back. Include what you tried afterward that still failed. Answer from who you were while it was happening, before you knew what you would eventually learn.', key: 'easyAnswer_v4' },
    { label: 'What larger truth did you discover because you lived through that difficult experience?', hint: 'Describe how you discovered it, what it changed in you, and who else may need to understand it.', key: 'easyAnswer_v5' },
    { label: 'Who were you before these realizations, and who are you now?', hint: 'Describe what changed, what remains unfinished, what telling the story helped you understand, and where you go next.', key: 'easyAnswer_v6' }
  ],
  2: [
    null,
    { label: 'What part of your past kept shaping you before you understood why?', hint: 'Describe the everyday life you were in, the thread or unlikely chapter that kept showing up, and why you did not recognize or follow it yet.', key: 'easyAnswer_v1' },
    { label: 'What is one thing you used to think was true about your work or field that experience proved was wrong or incomplete?', hint: 'Describe the real situation that exposed the problem, the new lens you earned, what the old thinking costs, and why this matters to the people you understand.', key: 'easyAnswer_v2' },
    { label: 'Where has your first professional realization met the reality of communicating your expertise publicly?', hint: 'Describe one concrete moment, what your usual expert instinct wanted to do, what you did instead, what it revealed, and what remains difficult.', key: 'easyAnswer_v3' },
    { label: 'In the work, craft, calling, or expertise story you have been telling, what failure was so devastating that you thought what you had built or hoped to build might never recover? What did you do, avoid, refuse to see, or get completely wrong that made it your fault?', hint: 'Tell us what collapsed, what seemed permanently lost, and why you could not see a way back in this part of your life. Include what you tried afterward that still failed. Answer from who you were while it was happening, before you knew what you would eventually learn.', key: 'easyAnswer_v4' },
    { label: 'What larger professional truth did that difficult experience force you to understand, and how did it deepen the first realization you shared?', hint: 'Trace how the truth emerged through the aftermath or rebuilding, what it changed in your work or decisions, and what useful lens it gives someone facing the problem now.', key: 'easyAnswer_v5' },
    { label: 'Who were you before the two professional realizations and the hardest part of the story, and who are you now in relation to your expertise and the people you want to reach?', hint: 'Describe what genuinely changed, what remains unfinished or still needed, what telling the story clarified about your work, and what perspective or mission you want the right viewer to keep following.', key: 'easyAnswer_v6' }
  ]
};

function getEasyPrompt(videoIdx, level) {
  const prompts = VIDEO_EASY_PROMPTS[Number(level) === 2 ? 2 : 1];
  return prompts[videoIdx] || null;
}

const videoPromptMode = {};
const VIDEO_ANSWER_KEY_PATTERN = /^(?:v[0-6]p\d+|v0decl|easyAnswer_v[1-6])$/;
let videoAnswerSaveTimer = null;

function collectCurrentVideoAnswers() {
  const answers = {};
  Object.keys(state.videos || {}).forEach(key => {
    if (VIDEO_ANSWER_KEY_PATTERN.test(key) && typeof state.videos[key] === 'string') {
      answers[key] = state.videos[key];
    }
  });
  return answers;
}

function captureVideoAnswersByLevel() {
  if (!state.videoAnswersByLevel || typeof state.videoAnswersByLevel !== 'object') state.videoAnswersByLevel = {};
  const levelKey = String(state.level || 1);
  state.videoAnswersByLevel[levelKey] = Object.assign({}, state.videoAnswersByLevel[levelKey] || {}, collectCurrentVideoAnswers());
  return state.videoAnswersByLevel;
}

function setVideoAnswer(key, value) {
  if (!VIDEO_ANSWER_KEY_PATTERN.test(key)) return;
  state.videos[key] = value;
  clearTimeout(videoAnswerSaveTimer);
  videoAnswerSaveTimer = setTimeout(saveProgress, 600);
}

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

const VIDEO_STORY_LABELS = {
  1: ['YOUR INTRODUCTION', 'HERE\'S WHO I AM', 'WHAT I USED TO THINK WAS TRUE', 'WHAT IT\'S ACTUALLY BEEN LIKE', 'THE HARDEST PART', 'WHAT I SEE DIFFERENTLY NOW', 'WHAT I LEARNED'],
  2: ['YOUR INTRODUCTION', 'HOW YOU GOT HERE', 'WHAT YOU SEE DIFFERENTLY', 'WHAT THE WORK LOOKS LIKE', 'THE HARDEST PART', 'WHAT THE HARDEST PART TAUGHT YOU', 'WHAT YOU CARRY FORWARD']
};

const LEVEL_2_STORY_BEATS = [
  // V1 — YOUR INTRODUCTION
  ['Empathy Lock: your specific flavor of why you have not been doing this',
   'Why Now: what made this attempt matter today instead of someday',
   'Who: the specific person you hope recognizes themselves in your story'],
  // V2 — YOUR ORIGIN / ORDINARY WORLD
  ['The Ordinary World: the concrete life you were living before anything changed',
   'The Hidden Thread: the interest, frustration, detour, or pattern you kept returning to',
   'The Identity Clue: why that detail may have mattered before you understood it',
   'The Refusal: what kept you from following the thread sooner'],
  // V3 — YOUR FIRST PROFESSIONAL REALIZATION (7-beat structure)
  ['Pattern Break: a familiar experience seen an unfamiliar way (cognitive friction)',
   'Discovery Arc: how you arrived at the insight (the journey, not just the conclusion)',
   'Cognitive Reframe: the old lens cracks; the new one snaps into place',
   '"Aha" Transfer: the viewer receives a tool they can actually use after this video',
   'Cost Revelation: what it costs to not see it this way (honest, not fear-based)',
   'Simplicity Signal: the reframe in one sentence. Screenshot-worthy.',
   'Authority Anchor: viewer associates you with insight without you claiming it'],
  // V4 — THE WORK IN PUBLIC
  ['Old Pattern vs. New Behavior: one concrete moment where the two collided',
   'Small Win Proof: the subtle behavioral evidence that something shifted',
   'Real-Time Transparency: what still feels difficult right now',
   'Trial Meaning: what this test proves without claiming the journey is complete'],
  // V5 — THE HARDEST PART
  ['False Confidence: what you thought the first realization had solved',
   'The Collapse: the moment the failure became impossible to dismiss',
   'Your Responsibility: the decision, avoidance, or blind spot that caused or worsened it',
   'Apparent Permanent Loss: what seemed destroyed or over for good',
   'Failed Recovery: what you tried, why it failed, and why no way back was visible'],
  // V6 — THE LARGER PROFESSIONAL TRUTH
  ['The Earlier Understanding: what the hardest part proved was incomplete',
   'The Aftermath: how the larger truth became impossible to ignore',
   'The Larger Truth: what you can now carry into the work',
   'The Useful Lens: what someone else can recognize or do differently'],
  // V7 — WHAT YOU CARRY FORWARD
  ['The Return: the concrete difference between the person who started and the person here now',
   'Full Circle: loop back to where you started, the audience feels the arc close',
   'What Changed: not performance of growth, but the actual honest accounting',
   'The Gift: what you can now give the audience because you completed the journey',
   'The Next Chapter: the relationship, direction, or work that opens from here'],
];

const VIDEO_STORY_BEATS = {
  1: [
    ['Empathy Lock: the specific reason you have not been posting',
     'Why Now: why you are doing this challenge now instead of continuing to wait'],
    ['Your Background: the part of your life that helps people understand you',
     'The Unexpected Detail: the part of you that complicates the obvious first impression',
     'What You Care About: what naturally keeps drawing your attention and why it matters'],
    ['What You Thought Was True: the old idea and how it shaped real choices',
     'What Made You Question It: the moment or evidence the old idea could not explain',
     'The First Realization: the new lens the audience reaches through your story',
     'Why It Matters: the quiet cost of continuing to think the old way'],
    ['Expected vs. Actual: what you thought the experience would be and what it has really been',
     'The Real Detail: one moment or behavior the audience can picture',
     'What Is Changing: the small shift you are beginning to notice',
     'What Is Still Hard: the unresolved part and why you are continuing'],
    ['False Confidence: what you thought the first realization had solved',
     'The Collapse: the moment the failure became impossible to dismiss',
     'Your Responsibility: the choice, avoidance, refusal, or blind spot that caused or worsened it',
     'Apparent Permanent Loss: what seemed destroyed or over for good',
     'Failed Recovery: what you tried, why it failed, and why no way back was visible'],
    ['The Larger Realization: what the ordeal eventually made clear',
     'How It Emerged: the moment or evidence that brought it into focus',
     'The Deeper Meaning: how it changed your understanding of the first realization',
     'What Changed: the real difference in your identity, choices, or life',
     'Who Needs It: the person this truth may help see differently'],
    ['Who You Were: how you saw yourself before both realizations',
     'Who You Are Now: what is genuinely different',
     'What Remains: the unfinished or familiar part of the earlier you',
     'What The Challenge Clarified: what seven videos helped you connect or put into words',
     'The Next Chapter: what you carry forward and where the story goes next']
  ],
  2: LEVEL_2_STORY_BEATS
};





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

async function apiAuthorizationHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const result = await _sb.auth.getSession();
    const token = result && result.data && result.data.session && result.data.session.access_token;
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch(e) {}
  return headers;
}

async function callGenerationAPI(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 85000);
  let response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: await apiAuthorizationHeaders(),
      body: JSON.stringify(payload),
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
    const error = new Error(err.error ? err.error : 'API error ' + response.status);
    error.code = err.code || '';
    throw error;
  }
  const data = await response.json();
  window._SIS_lastPromptVersion = data.promptVersion || '';
  return data.content ? String(data.content).trim() : null;
}

async function generateValidatedScript(userMessage, level, video, mode, details) {
  const payload = Object.assign({
    mode: mode || 'script',
    userContext: userMessage,
    level,
    videoNumber: video
  }, details || {});
  return callGenerationAPI(payload);
}

// Parse [HOOK] / [OPEN LOOP] / [MEAT] / [CONCLUSION] / [CTA] sections from AI response
function parseScriptSections(scriptText) {
  if (window.SISPromptEngine) return SISPromptEngine.parseSections(scriptText);
  if (!scriptText) return null;
  const sections = { HOOK: '', 'OPEN LOOP': '', MEAT: '', CONCLUSION: '', CTA: '' };
  const sectionOrder = ['HOOK', 'OPEN LOOP', 'MEAT', 'CONCLUSION', 'CTA'];
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
  return ['HOOK', 'OPEN LOOP', 'MEAT', 'CONCLUSION', 'CTA']
    .filter(key => sections[key])
    .map(key => '[' + key + ']\n' + String(sections[key]).trim())
    .join('\n\n');
}

function finalScriptText(idx, rawScript, level) {
  const script = rawScript == null ? state.videos['script_v' + idx] || '' : rawScript;
  const activeLevel = Number(level || state.level || 1);
  if (!window.SISPromptEngine) return String(script).replace(/\[(HOOK|OPEN LOOP|MEAT|CONCLUSION|CTA)\]\s*/g, '').trim();
  return SISPromptEngine.canonicalScript(script, idx + 1, idx === 0 ? videoOneDeclaration(activeLevel) : '');
}

function archivedScriptText(collection, idx, level) {
  const scripts = collection || {};
  const raw = scripts['script_v' + idx] || '';
  if (idx !== 0 || !window.SISPromptEngine) return String(raw).replace(/\[(HOOK|OPEN LOOP|MEAT|CONCLUSION|CTA)\]\s*/g, '').trim();
  const declaration = Number(level) === 2
    ? scripts.v0decl || videoOneDeclaration(2)
    : scripts.v0p0 || videoOneDeclaration(1);
  return SISPromptEngine.canonicalScript(raw, 1, declaration);
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

  await flushScriptEditSave(videoIdx);

  const originalText = btnEl ? btnEl.textContent : '';
  if (btnEl) { btnEl.textContent = '⏳ Regenerating...'; btnEl.disabled = true; }

  const level = state.level || 1;
  const videoNum = videoIdx + 1;
  const sections = state.videos[sectionsKey] || {};
  const currentScript = state.videos[editKey] || '';

  try {
    const newSectionText = await generateValidatedScript(
      buildAPIUserMessage(videoIdx),
      level,
      videoNum,
      'section',
      {
        sectionKey,
        existingScript: sectionsToFullScript(sections) || currentScript,
        feedback: regenFeedback
      }
    );
    if (!newSectionText) throw new Error('Empty response');

    // Update sections state
    const updatedSections = Object.assign({}, sections);
    updatedSections[sectionKey] = newSectionText.trim();
    state.videos[sectionsKey] = updatedSections;

    // Rebuild full script from updated sections
    state.videos[editKey] = sectionsToFullScript(updatedSections);

    // Also update the editor textarea if visible
    const editor = document.getElementById('script-editor');
    const finalContent = finalScriptText(videoIdx, state.videos[editKey], level);
    if (editor) editor.value = finalContent;

    // Update just this section's text in the guided view
    const sectionEl = document.getElementById('sv-section-text-' + sectionKey.replace(' ', '-'));
    if (sectionEl) sectionEl.textContent = newSectionText.trim();

    saveProgress();
    saveScriptEditToDb(videoNum, level, state.videos[editKey], finalContent);
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

async function flushScriptEditSave(videoIdx) {
  if (scriptEditSaveTimer) {
    clearTimeout(scriptEditSaveTimer);
    scriptEditSaveTimer = null;
  }
  const script = state.videos['script_v' + videoIdx];
  if (!script || typeof saveScriptEditToDb !== 'function') return;
  const level = state.level || 1;
  await saveScriptEditToDb(videoIdx + 1, level, script, finalScriptText(videoIdx, script, level));
}

// Regenerate the complete script while preserving the user's answers and prior script version.
async function regenerateFullScript(videoIdx, btnEl) {
  const editKey = 'script_v' + videoIdx;
  const sectionsKey = 'sections_v' + videoIdx;
  const regenFeedback = await showRegenModal('full script');
  if (regenFeedback === null) return;

  const originalText = btnEl ? btnEl.textContent : '';
  if (btnEl) {
    btnEl.textContent = '⏳ Regenerating...';
    btnEl.disabled = true;
  }

  const level = state.level || 1;
  const videoNum = videoIdx + 1;
  const currentScript = state.videos[editKey] || '';
  await flushScriptEditSave(videoIdx);
  try {
    const script = await generateValidatedScript(
      buildAPIUserMessage(videoIdx),
      level,
      videoNum,
      'full-regeneration',
      {
        existingScript: finalScriptText(videoIdx, currentScript, level),
        feedback: regenFeedback
      }
    );
    if (!script) throw new Error('Empty response');

    const promptVersion = window._SIS_lastPromptVersion || '';
    const finalContent = finalScriptText(videoIdx, script, level);
    const parsedSections = parseScriptSections(script);
    state.videos[editKey] = script;
    if (parsedSections) state.videos[sectionsKey] = parsedSections;
    else delete state.videos[sectionsKey];
    state.videos['prompt_version_v' + videoIdx] = promptVersion;
    saveProgress();

    // Inserting a new script preserves the earlier version and lets the database mark this one current.
    queueScriptSave(videoNum, level, script, finalContent, promptVersion);
    if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot(videoIdx);
    if (typeof logEvent === 'function') {
      logEvent('script_regenerated', {
        video_number: videoNum,
        level,
        scope: 'full_script',
        prompt_version: promptVersion || null
      });
    }

    _doShowScriptView(videoIdx);
    if (typeof flashSavedIndicator === 'function') flashSavedIndicator();
  } catch (err) {
    if (btnEl) {
      btnEl.textContent = '⚠️ Error';
      btnEl.disabled = false;
      setTimeout(() => {
        if (btnEl) btnEl.textContent = originalText;
      }, 3000);
    }
    console.error('Regenerate full script error:', err);
  }
}

function videoOneDeclaration(level) {
  const name = state.name || '';
  if (Number(level) === 2) {
    return state.videos.v0decl || `For those of you who don't know me yet, my name is ${name}. I kinda never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me, some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of. I'm specifically doing this 7 Video Challenge because I have to share my knowledge, my experience, and my lived reality for the specific people I want to help before the world changes forever and I won't have the chance. These 7 videos are how I'm establishing myself as a credible voice in my field, but I'm scared, I'm frustrated, I don't know how it's going to go, but I'm committed to finishing.`;
  }
  return state.videos.v0p0 || `Hi, my name is ${name}. I never thought I'd be here, but I'm actually doing a challenge where I'm committing to make 7 videos about me... some of my deepest thoughts, vulnerable opinions, and personal history that you probably aren't aware of.`;
}

function videoOnePromptAnswers(level) {
  const sv = state.videos;
  const q2 = state.mvoQ2 || {};
  const q3 = state.mvoQ3 || {};
  const q4 = state.mvoQ4 || {};
  const isL2 = Number(level) === 2;
  const p2 = ensurePhase2();
  const answers = [
    { label:'Opening declaration (read-only)', value:videoOneDeclaration(level) },
    { label:"What's been stopping you from posting until now", value:sv.v0p1 || (isL2 ? q3.before_full : q2.before_full) || '' },
    { label:"Why you're doing this challenge right now", value:sv.v0p2 || (isL2 ? q4.crack_full : q3.catalyst_full) || p2.commitmentDeclaration || '' }
  ];
  if (isL2) answers.push({ label:"Who you're here to reach", value:sv.v0p3 || q2.village_full || '' });
  answers.push({ label:'Anything else they want to add', value:sv.v0p4 || p2.firstScriptNotes || '' });
  return answers;
}

function extendedPromptAnswers(videoDefinition) {
  return (videoDefinition && videoDefinition.prompts || []).map(prompt => ({
    label: prompt.label.replace(/\s*___\s*$/, '').trim(),
    value: state.videos[prompt.key] || ''
  }));
}

function buildAPIUserMessage(videoIdx) {
  const level = state.level || 1;
  const video = videoIdx + 1;
  const p2 = ensurePhase2();
  const custom = p2.custom || {};
  const commitment = p2.commitmentDeclaration || buildCommitmentDeclaration();
  const onboardingLines = SISPromptEngine.buildOnboardingLines({
    name: state.name || '(not provided)',
    postingExperience: historyLabels[state.posted] || (state.posted === 'no' ? 'No, never' : state.posted || '(not provided)'),
    postingHistory: state.history ? (historyLabels[state.history] || state.history) : '',
    blocker: state.blocker ? (blockerLabels[state.blocker] || state.blocker) : '',
    customBlocker: custom.blocker || '',
    businessStage: state.business ? (businessLabels[state.business] || state.business) : '',
    contentIntent: p2.contentIntentTitle || p2.contentIntent || '',
    contextMode: p2.contentMode === 'extended' ? 'Extended' : 'Simple',
    audienceContext: p2.audienceContext || '',
    messageContext: p2.messageContext || '',
    firstScriptNotes: p2.firstScriptNotes || '',
    commitmentPain: p2.commitmentPainText || phase2ValueText('pain', p2.commitmentPain, p2.commitmentPainCustom),
    commitmentDesire: p2.commitmentDesireText || phase2ValueText('desire', p2.commitmentDesire, p2.commitmentDesireCustom),
    commitment,
    missionStatement: p2.missionStatement || '',
    topic: state.topicFreewrite || '',
    knowledgeContext: p2.knowledgeContext || ''
  });

  const videos = getVideos();
  const previousVideos = [];
  for (let index = 0; index < videoIdx; index++) {
    const definition = videos[index];
    const easy = getEasyPrompt(index, level);
    const mode = index === 0 ? 'extended' : getSavedVideoPromptMode(index, level);
    const declaration = index === 0 ? videoOneDeclaration(level) : '';
    const rawScript = state.videos['script_v' + index] || '';
    previousVideos.push({
      video: index + 1,
      mode,
      easyAnswer: easy ? state.videos[easy.key] || '' : '',
      answers: index === 0 ? videoOnePromptAnswers(level) : extendedPromptAnswers(definition),
      script: rawScript ? SISPromptEngine.canonicalScript(rawScript, index + 1, declaration) : ''
    });
  }

  const currentDefinition = videos[videoIdx];
  const currentEasy = getEasyPrompt(videoIdx, level);
  const currentMode = videoIdx === 0 ? 'extended' : getSavedVideoPromptMode(videoIdx, level);
  return SISPromptEngine.buildUserMessage({
    level,
    video,
    onboardingLines,
    previousVideos,
    currentMode,
    currentEasyAnswer: currentEasy ? state.videos[currentEasy.key] || '' : '',
    currentAnswers: videoIdx === 0 ? videoOnePromptAnswers(level) : extendedPromptAnswers(currentDefinition)
  });
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
    title:"Here's Who I Am",
    note:"Let people meet the person behind the videos: where you came from, something they might not expect, and what naturally holds your attention. You do not need to explain what it all means yet.",
    prompts:[
      {label:"What part of your background or everyday life would help someone understand you better?",hint:"Choose one part of where you came from, what your life looked like, or an experience that left a mark. You do not need to tell your entire life story.",key:"v1p0",ph:"Share the part of your background that helps someone understand you."},
      {label:"What is something about you that people usually do not expect?",hint:"It could be an interest, habit, skill, obsession, contradiction, past chapter, or part of your personality that does not fit the obvious version of you.",key:"v1p1",ph:"Share something real about you that people may not expect."},
      {label:"What do you find yourself caring about, noticing, or returning to, even when nobody asks you to?",hint:"What gets your attention, bothers you, fascinates you, or makes you want to say something? Why does it matter to you personally?",key:"v1p2",ph:"Describe what naturally keeps drawing your attention and why you care."}
    ],
    compile:v=>`The background that helps someone understand me: ${v.v1p0||'___'}. Something people do not expect about me: ${v.v1p1||'___'}. What I keep caring about or returning to: ${v.v1p2||'___'}.`
  },
  {
    title:"What I Used To Think Was True",
    note:"Share one thing you used to think was true, the experience that made you question it, and why that old way of thinking matters. The script will shape the larger realization from your answers.",
    prompts:[
      {label:"What is one thing you used to think was true (that isn't true), and how did it shape the way you acted, waited, chose, or saw yourself?",hint:"Choose something that affected real decisions, not a minor opinion you happened to change.",key:"v2p0",ph:"Describe what you used to think was true and how it affected your life."},
      {label:"What experience, moment, or repeated pattern first made you question whether it was actually true?",hint:"If there was one clear moment, describe it. If the change happened gradually, describe the evidence that kept piling up.",key:"v2p1",ph:"Describe what made the old idea stop making sense."},
      {label:"What does continuing to think the old way quietly cost someone, and why do you care enough to say that aloud?",hint:"Name the honest consequence and why another person recognizing it matters to you.",key:"v2p2",ph:"Describe the cost of the old way of thinking and why you want to name it."}
    ],
    compile:v=>`What I used to think was true and how it shaped me: ${v.v2p0||'___'}. What made me question it: ${v.v2p1||'___'}. What the old way costs and why I care: ${v.v2p2||'___'}.`
  },
  {
    title:"Here's What It's Actually Been Like",
    note:"Report honestly from the middle. Compare the experience with what you expected, notice any early change, name what remains difficult, and explain why you are continuing.",
    prompts:[
      {label:"What has making these videos actually been like so far, compared with what you expected? Share one moment or detail that captures the difference.",hint:"What has been stranger, easier, harder, quieter, more emotional, or more ordinary than you imagined? Include something you did, almost did, noticed, avoided, or handled differently.",key:"v3p0",ph:"Describe the reality so far and one detail that captures it."},
      {label:"What, if anything, is beginning to change in the way you approach recording, posting, or trusting yourself?",hint:"A small change counts. It is also fine if the change is incomplete or difficult to describe.",key:"v3p1",ph:"Describe any small change you are beginning to notice."},
      {label:"What is still difficult, awkward, uncertain, or unresolved right now?",hint:"Name the specific part you have not conquered. The middle is allowed to remain messy.",key:"v3p2",ph:"Describe what is still difficult or unresolved."},
      {label:"Why are you continuing even though that part is still difficult?",hint:"What is enough to make you record the next video even without certainty that this is working?",key:"v3p3",ph:"Describe the honest reason you are continuing."}
    ],
    compile:v=>`What making these videos has actually been like: ${v.v3p0||'___'}. What is beginning to change: ${v.v3p1||'___'}. What is still difficult: ${v.v3p2||'___'}. Why I am continuing: ${v.v3p3||'___'}.`
  },
  {
    title:"The Hardest Part",
    note:"Now we are returning to the larger story you have been telling, not the experience of making these videos. This is the chapter where things went as badly as they could have gone. Choose the failure, loss, or period when you genuinely wondered whether you would recover. Do not tell us what you eventually learned or how everything worked out. Answer from who you were while it was happening, before you could see a way forward.",
    prompts:[
      {label:"Thinking about the main part of your life you have been discussing, what failure, loss, or period brought you closest to believing you might never recover?",hint:"Choose something that actually happened, rather than something you feared might happen. It could involve your work, money, family, health, identity, reputation, relationships, or the future you thought you were building. If there was not one dramatic event, describe the period when everything gradually fell apart.",key:"v4p0",ph:"Describe the failure, loss, or period when you thought you might not recover."},
      {label:"Take us to the moment you realized this was more than an ordinary setback. What had happened, and what made you think your life might not return to normal?",hint:"Give us something we can picture. Where were you? Who else was affected? What had just happened? What did you see, hear, lose, or finally understand that made the seriousness impossible to ignore?",key:"v4p4",ph:"Describe the moment the full seriousness became real."},
      {label:"Why was it your fault? What did you do, avoid, ignore, refuse to admit, or get completely wrong that caused the failure or made it worse?",hint:"You do not have to make yourself the villain. Look for the decision that was yours: the warning you ignored, the conversation you avoided, the risk you underestimated, the pattern you kept repeating, or the moment you knew better and continued anyway. Tell us what you should have done differently and why you did not do it.",key:"v4p1",ph:"Describe the decision, avoidance, or blind spot that was yours."},
      {label:"What did this failure take from you, and what did you believe might be permanently over because of it?",hint:"Go beyond saying it was difficult. What future disappeared? What relationship, livelihood, trust, identity, opportunity, belonging, confidence, or sense of purpose seemed impossible to restore? Why did that particular loss feel capable of ruining you?",key:"v4p2",ph:"Describe what seemed permanently lost and why it mattered so much."},
      {label:"What did you try afterward that still did not fix it, and what did you believe about yourself or your future when you could no longer see a way back?",hint:"Tell us about the attempted recovery that failed. What did you try to repair, replace, escape, prove, or force? What remained broken afterward? End before the realization or comeback. The next part of your story will deal with what eventually changed.",key:"v4p3",ph:"Describe the failed recovery and the lowest point before you could see a way forward."}
    ],
    compile:v=>`The failure, loss, or period when I thought I might not recover: ${v.v4p0||'___'}. The moment I realized this was more than a setback: ${v.v4p4||'___'}. Why it was my fault: ${v.v4p1||'___'}. What I believed might be permanently over: ${v.v4p2||'___'}. What I tried that failed and what I believed at the lowest point: ${v.v4p3||'___'}.`
  },
  {
    title:"What I See Differently Now",
    note:"Share the larger realization you discovered because you lived through the hardest part of your story. This should deepen the first realization, not repeat it.",
    prompts:[
      {label:"What is the biggest thing you eventually understood because you lived through the difficult experience you just described?",hint:"Choose something you could not have fully understood before living through it. Say it in your own words.",key:"v5p0",ph:"Describe the larger truth the difficult experience taught you."},
      {label:"How did you come to understand that? Was there a moment when it became clear, or did you recognize it gradually?",hint:"Describe the experience, evidence, conversation, consequence, or repeated pattern that brought the deeper truth into focus.",key:"v5p1",ph:"Describe how the larger realization became clear."},
      {label:"How did this larger realization change the way you understand your first realization or the person you were before it?",hint:"What became deeper, more complete, or different after the hard experience?",key:"v5p2",ph:"Describe how the second realization changed your understanding of the first."},
      {label:"What changed in who you became, the choices you made, or the way you live because you understood this?",hint:"Describe real consequences in your life. The change can be imperfect or ongoing.",key:"v5p3",ph:"Describe what genuinely changed in you or your life."},
      {label:"Who most needs to understand what you discovered, and what might it help them see differently?",hint:"Think of someone still living inside the part of the story you have already lived through.",key:"v5p4",ph:"Describe who needs this realization and what it could help them see."}
    ],
    compile:v=>`The biggest thing I understood because of the difficult experience: ${v.v5p0||'___'}. How I came to understand it: ${v.v5p1||'___'}. How it deepened my first realization: ${v.v5p2||'___'}. What changed in me or my life: ${v.v5p3||'___'}. Who needs this and what it could help them see: ${v.v5p4||'___'}.`
  },
  {
    title:"What I Learned",
    note:"Close the larger life story you have told. Compare who you were before both realizations with who you are now, acknowledge what remains, and connect the seven videos to what comes next.",
    prompts:[
      {label:"Before either of the realizations you have talked about, who were you and how did you see yourself or this part of your life?",hint:"Think about how you thought, chose, or moved through the world before the first truth changed and before the difficult experience that led to the second one.",key:"v6p0",ph:"Describe who you were and how you saw this part of your life before either realization."},
      {label:"Who are you now, and what is genuinely different in the way you think, choose, respond, or live?",hint:"Point to real differences rather than saying you are a completely different person. What would the earlier version of you notice?",key:"v6p1",ph:"Describe who you are now and what is genuinely different."},
      {label:"What part of the earlier version of you is still present or still being worked through?",hint:"Growth does not erase a person. What remains complicated, unfinished, useful, or recognizably you?",key:"v6p2",ph:"Describe what remains present or unfinished."},
      {label:"What did telling this story across seven videos help you notice, understand, or finally put into words about your larger story?",hint:"The videos did not create your entire transformation. What did telling the story help you connect or express?",key:"v6p3",ph:"Describe what telling the story helped you understand or express."},
      {label:"What are you carrying forward from everything you lived and learned, and where do you want your story to go next?",hint:"You do not need a complete plan. Name the truth, direction, relationship, work, or possibility that now matters enough to continue.",key:"v6p4",ph:"Describe what you are carrying forward and where the story goes next."}
    ],
    compile:v=>`Who I was before both realizations: ${v.v6p0||'___'}. Who I am now and what is different: ${v.v6p1||'___'}. What remains present or unfinished: ${v.v6p2||'___'}. What telling this story helped me understand: ${v.v6p3||'___'}. What I am carrying forward and what comes next: ${v.v6p4||'___'}.`
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
    title:"How I Got Here",
    note:"Your audience needs to understand the path that formed what you know. Stay with the detour, wound, obsession, or unlikely chapter before you understood its professional meaning. This is the origin, not the industry lesson yet.",
    prompts:[
      {label:"How did you get into this? Skip the polished professional answer. What is the real story of how you ended up knowing what you know?",hint:"Maybe it was accidental. Maybe you were trying to solve your own problem. Maybe someone else's problem landed in your lap and you realized you were good at this. What actually happened?",key:"v1p0",ph:"e.g. I got into this because my sister was drowning in debt after her divorce and I helped her build a plan that got her out in 18 months. Her friends started asking me for help. Then their friends."},
      {label:"What detour, wound, obsession, or unlikely chapter shaped the way you understand this work?",hint:"The part of the story that may not look professional on paper but changed what you notice, care about, or do differently. Give one concrete detail.",key:"v1p1",ph:"Describe the chapter that formed your lens before you had language for it."},
      {label:"What did you misunderstand or resist about treating that path as expertise, and why does this work matter to you personally now?",hint:"Start inside the earlier perspective: why did the chapter look irrelevant, unprofessional, or unworthy of claiming? Then name the human reason the work matters to you now without turning it into an industry lesson or business pitch.",key:"v1p2",ph:"Describe what you resisted about the path and why the work matters personally now."}
    ],
    compile:v=>`How I got into this: ${v.v1p0||'___'}. The unlikely chapter that shaped my lens: ${v.v1p1||'___'}. What I misunderstood or resisted about that path: ${v.v1p2||'___'}.`
  },
  {
    title:"What I See Differently",
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
    title:"What The Work Looks Like",
    note:"Your first professional realization now has to survive public practice. Show one concrete collision between your expert instincts and the new behavior visibility required. Authority comes from how you read the experience, not from teaching or reporting progress.",
    prompts:[
      {label:"Tell me about one specific moment when your usual expert instinct showed up while you were communicating publicly.",hint:"A real scene. What were you tempted to overexplain, hide, control, perfect, dismiss, or avoid? What would you normally have done?",key:"v3p0",ph:"Describe the exact public moment and the expert habit it triggered."},
      {label:"What did you actually do differently this time?",hint:"Make the change observable. What did you simplify, say plainly, leave imperfect, publish, ask, or allow the audience to see?",key:"v3p1",ph:"Describe the different action you took in that moment."},
      {label:"What happened because you acted differently, and what did it reveal about your expertise or communication?",hint:"Use only a real result. It can be something you noticed internally; you do not need a client, comment, message, metric, or public response.",key:"v3p2",ph:"Describe the real consequence and what made it unexpected."},
      {label:"What is still difficult about being seen doing this work, even after that small win?",hint:"Name the remaining friction specifically. This is one test, not proof that visibility is solved, and the unresolved cost prepares the hardest part of the story in Video 5.",key:"v3p3",ph:"Describe where the old expert pattern still has a hold on you."}
    ],
    compile:v=>`The specific public trial: ${v.v3p0||'___'}. What I did differently: ${v.v3p1||'___'}. What happened and what it revealed: ${v.v3p2||'___'}. What is still difficult about being seen: ${v.v3p3||'___'}.`
  },
  {
    title:"The Hardest Part",
    note:"Now we are returning to the larger work, craft, calling, or expertise story you have been telling, not the experience of making these videos. This is the chapter where what you had built or hoped to build came closest to collapsing. Choose the failure or period when you genuinely wondered whether this part of your future would recover. Do not tell us what you eventually learned or how everything worked out. Answer from who you were while it was happening.",
    prompts:[
      {label:"Thinking about the work, craft, calling, or expertise story you have been discussing, what failure or period brought you closest to believing what you had built or hoped to build might never recover?",hint:"Choose something that actually happened, rather than something you feared might happen. You do not need to own a business or have clients. If there was not one dramatic event, describe the period when your work, confidence, reputation, livelihood, direction, or hoped-for future gradually fell apart.",key:"v4p0",ph:"Describe the failure or period when what you had built or hoped to build seemed lost."},
      {label:"Take us to the moment you realized this was more than an ordinary professional setback. What had happened, and what made the consequences feel impossible to repair?",hint:"Give us something we can picture. Where were you? Who else was affected? What result, conversation, loss, message, or realization made the seriousness impossible to ignore?",key:"v4p4",ph:"Describe the moment the full professional seriousness became real."},
      {label:"Why was it your fault? What did you do, avoid, ignore, refuse to admit, overestimate, or get completely wrong that caused the failure or made it worse?",hint:"Look for the professional decision that was yours: the warning you ignored, the conversation you avoided, the risk you underestimated, the responsibility you mishandled, or the moment you knew better and continued anyway. Tell us what you should have done differently and why you did not do it.",key:"v4p1",ph:"Describe the professional decision, avoidance, or blind spot that was yours."},
      {label:"What did this failure take from you, your work, or the people who depended on you, and what did you believe might be permanently over?",hint:"Go beyond saying it was difficult. What livelihood, credibility, trust, opportunity, relationship, body of work, identity, or future seemed impossible to restore? Why did that loss feel capable of ending everything you had built?",key:"v4p2",ph:"Describe what seemed permanently lost professionally and why it mattered so much."},
      {label:"What did you try afterward that still did not fix it, and what did you believe about yourself or your future when you could no longer see a professional way back?",hint:"Tell us about the attempted recovery that failed. What did you try to repair, replace, explain, prove, or force? What remained broken afterward? End before the realization or comeback. The next part of your story will deal with what eventually changed.",key:"v4p3",ph:"Describe the failed recovery and the professional lowest point before you could see a way forward."}
    ],
    compile:v=>`The professional failure or period when I thought I might not recover: ${v.v4p0||'___'}. The moment I realized this was more than a setback: ${v.v4p4||'___'}. Why it was my fault: ${v.v4p1||'___'}. What I believed might be permanently over: ${v.v4p2||'___'}. What I tried that failed and what I believed at the lowest point: ${v.v4p3||'___'}.`
  },
  {
    title:"What The Hardest Part Taught Me",
    note:"This is the larger professional truth earned through the difficult experience you just described. It must deepen or correct the first realization rather than becoming another unrelated hot take. Show how the defeat changed your understanding, your work, and the lens you can now give someone else.",
    prompts:[
      {label:"Looking back at the difficult experience you just described, what larger truth about your work, your field, or the people you serve became impossible for you to ignore?",hint:"Choose the truth you could not have earned before that defeat. It may challenge familiar advice, but it must grow directly from what happened to you rather than becoming a separate industry opinion.",key:"v5p0",ph:"Describe the larger professional truth the difficult experience made impossible to ignore."},
      {label:"How did that truth become clear through the aftermath, failed recovery, or rebuilding?",hint:"Walk through the evidence. What did you try, notice, lose, rebuild, or finally stop doing that changed your interpretation of the failure? Give the story that earned the truth instead of jumping straight to the lesson.",key:"v5p1",ph:"Describe how the larger truth emerged through the aftermath or rebuilding."},
      {label:"How does this larger realization deepen, correct, or complete the first professional realization you shared earlier?",hint:"The first realization changed the direction of the story. The difficult experience showed what that lens still could not explain. Name what became more complete without simply repeating the first insight.",key:"v5p2",ph:"Describe how the second realization changes or completes the first."},
      {label:"What changed in the way you work, decide, communicate, or help people once you understood this?",hint:"Make the larger truth observable. Describe a real choice, standard, boundary, method, or way of seeing that changed because the difficult experience taught you something theory could not.",key:"v5p3",ph:"Describe what genuinely changed in your work or decisions."},
      {label:"Who is still facing this problem the way you once did, and what could this truth help them recognize or do differently?",hint:"Picture one specific person whether or not they are a client. What are they misreading, repeating, or blaming themselves for? Give them the useful lens you paid for through experience.",key:"v5p4",ph:"Describe who needs this lens and what it could help them recognize."}
    ],
    compile:v=>`The larger professional truth the difficult experience exposed: ${v.v5p0||'___'}. How it became clear through the aftermath: ${v.v5p1||'___'}. How it deepens or corrects my first realization: ${v.v5p2||'___'}. What changed in my work or decisions: ${v.v5p3||'___'}. Who needs this lens and what it could help them recognize: ${v.v5p4||'___'}.`
  },
  {
    title:"What I Carry Forward",
    note:"Close the larger expert story, not merely the filming experience. Compare your earlier relationship to your expertise with who you are now, acknowledge what remains unfinished, name what telling the story clarified, and open an ongoing relationship with the people who value your perspective.",
    prompts:[
      {label:"Before the two professional realizations and the hardest part of the story, how did you see your expertise, your place in the work, and your right to speak about it publicly?",hint:"Return to the person behind Video 1 and the origin in Video 2. What did you believe made knowledge count? What were you waiting to prove, earn, perfect, or receive permission for?",key:"v6p0",ph:"Describe your earlier relationship to your expertise and public voice."},
      {label:"Who are you now in relation to your expertise and the people you want to reach, and what do you do differently because of what you lived through?",hint:"Make the return observable. Name a real change in how you decide, communicate, practice, teach, create, lead, or allow yourself to be seen.",key:"v6p1",ph:"Describe who you are now and what is genuinely different in your work or public voice."},
      {label:"What remains unfinished, and what do you still need in order to grow into the work, impact, or public role you now see more clearly?",hint:"Authority does not require pretending you are complete. Name the specific skill, support, courage, structure, experience, or unresolved tension that belongs to the next chapter without asking the audience to rescue you.",key:"v6p2",ph:"Describe what remains unfinished or what you still need."},
      {label:"What did telling this larger story across seven videos help you understand or finally put into words about your work and the people you understand?",hint:"The videos did not create your expertise or your whole transformation. What connection, pattern, responsibility, audience, or professional truth became clearer when you had to tell the complete story?",key:"v6p3",ph:"Describe what telling the story helped you clarify about your work and audience."},
      {label:"What perspective, work, or mission are you carrying forward, and why would the right person want to keep following where you take it?",hint:"Name the direction and the relationship, not an offer. What will you keep noticing, questioning, building, practicing, or saying that makes your continuing story worth staying connected to?",key:"v6p4",ph:"Describe what you are carrying forward and why the right viewer should stay."}
    ],
    compile:v=>`Who I was before both professional realizations and the hardest part of the story: ${v.v6p0||'___'}. Who I am now in relation to my expertise and audience: ${v.v6p1||'___'}. What remains unfinished or still needed: ${v.v6p2||'___'}. What telling the story clarified about my work and audience: ${v.v6p3||'___'}. What I am carrying forward and why the right viewer should stay: ${v.v6p4||'___'}.`
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

function getSavedVideoPromptMode(idx, level) {
  const levelKey = String(level || state.level || 1);
  const memoryKey = levelKey + ':' + String(idx);
  if (videoPromptMode[memoryKey] === 'easy' || videoPromptMode[memoryKey] === 'extended') return videoPromptMode[memoryKey];
  const p2 = ensurePhase2();
  const levelModes = p2.videoPromptModesByLevel && p2.videoPromptModesByLevel[levelKey];
  const saved = levelModes && levelModes[String(idx)];
  if (saved === 'easy' || saved === 'extended') return saved;
  return 'easy';
}

function setVideoPromptMode(idx, mode) {
  const p2 = ensurePhase2();
  if (!p2.videoPromptModesByLevel || typeof p2.videoPromptModesByLevel !== 'object') p2.videoPromptModesByLevel = {};
  const levelKey = String(state.level || 1);
  videoPromptMode[levelKey + ':' + String(idx)] = mode;
  if (!p2.videoPromptModesByLevel[levelKey]) p2.videoPromptModesByLevel[levelKey] = {};
  p2.videoPromptModesByLevel[levelKey][String(idx)] = mode;
  saveProgress();
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
          {key:'v0p4', label:"Anything else you'd like to add?",
           hint:'Optional: add anything that would help the first video sound or feel more like you.',
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
              oninput="setVideoAnswer('${p.key}', this.value)">${sv[p.key] || p.def}</textarea>
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
              oninput="setVideoAnswer('${p.key}', this.value)">${sv[p.key] || ''}</textarea>
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
    const easyPrompt = getEasyPrompt(idx, state.level || 1);
    const defaultMode = getSavedVideoPromptMode(idx);
    const extHTML = v.prompts.map(p => `
      <div class="input-group">
        <label class="input-label">${p.label}</label>
        <span class="input-hint">${p.hint}</span>
        <textarea class="text-input" rows="2" placeholder="${p.ph}"
          oninput="setVideoAnswer('${p.key}', this.value)">${state.videos[p.key] || ''}</textarea>
      </div>`).join('');

    if (easyPrompt) {
      const easyAnswerVal = state.videos[easyPrompt.key] || '';
      const easyHTML = `
        <div class="input-group">
          <label class="input-label">${easyPrompt.label}</label>
          <span class="input-hint">${easyPrompt.hint}</span>
          <textarea class="text-input" rows="4" placeholder="Write whatever comes naturally. You can always add more later."
            oninput="setVideoAnswer('${easyPrompt.key}', this.value)">${easyAnswerVal}</textarea>
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

let guestAccessVerified = false;
let guestGatePromise = null;

async function guestAccessConfig() {
  const response = await fetch('/api/guest-config', {
    headers: await apiAuthorizationHeaders()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The human check could not be prepared.');
  return data;
}

function waitForTurnstile() {
  return new Promise((resolve, reject) => {
    let checks = 0;
    const timer = setInterval(() => {
      checks += 1;
      if (window.turnstile) {
        clearInterval(timer);
        resolve(window.turnstile);
      } else if (checks > 50) {
        clearInterval(timer);
        reject(new Error('The human check did not load. Please refresh and try again.'));
      }
    }, 100);
  });
}

async function showGuestHumanCheck(siteKey) {
  if (guestGatePromise) return guestGatePromise;
  guestGatePromise = new Promise(async resolve => {
    const overlay = document.getElementById('guest-human-check');
    const widget = document.getElementById('guest-turnstile-widget');
    const errorEl = document.getElementById('guest-human-error');
    const cancel = document.getElementById('guest-human-cancel');
    let widgetId = null;

    function finish(result) {
      overlay.hidden = true;
      cancel.onclick = null;
      if (widgetId != null && window.turnstile) window.turnstile.remove(widgetId);
      widget.innerHTML = '';
      guestGatePromise = null;
      resolve(result);
    }

    try {
      overlay.hidden = false;
      errorEl.hidden = true;
      errorEl.textContent = '';
      cancel.onclick = () => finish(false);
      const turnstile = await waitForTurnstile();
      widgetId = turnstile.render(widget, {
        sitekey: siteKey,
        action: 'sis_guest_unlock',
        theme: document.body.classList.contains('light-mode') ? 'light' : 'dark',
        callback: async token => {
          try {
            const response = await fetch('/api/guest-verify', {
              method: 'POST',
              headers: await apiAuthorizationHeaders(),
              body: JSON.stringify({ token })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.verified) throw new Error(data.error || 'The human check did not complete.');
            guestAccessVerified = true;
            finish(true);
          } catch (error) {
            errorEl.textContent = error.message || 'Please try the check again.';
            errorEl.hidden = false;
            turnstile.reset(widgetId);
          }
        },
        'error-callback': () => {
          errorEl.textContent = 'The human check had trouble loading. Please try again.';
          errorEl.hidden = false;
        }
      });
    } catch (error) {
      errorEl.textContent = error.message || 'The human check could not load.';
      errorEl.hidden = false;
    }
  });
  return guestGatePromise;
}

async function ensureGuestCanGenerate(videoIdx) {
  if (videoIdx < 1 || guestAccessVerified || (typeof getCurrentUser === 'function' && getCurrentUser())) return true;
  const config = await guestAccessConfig();
  if (config.authenticated || config.verified) {
    guestAccessVerified = true;
    return true;
  }
  if (!config.siteKey) throw new Error('The human check is not configured yet.');
  return showGuestHumanCheck(config.siteKey);
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
    try {
      if (!(await ensureGuestCanGenerate(idx))) return;
    } catch (error) {
      alert(error.message || 'The human check could not be completed.');
      return;
    }
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
      const level = state.level || 1;
      const video = idx + 1;
      const script = await generateValidatedScript(userMessage, level, video);
      const promptVersion = window._SIS_lastPromptVersion || '';
      const finalContent = finalScriptText(idx, script, level);
      window._SIS_log && _SIS_log('gen:got-response', {len: script ? script.length : 0});
      state.videos[editKey] = script;
      state.videos['prompt_version_v' + idx] = promptVersion;
      saveProgress();
      trackSession();
      queueScriptSave(video, level, script, finalContent, promptVersion);
      if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot(idx);
      if (typeof logEvent === 'function') logEvent('script_generated', {video_number: video, level, prompt_version: promptVersion || null});
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

const VIDEO_RATIONALE = {
  1: [
    'WHERE WE ARE: You are making the declaration and letting people see the real reason you have waited. The audience does not need confidence from you yet. They need honesty and a reason to believe you will finish the challenge.',
    'WHERE WE ARE: Let people meet you before asking them to care about a lesson. Your background, an unexpected detail, and what naturally matters to you give the audience a human reason to recognize themselves and stay curious.',
    'WHERE WE ARE: One thing you used to think was true meets evidence it cannot explain. The audience should arrive at the new way of seeing it through your story, not because you lecture them.',
    'WHERE WE ARE: You are halfway through the challenge and reporting honestly from the middle. The contrast between what you expected and what is really happening builds trust, especially when some part is still difficult.',
    'WHERE WE ARE: This is the lowest point in the larger story you have been telling: the failure or loss that felt capable of ruining your life, identity, future, or reason to continue. Your own choice or blind spot helped cause it, and recovery did not feel guaranteed. Stay inside what you believed then. The next video deals with the way back and what you eventually understood.',
    'WHERE WE ARE: The difficult chapter has finally produced a larger realization. Show how it became clear, how it deepened the first realization, and what genuinely changed because of it.',
    'WHERE WE ARE: Bring the larger story home by comparing who you were before both realizations with who you are now. The challenge helped you tell and understand that story. It did not create your whole transformation.'
  ],
  2: [
    'WHERE WE ARE: You are making the declaration and letting people see the gap between what you know privately and what you have been willing to own publicly. The audience needs quiet confidence, honest hesitation, and a reason to believe you will finish.',
    'WHERE WE ARE: Let people see the path that formed your perspective before you explain the lesson. The real origin, unlikely chapter, resistance, and personal reason for caring make expertise feel human and earned.',
    'WHERE WE ARE: One familiar professional belief meets an experience it cannot explain. Let the audience arrive at the new lens through the story. This is the first useful realization, not your final wisdom.',
    'WHERE WE ARE: Your first professional realization now meets public practice. Show one expert instinct colliding with a different action, the real result, and what remains difficult. The quality of your observation reveals competence without a claim.',
    'WHERE WE ARE: This is the lowest point in the larger work, craft, calling, or expertise story: the failure that threatened what you had built or hoped to build. Your own decision or blind spot helped cause it, and recovery did not feel guaranteed. Stay inside what you believed then.',
    'WHERE WE ARE: The difficult experience has produced a larger professional truth. Show how the aftermath earned it, how it deepens the first realization, what changed in your work, and what useful lens another person can carry away.',
    'WHERE WE ARE: Bring the larger expert story home. Compare your earlier relationship to your knowledge and visibility with who you are now, acknowledge what remains unfinished, and show why your continuing perspective is worth following.'
  ]
};

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
  const declText = isV1 ? videoOneDeclaration(state.level || 1) : '';

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
  const levelRationale = VIDEO_RATIONALE[state.level || 1] || VIDEO_RATIONALE[1];
  if (rationaleEl) rationaleEl.textContent = levelRationale[idx] || '';

  // Populate guided view (HOOK / OPEN LOOP / story section / CONCLUSION / CTA)
  const levelStoryLabels = VIDEO_STORY_LABELS[state.level || 1] || VIDEO_STORY_LABELS[1];
  const levelStoryBeats = VIDEO_STORY_BEATS[state.level || 1] || VIDEO_STORY_BEATS[1];
  const storyLabel = levelStoryLabels[idx] || 'YOUR STORY';
  const storyBeats = levelStoryBeats[idx] || [];
  const beatsEl = document.getElementById('sv-beats');
  if (beatsEl) {
    const sections = state.videos[sectionsKey];
    if (sections && (sections.HOOK || sections['OPEN LOOP'] || sections.MEAT || sections.CONCLUSION || sections.CTA)) {
      // AI-generated script with parsed sections — show sections with psychological labels
      const sectionDefs = [
        { key: 'HOOK',       label: 'HOOK',       desc: 'Stops the scroll in the first 7 words. Grabs attention before anything else.' },
        { key: 'OPEN LOOP',  label: 'OPEN LOOP',  desc: 'Creates tension or curiosity. Signals something important is coming.' },
        ...(isV1 && declText ? [{ key: 'DECLARATION', label: 'DECLARATION', desc: 'Your commitment, out loud. Say this close to verbatim. It signals trust and sets up everything that follows.', fixed: true, fixedText: declText }] : []),
        { key: 'MEAT',       label: storyLabel,    desc: null, beats: storyBeats },
        { key: 'CONCLUSION', label: 'CONCLUSION',  desc: 'Closes the thought with a turn, sharper meaning, or emotional landing.' },
        { key: 'CTA',        label: 'CTA',         desc: 'The direct next action. Gives the viewer a clear, story-specific reason to follow.' },
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

  // Populate clean (editable) view — strip section labels, inject DECLARATION for V1
  const editor = document.getElementById('script-editor');
  if (editor) {
    const rawScript = state.videos[editKey] || '';
    const cleanScript = finalScriptText(idx, rawScript, state.level || 1);
    editor.value = cleanScript;
    editor.oninput = () => {
      state.videos[editKey] = editor.value;
      const reParsed = parseScriptSections(editor.value);
      if (reParsed) state.videos[sectionsKey] = reParsed;
      clearTimeout(scriptEditSaveTimer);
      scriptEditSaveTimer = setTimeout(() => {
        scriptEditSaveTimer = null;
        saveScriptEditToDb(idx + 1, state.level || 1, editor.value, editor.value);
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

function clearVideoPromptAnswers(idx) {
  const videos = getVideos();
  const v = videos[idx];
  const keys = new Set();
  const easyPrompt = getEasyPrompt(idx, state.level || 1);
  if (easyPrompt && easyPrompt.key) keys.add(easyPrompt.key);
  if (v && v.prompts) v.prompts.forEach(p => { if (p.key) keys.add(p.key); });
  if (idx === 0) ['_v1_seen', 'v0p0', 'v0p1', 'v0p2', 'v0p3', 'v0p4', 'v0decl'].forEach(key => keys.add(key));
  keys.forEach(key => { delete state.videos[key]; });
  const levelKey = String(state.level || 1);
  if (state.videoAnswersByLevel && state.videoAnswersByLevel[levelKey]) {
    keys.forEach(key => { delete state.videoAnswersByLevel[levelKey][key]; });
  }
}

async function clearVideoDraftForRegeneration(idx) {
  const level = state.level || 1;
  const videoNumber = idx + 1;
  delete state.videos['script_v' + idx];
  delete state.videos['sections_v' + idx];
  delete state.videos['_undo_v' + idx];
  delete state.videos['locked_v' + idx];
  delete state.videos['prompt_version_v' + idx];
  clearVideoPromptAnswers(idx);
  if (typeof clearCurrentScriptForRegeneration === 'function') {
    await clearCurrentScriptForRegeneration(videoNumber, level);
  }
}

async function startVideoOver() {
  const idx = currentVideoIndex;
  // Push snapshot before wiping so undo can recover
  if (typeof pushUndoSnapshot === 'function') pushUndoSnapshot(idx);
  const videos = getVideos();
  const v = videos[idx];
  await clearVideoDraftForRegeneration(idx);
  if (v.beats) {
    state.mvoQ2 = null; state.mvoQ3 = null; state.mvoQ4 = null;
    mvoQ2Skipped = false;
    goToMvoScreen();
  } else {
    renderVideoPrompts(idx);
    showScreen('screen-7');
    currentIndex = screenOrder.indexOf('screen-7');
  }
  saveProgress();
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
const _versionFinalStore = {};

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
  previous.forEach(v => {
    _versionStore[v.id] = v.content;
    _versionFinalStore[v.id] = v.final_content || finalScriptText(idx, v.content, state.level || 1);
  });

  versionsList.innerHTML = previous.map(v => {
    const clean = v.final_content || finalScriptText(idx, v.content, state.level || 1);
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
  captureVideoAnswersByLevel();
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

  const clean = finalScriptText(idx, text, state.level || 1);

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
    await saveScriptEditToDb(idx + 1, state.level || 1, currentScript, finalScriptText(idx, currentScript, state.level || 1));
  }
  await clearVideoDraftForRegeneration(idx);
  // For V1 (idx 0), also reset the MVO answers and topic freewrite
  if (idx === 0) {
    state.mvoQ2 = null; state.mvoQ3 = null; state.mvoQ4 = null;
    state.topicFreewrite = '';
    mvoQ2Skipped = false;
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
  const clean = finalScriptText(idx);
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
    _versionFinalStore[ver.id] = ver.final_content || finalScriptText(idx, ver.content, state.level || 1);
    const clean = _versionFinalStore[ver.id];
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
  const content = _versionFinalStore[scriptId] || _versionStore[scriptId];
  if (!content) return;
  const clean = content.trim();
  navigator.clipboard && navigator.clipboard.writeText(clean).then(() => {
    if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = orig, 1500); }
  });
}

function printVersion(scriptId, idx) {
  const content = _versionFinalStore[scriptId] || _versionStore[scriptId];
  if (!content) return;
  const videos = getVideos();
  const v = videos[idx];
  const clean = content.trim();
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
    delete _versionFinalStore[scriptId];
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
  const clean = finalScriptText(idx);
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
  const clean = finalScriptText(idx, script, state.level || 1);
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
  captureVideoAnswersByLevel();

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

// ── POINTS PANEL + WEALTH VAULT ───────────────────────
// Dashboard strip (milestone + progress, tap to open) and the full vault:
// eight faceted gems earned at milestones, a money pile that grows with
// total points, and the numbered breakdown for people who love numbers.
// Data comes from computePoints(state) in js/points.js.

const POINTS_LABELS = {
  onboarding_complete: 'Completed your onboarding',
  starter_context: 'Shared your story and context',
  audience_context: 'Described your audience',
  message_context: 'Named your core message',
  mvo_q4_answered: 'Answered the deep question',
  first_script_notes: 'Added extra script notes',
  scripts_generated: 'Scripts created',
  all_seven_scripts: 'All 7 scripts complete',
  scripts_locked: 'Scripts locked in',
  videos_filmed: 'Videos filmed',
  videos_posted: 'Videos posted',
  post_url_bonus: 'Shared your video links',
  sponsor_clicks: 'Explored the creator tools',
  graduation_watched: 'Watched the Graduation Event',
  call_scheduled: 'Scheduled your 1-1 with David Bee'
};

const GEM_COLORS = {
  amethyst: ['#c4b5fd', '#7c3aed'],
  topaz:    ['#fde68a', '#d97706'],
  emerald:  ['#6ee7b7', '#059669'],
  sapphire: ['#93c5fd', '#2563eb'],
  ruby:     ['#fca5a5', '#dc2626'],
  opal:     ['#c4b5fd', '#22d3ee'],
  diamond:  ['#f0f9ff', '#60a5fa'],
  gold:     ['#fde047', '#f59e0b']
};

function _gemSVG(gem, earned, size) {
  const c = GEM_COLORS[gem] || GEM_COLORS.diamond;
  const gid = 'gg-' + gem + (earned ? '-on' : '-off');
  const light = earned ? c[0] : '#5a6b6b';
  const dark = earned ? c[1] : '#2c3a3a';
  const glow = earned ? `filter="url(#glow-${gem})"` : '';
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" class="vault-gem-svg${earned ? ' gem-earned' : ''}" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${light}"/>
        <stop offset="100%" stop-color="${dark}"/>
      </linearGradient>
      ${earned ? `<filter id="glow-${gem}" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.4" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>` : ''}
    </defs>
    <g ${glow} opacity="${earned ? 1 : 0.45}">
      <polygon points="22,12 42,12 52,26 32,54 12,26" fill="url(#${gid})"/>
      <polygon points="22,12 42,12 38,26 26,26" fill="#ffffff" opacity="0.32"/>
      <polygon points="22,12 26,26 12,26" fill="#ffffff" opacity="0.14"/>
      <polygon points="42,12 52,26 38,26" fill="#000000" opacity="0.12"/>
      <polygon points="12,26 26,26 32,54" fill="#000000" opacity="0.18"/>
      <polygon points="38,26 52,26 32,54" fill="#000000" opacity="0.3"/>
      <polygon points="26,26 38,26 32,54" fill="#ffffff" opacity="0.1"/>
    </g>
  </svg>`;
}

function _moneyPileSVG(ratio) {
  // Wealth grows with points: bill stacks rise, coins pile up, one layer at
  // a time. Pure visual metaphor; the numbers live in the breakdown below.
  const steps = 6;
  const visible = Math.max(ratio > 0 ? 1 : 0, Math.round(ratio * steps));
  let bills = '';
  for (let i = 0; i < 3; i++) {
    const on = visible >= (i + 1) * 2;
    const y = 46 - i * 9;
    bills += `<g opacity="${on ? 1 : 0.12}">
      <rect x="${14 + i * 3}" y="${y}" width="52" height="8" rx="2" fill="#2f9e63"/>
      <rect x="${14 + i * 3}" y="${y}" width="52" height="8" rx="2" fill="none" stroke="#1c7a48" stroke-width="1"/>
      <circle cx="${40 + i * 3}" cy="${y + 4}" r="2.6" fill="#c9f2dc" opacity="0.9"/>
    </g>`;
  }
  let coins = '';
  for (let i = 0; i < 3; i++) {
    const on = visible >= i * 2 + 1;
    const cx = 86 + (i % 2) * 14;
    const cy = 50 - Math.floor(i / 2) * 9 - (i % 2) * 4;
    coins += `<g opacity="${on ? 1 : 0.12}">
      <ellipse cx="${cx}" cy="${cy}" rx="9" ry="7" fill="#f5c94c"/>
      <ellipse cx="${cx}" cy="${cy - 1.5}" rx="9" ry="7" fill="#fde68a"/>
      <text x="${cx}" y="${cy + 1.6}" text-anchor="middle" font-size="8" font-weight="800" fill="#b07d1a">$</text>
    </g>`;
  }
  return `<svg viewBox="0 0 112 60" class="vault-money-svg" aria-hidden="true">${bills}${coins}</svg>`;
}

const MILESTONES_SEEN_KEY = 'sis_milestones_seen_v1';

function buildPointsPanel() {
  const pts = computePoints(state);
  const wrap = document.createElement('div');
  wrap.className = 'db-points-panel';
  wrap.id = 'db-points-panel';

  const current = pts.earnedCount > 0 ? pts.milestones[pts.earnedCount - 1] : null;
  const stripTitle = current ? current.name : 'Just Getting Started';
  const nextLine = pts.nextMilestone
    ? (pts.nextMilestone.at - pts.total) + ' points to ' + pts.nextMilestone.name
    : 'Every milestone earned. Incredible.';

  const miniGems = pts.milestones.map(m => _gemSVG(m.gem, m.earned, 16)).join('');

  const gemGrid = pts.milestones.map(m => `
    <div class="vault-gem-slot${m.earned ? ' earned' : ''}" title="${escapeHTML(m.name)} at ${m.at} points">
      ${_gemSVG(m.gem, m.earned, 44)}
      <div class="vault-gem-name">${escapeHTML(m.name)}</div>
      <div class="vault-gem-at">${m.earned ? 'Earned' : m.at + ' pts'}</div>
    </div>`).join('');

  const rows = Object.keys(pts.breakdown).map(k => {
    const v = pts.breakdown[k];
    const p = (typeof v === 'object') ? v.points : v;
    const count = (typeof v === 'object' && v.count) ? ' ×' + v.count : '';
    return `<div class="vault-row"><span>${escapeHTML(POINTS_LABELS[k] || k)}${count}</span><strong>+${p}</strong></div>`;
  }).join('') || '<div class="vault-row muted-row"><span>Your first points are one step away</span></div>';

  wrap.innerHTML = `
    <button class="db-points-strip" onclick="toggleVaultPanel()" aria-expanded="false">
      <div class="dbp-left">
        <span class="dbp-eyebrow">Your Progress</span>
        <span class="dbp-milestone">${escapeHTML(stripTitle)}</span>
      </div>
      <div class="dbp-mid">
        <div class="dbp-bar"><div class="dbp-bar-fill" style="width:${pts.progressToNext}%"></div></div>
        <span class="dbp-next">${pts.total} points · ${escapeHTML(nextLine)}</span>
      </div>
      <div class="dbp-right">
        <span class="dbp-gems-mini">${miniGems}</span>
        <span class="dbp-arrow" id="vault-arrow">▼</span>
      </div>
    </button>
    <div class="vault-body" id="vault-body" style="display:none;">
      <div class="vault-gems">${gemGrid}</div>
      <div class="vault-money">
        ${_moneyPileSVG(pts.maxTotal ? pts.total / pts.maxTotal : 0)}
        <div class="vault-money-caption">Your wealth is building. ${pts.total} of ${pts.maxTotal} points.</div>
      </div>
      <div class="vault-breakdown">
        <div class="vault-breakdown-title">How you earned it</div>
        ${rows}
      </div>
    </div>`;

  _checkMilestoneCelebration(pts, wrap);
  return wrap;
}

function toggleVaultPanel() {
  const body = document.getElementById('vault-body');
  const arrow = document.getElementById('vault-arrow');
  const strip = document.querySelector('.db-points-strip');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)';
  if (strip) strip.setAttribute('aria-expanded', String(!open));
}

// Confetti + gem flash when a new milestone was crossed since last visit.
// First-ever render just records the baseline so returning users are not
// greeted with retroactive confetti spam.
function _checkMilestoneCelebration(pts, wrap) {
  let seen = null;
  try { seen = localStorage.getItem(MILESTONES_SEEN_KEY); } catch(e) {}
  if (seen === null) {
    try { localStorage.setItem(MILESTONES_SEEN_KEY, String(pts.earnedCount)); } catch(e) {}
    return;
  }
  const seenCount = parseInt(seen, 10) || 0;
  if (pts.earnedCount > seenCount) {
    try { localStorage.setItem(MILESTONES_SEEN_KEY, String(pts.earnedCount)); } catch(e) {}
    setTimeout(() => {
      launchConfetti();
      const slots = wrap.querySelectorAll('.vault-gem-slot.earned');
      const newest = slots[slots.length - 1];
      if (newest) newest.classList.add('gem-just-earned');
      // Auto-open the vault so they see what they just earned
      const body = document.getElementById('vault-body');
      if (body && body.style.display === 'none') toggleVaultPanel();
    }, 600);
  } else if (pts.earnedCount < seenCount) {
    // Start-over path — resync quietly
    try { localStorage.setItem(MILESTONES_SEEN_KEY, String(pts.earnedCount)); } catch(e) {}
  }
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

  // ── POINTS PANEL + WEALTH VAULT ───────────────────────
  if (typeof buildPointsPanel === 'function') {
    try { output.appendChild(buildPointsPanel()); } catch(e) {
      console.error('[SeenInSeven] buildPointsPanel threw: ' + e.message);
    }
  }

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
    const clean = finalScriptText(i, script, state.level || 1);
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
      </div>
      ${filmed ? (() => {
        const vp = (state.videoPosted && state.videoPosted[i]) || {};
        return `<div class="dbc-posted-row">
          <label class="dbc-posted-check">
            <input type="checkbox" ${vp.posted ? 'checked' : ''} onchange="togglePosted(${i}, this.checked)">
            <span>I posted it</span>
          </label>
          ${vp.posted ? `<input type="url" class="dbc-post-url" placeholder="Paste your video link for bonus points"
            value="${escapeHTML(vp.url || '')}" onchange="setPostUrl(${i}, this.value)">` : ''}
        </div>`;
      })() : ''}`;
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
      const clean = archivedScriptText(state.l1Videos, i, 1);
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
  const clean = archivedScriptText(state.l1Videos, idx, 1);
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

  // Engagement cards appear only when David has set their URLs
  const grad = document.getElementById('engage-graduation');
  const gradCta = document.getElementById('engage-graduation-cta');
  if (grad && ENGAGE_LINKS.graduation) {
    partnerSection.removeAttribute('data-locked');
    grad.style.display = '';
    if (gradCta) gradCta.href = ENGAGE_LINKS.graduation;
  }
  const call = document.getElementById('engage-call');
  const callCta = document.getElementById('engage-call-cta');
  if (call && ENGAGE_LINKS.schedule) {
    partnerSection.removeAttribute('data-locked');
    call.style.display = '';
    if (callCta) callCta.href = ENGAGE_LINKS.schedule;
  }
}

// ── ENGAGEMENT POINT HOOKS ────────────────────────────
// Sponsor/graduation/call actions persist two ways: state.engage for the
// instant client-side points display (works anonymous), and a logs event
// for the authoritative server-side computation.

function _refreshPointsPanel() {
  const old = document.getElementById('db-points-panel');
  if (!old || typeof buildPointsPanel !== 'function') return;
  const wasOpen = (() => {
    const body = document.getElementById('vault-body');
    return body && body.style.display !== 'none';
  })();
  const fresh = buildPointsPanel();
  old.replaceWith(fresh);
  if (wasOpen) toggleVaultPanel();
}

function trackSponsorClick(partner) {
  if (!state.engage) state.engage = {};
  const key = 'sponsor_' + partner;
  if (!state.engage[key]) {
    state.engage[key] = true;
    saveProgress();
    if (typeof logEvent === 'function') logEvent('sponsor_clicked', { partner: partner });
    _refreshPointsPanel();
  }
  return true; // let the link navigate
}

function openEngageLink(kind) {
  const url = kind === 'graduation' ? ENGAGE_LINKS.graduation : ENGAGE_LINKS.schedule;
  if (!url) return false;
  if (!state.engage) state.engage = {};
  const key = kind === 'graduation' ? 'graduation' : 'call';
  if (!state.engage[key]) {
    state.engage[key] = true;
    saveProgress();
    if (typeof logEvent === 'function') {
      logEvent(kind === 'graduation' ? 'graduation_watched' : 'call_scheduled', {});
    }
    _refreshPointsPanel();
  }
  return true; // href is set by updatePartnerVisibility; let the link navigate
}

// ── POSTED TRACKING (points: posted + optional URL bonus) ────────────
function togglePosted(idx, checked) {
  if (!state.videoPosted) state.videoPosted = {};
  const prev = state.videoPosted[idx] || {};
  state.videoPosted[idx] = { posted: !!checked, url: prev.url || '' };
  saveProgress();
  if (typeof queuePostedSave === 'function') {
    queuePostedSave(idx, state.level || 1, !!checked, prev.url || '');
  }
  if (checked && typeof logEvent === 'function') {
    logEvent('video_posted', { video_number: idx + 1, has_url: !!(prev.url) });
  }
  buildPlan(); // refresh card UI + points strip together
}

function setPostUrl(idx, value) {
  if (!state.videoPosted) state.videoPosted = {};
  const prev = state.videoPosted[idx] || {};
  const url = String(value || '').trim().slice(0, 500);
  state.videoPosted[idx] = { posted: prev.posted !== false, url: url };
  saveProgress();
  if (typeof queuePostedSave === 'function') {
    queuePostedSave(idx, state.level || 1, state.videoPosted[idx].posted, url);
  }
  if (url && typeof logEvent === 'function') {
    logEvent('video_posted', { video_number: idx + 1, has_url: true });
  }
  buildPlan();
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
    const clean = finalScriptText(i, script, state.level || 1);
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
      const clean = archivedScriptText(state.l1Videos, i, 1);
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
  const showFreewrite = level === 1 || level === 2;
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
  if (level === 2 && mode === 'simple') return "Pick the closest one, then add anything the choices don't capture.";
  return 'Use your own words if you want to give the script builder more context.';
}

function getMvoFreewriteLabel(qNum, level, mode) {
  if (level === 1 && mode === 'simple') return 'Add anything else that brought you here.';
  if (level === 2 && mode === 'simple') return "Add what the choices don't capture.";
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
    if (sv.v0p1) q2 = Object.assign({}, q2, {before_full: sv.v0p1});
    if (sv.v0p2) q3 = Object.assign({}, q3, {catalyst_full: sv.v0p2});
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
    var cleanScript = finalScriptText(i, script, state.level || 1);
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
      const storedClean = finalScriptText(idx, stored, state.level || 1);
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
  const text = finalScriptText(currentVideoIndex);
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
  captureVideoAnswersByLevel();
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
    videoAnswersByLevel: state.videoAnswersByLevel || {},
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
      if (data.videoAnswersByLevel) state.videoAnswersByLevel = data.videoAnswersByLevel;
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
  Object.keys(state).forEach(k => state[k] = k === 'videos' || k === 'videoStatus' || k === 'videoAnswersByLevel' ? {} : null);
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
