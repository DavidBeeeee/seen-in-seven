// ── POINTS ENGINE (client mirror) ──────────────────────────────────────
// Mirrors compute_user_points() in Supabase (supabase_migrations/
// 2026-07-15-add-points.sql). Both derive points as a pure function over
// persisted data — no ledger — so totals are idempotent and recomputable.
// This copy runs instantly and works for anonymous/offline users from the
// local `state` object; the server copy is authoritative (admin, anti-
// tamper). Keys here MUST match the jsonb keys in points_config.rules.
// After auth, applyPointsConfig() swaps in the server's values so David
// can tune numbers without a redeploy; these baked-in values are the
// anonymous/offline fallback.

let POINTS_RULES = {
  version: 1,
  onboarding_complete: 50,
  context_tier_1: 10,
  context_tier_2: 25,
  context_tier_3: 50,
  context_tier_2_at: 200,
  context_tier_3_at: 1000,
  audience_context: 15,
  message_context: 15,
  mvo_q4_answered: 20,
  first_script_notes: 20,
  script_generated: 25,
  script_locked: 30,
  video_filmed: 50,
  video_posted: 75,
  post_url_bonus: 25,
  all_seven_scripts: 100,
  sponsor_click: 15,
  graduation_watched: 100,
  call_scheduled: 100,
  milestones: [50, 150, 400, 650, 950, 1250, 1600, 1935]
};

// Milestone identities — names in David Bee's voice, one gem each.
// Thresholds come from POINTS_RULES.milestones so tuning stays in one place.
const MILESTONE_META = [
  { id: 'first_steps',      name: 'First Steps',       gem: 'amethyst' },
  { id: 'found_your_voice', name: 'Found Your Voice',  gem: 'topaz' },
  { id: 'on_camera',        name: 'On Camera',         gem: 'emerald' },
  { id: 'momentum',         name: 'Momentum',          gem: 'sapphire' },
  { id: 'halfway_hero',     name: 'Halfway Hero',      gem: 'ruby' },
  { id: 'seen_and_heard',   name: 'Seen and Heard',    gem: 'opal' },
  { id: 'almost_legendary', name: 'Almost Legendary',  gem: 'diamond' },
  { id: 'seen_in_seven',    name: 'Seen In Seven',     gem: 'gold' }
];

// Swap in server-side rules post-auth (called with points_config row).
function applyPointsConfig(rules, version) {
  if (!rules || typeof rules !== 'object') return;
  POINTS_RULES = Object.assign({}, POINTS_RULES, rules, { version: version || POINTS_RULES.version });
}

function _len(v) { return (typeof v === 'string') ? v.trim().length : 0; }
function _filled(v) { return _len(v) > 0; }

// Pure function: state → points. Mirrors the SQL rule-for-rule.
function computePoints(s) {
  const r = POINTS_RULES;
  const p2 = s.phase2 || {};
  const breakdown = {};
  let total = 0;
  function award(key, pts, extra) {
    if (pts <= 0) return;
    total += pts;
    breakdown[key] = extra ? Object.assign({ points: pts }, extra) : pts;
  }

  // Onboarding complete
  if (s.level) award('onboarding_complete', r.onboarding_complete);

  // Starter context tiers (longest of freewrite / pasted knowledge context)
  const ctxLen = Math.max(_len(s.topicFreewrite), _len(p2.knowledgeContext));
  if (ctxLen >= r.context_tier_3_at) award('starter_context', r.context_tier_3);
  else if (ctxLen >= r.context_tier_2_at) award('starter_context', r.context_tier_2);
  else if (ctxLen > 0) award('starter_context', r.context_tier_1);

  // Extended-mode fields (persist only when genuinely answered)
  if (_filled(p2.audienceContext)) award('audience_context', r.audience_context);
  if (_filled(p2.messageContext)) award('message_context', r.message_context);
  const q4 = s.mvoQ4 || {};
  if (_filled(q4.village_full) || _filled(q4.crack_full)) award('mvo_q4_answered', r.mvo_q4_answered);
  if (_filled(p2.firstScriptNotes)) award('first_script_notes', r.first_script_notes);

  // Per-video booleans, merged across the active level and the L1 archive
  // (mirrors the server counting distinct video_number/video_index across
  // levels, so level-switchers keep their points).
  const vids = s.videos || {};
  const l1v = s.l1Videos || {};
  const vs = s.videoStatus || {};
  const l1s = s.l1VideoStatus || {};
  const posted = s.videoPosted || {};
  let genCount = 0, lockCount = 0, filmCount = 0, postCount = 0, urlCount = 0;
  for (let i = 0; i < 7; i++) {
    if (vids['script_v' + i] || l1v['script_v' + i]) genCount++;
    if (vids['locked_v' + i] || l1v['locked_v' + i]) lockCount++;
    if (vs[i] === 'filmed' || l1s[i] === 'filmed') filmCount++;
    const p = posted[i] || {};
    if (p.posted) postCount++;
    if (_filled(p.url)) urlCount++;
  }
  if (genCount) award('scripts_generated', genCount * r.script_generated, { count: genCount });
  if (genCount >= 7) award('all_seven_scripts', r.all_seven_scripts);
  if (lockCount) award('scripts_locked', lockCount * r.script_locked, { count: lockCount });
  if (filmCount) award('videos_filmed', filmCount * r.video_filmed, { count: filmCount });
  if (postCount) award('videos_posted', postCount * r.video_posted, { count: postCount });
  if (urlCount) award('post_url_bonus', urlCount * r.post_url_bonus, { count: urlCount });

  // Engagement (mirrored locally in state.engage; server derives from logs)
  const eng = s.engage || {};
  const sponsorCount = (eng.sponsor_vubli ? 1 : 0) + (eng.sponsor_temu ? 1 : 0);
  if (sponsorCount) award('sponsor_clicks', sponsorCount * r.sponsor_click, { count: sponsorCount });
  if (eng.graduation) award('graduation_watched', r.graduation_watched);
  if (eng.call) award('call_scheduled', r.call_scheduled);

  // Milestones
  const thresholds = r.milestones || [];
  const milestones = MILESTONE_META.map((m, i) => Object.assign({}, m, {
    at: thresholds[i] || 0,
    earned: total >= (thresholds[i] || Infinity)
  }));
  const earnedCount = milestones.filter(m => m.earned).length;
  const next = milestones.find(m => !m.earned) || null;
  const prevAt = earnedCount > 0 ? milestones[earnedCount - 1].at : 0;
  const progressToNext = next
    ? Math.min(100, Math.round(((total - prevAt) / Math.max(next.at - prevAt, 1)) * 100))
    : 100;

  return {
    total: total,
    breakdown: breakdown,
    rules_version: r.version,
    milestones: milestones,
    earnedCount: earnedCount,
    nextMilestone: next,
    progressToNext: progressToNext,
    maxTotal: thresholds.length ? thresholds[thresholds.length - 1] : total
  };
}
