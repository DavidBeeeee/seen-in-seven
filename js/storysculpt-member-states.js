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
  const FINISHING_LOCK_LINE = 'Finishing locks the interview so your script stays stable; you can refine the finished script with a note anytime.';
  const MEMBERSHIP_LAPSE_LINE = 'A lapsed membership pauses new scripts, interview generation, and revisions while keeping your saved chats, scripts, and story profile intact.';
  const PROFILE_STALE_DAYS = 30;

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
  // never resets the gap it is measuring. UX 47 (WBR-462): also count separate
  // 21-day gaps between the member's saved chats so a repeated lapse across
  // chats is distinguished from a single long one using the 21-day threshold.
  function engagement(projects, now) {
    const list = Array.isArray(projects) ? projects : [];
    let last = null;
    let lastTime = null;
    const stamps = [];
    for (const project of list) {
      const t = projectTime(project);
      if (t != null) {
        stamps.push(t);
        if (lastTime == null || t > lastTime) { last = project; lastTime = t; }
      }
    }
    if (!last) return { state: 'new', days: null, lastChat: null, repeated: false, lapseCount: 0 };
    const at = now == null ? Date.now() : now;
    const days = Math.floor(Math.max(0, at - lastTime) / DAY_MS);
    const state = days >= LAPSE_AFTER_DAYS ? 'lapsed' : (days >= QUIET_AFTER_DAYS ? 'quiet' : 'current');
    stamps.sort((a, b) => a - b);
    let priorLapses = 0;
    for (let i = 1; i < stamps.length; i++) {
      if (stamps[i] - stamps[i - 1] >= LAPSE_AFTER_DAYS * DAY_MS) priorLapses += 1;
    }
    const lapseCount = (state === 'lapsed' ? 1 : 0) + priorLapses;
    const repeated = state === 'lapsed' && lapseCount >= 2;
    return { state, days, lastChat: last, repeated, lapseCount };
  }

  // The line shown on reopen. A lapse names the member's last chat and welcomes
  // them back; a quiet stretch is a gentle pointer and is never called a lapse;
  // a current member sees nothing.
  function returnNotice(projects, now, repeated = false) {
    const e = engagement(projects, now);
    if (e.state !== 'lapsed' && e.state !== 'quiet') return null;
    const title = (e.lastChat.title || '').trim() || 'Untitled script';
    const isRepeated = Boolean(repeated || e.repeated);
    if (e.state === 'lapsed') {
      return {
        state: 'lapsed',
        projectId: e.lastChat.id,
        title: 'Welcome back.',
        repeated: isRepeated,
        text: (isRepeated ? 'Another stretch away is okay. ' : '') + 'Your last chat, "' + title + '", is right where you left it. Pick it up or start something new.'
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
  function returnNoticeFor(projects, now, history = {}) {
    const e = engagement(projects, now);
    const at = now == null ? Date.now() : now;
    let repeated = false;
    // Device-local, account-scoped observations, not an invented history of
    // visits we cannot see. Reloading the same gap never counts it twice.
    if (e.state === 'lapsed' && history.owner && history.storage) {
      try {
        const key = 'storysculpt-return-gaps:' + history.owner;
        const prior = JSON.parse(history.storage.getItem(key) || 'null');
        const lastActivity = projectTime(e.lastChat);
        const valid = prior && Number.isFinite(prior.returnedAt) && prior.returnedAt <= at && Number.isFinite(prior.lastActivity) && prior.lastActivity <= lastActivity && [1, 2].includes(prior.count);
        const count = valid ? (lastActivity > prior.returnedAt ? 2 : prior.count) : 1;
        repeated = count === 2;
        history.storage.setItem(key, JSON.stringify({ count, returnedAt: valid && lastActivity <= prior.returnedAt ? prior.returnedAt : at, lastActivity }));
      } catch (_) { /* Unavailable storage must not block returning to a chat. */ }
    }
    const notice = returnNotice(projects, now, repeated);
    if (!notice) return null;
    const chat = e.lastChat;
    const touched = chat && (chat.updated_at || chat.created_at);
    const dismissed = chat && chat.intake && chat.intake.returnDismissedFor;
    if (dismissed && touched && dismissed === touched) return null;
    return notice;
  }

  function refreshReturnNotice(notice, projects) {
    if (!notice) return null;
    const project = projects.find(p => p.id === notice.projectId && !p.archived);
    if (!project) return null;
    // Keep the measured gap and dismissal state, but never a stale chat name.
    const title = (project.title || '').trim() || 'Untitled script';
    return { ...notice, text: notice.state === 'lapsed'
      ? (notice.repeated ? 'Another stretch away is okay. ' : '') + 'Your last chat, "' + title + '", is right where you left it. Pick it up or start something new.'
      : '"' + title + '" is open where you left off.' };
  }

  // The value stored on the chat when its notice is dismissed.
  function dismissalStamp(project) {
    return project ? (project.updated_at || project.created_at || null) : null;
  }

  // WBR-373 & WBR-462 progress (Stranger 44, 48, 52, 54, 55, 57; UX 13, 17, 18, 19, 45, 46).
  // Only a finished script counts, and once a script has a saved version in
  // intake.versions no later mistake erases its finished count (UX 46).
  function isFinished(project) {
    if (!project) return false;
    if (typeof project.output === 'string' && project.output.trim()) return true;
    const versions = project.intake && Array.isArray(project.intake.versions) ? project.intake.versions : [];
    return versions.some(v => v && typeof v.content === 'string' && v.content.trim());
  }

  function isFilmed(project) {
    return isFinished(project) && Boolean(project.intake && project.intake.filmed);
  }

  function isPosted(project) {
    return isFilmed(project) && Boolean(project.intake && project.intake.posted);
  }

  // UX 17, 18, 19: graded feedback scale where finishing, filming, and posting
  // are distinct events with different weight.
  const FEEDBACK_SCALE = Object.freeze({
    drafting: { stage: 'drafting', weight: 0, label: 'In progress', headline: 'Draft in progress.', detail: 'Answer the current step to finish this script.' },
    finished: { stage: 'finished', weight: 1, label: 'Finished', headline: 'Script finished.', detail: 'The words are ready. Record it on camera to move from draft to filmed.' },
    filmed: { stage: 'filmed', weight: 2, label: 'Filmed', headline: 'Video filmed.', detail: 'Recording on camera carries more weight than a draft alone. Share it with your audience and mark it posted when it goes live.' },
    posted: { stage: 'posted', weight: 3, label: 'Posted', headline: 'Video posted.', detail: 'Published to your audience. You took this story all the way from blank page to live video.' }
  });

  function feedbackScale(project) {
    if (isPosted(project)) return FEEDBACK_SCALE.posted;
    if (isFilmed(project)) return FEEDBACK_SCALE.filmed;
    if (isFinished(project)) return FEEDBACK_SCALE.finished;
    return FEEDBACK_SCALE.drafting;
  }

  // Stranger 48: a project that finishes early or in fewer turns says so.
  const EXPECTED_INTERVIEW_TURNS = Object.freeze({ bold: 6, mini: 6, rant: 7, ugc: 3 });

  function earlyFinishLine(project) {
    if (!isFinished(project)) return null;
    const mode = String((project && project.content_type) || 'rant').toLowerCase();
    const expected = EXPECTED_INTERVIEW_TURNS[mode] || 6;
    const turns = Array.isArray(project && project.conversation)
      ? project.conversation.filter(m => m && m.role === 'user' && typeof m.content === 'string' && m.content.trim().length > 0).length
      : 0;
    const flaggedEarly = Boolean(project && project.intake && project.intake.finishedEarly);
    if (!flaggedEarly && (turns === 0 || turns >= expected)) return null;
    const stepPhrase = turns === 1 ? '1 answer' : (turns + ' answers');
    return 'Finished early in ' + stepPhrase + ' (instead of the usual ' + expected + ') because your story already carried the hook, proof, and call to action.';
  }

  // Stranger 52, 54, 55: sincere effort is recognised by what the member did
  // (answered steps, revised, filmed, posted), never by clicks or empty activity.
  function effortRecognition(project) {
    if (!project || typeof project !== 'object') {
      return { sincere: false, weight: 0, answeredSteps: 0, revisions: 0, filmed: false, posted: false, line: '' };
    }
    const conversation = Array.isArray(project.conversation) ? project.conversation : [];
    const answeredSteps = conversation.filter(m => {
      if (!m || m.role !== 'user' || typeof m.content !== 'string') return false;
      const clean = m.content.replace(/\s+/g, ' ').trim();
      return clean.length >= 2;
    }).length;
    const versions = project.intake && Array.isArray(project.intake.versions) ? project.intake.versions : [];
    const revisions = Math.max(0, versions.length - 1);
    const filmed = isFilmed(project);
    const posted = isPosted(project);
    const finished = isFinished(project);
    const sincere = answeredSteps > 0 || revisions > 0 || finished || filmed || posted;
    if (!sincere) {
      return { sincere: false, weight: 0, answeredSteps: 0, revisions: 0, filmed: false, posted: false, line: '' };
    }
    const parts = [];
    if (answeredSteps > 0) parts.push('answered ' + countWord(answeredSteps, 'interview step', 'interview steps'));
    if (revisions > 0) parts.push('revised ' + countWord(revisions, 'time', 'times'));
    if (filmed) parts.push('filmed the script');
    if (posted) parts.push('posted the video');
    const scale = feedbackScale(project);
    const weight = scale.weight + (revisions > 0 ? 1 : 0) + (answeredSteps >= 3 ? 1 : 0);
    return {
      sincere: true,
      weight,
      answeredSteps,
      revisions,
      filmed,
      posted,
      line: 'Effort recorded from what you did: you ' + parts.join(', ') + '.'
    };
  }

  // UX 13: a member returning to maintain an old script is told apart from one
  // recovering from a long gap.
  function returnContext(projects, targetProject, now) {
    const at = now == null ? Date.now() : now;
    const overall = engagement(projects, at);
    const targetTime = projectTime(targetProject);
    const targetAgeDays = targetTime != null ? Math.floor(Math.max(0, at - targetTime) / DAY_MS) : 0;
    const title = ((targetProject && targetProject.title) || '').trim() || 'Untitled script';
    if (targetProject && isFinished(targetProject) && targetAgeDays >= LAPSE_AFTER_DAYS && overall.state !== 'lapsed') {
      return {
        kind: 'maintaining',
        lapsed: false,
        days: targetAgeDays,
        title: 'Maintaining an earlier script.',
        text: 'You are updating "' + title + '" from ' + targetAgeDays + ' days ago while your library stays current. Revise it with a note or save a fresh version.'
      };
    }
    if (overall.state === 'lapsed') {
      const notice = returnNotice(projects, at, overall.repeated);
      return {
        kind: 'recovering',
        lapsed: true,
        days: overall.days,
        title: notice ? notice.title : 'Welcome back.',
        text: notice ? notice.text : 'Pick up where you left off or start something new.'
      };
    }
    return {
      kind: 'current',
      lapsed: false,
      days: overall.days || 0,
      title: '',
      text: ''
    };
  }

  // Stranger 44: a script carries a stated objective the member picked (who it
  // is for and what they should do next) so it can be classified.
  function scriptObjective(project) {
    const raw = project && project.intake && project.intake.objective;
    if (!raw || typeof raw !== 'object') return null;
    const audience = String(raw.audience || '').replace(/\s+/g, ' ').trim();
    const nextAction = String(raw.nextAction || '').replace(/\s+/g, ' ').trim();
    if (!audience && !nextAction) return null;
    const category = /buy|order|book|apply|shop|sign up|join|client|customer/i.test(nextAction)
      ? 'conversion'
      : /comment|reply|share|answer|tell me|dm|message/i.test(nextAction)
        ? 'conversation'
        : 'awareness';
    return {
      audience: audience || 'General audience',
      nextAction: nextAction || 'Consider the takeaway',
      category,
      summary: 'For ' + (audience || 'your audience') + ' -> Next action: ' + (nextAction || 'consider the takeaway') + ' (' + category + ')'
    };
  }

  function withScriptObjective(project, audience, nextAction) {
    if (!project || typeof project !== 'object') return project;
    const cleanAudience = String(audience || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const cleanAction = String(nextAction || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const intake = Object.assign({}, project.intake, {
      objective: {
        audience: cleanAudience,
        nextAction: cleanAction,
        updatedAt: new Date().toISOString()
      }
    });
    return Object.assign({}, project, { intake });
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
    const filmedCount = list.filter(isFilmed).length;
    const postedCount = list.filter(isPosted).length;
    return {
      finished: list.length,
      filmed: filmedCount,
      posted: postedCount,
      last30,
      prior30,
      thisMonth: last30,
      lastMonth: prior30,
      lastFinished
    };
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

  // UX 45, 46: long-period change shown as month over month, never erased by a mistake.
  function monthOverMonthLine(p) {
    if (!p || !p.finished) return 'Month over month: 0 this month vs 0 last month.';
    const cur = Number(p.thisMonth ?? p.last30 ?? 0);
    const prev = Number(p.lastMonth ?? p.prior30 ?? 0);
    if (!cur && !prev) return 'Month over month: 0 finished this month vs 0 last month. Your ' + countWord(p.finished, 'finished script stays', 'finished scripts stay') + ' on record.';
    if (cur === prev) return 'Month over month: ' + countWord(cur, 'script', 'scripts') + ' this month, matching ' + prev + ' last month.';
    const dir = cur > prev ? 'up from ' : 'down from ';
    return 'Month over month: ' + countWord(cur, 'script', 'scripts') + ' this month, ' + dir + prev + ' last month.';
  }

  function progressMarkup(p) {
    const finishedCount = p ? p.finished : 0;
    const filmedCount = p ? p.filmed : 0;
    const postedCount = p && typeof p.posted === 'number' ? p.posted : 0;
    const stats = '<span class="story-progress-stat"><strong>' + finishedCount + '</strong> finished</span>' +
      '<span class="story-progress-stat"><strong>' + filmedCount + '</strong> filmed</span>' +
      '<span class="story-progress-stat"><strong>' + postedCount + '</strong> posted</span>';
    return '<div class="story-progress" data-finished="' + finishedCount + '" data-filmed="' + filmedCount + '" data-posted="' + postedCount + '">' +
      '<p class="story-progress-head">Your scripts</p>' +
      '<div class="story-progress-stats">' + stats + '</div>' +
      '<p class="story-progress-line">' + escapeHtml(progressLine(p)) + '</p>' +
      '<p class="story-progress-mom">' + escapeHtml(monthOverMonthLine(p)) + '</p>' +
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
    const recent = engagement(list).lastChat || list[0];
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

  // WBR-462: story profile freshness and refresh offer (Stranger 45).
  function profileFreshness(updatedAt, now) {
    if (!updatedAt) {
      return {
        state: 'new',
        days: null,
        stale: false,
        line: 'Set your story profile once so every chat remembers your standing facts, audience, and voice.',
        offer: null
      };
    }
    const at = now == null ? Date.now() : now;
    const t = typeof updatedAt === 'string' ? Date.parse(updatedAt) : Number(updatedAt);
    if (!Number.isFinite(t)) {
      return {
        state: 'new',
        days: null,
        stale: false,
        line: 'Set your story profile once so every chat remembers your standing facts, audience, and voice.',
        offer: null
      };
    }
    const days = Math.floor(Math.max(0, at - t) / DAY_MS);
    if (days >= PROFILE_STALE_DAYS) {
      return {
        state: 'stale',
        days,
        stale: true,
        line: 'Story profile updated ' + days + ' days ago.',
        offer: 'Review your audience, offers, or facts to keep future scripts current.'
      };
    }
    return {
      state: 'fresh',
      days,
      stale: false,
      line: days === 0 ? 'Story profile updated today.' : 'Story profile updated ' + countWord(days, 'day', 'days') + ' ago.',
      offer: null
    };
  }

  function profileFreshnessMarkup(freshness) {
    if (!freshness || freshness.state === 'new') return '';
    if (freshness.stale) {
      return '<div class="story-memory-freshness is-stale" role="status" data-stale="true" data-days="' + freshness.days + '">' +
        '<p><strong>' + escapeHtml(freshness.line) + '</strong> ' + escapeHtml(freshness.offer) + '</p>' +
        '<button class="subtle-button story-refresh-profile-btn" id="mem-refresh-offer" type="button">Review details</button>' +
      '</div>';
    }
    return '<div class="story-memory-freshness is-fresh" role="status" data-stale="false" data-days="' + freshness.days + '">' +
      '<p>' + escapeHtml(freshness.line) + '</p>' +
    '</div>';
  }

  // WBR-462 (WO-20261101-latemorning & WO-20261101-agnight):
  // 1. Broad-answer narrowing question, bounded in code with a canonical fixture.
  // 2. Interrupted step resume at the exact step with the member's last answer kept.
  // 3. Status-line reasons naming why the screen changed, when an earlier answer
  //    shaped a question, and reserving strongest praise for the finished script.
  // 4. New-chat memory preview, per-chat leave-out, one-time remembered-line
  //    surfacing, and suppression of stale details the member has corrected.
  // 5. Settings summary showing format, color theme, and story profile in one place.

  const BROAD_ANSWER_FIXTURE = Object.freeze({
    fiveTopics: 'I want to talk about 1) how I priced my first coaching offer too low, 2) why hiring a virtual assistant too early burned me out, 3) moving my studio to Denver after college, 4) my daily morning walk routine, and 5) how I onboard new clients on Mondays.',
    lifeStory: 'Here is my whole life story from growing up in Ohio to college, my first corporate job in accounting, starting a photography side hustle in 2016, burning out during the pandemic, switching to coaching, and launching three different courses over the last decade.',
    focusedFollowup: 'Let us focus on pricing my first coaching offer too low.'
  });

  const NARROW_ELIGIBLE_STEPS = new Set(['', 'start', 'B1', 'M1', 'R1', 'R2']);
  const LIFE_STAGE_PATTERNS = [
    /\bwhole life story\b/i,
    /\bgrowing up\b/i,
    /\bchildhood\b/i,
    /\bhigh school\b/i,
    /\bcollege\b/i,
    /\bfirst (?:corporate )?job\b/i,
    /\bside hustle\b/i,
    /\bpandemic\b/i,
    /\bover the last decade\b/i
  ];

  function extractBroadTopics(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const numbered = [];
    const numRe = /(?:^|\s)(?:\d+[.)]|[-*•])\s*([^;\n]+?)(?=(?:\s+\d+[.)]|\s+[-*•]|;|\n|$))/g;
    let m;
    while ((m = numRe.exec(clean)) !== null) {
      const item = m[1].replace(/^(?:and\s+)/i, '').replace(/[,.]+$/, '').trim();
      if (item.length >= 4) numbered.push(item.slice(0, 70));
    }
    if (numbered.length >= 3) return numbered.slice(0, 6);

    const clauses = clean
      .split(/(?:;|,\s+and\s+|\s+and also\s+|\s+plus\s+|,\s*(?=(?:how|why|when|moving|starting|burning|switching|launching|my|hiring|pricing)\b))/i)
      .map(part => part.replace(/^(?:i want to talk about|here is my whole life story from|about)\s+/i, '').replace(/[,.]+$/, '').trim())
      .filter(part => part.split(/\s+/).length >= 3);
    if (clauses.length >= 4) return clauses.slice(0, 6);
    return [];
  }

  function broadAnswerCheck(answer, conversation, currentStep) {
    const text = String(answer || '').replace(/\s+/g, ' ').trim();
    const step = String(currentStep || '').trim();
    const list = Array.isArray(conversation) ? conversation : [];
    if (!text || text.split(/\s+/).length < 18) return { broad: false, reason: 'short' };
    if (step && !NARROW_ELIGIBLE_STEPS.has(step)) return { broad: false, reason: 'step-ineligible' };
    const alreadyNarrowed = list.some(turn => turn && turn.role === 'assistant' && (turn.step === 'narrow' || turn.narrowingQuestion === true));
    if (alreadyNarrowed) return { broad: false, reason: 'already-narrowed' };

    const topics = extractBroadTopics(text);
    const lifeHits = LIFE_STAGE_PATTERNS.filter(re => re.test(text)).length;
    const isLifeStory = /\bwhole life story\b/i.test(text) || lifeHits >= 3;
    if (topics.length < 4 && !isLifeStory) {
      return { broad: false, reason: 'focused' };
    }
    const named = topics.slice(0, 3).map(t => t.length > 48 ? t.slice(0, 45).trim() + '...' : t);
    const question = named.length >= 2
      ? 'You named several distinct stories here (' + named.join('; ') + '). One short video lands best when it turns on a single moment. Which one of those should we build this script around first?'
      : 'That spans a whole life story across several chapters. One short video lands best when it turns on a single moment. Which one moment or topic from what you shared should we build this script around first?';
    const statusLine = 'Screen stayed on this step to ask one narrowing question because your answer covered several topics at once.';
    return {
      broad: true,
      topics: topics.length ? topics : ['multiple life chapters'],
      question,
      statusLine
    };
  }

  function defaultStepForMode(mode) {
    const m = String(mode || '').toLowerCase();
    if (m === 'bold') return 'B1';
    if (m === 'mini') return 'M1';
    return 'R1';
  }

  function shortPhrase(text, maxChars = 54) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const chars = Array.from(clean);
    if (chars.length <= maxChars) return clean;
    return chars.slice(0, maxChars - 1).join('').trimEnd() + '…';
  }

  function interruptedStepInfo(project, stepGuides) {
    if (!project || isFinished(project)) return null;
    const intake = project.intake && typeof project.intake === 'object' ? project.intake : {};
    const list = Array.isArray(project.conversation) ? project.conversation : [];
    const lastTurn = list.length ? list[list.length - 1] : null;
    const savedInterrupt = intake.interruptedStep && typeof intake.interruptedStep === 'object' ? intake.interruptedStep : null;
    const hasTrailingUserTurn = Boolean(lastTurn && lastTurn.role === 'user' && (lastTurn.key || lastTurn.interrupted) && String(lastTurn.content || '').trim());
    if (!savedInterrupt && !hasTrailingUserTurn) return null;

    const step = String((savedInterrupt && savedInterrupt.step) || intake.current_step || defaultStepForMode(project.content_type)).trim();
    const guide = stepGuides && stepGuides[step] ? stepGuides[step] : null;
    const stepTitle = (guide && guide.title) || ('Step ' + step);
    const lastUser = [...list].reverse().find(m => m && m.role === 'user' && String(m.content || '').trim());
    const lastAnswer = String((savedInterrupt && savedInterrupt.lastAnswer) || (lastUser && lastUser.content) || '').trim();
    const excerpt = shortPhrase(lastAnswer, 48);
    const answerPart = excerpt ? 'Your last answer (“' + excerpt + '”) is kept.' : 'Your last answer is kept.';
    const statusLine = 'Step paused on ' + stepTitle + ' before StorySculpt finished replying. ' + answerPart + ' Press Resume this step to continue from ' + stepTitle + '.';
    return {
      interrupted: true,
      step,
      stepTitle,
      lastAnswer,
      statusLine
    };
  }

  function shapedByPhrase(conversation) {
    const list = Array.isArray(conversation) ? conversation : [];
    const candidates = list.filter(m => {
      if (!m || m.role !== 'user' || m.excludeFromGeneration === true) return false;
      const text = String(m.content || '').replace(/\s+/g, ' ').trim();
      if (!text || /^(?:\d+|option\s*\d+|\d+\s*(?:seconds|sec|minutes|min)|epiphany|enragement|entertainment|empathy|education)$/i.test(text)) return false;
      return text.split(/\s+/).length >= 3;
    });
    if (!candidates.length) return '';
    // Prefer an earlier substantive answer when multiple answers exist so the
    // member sees how their earlier story detail shaped the new question.
    const chosen = candidates.length >= 2 ? candidates[candidates.length - 2] : candidates[0];
    const firstClause = String(chosen.content || '').split(/(?:[.!?\n]|,\s+)/)[0].trim();
    return shortPhrase(firstClause || chosen.content, 44);
  }

  function generationStatusLine(project, opts = {}) {
    const isFinal = Boolean(opts.isFinal || (project && isFinished(project)));
    if (isFinal) {
      return 'Screen changed to your finished script because every interview step is complete. Strong work bringing this story together, your script is ready to film.';
    }
    const intake = project && project.intake && typeof project.intake === 'object' ? project.intake : {};
    const step = String(opts.step || intake.current_step || '').trim();
    const guides = opts.stepGuides || {};
    const stepTitle = (guides[step] && guides[step].title) || (step ? 'Step ' + step : 'the next question');
    const earlier = shapedByPhrase(project && project.conversation);
    const base = earlier
      ? 'Screen updated to ' + stepTitle + ' because your earlier answer (“' + earlier + '”) shaped this question.'
      : 'Screen updated to ' + stepTitle + ' after your answer.';
    if (opts.isPreFinal) {
      return base + ' ' + FINISHING_LOCK_LINE;
    }
    return base;
  }

  const MEMORY_FIELD_LIST = [
    ['name', 'Name'],
    ['role', 'What they do'],
    ['audience', 'Who their videos are for'],
    ['voice', 'Voice and phrasing'],
    ['offers', 'Offers and recurring calls to action'],
    ['facts', 'Facts and results to reuse'],
    ['notes', 'Other notes']
  ];

  const EMOTION_WORDS = [
    'ashamed', 'terrified', 'anxious', 'embarrassed', 'depressed', 'panicked',
    'heartbroken', 'guilty', 'humiliated', 'afraid', 'scared', 'overwhelmed',
    'burned out', 'burnout', 'furious', 'bitter', 'resentful', 'insecure', 'lonely'
  ];

  function extractCorrections(conversation, intake) {
    const list = Array.isArray(conversation) ? conversation : [];
    const safeIntake = intake && typeof intake === 'object' ? intake : {};
    const supersededPhrases = new Set(
      Array.isArray(safeIntake.supersededDetails)
        ? safeIntake.supersededDetails.map(s => String(s || '').trim()).filter(Boolean)
        : []
    );
    const correctedEmotions = new Set();
    let replacementEmotion = '';

    for (const msg of list) {
      if (!msg || msg.role !== 'user') continue;
      const text = String(msg.content || '').trim();
      if (!text) continue;
      if (msg.excludeFromGeneration === true) {
        supersededPhrases.add(text);
        for (const emo of EMOTION_WORDS) {
          if (new RegExp('\\b' + emo + '\\b', 'i').test(text)) correctedEmotions.add(emo.toLowerCase());
        }
        continue;
      }
      // Explicit negation or correction of an earlier emotion or detail:
      // e.g. "I wasn't ashamed, I was angry", "not terrified, actually relieved", "Correction: ..."
      for (const emo of EMOTION_WORDS) {
        const negRe = new RegExp('\\b(?:not|never|wasn[\'’]?t|weren[\'’]?t|no longer|instead of(?: feeling| being)?|stop saying i was)\\s+(?:feeling\\s+|being\\s+|so\\s+)?' + emo + '\\b', 'i');
        if (negRe.test(text)) {
          correctedEmotions.add(emo.toLowerCase());
        }
      }
      const notXButY = text.match(/\b(?:i\s+was(?:n['’]?t|\s+not)|not|instead\s+of)\s+([a-z][a-z\s]{2,28}?)\s*(?:,|but|i\s+was|actually)\s+(?:i\s+was\s+|actually\s+|i\s+felt\s+)?([a-z][a-z\s]{2,28})/i);
      if (notXButY) {
        const stale = notXButY[1].trim().toLowerCase();
        const fresh = notXButY[2].trim();
        if (stale.length >= 3) {
          supersededPhrases.add(stale);
          for (const emo of EMOTION_WORDS) {
            if (stale.includes(emo)) correctedEmotions.add(emo.toLowerCase());
          }
        }
        if (fresh) replacementEmotion = fresh;
      }
    }

    // Also check if an earlier user turn stated an emotion that a later user turn corrected
    if (correctedEmotions.size > 0) {
      for (const msg of list) {
        if (!msg || msg.role !== 'user') continue;
        const text = String(msg.content || '').trim();
        for (const emo of correctedEmotions) {
          if (new RegExp('\\b' + emo + '\\b', 'i').test(text) && !new RegExp('\\b(?:not|never|wasn[\'’]?t)\\s+' + emo + '\\b', 'i').test(text)) {
            supersededPhrases.add(text);
          }
        }
      }
    }

    return {
      supersededPhrases: [...supersededPhrases],
      correctedEmotions: [...correctedEmotions],
      replacementEmotion
    };
  }

  function memoryIsSuperseded(value, corrections) {
    for (const emo of corrections.correctedEmotions) {
      if (new RegExp('\\b' + emo + '\\b', 'i').test(value)) return true;
    }
    for (const phrase of corrections.supersededPhrases) {
      if (phrase.length >= 4 && value.toLowerCase().includes(phrase.toLowerCase())) return true;
    }
    return false;
  }

  function activeMemoryFacts(memoryProfile, project, now = Date.now()) {
    const profile = memoryProfile && typeof memoryProfile === 'object' ? memoryProfile : {};
    const intake = project && project.intake && typeof project.intake === 'object' ? project.intake : {};
    const excludedSet = new Set(Array.isArray(intake.excludedMemoryKeys) ? intake.excludedMemoryKeys : []);
    const usedSet = new Set(Array.isArray(intake.usedMemoryKeys) ? intake.usedMemoryKeys : []);
    const corrections = extractCorrections(project && project.conversation, intake);

    const facts = [];
    for (const [key, label] of MEMORY_FIELD_LIST) {
      const value = String(profile[key] || '').trim();
      if (!value) continue;
      facts.push({
        key,
        label,
        value,
        excluded: excludedSet.has(key),
        usedOnce: usedSet.has(key),
        superseded: memoryIsSuperseded(value, corrections),
        confirmed: false
      });
    }

    const memories = Array.isArray(profile.confirmedMemories) ? profile.confirmedMemories : [];
    const seen = new Set();
    for (const entry of memories) {
      if (!entry || typeof entry !== 'object') continue;
      const id = String(entry.id || '');
      const value = String(entry.text || '').trim().slice(0, 1600);
      const confirmedAt = Date.parse(entry.confirmedAt || '');
      const age = now - confirmedAt;
      if (!id || seen.has(id) || !value || !['fact', 'voice'].includes(entry.category)) continue;
      if (!Number.isInteger(entry.sourceMessageIndex) || entry.sourceMessageIndex < 0 || !entry.sourceProjectId) continue;
      if (!Number.isFinite(confirmedAt) || age < 0 || age > 90 * DAY_MS) continue;
      seen.add(id);
      const ageDays = Math.floor(age / DAY_MS);
      const ageText = ageDays === 0 ? 'today' : (ageDays + ' days ago');
      facts.push({
        key: 'confirmed:' + id,
        label: entry.category === 'voice' ? 'Confirmed voice note' : 'Confirmed fact',
        value,
        excluded: excludedSet.has('confirmed:' + id),
        usedOnce: usedSet.has('confirmed:' + id),
        superseded: memoryIsSuperseded(value, corrections),
        confirmed: true,
        confirmedAt: entry.confirmedAt,
        origin: 'Finished project ' + entry.sourceProjectId + ', answer ' + (entry.sourceMessageIndex + 1) + '; confirmed ' + ageText
      });
    }
    return facts;
  }

  function newChatMemoryPreviewMarkup(memoryProfile, project) {
    const facts = activeMemoryFacts(memoryProfile, project).filter(f => !f.superseded);
    if (!facts.length) return '';
    const activeCount = facts.filter(f => !f.excluded).length;
    const excludedCount = facts.length - activeCount;
    const summary = excludedCount > 0
      ? 'Using ' + activeCount + ' of ' + facts.length + ' saved entries for this chat (' + excludedCount + ' left out)'
      : 'Saved entries StorySculpt will use in this chat (' + facts.length + ')';

    const itemsHtml = facts.map(item => {
      const stateClass = item.excluded ? ' is-excluded' : '';
      const noteHtml = item.excluded
        ? '<span class="story-msg-excluded-note">Left out of this chat</span>'
        : (item.usedOnce ? '<span class="story-memory-used-note">Used once in this chat</span>' : '');
      const originHtml = item.confirmed
        ? '<small class="story-memory-preview-origin">' + escapeHtml(item.origin) + '</small>' : '';
      const btnLabel = item.excluded ? 'Use in this chat' : 'Leave out of this chat';
      return '<div class="story-memory-preview-item' + stateClass + '" data-mem-item="' + escapeHtml(item.key) + '">' +
        '<div class="story-memory-preview-copy">' +
          '<strong class="story-memory-preview-label">' + escapeHtml(item.label) + ':</strong> ' +
          '<span class="story-memory-preview-value">' + escapeHtml(item.value) + '</span> ' +
          originHtml + noteHtml +
        '</div>' +
        '<button type="button" class="story-msg-action story-memory-fact-toggle" data-action="toggle-chat-memory-fact" data-mem-key="' + escapeHtml(item.key) + '" aria-pressed="' + (item.excluded ? 'true' : 'false') + '">' + btnLabel + '</button>' +
      '</div>';
    }).join('');

    return '<div class="story-memory-preview-box" data-memory-preview="true">' +
      '<div class="story-memory-preview-head">' +
        '<strong>' + escapeHtml(summary) + '</strong>' +
        '<span>From your story profile and answers you confirmed in finished projects. Leave any entry out for this chat without deleting it.</span>' +
      '</div>' +
      '<div class="story-memory-preview-list">' + itemsHtml + '</div>' +
    '</div>';
  }

  function composeChatMemory(memoryProfile, project, opts = {}) {
    const facts = activeMemoryFacts(memoryProfile, project);
    const active = facts.filter(item => {
      if (item.excluded || item.superseded) return false;
      if (opts.omitUsedOnce && item.usedOnce) return false;
      return true;
    });
    const standing = active.filter(item => !item.confirmed);
    const confirmed = active.filter(item => item.confirmed);
    const blocks = [];
    if (standing.length) blocks.push('MEMBER STORY PROFILE (standing facts the member set once):\n' + standing.map(item => item.label + ': ' + item.value).join('\n'));
    if (confirmed.length) blocks.push('MEMBER-CONFIRMED PROJECT MEMORY:\n' + confirmed.map(item => item.label + ' [' + item.origin + ']: ' + item.value).join('\n'));
    return blocks.join('\n\n');
  }

  function sanitizeRememberedLinesInTurn(content, memoryProfile, project) {
    const raw = String(content || '');
    if (!raw.trim()) return { content: raw, newlyUsedKeys: [] };
    const facts = activeMemoryFacts(memoryProfile, project);
    const intake = project && project.intake && typeof project.intake === 'object' ? project.intake : {};
    const alreadyUsed = new Set(Array.isArray(intake.usedMemoryKeys) ? intake.usedMemoryKeys : []);
    const corrections = extractCorrections(project && project.conversation, intake);

    // Also detect any fact that already appeared in an earlier assistant turn in this chat
    const list = Array.isArray(project && project.conversation) ? project.conversation : [];
    for (const msg of list) {
      if (!msg || msg.role !== 'assistant') continue;
      const prevText = String(msg.content || '').toLowerCase();
      for (const f of facts) {
        const snippet = f.value.toLowerCase().trim();
        if (snippet.length >= 5 && prevText.includes(snippet)) {
          alreadyUsed.add(f.key);
        }
      }
    }

    const newlyUsedKeys = [];
    const lines = raw.split('\n');
    const cleanedLines = lines.map(line => {
      // Preserve numbered option lines (1. / 2. / 3.) unless they contain a corrected stale emotion
      const isOptionLine = /^\s*(?:\*\*)?\d+[.)]/.test(line);
      const sentences = line.split(/(?<=[.!?])\s+/);
      const keptSentences = [];
      for (let s of sentences) {
        const lower = s.toLowerCase();
        let drop = false;

        // 1. Never resurface a fact the member left out for this chat or a superseded fact
        for (const f of facts) {
          const valLower = f.value.toLowerCase().trim();
          if (valLower.length < 4) continue;
          if ((f.excluded || f.superseded) && lower.includes(valLower)) {
            drop = true;
            break;
          }
          // 2. Never resurface the same remembered line twice in one chat
          if (!f.excluded && !f.superseded && lower.includes(valLower)) {
            if (alreadyUsed.has(f.key)) {
              drop = true;
              break;
            } else {
              alreadyUsed.add(f.key);
              if (!newlyUsedKeys.includes(f.key)) newlyUsedKeys.push(f.key);
            }
          }
        }

        // 3. Never resurface a stale emotional detail the member has since corrected
        if (!drop) {
          for (const emo of corrections.correctedEmotions) {
            if (new RegExp('\\b' + emo + '\\b', 'i').test(s)) {
              if (corrections.replacementEmotion && isOptionLine) {
                s = s.replace(new RegExp('\\b' + emo + '\\b', 'gi'), corrections.replacementEmotion);
              } else {
                drop = true;
              }
              break;
            }
          }
        }
        if (!drop) {
          for (const phrase of corrections.supersededPhrases) {
            const pLower = String(phrase || '').toLowerCase().trim();
            if (pLower.length >= 6 && lower.includes(pLower)) {
              drop = true;
              break;
            }
          }
        }

        if (!drop) keptSentences.push(s);
      }
      return keptSentences.join(' ').trim();
    }).filter((line, idx) => line.length > 0 || lines[idx].trim() === '');

    const out = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return {
      content: out || raw,
      newlyUsedKeys
    };
  }

  function settingsSummaryMarkup(opts = {}) {
    const story = opts.activeStory || null;
    const modeLabels = opts.modeLabels || { bold: 'Controversial Take', mini: 'Mini-Webinar', rant: '5E Talking Head', ugc: 'UGC / Product Video' };
    const formatName = story && story.content_type
      ? (modeLabels[story.content_type] || story.content_type)
      : 'Chosen per script when you start a chat';
    const formatRule = story && story.content_type
      ? formatName + ' (locked for this chat; start a new chat for a different format)'
      : 'Chosen when you start a chat (locked per chat once started)';
    const theme = String(opts.theme || 'dark').toLowerCase() === 'light' ? 'Light' : 'Dark';
    const nextTheme = theme === 'Light' ? 'Dark' : 'Light';
    const profile = opts.memoryProfile && typeof opts.memoryProfile === 'object' ? opts.memoryProfile : {};
    const savedCount = MEMORY_FIELD_LIST.filter(([k]) => String(profile[k] || '').trim().length > 0).length;
    const profileSummary = savedCount > 0
      ? savedCount + ' of ' + MEMORY_FIELD_LIST.length + ' standing fields saved below (reused across chats unless left out for a chat)'
      : '0 of ' + MEMORY_FIELD_LIST.length + ' standing fields saved yet (fill in any fields below to reuse across chats)';

    return '<div class="story-settings-card" data-settings-summary="true">' +
      '<div class="story-settings-row" id="settings-format-row">' +
        '<div><strong>Script format</strong><p id="settings-format-value">' + escapeHtml(formatRule) + '</p></div>' +
      '</div>' +
      '<div class="story-settings-row" id="settings-theme-row">' +
        '<div><strong>Color theme</strong><p id="settings-theme-value">' + escapeHtml(theme) + ' mode active</p></div>' +
        '<button class="secondary-button" id="settings-theme-toggle" data-action="toggle-settings-theme" type="button">Switch to ' + escapeHtml(nextTheme) + '</button>' +
      '</div>' +
      '<div class="story-settings-row" id="settings-profile-row">' +
        '<div><strong>Story profile</strong><p id="settings-profile-summary">' + escapeHtml(profileSummary) + '</p></div>' +
      '</div>' +
    '</div>';
  }

  const api = {
    DAY_MS, QUIET_AFTER_DAYS, LAPSE_AFTER_DAYS, COLLAPSE_AFTER, KEEP_VISIBLE,
    INACTIVITY_LINE, FINISHED_LINE, FINISHING_LOCK_LINE, MEMBERSHIP_LAPSE_LINE, PROFILE_STALE_DAYS,
    BROAD_ANSWER_FIXTURE, MEMORY_FIELD_LIST, FEEDBACK_SCALE,
    engagement, returnNotice, exportFileName, returnNoticeMarkup, threadWindow, showEarlierMarkup, earlierAnswerExcerpt,
    returnNoticeFor, refreshReturnNotice, dismissalStamp, isFinished, isFilmed, isPosted,
    feedbackScale, earlyFinishLine, effortRecognition, returnContext, scriptObjective, withScriptObjective,
    finishedTime, progress, progressLine, monthOverMonthLine, progressMarkup,
    memberStep, nextStep, nextStepMarkup, versionView, returnVisitLine,
    profileFreshness, profileFreshnessMarkup,
    broadAnswerCheck, interruptedStepInfo, generationStatusLine,
    extractCorrections, activeMemoryFacts, newChatMemoryPreviewMarkup, composeChatMemory, sanitizeRememberedLinesInTurn, settingsSummaryMarkup
  };
  root.StorySculptStates = api;
})(typeof window !== 'undefined' ? window : globalThis);
