// Navigator roadmap integrity and member data controls. WBR-373 / WBR-459.
// The server resolves ownership from the caller. The profileId argument remains
// for the existing page/test API and for explicit owner-scoped table reads.

import { newIdempotencyKey } from './navigator-moves-store.mjs';

const TABLE = 'navigator_roadmaps';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function stamp(profile) {
  const t = profile && Date.parse(profile.updatedAt);
  return Number.isFinite(t) ? t : 0;
}

export async function loadCurrent(sb, profileId) {
  const { data, error } = await sb.from(TABLE)
    .select('id, profile, profile_updated_at, status, version')
    .eq('user_id', profileId)
    .eq('is_current', true)
    .limit(1);
  if (error) return { row: null, error };
  return { row: (data && data[0]) || null, error: null };
}

export function isStaleVersion(error) {
  return !!error && JSON.stringify(error).includes('STALE_VERSION');
}

function permanent(error) {
  const text = JSON.stringify(error || {});
  return ['STALE_VERSION', 'ILLEGAL_TRANSITION', 'BAD_IDEMPOTENCY_KEY', 'ACCESS_DENIED', 'NOT_AUTHENTICATED', '23514']
    .some(code => text.includes(code));
}

// One logical save keeps one key across its single retry. The database checks
// both that key and the version the member actually read.
export async function saveCurrent(sb, profileId, profile, options = {}) {
  if (!profileId) return { error: { message: 'NOT_AUTHENTICATED' } };
  const updatedAt = profile.updatedAt || new Date().toISOString();
  const idempotencyKey = options.idempotencyKey || newIdempotencyKey();
  const { data, error } = await sb.rpc('save_navigator_roadmap', {
    p_profile: profile,
    p_profile_updated_at: updatedAt,
    p_expected_version: Number.isInteger(options.expectedVersion) ? options.expectedVersion : null,
    p_idempotency_key: idempotencyKey,
    p_status: options.status || 'in_progress'
  });
  if (error) return { error, idempotencyKey };
  return { error: null, row: data, id: data && data.id, version: data && data.version, idempotencyKey };
}

export async function saveCurrentWithRetry(sb, profileId, profile, options = {}) {
  const wait = options.sleep || sleep;
  const delay = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 400;
  let result;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      result = await saveCurrent(sb, profileId, profile, options);
    } catch (error) {
      result = { error };
    }
    result.attempts = attempt;
    if (!result.error || permanent(result.error) || attempt === 2) return result;
    await wait(delay);
  }
  return result;
}

export async function archiveCurrent(sb, profileId, options = {}) {
  const now = new Date().toISOString();
  const patch = {
    status: 'archived', is_current: false, archived_at: now, updated_at: now,
    expected_version: Number.isInteger(options.expectedVersion) ? options.expectedVersion : null
  };
  return sb.from(TABLE)
    .update(patch)
    .eq('user_id', profileId)
    .eq('is_current', true)
    .select('id, status, version');
}

export async function listVersions(sb, profileId) {
  const { data, error } = await sb.from(TABLE)
    .select('id, profile, profile_updated_at, archived_at, status, version')
    .eq('user_id', profileId)
    .eq('is_current', false)
    .order('archived_at', { ascending: false });
  return { versions: data || [], error: error || null };
}

export async function exportNavigatorData(sb, profileId) {
  const [roadmaps, moves, states] = await Promise.all([
    sb.from('navigator_roadmaps').select('id, profile, status, version, is_current, profile_updated_at, archived_at, created_at, updated_at').eq('user_id', profileId).order('created_at', { ascending: false }),
    sb.from('navigator_moves').select('*').eq('user_id', profileId).order('created_at', { ascending: false }),
    sb.from('navigator_states').select('state, updated_at').eq('user_id', profileId)
  ]);
  const error = roadmaps.error || moves.error || states.error;
  if (error) return { error };
  return {
    error: null,
    data: {
      format: 'next-step-navigator-export', version: 1,
      exportedAt: new Date().toISOString(),
      roadmaps: roadmaps.data || [], moves: moves.data || [], states: states.data || []
    }
  };
}

export async function eraseNavigatorData(sb) {
  const { data, error } = await sb.rpc('erase_navigator_data');
  return { data: data || null, error: error || null };
}

export function chooseNewer(localProfile, serverRow) {
  const serverProfile = serverRow && serverRow.profile;
  if (serverProfile && !serverProfile.updatedAt && serverRow.profile_updated_at) {
    serverProfile.updatedAt = serverRow.profile_updated_at;
  }
  const hasLocal = !!(localProfile && localProfile.name);
  const hasServer = !!(serverProfile && serverProfile.name);
  if (!hasLocal && !hasServer) return { profile: null, source: 'none' };
  if (!hasServer) return { profile: localProfile, source: 'device' };
  if (!hasLocal) return { profile: serverProfile, source: 'account' };
  return stamp(localProfile) > stamp(serverProfile)
    ? { profile: localProfile, source: 'device' }
    : { profile: serverProfile, source: 'account' };
}

export function formatUpdated(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

if (typeof window !== 'undefined') {
  window.NavigatorRoadmapStore = {
    loadCurrent, saveCurrent, saveCurrentWithRetry, archiveCurrent, listVersions,
    exportNavigatorData, eraseNavigatorData, isStaleVersion, chooseNewer, formatUpdated
  };
  window.dispatchEvent(new Event('navigator-roadmap-store-ready'));
}
