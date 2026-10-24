// Certainty session reminders: the scheduled job that reaches a member and David
// before a booked session. WO-20261001-evening / WBR-098 (Momentum 300 FAILs
// Developer 14, 84, 93). The booking engine in api/certainty.js holds the hour
// and writes David's calendar; nothing used to arrive ahead of the session on
// either side. This endpoint runs on a Vercel cron, finds sessions inside a lead
// window (24 hours and 1 hour out), reminds the member and gives David the
// upcoming list, and records a certainty_reminder event per send so a missed one
// is diagnosable. It is idempotent: each (session, window) is reminded once.
//
// Why this is the one Certainty path that uses the service key. Every member
// action goes through a SECURITY DEFINER RPC that resolves the member from
// auth.uid(). A cron has no member session (auth.uid() is null), so the booking
// RPCs cannot drive it. The three certainty_reminder_* RPCs are granted to
// service_role only and are called here with the service key. This file never
// reaches the browser (it is an API route), so no server credential leaves the
// server. The WorkerBee API's no-service-key rule is about api/workerbee.js and
// client code; a scheduled operator job is exactly what the service key is for.
//
// Fail closed and logged, never a placeholder. The send channel is gated on what
// David configures. Until he picks one (see CERTAINTY_REMINDER_CHANNEL below),
// each due reminder is recorded as 'held' and nothing is sent: a held reminder
// is visible and honest; a reminder sent to a guessed address is not.

export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
// The service key. The reminder RPCs are granted to service_role only, so the
// job authenticates as service_role rather than as a member. Both common names
// are accepted so the key can be stored under whichever one the project uses.
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// The send channel David picks. Unset (or anything other than 'email') means
// hold: record the reminder and send nothing. 'email' sends through Resend when
// the sender identity is also configured; if it is not, that too holds rather
// than inventing a sender. Either way the reminder is recorded, never dropped.
const CHANNEL = String(process.env.CERTAINTY_REMINDER_CHANNEL || '').trim().toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const REMINDER_FROM = process.env.CERTAINTY_REMINDER_FROM || '';
const OPERATOR_EMAIL = process.env.CERTAINTY_OPERATOR_EMAIL || '';

// David's Zoom room, server-side only, from the same CERTAINTY_ZOOM_URL setting
// as the booking endpoint and never from source: only a member who holds a
// booking ever receives the link, here in their reminder (Developer 97).
function zoomUrl() {
  return String(process.env.CERTAINTY_ZOOM_URL || '').trim() || null;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Only the scheduler may trigger this. Vercel Cron sends the project's
// CRON_SECRET as a bearer token; a request without it is refused so the endpoint
// is not a public send button. If CRON_SECRET is not configured the endpoint
// fails closed rather than running wide open.
function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  const header = String(req.headers.authorization || '');
  return header === 'Bearer ' + secret;
}

// The hourly tick (WBR-458, Developer 84). Vercel Hobby runs the cron above at
// most once a day, so pg_cron calls this job every hour carrying a single-use
// nonce the database minted a moment earlier. The job consumes it with the
// service key; it is accepted once and only within ten minutes, so the header
// is no standing credential and no secret was copied into the database.
const TICK_HEADER = 'x-certainty-tick';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tickNonce(req) {
  const value = String((req.headers && req.headers[TICK_HEADER]) || '').trim();
  return UUID_RE.test(value) ? value : null;
}

// A run is missed when the last heartbeat is older than this. The daily cron
// alone would leave 24 hours between runs; 26 gives it two hours of slack.
export const MISSED_AFTER_HOURS = 26;

// What David reads when a run was missed. Pure, so the check can exercise it.
export function missedRunAlert(run) {
  if (!run || !run.missed) return null;
  const last = run.previousRanAt ? new Date(run.previousRanAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown';
  const line = 'Reminder job gap: the last run before this one was ' + run.gapHours + ' hours ago (' + last + '), past the ' + (run.thresholdHours || MISSED_AFTER_HOURS) + '-hour limit. Reminders due in that gap may not have gone out.';
  return {
    line,
    subject: 'Certainty reminders: a run was missed',
    text: [line, '', 'Check the Vercel cron for /api/certainty-reminders and the hourly pg_cron job certainty-reminders-hourly.'].join('\n')
  };
}

async function rpc(name, args) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args || {})
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (error) { data = raw; }
  return { ok: response.ok, status: response.status, data };
}

