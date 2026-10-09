// WBR-373: what StorySculpt says to a member about time and state.
// Pure functions only, so scripts/check-storysculpt-member-states.mjs can run
// them in Node against seeded members. The thresholds match Certainty's
// documented rule (certainty_engagement, 8440213): under 8 days is current,
// 8 to 20 days is a quiet stretch, 21 days or more is a lapse.
// Member copy here carries no em dashes and no guilt words.
(function (root) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const QUIET_AFTER_DAYS = 8;
  const LAPSE_AFTER_DAYS = 21;
  // A long thread opens on the latest exchange. Above COLLAPSE_AFTER messages,
  // everything but the last KEEP_VISIBLE sits behind "Show earlier".
  const COLLAPSE_AFTER = 12;
  const KEEP_VISIBLE = 6;

  const INACTIVITY_LINE = 'Step away whenever you like. Nothing is deleted when you stop: your chats and scripts stay in your account until you delete them.';
  const FINISHED_LINE = 'This script is finished. Refine it with a note or start a new chat.';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function projectTime(project) {
    const t = Date.parse(project && (project.updated_at || project.created_at));
    return Number.isFinite(t) ? t : null;
  }

  // The member's most recent chat and how long ago they last touched any chat.
  // Read on page load, before this visit saves anything, so the visit itself
  // never resets the gap it is measuring.
  function engagement(projects, now) {
    const list = Array.isArray(projects) ? projects : [];
    let last = null;
    let lastTime = null;
    for (const project of list) {
      const t = projectTime(project);
      if (t != null && (lastTime == null || t > lastTime)) { last = project; lastTime = t; }
    }
    if (!last) return { state: 'new', days: null, lastChat: null };
    const days = Math.floor(Math.max(0, (now == null ? Date.now() : now) - lastTime) / DAY_MS);
    const state = days >= LAPSE_AFTER_DAYS ? 'lapsed' : (days >= QUIET_AFTER_DAYS ? 'quiet' : 'current');
    return { state, days, lastChat: last };
  }

  // The line shown on reopen. A lapse names the member's last chat and welcomes
  // them back; a quiet stretch is a gentle pointer and is never called a lapse;
  // a current member sees nothing.
  function returnNotice(projects, now) {
    const e = engagement(projects, now);
    if (e.state !== 'lapsed' && e.state !== 'quiet') return null;
    const title = (e.lastChat.title || '').trim() || 'Untitled script';
    if (e.state === 'lapsed') {
      return {
        state: 'lapsed',
        projectId: e.lastChat.id,
        title: 'Welcome back.',
        text: 'Your last chat, "' + title + '", is right where you left it. Pick it up or start something new.'
      };
    }
    return {
      state: 'quiet',
      projectId: e.lastChat.id,
      title: 'Good to see you.',
      text: '"' + title + '" is open where you left off.'
    };
  }

  function returnNoticeMarkup(notice) {
    if (!notice) return '';
    return '<div class="story-return-notice ' + escapeHtml(notice.state) + '" role="status" data-return-state="' + escapeHtml(notice.state) + '">' +
      '<p><strong>' + escapeHtml(notice.title) + '</strong> ' + escapeHtml(notice.text) + '</p>' +
      '<button class="icon-button story-return-dismiss" type="button" data-return-dismiss="true" aria-label="Dismiss"><i data-lucide="x"></i></button>' +
    '</div>';
  }

  // Which messages of a thread to render. Indices stay absolute so copy,
  // promote and step actions keep pointing at the right message.
  function threadWindow(length, expanded) {
    const total = Math.max(0, Number(length) || 0);
    if (expanded || total <= COLLAPSE_AFTER) return { start: 0, hidden: 0 };
    const start = total - KEEP_VISIBLE;
    return { start, hidden: start };
  }

  function showEarlierMarkup(hidden) {
    if (!hidden) return '';
    const label = hidden === 1 ? 'Show earlier (1 message)' : 'Show earlier (' + hidden + ' messages)';
    return '<div class="story-show-earlier-wrap"><button class="story-show-earlier" type="button" data-show-earlier="true" aria-expanded="false">' +
      '<i data-lucide="chevrons-up"></i><span>' + escapeHtml(label) + '</span></button></div>';
  }

  const api = {
    DAY_MS, QUIET_AFTER_DAYS, LAPSE_AFTER_DAYS, COLLAPSE_AFTER, KEEP_VISIBLE,
    INACTIVITY_LINE, FINISHED_LINE,
    engagement, returnNotice, returnNoticeMarkup, threadWindow, showEarlierMarkup
  };
  root.StorySculptStates = api;
})(typeof window !== 'undefined' ? window : globalThis);
