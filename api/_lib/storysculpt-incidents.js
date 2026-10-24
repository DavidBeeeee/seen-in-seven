// StorySculpt's incident check, shared by the on-request script
// (scripts/storysculpt-incidents.mjs) and the hourly scheduled run, which rides
// the Certainty reminder job's pg_cron tick (WBR-458, Developer 76 to 80). It
// reads the window's storysculpt_* events with the service key, applies
// incidentSignal(), and when the signal trips emails David once per window.
// Counts and kinds only: events never carry member content.

import { incidentSignal, incidentAlertMessage } from './storysculpt-observability.js';

export async function readStorySculptEvents({ supabaseUrl, serviceKey, minutes, fetchFn = fetch }) {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const url = `${String(supabaseUrl).replace(/\/$/, '')}/rest/v1/logs?select=event_type,detail,created_at&event_type=like.storysculpt_*&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=2000`;
  const response = await fetchFn(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!response.ok) {
    const error = new Error(`could not read logs (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Returns { signal, alert, alertOutcome }. alertOutcome is null when nothing
// tripped, otherwise 'sent', 'held' (no email channel configured) or 'failed'.
export async function checkStorySculptIncidents({ supabaseUrl, serviceKey, minutes = 60, send = null, fetchFn = fetch }) {
  const rows = await readStorySculptEvents({ supabaseUrl, serviceKey, minutes, fetchFn });
  const signal = incidentSignal(rows, { windowMinutes: minutes });
  const alert = incidentAlertMessage(signal);
  if (!alert) return { signal, alert: null, alertOutcome: null };
  console.error('storysculpt incident', JSON.stringify({ reason: signal.reason, kinds: signal.kinds, byProvider: signal.byProvider }));
  if (!send) return { signal, alert, alertOutcome: 'held' };
  try {
    await send(alert);
    return { signal, alert, alertOutcome: 'sent' };
  } catch (error) {
    console.error('storysculpt incident alert failed', String(error));
    return { signal, alert, alertOutcome: 'failed' };
  }
}
