#!/usr/bin/env node
// StorySculpt's minimal incident signal. Reads the last window of storysculpt_*
// events from public.logs and answers one question with an exit code: is
// something broken that a member would feel right now?
//
//   exit 0  ok        no member-facing failure pattern in the window
//   exit 2  incident  enough generation, database or delivery failures that a
//                     person should look (the reason names the worst layer),
//                     or one of the four kinds crossed its own threshold
//   exit 1            the signal itself could not be read
//
// It tells four kinds apart (WBR-458, Developer 76 to 80): an outside service
// failing (DeepSeek, Supabase, a product page, named per provider), our own
// app erroring, an answer rejected by the output check, and a member walking
// away mid-step. The same check runs on its own every hour on the Certainty
// reminder job's pg_cron tick and emails David when it trips; --alert sends
// that email from here too (needs RESEND_API_KEY, CERTAINTY_REMINDER_FROM and
// CERTAINTY_OPERATOR_EMAIL).
//
// Access and input refusals are the system working and never count. The rule
// lives in incidentSignal() in api/_lib/storysculpt-observability.js, shared
// with the evaluation set, so the script and the tests cannot disagree.
//
// Needs SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY): public.logs is not
// readable with a member token. Prints counts and classes only; event detail
// never carries member content, and this prints none.
//
//   node scripts/storysculpt-incidents.mjs [--minutes 60] [--json] [--sample] [--alert]
//
// WBR-005, 2026-10-03 evening order.

import { incidentSignal, incidentAlertMessage } from '../api/_lib/storysculpt-observability.js';
import { readStorySculptEvents } from '../api/_lib/storysculpt-incidents.js';

const supabaseUrl = String(process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const minutes = Math.max(1, Number(option('--minutes', 60)) || 60);

let rows;
if (argv.includes('--sample')) {
  const now = Date.now();
  rows = [
    { event_type: 'storysculpt_generation', created_at: new Date(now - 20 * 60000).toISOString(), detail: { outcome: 'generation' } },
    { event_type: 'storysculpt_walkaway', created_at: new Date(now - 15 * 60000).toISOString(), detail: { outcome: 'walkaway', failureClass: 'member-walkaway' } },
    { event_type: 'storysculpt_error', created_at: new Date(now - 10 * 60000).toISOString(), detail: { outcome: 'error', failureClass: 'deepseek-error', layer: 'generation' } },
    { event_type: 'storysculpt_generation', created_at: new Date(now - 5 * 60000).toISOString(), detail: { outcome: 'generation' } }
  ];
} else {
  if (!serviceKey) {
    console.error('storysculpt-incidents: SUPABASE_SECRET_KEY is required to read public.logs (or pass --sample).');
    process.exit(1);
  }

  try {
    rows = await readStorySculptEvents({ supabaseUrl, serviceKey, minutes });
  } catch (error) {
    console.error(`storysculpt-incidents: ${error.message}.`);
    process.exit(1);
  }
}

const signal = incidentSignal(rows, { windowMinutes: minutes });

if (argv.includes('--json')) console.log(JSON.stringify(signal, null, 2));
else {
  const layers = Object.entries(signal.byLayer).map(([layer, n]) => `${layer}=${n}`).join(' ') || 'none';
  const providers = Object.entries(signal.byProvider).map(([name, n]) => `${name}=${n}`).join(' ') || 'none';
  console.log(`StorySculpt ${signal.level.toUpperCase()}: ${signal.reason}. Last ${minutes}m: ${signal.attempts} attempt(s), ${signal.failures} failure(s), rate ${signal.failureRate}, by layer ${layers}. Provider failures: ${signal.providerFailures}, member walk-aways: ${signal.memberWalkaways}.`);
  console.log(`Kinds: outside services ${signal.kinds.provider} (${providers}), app errors ${signal.kinds.app}, rejected answers ${signal.kinds.rejected}, walk-aways ${signal.kinds.walkaway}. Tripped: ${signal.tripped.join(', ') || 'none'}.`);
}

const alert = incidentAlertMessage(signal);
if (alert && argv.includes('--alert')) {
  const { RESEND_API_KEY, CERTAINTY_REMINDER_FROM, CERTAINTY_OPERATOR_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CERTAINTY_REMINDER_FROM || !CERTAINTY_OPERATOR_EMAIL) {
    console.error('storysculpt-incidents: --alert needs RESEND_API_KEY, CERTAINTY_REMINDER_FROM and CERTAINTY_OPERATOR_EMAIL; the alert was not sent.');
  } else {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: CERTAINTY_REMINDER_FROM, to: [CERTAINTY_OPERATOR_EMAIL], subject: alert.subject, text: alert.text })
    });
    console.log(response.ok ? 'Alert emailed to David.' : `storysculpt-incidents: alert email failed (${response.status}).`);
  }
}
process.exit(signal.level === 'incident' ? 2 : 0);
