import { authenticatedUser, json } from './_lib/security.js';

export const config = { maxDuration: 30 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';

// Friendly text for the exceptions the booking RPCs raise. Anything not listed
// is a real fault and surfaces as a generic message rather than a raw code.
const FRIENDLY = {
  SIGN_IN_REQUIRED: 'Sign in to book a session.',
  MEMBERSHIP_REQUIRED: 'An active Momentum Hub membership is required.',
  BAD_MODE: 'Choose Zoom or phone for the session.',
  OUTSIDE_HOURS: 'Sessions run between 10am and midnight Eastern.',
  PHONE_REQUIRED: 'Add the number for David to call.',
  IN_PAST: 'That time has already passed. Pick a later one.',
  ALREADY_BOOKED_THIS_WEEK: 'You already have a session this week. Cancel it first to choose a new time.',
  SLOT_TAKEN: 'Someone just took that time. Pick another open slot.',
  NOT_FOUND: 'That session could not be found.'
};

function token(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

async function hasEeeAccess(userToken) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/has_studio_app_access', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + userToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_app_key: 'eee' })
  });
  return response.ok && (await response.json().catch(() => false)) === true;
}

async function rpc(name, args, userToken) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + userToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {})
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (error) { data = raw; }
  return { ok: response.ok, status: response.status, data };
}

// Observability. Every book, cancel, state read, and calendar write records an
// event so a broken booking is diagnosable and detectable before a member
// reports it (Developer 21, 22, 71, 72, 76, 79, 80). It goes through the
// record_log_event RPC, not a direct POST to /rest/v1/logs: the logs INSERT
// policy checks the INTERNAL public.users.id, which this serverless function
// does not hold (it only has the auth uid). The RPC resolves the member's
// internal id from auth.uid() itself, so the event is attributed to the member
// who caused it and actually lands. It is best-effort and never throws or
// blocks the booking on its own failure: telemetry that breaks the feature it
// watches is worse than no telemetry. An event NEVER carries member content:
// no topic, no phone, no email, only outcomes, modes, codes, and timings.
async function recordEvent(userToken, eventType, detail) {
  if (!userToken) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/record_log_event', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + userToken,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ p_event_type: eventType, p_detail: detail || {} }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    // Observability must never break the app.
  }
}

// The friendly error code an RPC raised, e.g. SLOT_TAKEN, for the event detail.
// It is a low-cardinality class, never member content.
function resultCode(result) {
  return (result && result.data && result.data.message) || (result && !result.ok ? 'rpc-error' : null);
}

// David's personal Zoom room. Override with the CERTAINTY_ZOOM_URL env var to
// keep it out of source (the Vercel token could not set it during the build).
// Either way it stays server-side: the join link is only ever returned to the
// member who holds the booking, never rendered on a public page.
const ZOOM_URL = process.env.CERTAINTY_ZOOM_URL || 'https://us06web.zoom.us/my/davidbee?pwd=yjZwIYrQ32ju9k66B0VvZKADp9fxMs.1';

// The join detail is composed here, not stored, so the Zoom room link only ever
// reaches a member who holds the booking.
function joinFor(session) {
  if (!session) return null;
  if (session.mode === 'zoom') {
    return { mode: 'zoom', label: 'Join on Zoom', joinUrl: ZOOM_URL };
  }
  return { mode: 'phone', label: 'David will call you', phone: session.phone || '' };
}

// The calendar write. Real, but only runs when the three Google values are set;
// until David connects the calendar it reports "not connected" and the booking
// still stands. This is the one seam left for the next pass.
async function googleAccessToken() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  return data.access_token || null;
}

async function writeToCalendar(session, join) {
  const accessToken = await googleAccessToken();
  if (!accessToken) return { connected: false, status: 'skipped' };
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const lines = [
    'Certainty Session with a Momentum Hub member.',
    '',
    'Member: ' + (session.member_name ? session.member_name + ' (' + session.member_email + ')' : session.member_email),
    session.mode === 'zoom' ? 'Format: Zoom' : 'Format: Phone call to ' + (session.phone || 'the number on file'),
    session.topic ? '' : null,
    session.topic ? 'Bringing: ' + session.topic : null
  ].filter(line => line !== null);
  const event = {
    summary: 'Certainty Session — ' + (session.member_name || session.member_email),
    description: lines.join('\n'),
    start: { dateTime: session.starts_at },
    end: { dateTime: session.ends_at },
    attendees: [{ email: session.member_email }]
  };
  if (session.mode === 'zoom' && join && join.joinUrl) event.location = join.joinUrl;
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events?sendUpdates=all',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    }
  );
  if (!response.ok) return { connected: true, status: 'failed' };
  const created = await response.json().catch(() => ({}));
  return { connected: true, status: 'created', eventId: created.id || null };
}

