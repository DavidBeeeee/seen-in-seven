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

  let activeRecognition = null;
  let activeBtn = null;
  let activeBadge = null;
  let silenceTimer = null;

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
      if (activeBtn === btn) stopListening();
      else startListening(el, btn, badge);
    });
  }

  function startListening(el, btn, badge) {
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
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += text + ' ';
        else interim = text;
      }
      el.value = (el.dataset.voiceBase || '') + finalTranscript + interim;
      // StorySculpt's own handlers (autosave, auto-grow, word count) run as if typed.
      el.dispatchEvent(new Event('input', { bubbles: true }));
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

    recognition.onend = () => stopListening(false);

    el.dataset.voiceBase = el.value ? el.value.trimEnd() + ' ' : '';
    finalTranscript = '';

    try {
      recognition.start();
      silenceTimer = setTimeout(() => stopListening(), 10000);
    } catch (_) {
      stopListening(false);
    }
  }

  function stopListening(cleanupBase = true) {
    clearTimeout(silenceTimer);
    if (activeRecognition) {
      try { activeRecognition.stop(); } catch (_) {}
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
    if (cleanupBase) {
      document.querySelectorAll('[data-voice-base]').forEach(el => { delete el.dataset.voiceBase; });
    }
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
