import { authenticatedUser, json } from './_lib/security.js';
import { detectCrisis } from './_lib/navigator-core.js';

export const config = { maxDuration: 30 };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';

// Friendly text for the exceptions the booking RPCs raise. Anything not listed
// is a real fault and surfaces as a generic message rather than a raw code.
const FRIENDLY = {
  SIGN_IN_REQUIRED: 'Sign in to book a session.',
  MEMBERSHIP_REQUIRED: 'Certainty Sessions is not included in your Studio access.',
  BAD_MODE: 'Choose Zoom or phone for the session.',
  OUTSIDE_HOURS: 'Sessions run between 10am and midnight Eastern.',
  PHONE_REQUIRED: 'Add the number for David to call.',
  IN_PAST: 'That time has already passed. Pick a later one.',
  ALREADY_BOOKED_THIS_WEEK: 'You already have a session this week. Cancel it first to choose a new time.',
  SLOT_TAKEN: 'Someone just took that time. Pick another open slot.',
  NOT_FOUND: 'That session could not be found.'
};

export const CERTAINTY_CRISIS_LINE = 'If you are in distress or thinking about hurting yourself, please call or text 988 right now. Your seat is held, but please reach out to someone who can support you today.';

// Pure helper: assesses a booking topic for crisis / self-harm language.
// Returns { tripped: true, line: '...', category: '...' } when crisis language
// is detected, or { tripped: false, line: null } for ordinary or empty topics.
export function evaluateCertaintyTopicSafety(topic) {
  const text = typeof topic === 'string' ? topic.trim() : '';
  if (!text) {
    return { tripped: false, line: null };
  }
  const check = detectCrisis(text);
  if (!check || !check.tripped) {
    return { tripped: false, line: null };
  }
  return {
    tripped: true,
    line: CERTAINTY_CRISIS_LINE,
    category: check.category || 'crisis'
  };
}

export const evaluateCertaintyTopic = evaluateCertaintyTopicSafety;
export const checkCertaintySafety = evaluateCertaintyTopicSafety;

// The time zones the settings panel offers by name. The panel also offers the
// member's own detected browser zone, which is always a real IANA zone, so the
// server accepts this list plus any zone the runtime itself recognises, and
// nothing else (UX 85, 86).
export const OFFERED_TIME_ZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London',
  'Europe/Paris', 'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland'
];

export function isOfferedTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const tz = value.trim();
  if (OFFERED_TIME_ZONES.includes(tz)) return true;
  try {
    if (typeof Intl.supportedValuesOf === 'function' && Intl.supportedValuesOf('timeZone').includes(tz)) return true;
  } catch (e) { /* fall through */ }
  return false;
}

// A phone number David can actually dial: digits with the usual separators,
// an optional leading +, and 7 to 15 digits in all.
export function isDialablePhone(value) {
  if (typeof value !== 'string') return false;
  const raw = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return false;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export const SETTINGS_ERRORS = {
  BAD_TIME_ZONE: 'Pick your time zone from the list so session times show correctly.',
  BAD_PHONE: 'That phone number does not look right. Use digits, with an area code, like (555) 123-4567.'
};

// Timezone and slot time calculation helpers.
export function getSlotInstant(isoDate, etHour) {
  const approx = new Date(`${isoDate}T${String(etHour).padStart(2, '0')}:00:00Z`);
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
  });
  const parts = {};
  f.formatToParts(approx).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value; });
  let h = Number(parts.hour === '24' ? 0 : parts.hour);
  let diff = etHour - h;
  return new Date(approx.getTime() + diff * 3600000);
}

export function formatSlotTime(isoDate, etHour, timeZone = 'America/New_York') {
  const instant = getSlotInstant(isoDate, etHour);
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
  const etText = `${etFormatter.format(instant)} ET`;
  if (!timeZone || timeZone === 'America/New_York') {
    return etText;
  }
  const memberFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric', minute: '2-digit', hour12: true
  });
  const memberText = memberFormatter.format(instant);
  return `${memberText} (${etText})`;
}

