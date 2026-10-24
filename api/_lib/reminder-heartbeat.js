// Read-only, member-free health summary for an observer outside the job.
export function heartbeatAge(rows, now = Date.now()) {
  const ranAt = Date.parse(rows?.[0]?.ran_at);
  if (!Number.isFinite(ranAt) || ranAt > now + 60000) return null;
  return Math.max(0, (now - ranAt) / 3600000);
}

export async function readReminderHeartbeat({ fetchFn = fetch, now = Date.now() } = {}) {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Heartbeat database access unavailable');
  const base = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
  const response = await fetchFn(base + '/rest/v1/certainty_reminder_runs?select=ran_at&order=ran_at.desc&limit=1', {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw new Error('Heartbeat read failed');
  return { ageHours: heartbeatAge(await response.json(), now) };
}