// The reminder channel as it actually stands right now. 'email' only when the
// sender identity is present too; otherwise 'held' with the reason, so a run is
// self-explaining in the logs.
function channelState() {
  if (CHANNEL !== 'email') {
    return { active: false, name: 'held', reason: CHANNEL ? 'unknown-channel:' + CHANNEL : 'no-channel-configured' };
  }
  if (!RESEND_API_KEY || !REMINDER_FROM) {
    return { active: false, name: 'held', reason: 'email-not-configured' };
  }
  return { active: true, name: 'email', reason: null };
}

async function sendEmail({ to, subject, text }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMINDER_FROM, to: [to], subject, text })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('resend ' + response.status + (detail ? ': ' + detail.slice(0, 200) : ''));
  }
  return true;
}

// What the member reads. Warm, specific, and short: the exact day and time, how
// to join, and nothing to do but show up. The lead window only chooses the first
// line; the time itself is always stated so the message is right whether it
// lands a day or an hour ahead.
export function memberMessage(item) {
  const lead = item.lead_window === '1h' ? 'Your Certainty session is coming up soon.' : 'A reminder about your Certainty session.';
  const when = item.label_day + ', ' + item.label_start + ' to ' + item.label_end + ' Eastern';
  const how = item.mode === 'zoom'
    ? (zoomUrl() ? 'Join on Zoom: ' + zoomUrl() : 'David will send the Zoom link before the session.')
    : 'David will call you' + (item.phone ? ' at ' + item.phone : '') + '.';
  const name = item.member_name ? item.member_name.split(' ')[0] : 'there';
  return {
    subject: item.lead_window === '1h' ? 'Your session with David starts soon' : 'Your session with David on ' + item.label_day,
    text: [
      'Hi ' + name + ',',
      '',
      lead,
      '',
      when,
      how,
      '',
      'Bring whatever is most on your mind. See you there.'
    ].join('\n')
  };
}

// David's upcoming-session summary for this run: the sessions just reminded, so
// he sees what is coming without opening the operator view.
// Flagged sessions lead, labelled, and say that no automated reminder went to
// the member, so David knows the reach-out is his.
export function operatorMessage(items, alert = null) {
  const ordered = items.slice().sort((a, b) => Number(Boolean(b.safety_flag)) - Number(Boolean(a.safety_flag)));
  const lines = ordered.map((it) => {
    const who = it.member_name ? it.member_name + ' (' + it.member_email + ')' : it.member_email;
    const how = it.mode === 'zoom' ? 'Zoom' : 'phone' + (it.phone ? ' ' + it.phone : '');
    const flag = it.safety_flag ? ' [Needs a human look before this session. No automated reminder was sent to them.]' : '';
    const calFlag = it.calendar_status === 'failed' ? ' [CALENDAR SYNC FAILED: needs retry]' : '';
    return '- ' + it.label_day + ', ' + it.label_start + ': ' + who + ', ' + how + flag + calFlag;
  });
  return {
    subject: 'Certainty sessions coming up (' + items.length + ')',
    text: [...(alert ? [alert.line, ''] : []), 'Upcoming Certainty sessions just reminded:', '', ...lines].join('\n')
  };
}

