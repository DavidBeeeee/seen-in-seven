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

// David's Zoom room, server-side only, same source as the booking endpoint: only
// a member who holds a booking ever receives the link, here in their reminder.
const ZOOM_URL = process.env.CERTAINTY_ZOOM_URL || 'https://us06web.zoom.us/my/davidbee?pwd=yjZwIYrQ32ju9k66B0VvZKADp9fxMs.1';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Only the scheduler may trigger this. Vercel Cron sends the project's
// CRON_SECRET as a bearer token; a request without it is refused so the endpoint
// is not a public send button. If CRON_SECRET is not configured the endpoint
// fails closed rather than running wide open.
function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  const header = String(req.headers.authorization || '');
  return header === 'Bearer ' + secret;
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
    ? 'Join on Zoom: ' + ZOOM_URL
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
export function operatorMessage(items) {
  const ordered = items.slice().sort((a, b) => Number(Boolean(b.safety_flag)) - Number(Boolean(a.safety_flag)));
  const lines = ordered.map((it) => {
    const who = it.member_name ? it.member_name + ' (' + it.member_email + ')' : it.member_email;
    const how = it.mode === 'zoom' ? 'Zoom' : 'phone' + (it.phone ? ' ' + it.phone : '');
    const flag = it.safety_flag ? ' [Needs a human look before this session. No automated reminder was sent to them.]' : '';
    return '- ' + it.label_day + ', ' + it.label_start + ': ' + who + ', ' + how + flag;
  });
  return {
    subject: 'Certainty sessions coming up (' + items.length + ')',
    text: ['Upcoming Certainty sessions just reminded:', '', ...lines].join('\n')
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
  if (!authorized(req)) {
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

  const now = new Date().toISOString();
  const due = await rpc('certainty_due_reminders', { p_now: now });
  if (!due.ok) {
    console.error('certainty-reminders: due query failed', due.status, due.data);
    return sendJson(res, 502, { ok: false, error: 'due-query-failed', status: due.status });
  }
  const items = Array.isArray(due.data) ? due.data : [];

  // Claim each due reminder first, so an overlapping run cannot also send it.
  const claimed = [];
  for (const item of items) {
    const channel = channelState();
    const claim = await rpc('certainty_claim_reminder', {
      p_session_id: item.session_id,
      p_lead_window: item.lead_window,
      p_channel: channel.name === 'email' ? 'email' : 'held'
    });
    if (claim.ok && claim.data === true) claimed.push(item);
  }

  if (!claimed.length) {
    return sendJson(res, 200, { ok: true, due: items.length, claimed: 0, sent: 0, held: 0, failed: 0 });
  }

  const channel = channelState();

  // David's digest once per run, covering the sessions reminded this run. Its
  // outcome is recorded on each session's reminder row as the operator side.
  let operatorOutcome = 'held';
  if (channel.active && OPERATOR_EMAIL) {
    try {
      const msg = operatorMessage(claimed);
      await sendEmail({ to: OPERATOR_EMAIL, subject: msg.subject, text: msg.text });
      operatorOutcome = 'sent';
    } catch (error) {
      console.error('certainty-reminders: operator digest failed', String(error));
      operatorOutcome = 'failed';
    }
  }

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

  return sendJson(res, 200, {
    ok: true,
    channel: channel.name,
    channelReason: channel.reason,
    due: items.length,
    claimed: claimed.length,
    ...counts,
    operatorOutcome
  });
}
