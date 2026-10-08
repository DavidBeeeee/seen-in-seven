async function renderHubScoreDates(profile, session) {
  if (profile.is_admin !== true) return;
  const routes = { storysculpt: '/storysculpt', nsn: '/navigator', boardroom: '/boardroom', certainty: '/certainty' };
  const slots = {};
  for (const [key, route] of Object.entries(routes)) {
    const card = document.querySelector(`.eee-tool a[href="${route}"]`)?.closest('.eee-tool-copy');
    if (!card) continue;
    const line = document.createElement('p');
    line.className = 'eee-score-freshness';
    line.textContent = '300 audit: loading latest published score...';
    line.setAttribute('aria-live', 'polite');
    card.appendChild(line);
    slots[key] = line;
  }
  try {
    const response = await fetch('/api/workerbee?view=hub-scores', { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
    if (!response.ok) throw new Error('Score read failed');
    const data = await response.json();
    for (const [key, line] of Object.entries(slots)) {
      const app = (data.apps || []).find((row) => row.key === key);
      const date = new Date(app?.lastScoredAt || '');
      if (!app?.tally || !Number.isFinite(date.getTime())) {
        line.textContent = '300 audit: no verified published score yet.';
        continue;
      }
      const label = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(date);
      line.textContent = `300 audit · ${label}: ${app.tally.PASS} pass, ${app.tally.PART} partial, ${app.tally.FAIL} fail, ${app.tally['N/A']} N/A.`;
    }
  } catch (_) {
    for (const line of Object.values(slots)) line.textContent = '300 audit unavailable. Open the WorkerBee dashboard to check the source.';
  }
}

EEEStudio.initialize(async ({ profile, sb, session }) => {
  await renderHubScoreDates(profile, session);
  const { data } = await sb.from('navigator_states').select('state').eq('user_id', profile.id).maybeSingle();
  const state = data && data.state ? data.state : {};
  const titleEl = document.getElementById('eee-next-title');
  const copyEl = document.getElementById('eee-next-copy');
  if (state.next_action && titleEl) {
    titleEl.textContent = state.next_action;
    if (copyEl) {
      copyEl.textContent = state.objective
        ? 'This is the next move inside: ' + state.objective
        : 'Your saved next action is ready when you are.';
    }
  }
});