// The one decision the job makes per member reminder. A safety-flagged session
// (the booking side read the topic as a crisis) never gets an automated nudge,
// whatever the channel: David reaches out himself, and the skip is recorded as
// held with reason 'safety-flag'. Otherwise the channel decides. Pure, so the
// check script can exercise it without a network.
export function planMemberReminder(item, channel) {
  if (item && item.safety_flag) return { send: false, outcome: 'held', holdReason: 'safety-flag' };
  if (!channel || !channel.active) return { send: false, outcome: 'held', holdReason: null };
  return { send: true, outcome: null, holdReason: null };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  const nonce = cronAuthorized(req) ? null : tickNonce(req);
  if (!cronAuthorized(req) && !nonce) {
    // No DB event here: with no member and possibly no service key, there is
    // nothing to attribute an event to. Fail closed and say why in the response
    // and the function log.
    const why = process.env.CRON_SECRET ? 'unauthorized' : 'cron-secret-not-configured';
    console.error('certainty-reminders refused:', why);
    return sendJson(res, process.env.CRON_SECRET ? 401 : 503, { ok: false, error: why });
  }
  if (!SERVICE_KEY) {
    console.error('certainty-reminders: service key not configured');
    return sendJson(res, 503, { ok: false, error: 'service-key-not-configured' });
  }
  if (nonce) {
    const consumed = await rpc('certainty_consume_tick', { p_nonce: nonce });
    if (!consumed.ok || consumed.data !== true) {
      console.error('certainty-reminders refused: tick-not-accepted', consumed.status);
      return sendJson(res, 401, { ok: false, error: 'tick-not-accepted' });
    }
  }
  const trigger = nonce ? 'hourly-tick' : (req.query && req.query.trigger === 'manual' ? 'manual' : 'vercel-cron');

  // The heartbeat comes first, before any query that could fail, so a run that
  // happened is always on record and the gap to the previous one is known.
  const channel = channelState();
  const beat = await rpc('certainty_record_reminder_run', {
    p_trigger: trigger,
    p_detail: { channel: channel.name },
    p_missed_after_hours: MISSED_AFTER_HOURS
  });
  const run = beat.ok && beat.data ? beat.data : null;
  if (!run) console.error('certainty-reminders: heartbeat write failed', beat.status);
  const alert = missedRunAlert(run);
  if (alert) console.error('certainty-reminders: missed run', JSON.stringify({ gapHours: run.gapHours, previousRanAt: run.previousRanAt }));

  const finishRun = async (detail, alertOutcome) => {
    if (run && run.id) await rpc('certainty_finish_reminder_run', { p_id: run.id, p_detail: detail, p_alert_outcome: alertOutcome });
  };

  const now = new Date().toISOString();
  const due = await rpc('certainty_due_reminders', { p_now: now });
  if (!due.ok) {
    console.error('certainty-reminders: due query failed', due.status, due.data);
    await finishRun({ outcome: 'due-query-failed', status: due.status }, alert ? 'held' : null);
    return sendJson(res, 502, { ok: false, error: 'due-query-failed', status: due.status });
  }
  const items = Array.isArray(due.data) ? due.data : [];

  // Claim each due reminder first, so an overlapping run cannot also send it.
  const claimed = [];
  for (const item of items) {
    const claim = await rpc('certainty_claim_reminder', {
      p_session_id: item.session_id,
      p_lead_window: item.lead_window,
      p_channel: channel.name === 'email' ? 'email' : 'held'
    });
    if (claim.ok && claim.data === true) claimed.push(item);
  }

  // David's digest once per run, covering the sessions reminded this run, led
  // by the missed-run alert when there is one. With nothing to remind, a missed
  // run still reaches him on its own. The digest outcome is recorded on each
  // session's reminder row as the operator side.
  let operatorOutcome = 'held';
  if ((claimed.length || alert) && channel.active && OPERATOR_EMAIL) {
    try {
      const msg = claimed.length ? operatorMessage(claimed, alert) : alert;
      await sendEmail({ to: OPERATOR_EMAIL, subject: msg.subject, text: msg.text });
      operatorOutcome = 'sent';
    } catch (error) {
      console.error('certainty-reminders: operator digest failed', String(error));
      operatorOutcome = 'failed';
    }
  }
  const alertOutcome = alert ? operatorOutcome : null;

  const counts = { sent: 0, held: 0, failed: 0, safetyHeld: 0 };
  for (const item of claimed) {
    const plan = planMemberReminder(item, channel);
    let memberOutcome = plan.outcome || 'held';
    if (plan.send) {
      try {
        const msg = memberMessage(item);
        await sendEmail({ to: item.member_email, subject: msg.subject, text: msg.text });
        memberOutcome = 'sent';
      } catch (error) {
        console.error('certainty-reminders: member send failed', item.session_id, item.lead_window, String(error));
        memberOutcome = 'failed';
      }
    }
    counts[memberOutcome] += 1;
    await rpc('certainty_finalize_reminder', {
      p_session_id: item.session_id,
      p_lead_window: item.lead_window,
      p_channel: channel.name === 'email' ? 'email' : 'held',
      p_member_outcome: memberOutcome,
      p_operator_outcome: operatorOutcome,
      p_hold_reason: plan.holdReason
    });
    if (plan.holdReason) counts.safetyHeld = (counts.safetyHeld || 0) + 1;
  }

  const summary = {
    ok: true,
    trigger,
    channel: channel.name,
    channelReason: channel.reason,
    due: items.length,
    claimed: claimed.length,
    ...counts,
    operatorOutcome: claimed.length || alert ? operatorOutcome : null,
    heartbeat: run ? { gapHours: run.gapHours, missed: run.missed, alertOutcome } : null
  };
  await finishRun({ outcome: 'ok', due: items.length, claimed: claimed.length, ...counts }, alertOutcome);
  return sendJson(res, 200, summary);
}
