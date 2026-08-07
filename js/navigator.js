let navigatorContext = null;
let navigatorState = {};
const navEl = id => document.getElementById(id);

function renderNavigatorState() {
  navEl('navigator-objective').value = navigatorState.objective || '';
  navEl('navigator-reality').value = navigatorState.current_reality || '';
  navEl('navigator-blocker').value = navigatorState.blocker || '';
  navEl('navigator-time').value = navigatorState.available_time || '1 hour';
  navEl('navigator-deadline').value = navigatorState.deadline || '';
  const hasResult = Boolean(navigatorState.next_action);
  navEl('navigator-result').hidden = !hasResult;
  if (hasResult) {
    navEl('navigator-action').textContent = navigatorState.next_action;
    navEl('navigator-start').textContent = navigatorState.first_15_minutes || '';
    navEl('navigator-done').textContent = navigatorState.done_when || '';
    navEl('navigator-why').textContent = navigatorState.why_this_now || '';
    navEl('navigator-result').classList.toggle('completed', navigatorState.completed === true);
    navEl('navigator-complete').querySelector('span').textContent = navigatorState.completed ? 'Completed' : 'Mark complete';
  }
  EEEStudio.refreshIcons();
}

async function saveNavigatorState() {
  const { error } = await navigatorContext.sb.from('navigator_states').upsert({ user_id: navigatorContext.profile.id, state: navigatorState, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

async function chooseNextMove(event) {
  event.preventDefault();
  const button = navEl('navigator-submit');
  button.disabled = true;
  button.querySelector('span').textContent = 'Finding the route...';
  navEl('navigator-message').textContent = 'Comparing the objective, blocker, and time available.';
  navigatorState = {
    objective: navEl('navigator-objective').value.trim(),
    current_reality: navEl('navigator-reality').value.trim(),
    blocker: navEl('navigator-blocker').value.trim(),
    available_time: navEl('navigator-time').value,
    deadline: navEl('navigator-deadline').value,
    completed: false
  };
  try {
    await saveNavigatorState();
    const response = await fetch('/api/navigator', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + navigatorContext.session.access_token }, body: JSON.stringify(navigatorState) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The Navigator could not choose the next move.');
    navigatorState = { ...navigatorState, ...data, updated_at: new Date().toISOString() };
    await saveNavigatorState();
    renderNavigatorState();
    navEl('navigator-message').textContent = 'Next move saved.';
    navEl('navigator-message').className = 'eee-message success';
  } catch (error) {
    navEl('navigator-message').textContent = error.message || 'The route did not finish. Your answers are saved.';
    navEl('navigator-message').className = 'eee-message error';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Choose my next move';
  }
}

navEl('navigator-form').addEventListener('submit', chooseNextMove);
navEl('navigator-clear').addEventListener('click', async () => { navigatorState = {}; await saveNavigatorState(); renderNavigatorState(); });
navEl('navigator-complete').addEventListener('click', async () => { navigatorState.completed = true; navigatorState.completed_at = new Date().toISOString(); await saveNavigatorState(); renderNavigatorState(); });
navEl('navigator-copy').addEventListener('click', async () => { await navigator.clipboard.writeText(navigatorState.next_action || ''); navEl('navigator-copy').querySelector('span').textContent = 'Copied'; setTimeout(() => { navEl('navigator-copy').querySelector('span').textContent = 'Copy next move'; }, 1300); });

EEEStudio.initialize(async context => {
  navigatorContext = context;
  const { data } = await context.sb.from('navigator_states').select('state').eq('user_id', context.profile.id).maybeSingle();
  navigatorState = data && data.state || {};
  renderNavigatorState();
});
