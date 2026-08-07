EEEStudio.initialize(async ({ profile, sb }) => {
  const { data } = await sb.from('navigator_states').select('state').eq('user_id', profile.id).maybeSingle();
  const state = data && data.state ? data.state : {};
  if (state.next_action) {
    document.getElementById('eee-next-title').textContent = state.next_action;
    document.getElementById('eee-next-copy').textContent = state.objective
      ? 'This is the next move inside: ' + state.objective
      : 'Your saved next action is ready when you are.';
  }
});
