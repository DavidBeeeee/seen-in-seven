// Next Step Navigator: the member's durable move record and return path. WBR-409.
//
// The roadmap builder on this page is the big plan. This module is the "what do I
// do right now" layer that sits beside it: every move the member chooses is saved
// server-side in navigator_moves, so a member who leaves and comes back finds
// their past moves, how many they have completed, and the one still open. The
// Navigator stops forgetting them.
//
// It does not self-initialize. The page calls window.NavigatorMoves.mount(context)
// from inside its own EEEStudio.initialize callback, so there is exactly one auth
// bootstrap. Everything here is wrapped so a failure in the move layer can never
// take down the roadmap builder it lives next to.

(function () {
  const el = id => document.getElementById(id);
  let ctx = null;
  let moves = [];
  let lastResult = null;
  // Reused across a retry of the same submission so a resubmit cannot duplicate
  // the move; cleared once a submission's write lands. WBR-005.
  let pendingIdempotencyKey = null;

  // The move write and its idempotency key live in js/navigator-moves-store.mjs,
  // a module the page loads as window.NavigatorMovesStore so the logic is unit
  // tested under node. These thin wrappers prefer that module and keep a plain
  // inline path as a defensive fallback, because the move layer must never break
  // the roadmap builder it sits beside even if the module failed to load.
  function store() {
    return (typeof window !== 'undefined' && window.NavigatorMovesStore) || null;
  }

  function makeIdempotencyKey() {
    const s = store();
    if (s) return s.newIdempotencyKey();
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'k-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function buildRow(input, data, idempotencyKey) {
    const s = store();
    if (s) return s.buildMoveRow({ profileId: ctx.profile.id, input, result: data, idempotencyKey });
    return {
      user_id: ctx.profile.id,
      objective: input.objective,
      current_reality: input.current_reality,
      blocker: input.blocker,
      available_time: input.available_time,
      deadline: input.deadline,
      next_action: data.next_action || '',
      first_15_minutes: data.first_15_minutes || '',
      done_when: data.done_when || '',
      why_this_now: data.why_this_now || '',
      source: data.source === 'fallback' ? 'fallback' : 'generated',
      status: 'active',
      idempotency_key: idempotencyKey
    };
  }

  function saveRow(sb, row) {
    const s = store();
    if (s) return s.saveMove(sb, row);
    return sb.from('navigator_moves').insert(row);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (error) {
      return '';
    }
  }

  async function loadMoves() {
    const { data, error } = await ctx.sb
      .from('navigator_moves')
      .select('*')
      .eq('user_id', ctx.profile.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    moves = Array.isArray(data) ? data : [];
  }

  function openMoves() {
    return moves.filter(move => move.status === 'active');
  }

  function completedMoves() {
    return moves.filter(move => move.status === 'completed');
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const QUIET_AFTER_DAYS = 8;
  const LAPSE_AFTER_DAYS = 21;

  function computeEngagement(list, nowMs = Date.now()) {
    const items = Array.isArray(list) ? list : [];
    if (!items.length) return { state: 'new', days: null, newest: null };
    const newest = items[0];
    const createdTime = Date.parse(newest && (newest.created_at || newest.updated_at));
    if (!Number.isFinite(createdTime)) return { state: 'new', days: null, newest: null };
    const days = Math.floor(Math.max(0, nowMs - createdTime) / DAY_MS);
    const state = days >= LAPSE_AFTER_DAYS ? 'lapsed' : (days >= QUIET_AFTER_DAYS ? 'quiet' : 'current');
    return { state, days, newest };
  }

  function computeReturnNotice(list, nowMs = Date.now()) {
    const eng = computeEngagement(list, nowMs);
    if (eng.state === 'lapsed') {
      const moveText = (eng.newest && eng.newest.next_action || 'your saved move').trim();
      return {
        state: 'lapsed',
        title: 'Welcome back.',
        moveName: moveText,
        text: 'Your last move was "' + moveText + '". You can pick it up or let it go below.'
      };
    }
    if (eng.state === 'quiet') {
      return {
        state: 'quiet',
        title: 'Good to see you again.',
        moveName: null,
        text: 'Your saved move is waiting below whenever you are ready.'
      };
    }
    return null;
  }

  function renderReturnNotice() {
    let noticeNode = el('navigator-return-notice');
    if (!noticeNode) {
      noticeNode = document.createElement('div');
      noticeNode.id = 'navigator-return-notice';
      noticeNode.className = 'nav-return-notice';
      const momentum = el('nav-momentum');
      if (momentum && momentum.parentNode) {
        momentum.parentNode.insertBefore(noticeNode, momentum.nextSibling);
      } else {
        const form = el('navigator-form');
        if (form && form.parentNode) form.parentNode.insertBefore(noticeNode, form);
      }
    }
    const notice = computeReturnNotice(moves, (typeof Date.now === 'function' ? Date.now() : new Date().getTime()));
    if (!notice) {
      noticeNode.hidden = true;
      noticeNode.innerHTML = '';
      noticeNode.removeAttribute('data-return-state');
      return;
    }
    noticeNode.hidden = false;
    noticeNode.setAttribute('data-return-state', notice.state);
    noticeNode.className = 'nav-return-notice nav-return-' + notice.state;
    if (notice.state === 'lapsed') {
      noticeNode.innerHTML =
        '<div class="nav-return-content">' +
          '<p class="nav-return-lead"><strong>' + escapeHtml(notice.title) + '</strong> ' +
          'Your last move was "' + escapeHtml(notice.moveName) + '". You can pick it up or let it go below.</p>' +
        '</div>';
    } else {
      noticeNode.innerHTML =
        '<div class="nav-return-content">' +
          '<p class="nav-return-lead"><strong>' + escapeHtml(notice.title) + '</strong> ' +
          escapeHtml(notice.text) + '</p>' +
        '</div>';
    }
  }

  // The return mechanic: a member arriving with history sees how far they have
  // come and the move still waiting, not an empty slot.
  function renderMomentum() {
    const strip = el('nav-momentum');
    if (!strip) return;
    const total = moves.length;
    if (!total) { strip.hidden = true; return; }
    const done = completedMoves().length;
    const open = openMoves().length;
    strip.hidden = false;
    strip.innerHTML =
      `<div class="nav-momentum-stats">` +
      `<span class="nav-momentum-count">${done}</span> move${done === 1 ? '' : 's'} completed` +
      (open ? ` &middot; <span class="nav-momentum-open">${open} waiting for you</span>` : '') +
      ` &middot; ${total} in all` +
      `</div>` +
      `<div class="nav-momentum-retention" style="margin-top: 6px; font-size: 13px; color: var(--studio-muted, #94a3b8);">When you stop, nothing is deleted. Every move stays.</div>`;
  }

  function renderResult(move) {
    const box = el('navigator-result');
    if (!box) return;
    if (!move) { box.hidden = true; return; }
    box.hidden = false;
    box.classList.toggle('completed', move.status === 'completed');
    box.classList.toggle('abandoned', move.status === 'abandoned');
    const head = box.querySelector('.nav-result-head');
    if (head) {
      const badge = move.status === 'completed' ? 'done' : (move.status === 'abandoned' ? 'let go' : 'open');
      head.innerHTML = `Your move <span class="nav-history-badge nav-badge-${escapeHtml(move.status)}">${badge}</span>`;
    }
    el('navigator-action').textContent = move.next_action || '';
    el('navigator-start').textContent = move.first_15_minutes || '';
    el('navigator-done').textContent = move.done_when || '';
    el('navigator-why').textContent = move.why_this_now || '';
    const flag = el('navigator-source');
    if (flag) {
      flag.hidden = move.source !== 'fallback';
      flag.textContent = move.source === 'fallback'
        ? 'A fresh tailored route was not available, so this is a safe fallback move you can make.'
        : '';
    }
    const completeBtn = el('navigator-complete');
    if (completeBtn) {
      completeBtn.hidden = move.status === 'completed' || move.status === 'abandoned';
      completeBtn.dataset.moveId = move.id || '';
    }
    let abandonBtn = el('navigator-abandon');
    if (!abandonBtn) {
      const actions = box.querySelector('.nav-result-actions');
      if (actions) {
        abandonBtn = document.createElement('button');
        abandonBtn.type = 'button';
        abandonBtn.id = 'navigator-abandon';
        abandonBtn.className = 'btn-secondary btn-nav-action';
        abandonBtn.innerHTML = '<span>Let it go</span>';
        const copyBtn = el('navigator-copy');
        if (copyBtn) actions.insertBefore(abandonBtn, copyBtn);
        else actions.appendChild(abandonBtn);
        abandonBtn.addEventListener('click', markAbandoned);
      }
    }
    if (abandonBtn) {
      abandonBtn.hidden = move.status === 'completed' || move.status === 'abandoned';
      abandonBtn.dataset.moveId = move.id || '';
    }
  }

  function renderHistory() {
    const list = el('navigator-history');
    if (!list) return;
    const prior = moves.slice(1); // the newest is shown as the current move
    if (!prior.length) { list.innerHTML = ''; return; }
    const rows = prior.map(move => {
      const badge = move.status === 'completed' ? 'done' : (move.status === 'abandoned' ? 'let go' : 'open');
      return `<li class="nav-history-row nav-history-${escapeHtml(move.status)}">
        <span class="nav-history-badge">${badge}</span>
        <span class="nav-history-text">${escapeHtml(move.next_action)}</span>
        <span class="nav-history-date">${formatDate(move.created_at)}</span>
      </li>`;
    }).join('');
    list.innerHTML = `<div class="nav-history-title">Earlier moves</div><ul class="nav-history-list">${rows}</ul>`;
  }

  function render() {
    renderMomentum();
    renderReturnNotice();
    renderResult(moves[0] || null);
    renderHistory();
    if (window.EEEStudio && window.EEEStudio.refreshIcons) window.EEEStudio.refreshIcons();
  }

  function setMessage(text, kind) {
    const node = el('navigator-message');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'eee-message' + (kind ? ' ' + kind : '');
  }

  async function chooseNextMove(event) {
    event.preventDefault();
    const button = el('navigator-submit');
    const input = {
      objective: (el('navigator-objective').value || '').trim(),
      current_reality: (el('navigator-reality').value || '').trim(),
      blocker: (el('navigator-blocker').value || '').trim(),
      available_time: (el('navigator-time').value || '').trim(),
      deadline: (el('navigator-deadline').value || '').trim()
    };
    if (!input.objective || !input.current_reality || !input.blocker || !input.available_time) {
      setMessage('Fill in the objective, where things stand, the blocker, and the time you have.', 'error');
      return;
    }
    button.disabled = true;
    const label = button.querySelector('span');
    if (label) label.textContent = 'Finding the route...';
    setMessage('Comparing the objective, blocker, and time available.');
    // One idempotency key per submission attempt. If the route is retried after a
    // flaky response the same key is reused, so the server-side unique index turns
    // the second write into a no-op rather than a duplicate move. WBR-005.
    if (!pendingIdempotencyKey) pendingIdempotencyKey = makeIdempotencyKey();
    try {
      const response = await fetch('/api/navigator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ctx.session.access_token },
        body: JSON.stringify(input)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The Navigator could not choose the next move.');
      if (data.safety || data.crisis) {
        pendingIdempotencyKey = null;
        renderResult(null);
        renderSafety(data.content || data.message);
        setMessage('Please reach out for help right now.', 'safety');
        return;
      }
      renderSafety(null);
      const row = buildRow(input, data, pendingIdempotencyKey);
      const { error } = await saveRow(ctx.sb, row);
      if (error) throw error;
      lastResult = row;
      // The write landed (or was a no-op for a duplicate key); this submission is
      // done, so the next one starts a fresh key.
      pendingIdempotencyKey = null;
      await loadMoves();
      render();
      setMessage(data.source === 'fallback'
        ? 'Saved. A fresh tailored route was not available, so this is a safe fallback move.'
        : 'Next move saved. It will be here when you come back.', 'success');
    } catch (error) {
      setMessage(error.message || 'The route did not finish. Nothing was lost.', 'error');
    } finally {
      button.disabled = false;
      if (label) label.textContent = 'Choose my next move';
    }
  }

  function renderSafety(text) {
    let card = el('navigator-safety-notice');
    if (!card) {
      card = document.createElement('div');
      card.id = 'navigator-safety-notice';
      card.className = 'nav-safety-notice';
      const form = el('navigator-form');
      if (form && form.parentNode) form.parentNode.insertBefore(card, form.nextSibling);
    }
    if (!text) {
      card.hidden = true;
      card.innerHTML = '';
      return;
    }
    card.hidden = false;
    card.innerHTML = '<div class="nav-safety-content" style="white-space: pre-wrap; line-height: 1.5; padding: 14px; border: 1px solid rgba(239,68,68,0.5); border-radius: 8px; background: rgba(239,68,68,0.08); margin: 16px 0;">' +
      escapeHtml(text) +
      '</div>';
  }

  async function markComplete(event) {
    const button = event.currentTarget;
    const moveId = button.dataset.moveId;
    if (!moveId) return;
    button.disabled = true;
    try {
      const { error } = await ctx.sb.from('navigator_moves')
        .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', moveId)
        .eq('user_id', ctx.profile.id);
      if (error) throw error;
      await loadMoves();
      render();
      setMessage('Marked complete. That is real progress, saved.', 'success');
    } catch (error) {
      setMessage(error.message || 'Could not mark that complete.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function markAbandoned(event) {
    const button = event.currentTarget;
    const moveId = button.dataset.moveId;
    if (!moveId) return;
    button.disabled = true;
    try {
      const { error } = await ctx.sb.from('navigator_moves')
        .update({ status: 'abandoned', updated_at: new Date().toISOString() })
        .eq('id', moveId)
        .eq('user_id', ctx.profile.id);
      if (error) throw error;
      await loadMoves();
      render();
      setMessage('Move let go. It stays in your history so nothing is lost.', 'success');
    } catch (error) {
      setMessage(error.message || 'Could not let that move go.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function startNew() {
    const form = el('navigator-form');
    if (form) form.reset();
    const timeField = el('navigator-time');
    if (timeField && !timeField.value) timeField.value = '1 hour';
    renderResult(null);
    renderSafety(null);
    const objective = el('navigator-objective');
    if (objective) objective.focus();
    setMessage('');
  }

  async function copyMove() {
    try {
      await navigator.clipboard.writeText((moves[0] && moves[0].next_action) || '');
      const span = el('navigator-copy') && el('navigator-copy').querySelector('span');
      if (span) {
        span.textContent = 'Copied';
        setTimeout(() => { span.textContent = 'Copy next move'; }, 1300);
      }
    } catch (error) {
      // Clipboard is a convenience; a failure is not worth a message.
    }
  }

  async function mount(context) {
    try {
      ctx = context;
      const form = el('navigator-form');
      if (!form) return; // Panel not on this page; nothing to do.
      form.addEventListener('submit', chooseNextMove);
      const complete = el('navigator-complete');
      if (complete) complete.addEventListener('click', markComplete);
      const abandon = el('navigator-abandon');
      if (abandon) abandon.addEventListener('click', markAbandoned);
      const copy = el('navigator-copy');
      if (copy) copy.addEventListener('click', copyMove);
      const fresh = el('navigator-new');
      if (fresh) fresh.addEventListener('click', startNew);
      const timeField = el('navigator-time');
      if (timeField && !timeField.value) timeField.value = '1 hour';
      await loadMoves();
      render();
    } catch (error) {
      // The move layer must never break the roadmap builder it sits beside.
      setMessage('Your saved moves could not load just now. Your roadmap is unaffected.', 'error');
    }
  }

  window.NavigatorMoves = { mount, computeEngagement, computeReturnNotice };
})();
