// ── VOICE-TO-TEXT FOR STORYSCULPT ─────────────────────
// The same voice input SeenInSeven has (js/app.js, initVoiceToText), for
// StorySculpt (David, 2026-10-17): the browser's native Web Speech API, a mic
// on each writing field, speech appended after what is already typed, a
// Listening badge, and a stop after 3 seconds of silence. Browsers without
// speech recognition (Firefox) show no mic and nothing else changes.
//
// StorySculpt skips its short label fields and the finished-script editor,
// which is the script itself rather than something the member answers.

(function initStorySculptVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const SKIP_IDS = new Set(['story-output-copy', 'story-title', 'mem-name', 'mem-role', 'ugc-product-url']);
  const SELECTOR = 'textarea, input[type="text"]';

  function eligible(el) {
    if (!el || el.dataset.voiceAttached) return false;
    if (SKIP_IDS.has(el.id)) return false;
    if (el.readOnly || el.disabled) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    return tag === 'input' && (el.type || 'text').toLowerCase() === 'text';
  }

  function attachMic(el) {
    if (!eligible(el)) return;
    const parent = el.parentNode;
    if (!parent) return;
    el.dataset.voiceAttached = '1';

    const isTextarea = el.tagName.toLowerCase() === 'textarea';
    const wrap = document.createElement('div');
    wrap.className = 'voice-input-wrap' + (isTextarea ? ' is-textarea' : '');
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voice-btn';
    btn.title = 'Click to speak';
    btn.innerHTML = '🎤';
    btn.setAttribute('aria-label', 'Speak instead of typing');

    const badge = document.createElement('span');
    badge.className = 'voice-listening-badge';
    badge.innerHTML = '<strong>Listening</strong> &nbsp;<em>(tap to stop)</em>';
    badge.style.display = 'none';

    wrap.appendChild(badge);
    wrap.appendChild(btn);

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (active && active.btn === btn) stopListening();
      else startListening(el, btn, badge);
    });
  }

  // Each listening session owns its field, its button and the text that was
  // in the field when it started. Chrome keeps delivering the last words for a
  // moment after stop, so a session's late results still land after that
  // starting text, and a session's own end can never switch off a newer one
  // (David, 2026-10-17: start, stop, start again wiped what was there).
  let active = null;
  const latestSession = new WeakMap();

  function startListening(el, btn, badge) {
    if (active) finishSession(active);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    const session = {
      recognition, el, btn, badge,
      base: el.value ? el.value.trimEnd() + ' ' : '',
      finalText: '',
      timer: null,
      live: true,
    };
    active = session;
    latestSession.set(el, session);

    btn.classList.add('listening');
    btn.innerHTML = '🟢';
    badge.style.display = 'block';

    recognition.onresult = (event) => {
      // A newer session on this field has taken over; this one is history.
      if (latestSession.get(el) !== session) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) session.finalText += text + ' ';
        else interim = text;
      }
      el.value = session.base + session.finalText + interim;
      // Existing handlers (autosave, auto-grow, word count) run as if typed.
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (session.live) {
        clearTimeout(session.timer);
        session.timer = setTimeout(() => finishSession(session), 3000);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        finishSession(session);
        btn.title = 'Microphone access denied';
        btn.innerHTML = '🚫';
        setTimeout(() => { if (!btn.classList.contains('listening')) { btn.innerHTML = '🎤'; btn.title = 'Click to speak'; } }, 3000);
        return;
      }
      finishSession(session);
    };

    recognition.onend = () => finishSession(session);

    try {
      recognition.start();
      session.timer = setTimeout(() => finishSession(session), 10000);
    } catch (_) {
      finishSession(session);
    }
  }

  // Stops one session. stop(), not abort(), so the words still being
  // recognised arrive and are kept.
  function finishSession(session) {
    if (!session || !session.live) return;
    session.live = false;
    clearTimeout(session.timer);
    try { session.recognition.stop(); } catch (_) {}
    session.btn.classList.remove('listening');
    session.btn.innerHTML = '🎤';
    session.badge.style.display = 'none';
    if (active === session) active = null;
  }

  function stopListening() {
    finishSession(active);
  }

  function attachAll(root) {
    if (root.matches && root.matches(SELECTOR)) attachMic(root);
    if (root.querySelectorAll) root.querySelectorAll(SELECTOR).forEach(attachMic);
  }

  // Regenerate notes and other fields StorySculpt renders later get a mic too.
  new MutationObserver((mutations) => {
    mutations.forEach(m => m.addedNodes.forEach(node => { if (node.nodeType === 1) attachAll(node); }));
  }).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => attachAll(document));
  else attachAll(document);
})();