function token(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

async function hasEeeAccess(userToken) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/has_studio_app_access', {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + userToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_app_key: 'certainty' }) // its own key, or the Momentum Hub bundle (WBR-442)
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
    summary: 'Certainty Session with ' + (session.member_name || session.member_email),
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
    return json(res, 403, { error: 'Certainty Sessions is not included in your Studio access.' });
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

      let settings = null;
      try {
        const settingsRes = await rpc('certainty_get_settings', {}, userToken);
        if (settingsRes.ok && settingsRes.data) settings = settingsRes.data;
      } catch (err) {
        // Settings are additive and never block state read.
      }

      await recordEvent(userToken, 'certainty_state', {
        schema: 1, outcome: 'ok', latencyMs: Date.now() - startedAt,
        bookedThisWeek: Boolean(state.bookedThisWeek), hasUpcoming: Boolean(state.upcoming), historyCount: Number(state.historyCount || 0),
        engagement: String(state.engagement || 'unknown')
      });
      return json(res, 200, {
        ...state,
        settings,
        upcoming: state.upcoming ? { ...state.upcoming, join: joinFor(state.upcoming) } : null
      });
    }

    if (action === 'settings') {
      const settingsRes = await rpc('certainty_get_settings', {}, userToken);
      if (!settingsRes.ok) return fail(res, settingsRes);
      return json(res, 200, { settings: settingsRes.data });
    }

    if (action === 'save_settings') {
      const body = req.body || {};
      if (body.time_zone != null && body.time_zone !== '' && !isOfferedTimeZone(body.time_zone)) {
        return json(res, 400, { error: SETTINGS_ERRORS.BAD_TIME_ZONE, code: 'BAD_TIME_ZONE' });
      }
      if (body.phone != null && String(body.phone).trim() !== '' && !isDialablePhone(String(body.phone))) {
        return json(res, 400, { error: SETTINGS_ERRORS.BAD_PHONE, code: 'BAD_PHONE' });
      }
      const saved = await rpc('certainty_save_settings', {
        p_time_zone: body.time_zone ? String(body.time_zone) : null,
        p_phone: body.phone ? String(body.phone) : null,
        p_default_mode: body.default_mode ? String(body.default_mode) : 'zoom'
      }, userToken);
      if (!saved.ok) return fail(res, saved);

      await recordEvent(userToken, 'certainty_settings', {
        schema: 1,
        mode: String(body.default_mode || 'zoom'),
        hasTimeZone: Boolean(body.time_zone),
        hasPhone: Boolean(body.phone),
        latencyMs: Date.now() - startedAt
      });
      return json(res, 200, { ok: true, settings: saved.data });
    }

    if (action === 'book') {
      const body = req.body || {};
      const safetyAssessment = evaluateCertaintyTopicSafety(body.topic);
      if (body.mode === 'phone' && body.phone && !isDialablePhone(String(body.phone))) {
        return json(res, 400, { error: SETTINGS_ERRORS.BAD_PHONE, code: 'BAD_PHONE' });
      }

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

      if (safetyAssessment.tripped) {
        try {
          await rpc('certainty_flag_safety', { p_id: session.id }, userToken);
        } catch (e) {
          // If RPC is unavailable, flag is remembered in-session
        }
        session.safety_flag = true;
        session.safety_flagged_at = new Date().toISOString();

        // Log safety event that carries NO topic text
        await recordEvent(userToken, 'certainty_safety', {
          schema: 1,
          category: safetyAssessment.category || 'crisis',
          sessionId: session.id
        });
      }

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
        calendarConnected: Boolean(calendar.connected), latencyMs: Date.now() - startedAt,
        safetyTripped: safetyAssessment.tripped
      });

      const crisisPayload = safetyAssessment.tripped ? {
        tripped: true,
        line: safetyAssessment.line,
        category: safetyAssessment.category
      } : null;

      return json(res, 200, {
        session: { ...session, calendar_status: calendar.status, join },
        calendar,
        crisis: crisisPayload,
        safety: safetyAssessment.tripped ? true : undefined
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
