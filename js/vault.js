let vaultContext = null;
let vaultItems = [];
let vaultProgress = new Map();
const vaultEl = id => document.getElementById(id);

function vaultEscape(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function filteredVaultItems() {
  const query = vaultEl('vault-search').value.trim().toLowerCase();
  const topic = vaultEl('vault-topic').value;
  return vaultItems.filter(item => {
    if (topic && item.topic !== topic) return false;
    const text = [item.title, item.speaker, item.topic, item.description].filter(Boolean).join(' ').toLowerCase();
    return !query || text.includes(query);
  });
}

function renderVault() {
  const items = filteredVaultItems();
  vaultEl('vault-count').textContent = vaultItems.length + ' recording' + (vaultItems.length === 1 ? '' : 's');
  vaultEl('vault-empty').hidden = vaultItems.length > 0;
  vaultEl('vault-grid').hidden = vaultItems.length === 0;
  vaultEl('vault-grid').innerHTML = items.map(item => {
    const complete = vaultProgress.get(item.id) === true;
    const image = item.thumbnail_url || '/assets/eee/vault.png';
    return '<article class="vault-card"><div class="vault-card-media"><img src="' + vaultEscape(image) + '" alt=""><span>' + vaultEscape(item.topic || 'Speaker session') + '</span></div><div class="vault-card-copy"><h2>' + vaultEscape(item.title) + '</h2><p class="vault-speaker">' + vaultEscape(item.speaker || 'Colorado Mastermind') + '</p><p class="vault-description">' + vaultEscape(item.description || '') + '</p><div class="vault-card-actions"><a class="secondary-button" href="' + vaultEscape(item.video_url) + '" target="_blank" rel="noopener"><i data-lucide="play"></i><span>Watch</span></a><button class="secondary-button vault-complete' + (complete ? ' completed' : '') + '" type="button" data-complete-id="' + vaultEscape(item.id) + '"><i data-lucide="' + (complete ? 'check' : 'circle') + '"></i><span>' + (complete ? 'Completed' : 'Mark complete') + '</span></button></div></div></article>';
  }).join('');
  EEEStudio.refreshIcons();
}

function renderTopics() {
  const topics = [...new Set(vaultItems.map(item => item.topic).filter(Boolean))].sort();
  vaultEl('vault-topic').innerHTML = '<option value="">All topics</option>' + topics.map(topic => '<option value="' + vaultEscape(topic) + '">' + vaultEscape(topic) + '</option>').join('');
}

async function loadVault() {
  const [itemsResult, progressResult] = await Promise.all([
    vaultContext.sb.from('solution_vault_items').select('*').eq('published', true).order('sort_order').order('created_at', { ascending: false }),
    vaultContext.sb.from('solution_vault_progress').select('item_id,completed').eq('user_id', vaultContext.profile.id)
  ]);
  if (itemsResult.error) throw itemsResult.error;
  vaultItems = itemsResult.data || [];
  vaultProgress = new Map((progressResult.data || []).map(row => [row.item_id, row.completed]));
  renderTopics();
  renderVault();
}

async function toggleVaultComplete(itemId) {
  const completed = !(vaultProgress.get(itemId) === true);
  const { error } = await vaultContext.sb.from('solution_vault_progress').upsert({ user_id: vaultContext.profile.id, item_id: itemId, completed, watched_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }, { onConflict: 'user_id,item_id' });
  if (error) return;
  vaultProgress.set(itemId, completed);
  renderVault();
}

async function addVaultItem(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const item = {
    title: vaultEl('vault-title').value.trim(),
    speaker: vaultEl('vault-speaker').value.trim() || null,
    topic: vaultEl('vault-item-topic').value.trim() || null,
    description: vaultEl('vault-description').value.trim() || null,
    video_url: vaultEl('vault-url').value.trim(),
    thumbnail_url: vaultEl('vault-thumbnail').value.trim() || null,
    published: true
  };
  const { error } = await vaultContext.sb.from('solution_vault_items').insert(item);
  if (error) {
    vaultEl('vault-admin-message').textContent = error.message;
    vaultEl('vault-admin-message').className = 'eee-message error';
  } else {
    vaultEl('vault-admin-form').reset();
    vaultEl('vault-admin-message').textContent = 'Recording added.';
    vaultEl('vault-admin-message').className = 'eee-message success';
    await loadVault();
  }
  button.disabled = false;
}

vaultEl('vault-search').addEventListener('input', renderVault);
vaultEl('vault-topic').addEventListener('change', renderVault);
vaultEl('vault-grid').addEventListener('click', event => { const button = event.target.closest('[data-complete-id]'); if (button) toggleVaultComplete(button.dataset.completeId); });
vaultEl('vault-admin-toggle').addEventListener('click', () => { vaultEl('vault-admin-form').hidden = !vaultEl('vault-admin-form').hidden; });
vaultEl('vault-admin-form').addEventListener('submit', addVaultItem);

EEEStudio.initialize(async context => {
  vaultContext = context;
  vaultEl('vault-admin').hidden = context.profile.is_admin !== true;
  await loadVault();
});
