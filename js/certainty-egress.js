/* Certainty's calm quota pause. The last good upcoming session stays visible. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CertaintyEgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var CACHE_KEY = 'certainty_last_good_upcoming_v1';

  function isPaused(data) {
    return Boolean(data && (data.code === 'SESSIONS_PAUSED' || data.code === 'exceed_egress_quota'));
  }

  function saveLastGood(storage, state, memberId) {
    if (!storage || !state || !memberId) return;
    try {
      // A confirmed empty state must replace a cancelled or old booking too.
      storage.setItem(CACHE_KEY, JSON.stringify({ memberId: memberId, savedAt: new Date().toISOString(), upcoming: state.upcoming || null }));
    } catch (e) { /* A full or blocked store never breaks booking. */ }
  }

  function lastGood(storage, memberId) {
    if (!storage || !memberId) return null;
    try {
      var saved = JSON.parse(storage.getItem(CACHE_KEY) || 'null');
      return saved && saved.memberId === memberId && saved.upcoming ? saved.upcoming : null;
    } catch (e) { return null; }
  }

  function recoveryLabel(retryAfter, now) {
    var date = new Date(retryAfter || (new Date(now || Date.now()).getTime() + 3 * 3600000));
    if (Number.isNaN(date.getTime())) return 'Try again in about three hours.';
    return 'Booking is expected back by ' + new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(date) + '.';
  }

  function pausedCopy(retryAfter, now) {
    return {
      title: 'Booking is paused for a few hours, your session is safe',
      recovery: recoveryLabel(retryAfter, now)
    };
  }

  // Operates on the existing primary session region, never a new main-screen card.
  function showPaused(document, upcoming, retryAfter, now, refresh) {
    var copy = pausedCopy(retryAfter, now);
    var gate = document.getElementById('eee-access-gate');
    var app = document.getElementById('eee-app');
    var skeleton = document.getElementById('cs-state-skeleton');
    var hero = document.getElementById('cs-hero');
    var primary = document.getElementById('cs-primary');
    var message = document.getElementById('cs-session-msg');
    if (skeleton) skeleton.classList.add('cs-hide');
    if (upcoming && primary && hero) {
      if (app) app.hidden = false;
      if (gate) gate.hidden = true;
      hero.classList.remove('cs-hide');
      if (message) {
        message.textContent = copy.title + '. ' + copy.recovery;
        message.className = 'cs-msg ok';
      }
      var day = primary.querySelector('.cs-next-day');
      var time = primary.querySelector('.cs-next-time');
      if (day) day.textContent = upcoming.label_day || '';
      if (time) time.textContent = (upcoming.label_start || '') + ' – ' + (upcoming.label_end || '') + ' ET';
      return { visible: 'session-and-pause', upcoming: upcoming, copy: copy };
    }
    if (app) app.hidden = true;
    if (gate) gate.hidden = false;
    var title = document.getElementById('eee-gate-title');
    var detail = document.getElementById('eee-gate-copy');
    var button = document.getElementById('eee-gate-button');
    if (title) title.textContent = copy.title;
    if (detail) detail.textContent = 'Your last confirmed booking remains on your account. ' + copy.recovery;
    if (button) {
      button.textContent = 'Try again';
      button.href = '#';
      button.onclick = function (event) {
        event.preventDefault();
        if (typeof refresh === 'function') refresh();
      };
    }
    return { visible: 'pause', upcoming: null, copy: copy };
  }

  return {
    isPaused: isPaused,
    saveLastGood: saveLastGood,
    lastGood: lastGood,
    pausedCopy: pausedCopy,
    showPaused: showPaused
  };
});
