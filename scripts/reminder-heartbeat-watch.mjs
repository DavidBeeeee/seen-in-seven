import { pathToFileURL } from 'node:url';

export function assessHeartbeat(payload, maxHours = 3) {
  if (![3, 26].includes(maxHours)) throw new Error('Threshold must be 3 (hourly-tick) or 26 (vercel-cron)');
  const age = payload?.ageHours;
  if (typeof age !== 'number' || !Number.isFinite(age) || age < 0 || age > maxHours) {
    throw new Error(`Reminder heartbeat missing or stale: age=${age}, limit=${maxHours} hours`);
  }
  return `Reminder heartbeat healthy: ${age.toFixed(2)}h <= ${maxHours}h`;
}

export async function watchHeartbeat(url, maxHours = 3, fetchFn = fetch) {
  const response = await fetchFn(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Heartbeat route HTTP ${response.status}`);
  return assessHeartbeat(await response.json(), maxHours);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(await watchHeartbeat('https://studio.coloradomastermind.com/api/certainty?action=heartbeat', Number(process.env.REMINDER_MAX_HOURS || 3)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
