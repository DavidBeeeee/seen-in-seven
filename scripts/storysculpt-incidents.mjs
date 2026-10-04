#!/usr/bin/env node
// StorySculpt's minimal incident signal. Reads the last window of storysculpt_*
// events from public.logs and answers one question with an exit code: is
// something broken that a member would feel right now?
//
//   exit 0  ok        no member-facing failure pattern in the window
//   exit 2  incident  enough generation, database or delivery failures that a
//                     person should look (the reason names the worst layer)
//   exit 1            the signal itself could not be read
//
// Access and input refusals are the system working and never count. The rule
// lives in incidentSignal() in api/_lib/storysculpt-observability.js, shared
// with the evaluation set, so the script and the tests cannot disagree.
//
// Needs SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY): public.logs is not
// readable with a member token. Prints counts and classes only; event detail
// never carries member content, and this prints none.
//
//   node scripts/storysculpt-incidents.mjs [--minutes 60] [--json]
//
// WBR-005, 2026-10-03 evening order.

import { incidentSignal } from '../api/_lib/storysculpt-observability.js';

const supabaseUrl = String(process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const minutes = Math.max(1, Number(option('--minutes', 60)) || 60);

if (!serviceKey) {
  console.error('storysculpt-incidents: SUPABASE_SECRET_KEY is required to read public.logs.');
  process.exit(1);
}

const since = new Date(Date.now() - minutes * 60000).toISOString();
const url = `${supabaseUrl}/rest/v1/logs?select=event_type,detail,created_at&event_type=like.storysculpt_*&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=2000`;
const response = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
if (!response.ok) {
  console.error(`storysculpt-incidents: could not read logs (${response.status}).`);
  process.exit(1);
}
const rows = await response.json();
const signal = incidentSignal(rows, { windowMinutes: minutes });

if (argv.includes('--json')) console.log(JSON.stringify(signal, null, 2));
else {
  const layers = Object.entries(signal.byLayer).map(([layer, n]) => `${layer}=${n}`).join(' ') || 'none';
  console.log(`StorySculpt ${signal.level.toUpperCase()}: ${signal.reason}. Last ${minutes}m: ${signal.attempts} attempt(s), ${signal.failures} failure(s), rate ${signal.failureRate}, by layer ${layers}.`);
}
process.exit(signal.level === 'incident' ? 2 : 0);