function fail(res, result) {
  const code = result && result.data && result.data.message;
  if (code && FRIENDLY[code]) return json(res, 400, { error: FRIENDLY[code], code });
  return json(res, 500, { error: 'Something went wrong with the session. Try again in a moment.' });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  const userToken = token(req);
  const user = await authenticatedUser(req);
  if (!user || !(await hasEeeAccess(userToken))) {
    // An authenticated member without access is worth seeing; an anonymous
    // caller has no member row so the event is simply dropped by the RPC.
    if (user) await recordEvent(userToken, 'certainty_denied', { schema: 1, outcome: 'denied', reason: 'no-eee-access' });
    return json(res, 403, { error: 'An active Momentum Hub membership is required.' });
  }

  const action = String(req.body && req.body.action || 'state');
  const startedAt = Date.now();

  try {
    if (action === 'state') {
      const result = await rpc('certainty_state', { p_days: 21 }, userToken);
      if (!result.ok) {
        await recordEvent(userToken, 'certainty_state', { schema: 1, outcome: 'error', code: resultCode(result), latencyMs: Date.now() - startedAt });
        return fail(res, result);
      }
      const state = result.data || {};
      await recordEvent(userToken, 'certainty_state', {
        schema: 1, outcome: 'ok', latencyMs: Date.now() - startedAt,
        bookedThisWeek: Boolean(state.bookedThisWeek), hasUpcoming: Boolean(state.upcoming), historyCount: Number(state.historyCount || 0)
      });
      return json(res, 200, { ...state, upcoming: state.upcoming ? { ...state.upcoming, join: joinFor(state.upcoming) } : null });
    }

    if (action === 'book') {
      const body = req.body || {};
      const booked = await rpc('book_certainty_session', {
        p_local_date: String(body.date || ''),
        p_hour: Number(body.hour),
        p_mode: String(body.mode || ''),
        p_phone: body.phone ? String(body.phone) : null,
        p_topic: body.topic ? String(body.topic) : null
      }, userToken);
      if (!booked.ok) {
        await recordEvent(userToken, 'certainty_book', {
          schema: 1, outcome: 'error', mode: String(body.mode || ''), code: resultCode(booked), latencyMs: Date.now() - startedAt
        });
        return fail(res, booked);
      }

      const session = booked.data;
      const join = joinFor(session);
      // Hold it on David's calendar. If the calendar is not connected yet, the
      // booking is still real; we just record that it did not sync.
      let calendar = { connected: false, status: 'skipped' };
      try {
        calendar = await writeToCalendar(session, join);
      } catch (error) {
        calendar = { connected: true, status: 'failed' };
      }
      await rpc('certainty_set_calendar', { p_id: session.id, p_event_id: calendar.eventId || null, p_status: calendar.status }, userToken);
      // The calendar write is its own event so a silent calendar outage is
      // visible on its own, not buried inside the booking's success.
      await recordEvent(userToken, 'certainty_calendar', {
        schema: 1, status: calendar.status, connected: Boolean(calendar.connected)
      });
      await recordEvent(userToken, 'certainty_book', {
        schema: 1, outcome: 'ok', mode: String(session.mode || ''), calendarStatus: calendar.status,
        calendarConnected: Boolean(calendar.connected), latencyMs: Date.now() - startedAt
      });

      return json(res, 200, {
        session: { ...session, calendar_status: calendar.status, join },
        calendar
      });
    }

    if (action === 'cancel') {
      const cancelled = await rpc('cancel_certainty_session', { p_id: String(req.body && req.body.id || '') }, userToken);
      if (!cancelled.ok) {
        await recordEvent(userToken, 'certainty_cancel', { schema: 1, outcome: 'error', code: resultCode(cancelled), latencyMs: Date.now() - startedAt });
        return fail(res, cancelled);
      }
      await recordEvent(userToken, 'certainty_cancel', { schema: 1, outcome: 'ok', latencyMs: Date.now() - startedAt });
      return json(res, 200, { cancelled: true });
    }

    return json(res, 400, { error: 'Unknown action.' });
  } catch (error) {
    await recordEvent(userToken, 'certainty_error', { schema: 1, outcome: 'error', action, latencyMs: Date.now() - startedAt });
    return json(res, 500, { error: (error && error.message) || 'The session service is unavailable right now.' });
  }
}
