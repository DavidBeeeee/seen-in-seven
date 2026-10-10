// The Navigator roadmap, saved to the member's account. WBR-373
// (300: UX 8, 88; Stranger 95; Developer A and E).
//
// The roadmap builder in api/_hub/navigator.html is an inline classic script,
// so the part that needs proving (save, cross-device restore, which copy wins,
// Start Fresh keeping the old one) lives here as a pure ES module. The browser
// loads it as a module that hangs these helpers on window.NavigatorRoadmapStore;
// scripts/check-navigator-roadmaps.mjs imports the same functions and runs them
// against a mock Supabase client that enforces the member-owns-row policy and
// the one-current-row index from the migration.
//
// Nothing here touches the DOM or localStorage. The page owns those.

const TABLE = 'navigator_roadmaps';

function stamp(profile) {
  const t = profile && Date.parse(profile.updatedAt);
  return Number.isFinite(t) ? t : 0;
}

// The member's current roadmap row, or null when they have never saved one.
export async function loadCurrent(sb, profileId) {
  const { data, error } = await sb.from(TABLE)
    .select('id, profile, profile_updated_at')
    .eq('user_id', profileId)
    .eq('is_current', true)
    .limit(1);
  if (error) return { row: null, error };
  return { row: (data && data[0]) || null, error: null };
}

// Write the profile as the current roadmap. Updates the current row when there is
// one, otherwise inserts it, so a member always has exactly one current row.
export async function saveCurrent(sb, profileId, profile) {
  const updatedAt = profile.updatedAt || new Date().toISOString();
  const fields = { profile, profile_updated_at: updatedAt, updated_at: new Date().toISOString() };
  const upd = await sb.from(TABLE)
    .update(fields)
    .eq('user_id', profileId)
    .eq('is_current', true)
    .select('id');
  if (upd.error) return { error: upd.error };
  if (upd.data && upd.data.length) return { error: null, id: upd.data[0].id };
  const ins = await sb.from(TABLE)
    .insert({ user_id: profileId, is_current: true, ...fields })
    .select('id');
  if (ins.error) return { error: ins.error };
  return { error: null, id: ins.data && ins.data[0] && ins.data[0].id };
}

// Start Fresh: the current roadmap becomes a prior version instead of being
// overwritten. The next save inserts a new current row.
export async function archiveCurrent(sb, profileId) {
  const now = new Date().toISOString();
  return sb.from(TABLE)
    .update({ is_current: false, archived_at: now, updated_at: now })
    .eq('user_id', profileId)
    .eq('is_current', true);
}

// Prior versions, newest first.
export async function listVersions(sb, profileId) {
  const { data, error } = await sb.from(TABLE)
    .select('id, profile, profile_updated_at, archived_at')
    .eq('user_id', profileId)
    .eq('is_current', false)
    .order('archived_at', { ascending: false });
  return { versions: data || [], error: error || null };
}

// Prefer the newer of the account copy and this device's copy, and say which.
// source: 'account' | 'device' | 'none'.
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

// "9 October 2026" style, in the member's locale.
export function formatUpdated(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

if (typeof window !== 'undefined') {
  window.NavigatorRoadmapStore = { loadCurrent, saveCurrent, archiveCurrent, listVersions, chooseNewer, formatUpdated };
  window.dispatchEvent(new Event('navigator-roadmap-store-ready'));
}
