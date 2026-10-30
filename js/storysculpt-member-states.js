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
  // everything but the last KEEP_VISIBLE sits behind "Show earlier answers".
  // UX 70, 71 (WBR-462): the last 12 stay, so the current state is readable
  // without opening anything.
  const COLLAPSE_AFTER = 12;
  const KEEP_VISIBLE = 12;

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

  // UX 82: quote the last usable earlier answer instead of inventing a recap.
  // Excluded answers stay available behind the control, not in the reminder.
  function earlierAnswerExcerpt(conversation, hidden) {
    const earlier = Array.isArray(conversation) ? conversation.slice(0, hidden) : [];
    for (let i = earlier.length - 1; i >= 0; i--) {
      const message = earlier[i];
      if (!message || message.role !== 'user' || message.excludeFromGeneration === true || typeof message.content !== 'string') continue;
      const text = message.content.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const characters = Array.from(text);
      return characters.slice(0, 140).join('') + (characters.length > 140 ? '…' : '');
    }
    return '';
  }

  function showEarlierMarkup(hidden, conversation) {
    if (!hidden) return '';
    const label = hidden === 1 ? 'Show earlier answers (1 message)' : 'Show earlier answers (' + hidden + ' messages)';
    const excerpt = earlierAnswerExcerpt(conversation, hidden);
    return '<div class="story-show-earlier-wrap"><button class="story-show-earlier" type="button" data-show-earlier="true" aria-expanded="false" aria-controls="story-conversation">' +
      '<i data-lucide="chevrons-up"></i><span>' + escapeHtml(label) + '</span></button></div>' +
      (excerpt ? '<p class="story-earlier-summary">Last earlier answer: “' + escapeHtml(excerpt) + '”</p>' : '');
  }

  // UX 54: a dismissed return notice stays dismissed for that chat. The chat
  // remembers which last-touched timestamp it was dismissed for, so it only
  // comes back after the member touches a chat again and a new gap opens.
  function returnNoticeFor(projects, now) {
    const notice = returnNotice(projects, now);
    if (!notice) return null;
    const e = engagement(projects, now);
    const chat = e.lastChat;
    const touched = chat && (chat.updated_at || chat.created_at);
    const dismissed = chat && chat.intake && chat.intake.returnDismissedFor;
    if (dismissed && touched && dismissed === touched) return null;
    return notice;
  }

  // The value stored on the chat when its notice is dismissed.
  function dismissalStamp(project) {
    return project ? (project.updated_at || project.created_at || null) : null;
  }

  // WBR-373 progress (Stranger 52, 55, 57; UX 13, 45). Only a finished script
  // counts, and only a finished script can be filmed. An empty or abandoned
  // chat adds nothing. No points, no streaks.
  function isFinished(project) {
    return Boolean(project && typeof project.output === 'string' && project.output.trim());
  }

  function isFilmed(project) {
    return isFinished(project) && Boolean(project.intake && project.intake.filmed);
  }

  // When a script was first finished: its first saved version, else the last
  // time the chat was touched.
  function finishedTime(project) {
    const versions = project && project.intake && Array.isArray(project.intake.versions) ? project.intake.versions : [];
    const first = versions.length ? Date.parse(versions[0].createdAt) : NaN;
    if (Number.isFinite(first)) return first;
    return projectTime(project);
  }

  function progress(projects, now) {
    const at = now == null ? Date.now() : now;
    const list = (Array.isArray(projects) ? projects : []).filter(isFinished);
    let last30 = 0;
    let prior30 = 0;
    let lastFinished = null;
    for (const project of list) {
      const t = finishedTime(project);
      if (t == null) continue;
      if (lastFinished == null || t > lastFinished) lastFinished = t;
      const age = at - t;
      if (age >= 0 && age < 30 * DAY_MS) last30 += 1;
      else if (age >= 30 * DAY_MS && age < 60 * DAY_MS) prior30 += 1;
    }
    return { finished: list.length, filmed: list.filter(isFilmed).length, last30, prior30, lastFinished };
  }

  function countWord(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  // One plain line comparing the last 30 days with the 30 before.
  function progressLine(p) {
    if (!p || !p.finished) return 'Finish a script and it counts here.';
    if (!p.last30 && !p.prior30) return 'None finished in the last 60 days. Every script you finished is still here.';
    const now = countWord(p.last30, 'script', 'scripts') + ' finished in the last 30 days';
    if (p.last30 === p.prior30) return now + ', the same as the 30 days before.';
    return now + ', ' + (p.last30 > p.prior30 ? 'up from ' : 'down from ') + p.prior30 + ' the 30 days before.';
  }

  function progressMarkup(p) {
    const finishedCount = p ? p.finished : 0;
    const filmedCount = p ? p.filmed : 0;
    const stats = '<span class="story-progress-stat"><strong>' + finishedCount + '</strong> finished</span>' +
      '<span class="story-progress-stat"><strong>' + filmedCount + '</strong> filmed</span>';
    return '<div class="story-progress" data-finished="' + finishedCount + '" data-filmed="' + filmedCount + '">' +
      '<p class="story-progress-head">Your scripts</p>' +
      '<div class="story-progress-stats">' + stats + '</div>' +
      '<p class="story-progress-line">' + escapeHtml(progressLine(p)) + '</p>' +
    '</div>';
  }

  // UX 36: one next step, rendered by the rail, the finished-script footer and
  // Help, so the three never disagree.
  function memberStep(project) {
    if (!project) return 'start';
    if (!isFinished(project)) return 'interview';
    return isFilmed(project) ? 'filmed' : 'film';
  }

  const NEXT_STEPS = {
    start: { action: 'new', label: 'Start a script', text: 'Pick a format to start a script. StorySculpt asks one question at a time.' },
    interview: { action: 'continue', label: 'Continue', text: 'Answer the next question to finish this script.' },
    film: { action: 'film', label: 'Mark filmed', text: 'Film this script, then mark it Filmed.' },
    filmed: { action: 'new', label: 'New chat', text: 'This one is filmed. Start your next script.' }
  };

  function nextStep(state) {
    const key = typeof state === 'string' ? state : memberStep(state);
    const step = NEXT_STEPS[key] || NEXT_STEPS.start;
    return { state: key, action: step.action, label: step.label, text: step.text };
  }

  function nextStepMarkup(step, surface) {
    if (!step) return '';
    return '<div class="story-next-step" data-next-state="' + escapeHtml(step.state) + '" data-surface="' + escapeHtml(surface || '') + '">' +
      '<p><strong>Next:</strong> <span class="story-next-step-text">' + escapeHtml(step.text) + '</span></p>' +
      '<button class="secondary-button story-next-step-btn" type="button" data-next-action="' + escapeHtml(step.action) + '">' + escapeHtml(step.label) + '</button>' +
    '</div>';
  }

  // UX 57: version pills. Only the newest version is ever called latest, and a
  // choice to view an older version lapses as soon as a newer one is saved
  // (seenLength is how many versions existed when the member chose it).
  function versionView(versions, viewingIndex, seenLength) {
    const list = Array.isArray(versions) ? versions : [];
    const last = list.length - 1;
    let index = Number.isInteger(viewingIndex) ? viewingIndex : -1;
    if (index !== -1 && (index > last || seenLength !== list.length)) index = -1;
    const pills = list.map((v, idx) => {
      const isLatest = idx === last;
      return {
        index: idx,
        latest: isLatest,
        active: index === -1 ? isLatest : index === idx,
        label: 'v' + v.version + (v.kind === 'points' ? ' points' : '') + (isLatest ? ' (latest)' : '')
      };
    });
    const older = index !== -1 && index < last;
    return { index, older, pills, banner: older ? 'Viewing Version ' + list[index].version + (list[index].note ? ' (' + list[index].note + ')' : '') : '' };
  }

  // UX 37: a script leaves StorySculpt as a plain text file named for its chat.
  function exportFileName(title) {
    const base = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return (base || 'storysculpt-script') + '.txt';
  }

  // WBR-462 (Stranger 26, 45, 57, 65; UX 11, 41, 44): on a return visit, name
  // where the member left off and what the next script could build on.
  // Plain sentences, coworker register, zero em dashes.
  function returnVisitLine(projects) {
    const list = Array.isArray(projects) ? projects.filter(p => !p.archived) : [];
    if (!list.length) return null;
    const recent = list[0];
    const rawTitle = (recent && recent.title || '').trim();
    const title = rawTitle || 'Untitled script';
    const finished = isFinished(recent);
    const filmed = isFilmed(recent);
    if (filmed) {
      return 'You filmed “' + title + '”. Start your next script to explore another angle or answer the next question from your audience.';
    }
    if (finished) {
      return 'You finished “' + title + '”. Record and mark it filmed, or start your next script to build on that proof with a new story.';
    }
    return 'You left off on “' + title + '”. Pick up that interview where you stopped, or start your next script to test a different hook.';
  }

  const api = {
    DAY_MS, QUIET_AFTER_DAYS, LAPSE_AFTER_DAYS, COLLAPSE_AFTER, KEEP_VISIBLE,
    INACTIVITY_LINE, FINISHED_LINE,
    engagement, returnNotice, exportFileName, returnNoticeMarkup, threadWindow, showEarlierMarkup, earlierAnswerExcerpt,
    returnNoticeFor, dismissalStamp, isFinished, isFilmed, finishedTime, progress, progressLine, progressMarkup,
    memberStep, nextStep, nextStepMarkup, versionView, returnVisitLine
  };
  root.StorySculptStates = api;
})(typeof window !== 'undefined' ? window : globalThis);
