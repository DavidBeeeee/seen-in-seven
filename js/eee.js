EEEStudio.initialize(async ({ profile, sb }) => {
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
