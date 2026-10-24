import { randomUUID } from 'node:crypto';
import { readReminderHeartbeat } from './_lib/reminder-heartbeat.js';
import { consumeQuota, json } from './_lib/security.js';
import { detectCrisis } from './_lib/navigator-core.js';

export const config = { maxDuration: 30 };

// App version and topic length limits (Developer 47, 89)
export const CERTAINTY_APP_VERSION = '2026.10.21.1';
export const CERTAINTY_TOPIC_MAX_LENGTH = 200;
export const TOPIC_MAX_LENGTH = 200;
export const MAX_CALENDAR_RETRIES = 3;
export const CALENDAR_BACKOFF_BASE_MS = 200;

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
  NOT_FOUND: 'That session could not be found.',
  TOPIC_TOO_LONG: 'Topic must be 200 characters or fewer.',
  CANNOT_UPDATE_CANCELLED: 'A cancelled session cannot be updated. Book a new time instead.',
  SESSION_ALREADY_ENDED: 'Past sessions cannot be rescheduled.',
  RATE_LIMITED: 'Certainty Sessions needs a short pause before the next request.'
};

// The planned answer when the session database cannot be reached (Developer 82):
// a coded 503 the page can show as written, logged without member content,
// never a hanging request or a blank page.
export const SESSIONS_UNREACHABLE = {
  code: 'SESSIONS_UNREACHABLE',
  error: 'We could not reach your sessions just now. Your bookings are safe. Give it a minute and try again.'
};
export const SUPABASE_TIMEOUT_MS = 6000;

function unreachable(res, where, correlationId, detail = {}) {
  // recordEvent goes through Supabase too and is likely down with it, so the
  // outage is also written to the runtime log, where it always lands.
  console.error(JSON.stringify({
    event: 'certainty_unreachable', where, correlationId, appVersion: CERTAINTY_APP_VERSION, ...detail
  }));
  return json(res, 503, { ...SESSIONS_UNREACHABLE, correlationId });
}

async function supabaseFetch(url, init, fetchFn = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// An outage is a network failure, a timeout, or a gateway-class status. A 4xx is
// a real answer from a database that is up.
function isOutageStatus(status) {
  return status === 0 || status >= 500;
}

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

// The signed-in member, or null, or 'unreachable' when Supabase auth itself is
// down, so an outage is never reported as "not included in your access".
async function memberFor(userToken) {
  if (!userToken) return null;
  try {
    const response = await supabaseFetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + userToken }
    });
    if (isOutageStatus(response.status)) return 'unreachable';
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return user && user.id ? user : null;
  } catch (error) {
    return 'unreachable';
  }
}

async function hasEeeAccess(userToken) {
  try {
    const response = await supabaseFetch(SUPABASE_URL + '/rest/v1/rpc/has_studio_app_access', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + userToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_app_key: 'certainty' }) // its own key, or the Momentum Hub bundle (WBR-442)
    });
    if (isOutageStatus(response.status)) return 'unreachable';
    return response.ok && (await response.json().catch(() => false)) === true;
  } catch (error) {
    return 'unreachable';
  }
}

async function rpc(name, args, userToken) {
  let response;
  try {
    response = await supabaseFetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + userToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    });
  } catch (error) {
    return { ok: false, status: 0, data: null, unreachable: true, rpc: name };
  }
  const raw = await response.text().catch(() => '');
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (error) { data = raw; }
  return { ok: response.ok, status: response.status, data, unreachable: isOutageStatus(response.status), rpc: name };
}

// Observability. Every book, cancel, state read, and calendar write records an
// event so a broken booking is diagnosable and detectable before a member
// reports it (Developer 21, 22, 23, 25, 71, 72, 74, 76, 77, 80, 89, 100).
// Each event carries a correlationId linking the request end-to-end, and the
// app version.
// It goes through the record_log_event RPC, not a direct POST to /rest/v1/logs.
// An event NEVER carries member content: no topic, no phone, no email, only
// outcomes, modes, codes, timings, and correlation IDs.
export async function recordEvent(userToken, eventType, detail, correlationId = null) {
  if (!userToken) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const payload = {
      ...(detail || {}),
      correlationId: correlationId || (detail && detail.correlationId) || null,
      appVersion: CERTAINTY_APP_VERSION
    };
    try {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/record_log_event', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + userToken,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ p_event_type: eventType, p_detail: payload }),
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

// David's personal Zoom room lives in the CERTAINTY_ZOOM_URL setting on Vercel,
// never in source (Developer 97). It is read per request, and a missing setting
// gives an honest pending state rather than a dead or stale link.
export const ZOOM_PENDING_LABEL = 'Zoom link coming from David';

export function zoomUrl() {
  return String(process.env.CERTAINTY_ZOOM_URL || '').trim() || null;
}

// The join detail is composed here, not stored, so the Zoom room link only ever
// reaches a member who holds the booking.
export function joinFor(session) {
  if (!session) return null;
  if (session.mode === 'zoom') {
    const url = zoomUrl();
    if (!url) return { mode: 'zoom', label: ZOOM_PENDING_LABEL, joinUrl: null, pending: true };
    return { mode: 'zoom', label: 'Join on Zoom', joinUrl: url };
  }
  return { mode: 'phone', label: 'David will call you', phone: session.phone || '' };
}

// Member-visible sync state enrichment (Developer 24, 27, 28, 29, 30, 86; Stranger 38; UX 6).
// Enriches session payload with calendar_sync_state, calendar_sync_label, and
// calendar_sync object for client rendering.
export function enrichSessionWithSyncState(session) {
  if (!session) return null;
  const status = session.calendar_status || 'pending';
  let syncState = 'pending';
  let syncLabel = 'Holding slot on calendar...';
  let isSynced = false;
  let isFailed = false;

  if (status === 'created') {
    syncState = 'synced';
    syncLabel = "Synced to David's calendar";
    isSynced = true;
  } else if (status === 'failed') {
    syncState = 'failed';
    syncLabel = 'Not yet synced to calendar (will retry)';
    isFailed = true;
  } else if (status === 'skipped') {
    syncState = 'not_connected';
    syncLabel = 'Held in Studio';
  }

  return {
    ...session,
    calendar_status: status,
    calendar_sync_state: syncState,
    calendar_sync_label: syncLabel,
    calendar_sync: {
      status,
      state: syncState,
      label: syncLabel,
      synced: isSynced,
      failed: isFailed,
      retryable: isFailed
    }
  };
}

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

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calendar write with retry and exponential backoff (Developer 28, 29, 30, 86).
// Attempts up to maxRetries times with exponential backoff on transient errors.
export async function writeToCalendarWithRetry(session, join, options = {}) {
  const maxRetries = options.maxRetries ?? MAX_CALENDAR_RETRIES;
  const backoffBaseMs = options.backoffBaseMs ?? CALENDAR_BACKOFF_BASE_MS;
  const sleepFn = options.sleepFn || defaultSleep;
  const fetchFn = options.fetchFn || fetch;
  const tokenFn = options.googleAccessTokenFn || googleAccessToken;

  const accessToken = await tokenFn();
  if (!accessToken) return { connected: false, status: 'skipped', attempts: 0 };

  // The destination is the calendar id, which names a calendar and is never a
  // secret; it rides on every outcome so a write can be traced (Developer 27).
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

  let lastError = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    attempts = attempt;
    try {
      const response = await fetchFn(
        'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events?sendUpdates=all',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        }
      );

      if (response.ok) {
        const created = await response.json().catch(() => ({}));
        return {
          connected: true,
          status: 'created',
          eventId: created.id || null,
          destination: calendarId,
          attempts
        };
      }

      // If client-side non-retryable error (e.g. 400 Bad Request), stop immediately
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const errText = await response.text().catch(() => '');
        return {
          connected: true,
          status: 'failed',
          attempts,
          statusCode: response.status,
          lastError: errText || `HTTP ${response.status}`,
          retryable: false,
          destination: calendarId
        };
      }

      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = (err && err.message) || 'Network error';
    }

    if (attempt < maxRetries) {
      const delay = backoffBaseMs * Math.pow(2, attempt - 1);
      await sleepFn(delay);
    }
  }

  return {
    connected: true,
    status: 'failed',
    attempts,
    lastError,
    retryable: true,
    destination: calendarId
  };
}

export const writeToCalendar = writeToCalendarWithRetry;

function fail(res, result, correlationId = null) {
  if (result && result.unreachable) {
    return unreachable(res, result.rpc || 'rpc', correlationId, { status: result.status });
  }
  const code = result && result.data && result.data.message;
  if (code && FRIENDLY[code]) return json(res, 400, { error: FRIENDLY[code], code, correlationId });
  return json(res, 500, { error: 'Something went wrong with the session. Try again in a moment.', correlationId });
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.action === 'heartbeat') {
    res.setHeader('Cache-Control', 'no-store');
    try { return json(res, 200, await readReminderHeartbeat()); }
    catch { return json(res, 503, { ageHours: null }); }
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  // Request correlation id (Developer 22, 25, 72, 76, 80, 100)
  const incomingId = String(req.headers['x-correlation-id'] || req.headers['x-request-id'] || '').trim();
  const correlationId = incomingId || randomUUID();
  try {
    if (res.setHeader) res.setHeader('x-correlation-id', correlationId);
  } catch (e) { /* ignore header error */ }

  const userToken = token(req);
  const user = await memberFor(userToken);
  if (user === 'unreachable') return unreachable(res, 'auth', correlationId);
  const access = user ? await hasEeeAccess(userToken) : false;
  if (access === 'unreachable') return unreachable(res, 'access', correlationId);
  if (!user || access !== true) {
    if (user) {
      await recordEvent(userToken, 'certainty_denied', {
        schema: 1, outcome: 'denied', reason: 'no-eee-access'
      }, correlationId);
    }
    return json(res, 403, { error: 'Certainty Sessions is not included in your Studio access.', correlationId });
  }

  const action = String(req.body && req.body.action || 'state');
  const startedAt = Date.now();

  try {
    if (action === 'state') {
      // Rate limit check using the api_usage quota pattern (Developer 99)
      let rateLimitAllowed = true;
      try {
        rateLimitAllowed = await consumeQuota({
          subject: 'user:' + user.id,
          endpoint: 'certainty',
          limit: 60,
          req,
          userId: user.id
        });
      } catch (rateErr) {
        // If usage protection secret is not configured in local environment,
        // do not break the app.
      }

      if (!rateLimitAllowed) {
        await recordEvent(userToken, 'certainty_rate_limited', {
          schema: 1,
          action: 'state',
          outcome: 'rate_limited',
          userId: user.id
        }, correlationId);
        return json(res, 429, {
          error: FRIENDLY.RATE_LIMITED,
          code: 'RATE_LIMITED',
          correlationId
        });
      }

      const result = await rpc('certainty_state', { p_days: 21 }, userToken);
      if (!result.ok) {
        await recordEvent(userToken, 'certainty_state', {
          schema: 1, outcome: 'error', code: resultCode(result), latencyMs: Date.now() - startedAt
        }, correlationId);
        return fail(res, result, correlationId);
      }
      const state = result.data || {};

      let settings = null;
      try {
        const settingsRes = await rpc('certainty_get_settings', {}, userToken);
        if (settingsRes.ok && settingsRes.data) {
          settings = settingsRes.data;
        } else if (!settingsRes.ok) {
          await recordEvent(userToken, 'certainty_rpc_error', {
            schema: 1, rpc: 'certainty_get_settings', code: resultCode(settingsRes)
          }, correlationId);
        }
      } catch (err) {
        // Settings are additive and never block state read.
      }

      await recordEvent(userToken, 'certainty_state', {
        schema: 1, outcome: 'ok', latencyMs: Date.now() - startedAt,
        bookedThisWeek: Boolean(state.bookedThisWeek), hasUpcoming: Boolean(state.upcoming),
        historyCount: Number(state.historyCount || 0),
        engagement: String(state.engagement || 'unknown')
      }, correlationId);

      // Return app version and member-visible sync state (Developer 89; Stranger 38; UX 6)
      const upcomingWithJoin = state.upcoming ? { ...state.upcoming, join: joinFor(state.upcoming) } : null;
      const upcomingEnriched = upcomingWithJoin ? enrichSessionWithSyncState(upcomingWithJoin) : null;

      return json(res, 200, {
        ...state,
        app_version: CERTAINTY_APP_VERSION,
        version: CERTAINTY_APP_VERSION,
        correlationId,
        settings,
        upcoming: upcomingEnriched
      });
    }

    // Paged session history (WBR-458, UX 71, 72). The state read above still
    // returns its first fifty rows unchanged; this pages past them and gives
    // the true total. offset defaults to 0, limit to 50 (at most 100).
    if (action === 'history') {
      const offset = Math.max(0, Math.floor(Number(req.body && req.body.offset) || 0));
      const limit = Math.min(100, Math.max(1, Math.floor(Number(req.body && req.body.limit) || 50)));
      const result = await rpc('certainty_history', { p_offset: offset, p_limit: limit }, userToken);
      if (!result.ok) {
        await recordEvent(userToken, 'certainty_history', {
          schema: 1, outcome: 'error', code: resultCode(result), offset, limit, latencyMs: Date.now() - startedAt
        }, correlationId);
        return fail(res, result, correlationId);
      }
      const page = result.data || {};
      await recordEvent(userToken, 'certainty_history', {
        schema: 1, outcome: 'ok', offset, limit, total: Number(page.total || 0), latencyMs: Date.now() - startedAt
      }, correlationId);
      return json(res, 200, { ...page, correlationId });
    }

    if (action === 'settings') {
      const settingsRes = await rpc('certainty_get_settings', {}, userToken);
      if (!settingsRes.ok) {
        await recordEvent(userToken, 'certainty_rpc_error', {
          schema: 1, rpc: 'certainty_get_settings', code: resultCode(settingsRes)
        }, correlationId);
        return fail(res, settingsRes, correlationId);
      }
      return json(res, 200, { settings: settingsRes.data, correlationId });
    }

    if (action === 'save_settings') {
      const body = req.body || {};
      if (body.time_zone != null && body.time_zone !== '' && !isOfferedTimeZone(body.time_zone)) {
        return json(res, 400, { error: SETTINGS_ERRORS.BAD_TIME_ZONE, code: 'BAD_TIME_ZONE', correlationId });
      }
      if (body.phone != null && String(body.phone).trim() !== '' && !isDialablePhone(String(body.phone))) {
        return json(res, 400, { error: SETTINGS_ERRORS.BAD_PHONE, code: 'BAD_PHONE', correlationId });
      }
      const saved = await rpc('certainty_save_settings', {
        p_time_zone: body.time_zone ? String(body.time_zone) : null,
        p_phone: body.phone ? String(body.phone) : null,
        p_default_mode: body.default_mode ? String(body.default_mode) : 'zoom'
      }, userToken);
      if (!saved.ok) {
        await recordEvent(userToken, 'certainty_rpc_error', {
          schema: 1, rpc: 'certainty_save_settings', code: resultCode(saved)
        }, correlationId);
        return fail(res, saved, correlationId);
      }

      await recordEvent(userToken, 'certainty_settings', {
        schema: 1,
        mode: String(body.default_mode || 'zoom'),
        hasTimeZone: Boolean(body.time_zone),
        hasPhone: Boolean(body.phone),
        latencyMs: Date.now() - startedAt
      }, correlationId);
      return json(res, 200, { ok: true, settings: saved.data, correlationId });
    }

    if (action === 'book') {
      const body = req.body || {};

      // 200-character topic cap aligned to input maxlength (Developer 47)
      if (body.topic != null && typeof body.topic === 'string') {
        if (body.topic.trim().length > CERTAINTY_TOPIC_MAX_LENGTH) {
          return json(res, 400, {
            error: `Topic must be ${CERTAINTY_TOPIC_MAX_LENGTH} characters or fewer.`,
            code: 'TOPIC_TOO_LONG',
            correlationId
          });
        }
      }

      const safetyAssessment = evaluateCertaintyTopicSafety(body.topic);
      if (body.mode === 'phone' && body.phone && !isDialablePhone(String(body.phone))) {
        return json(res, 400, { error: SETTINGS_ERRORS.BAD_PHONE, code: 'BAD_PHONE', correlationId });
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
        }, correlationId);
        return fail(res, booked, correlationId);
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
        }, correlationId);
      }

      const join = joinFor(session);
      // Calendar write with retry and backoff (Developer 24, 28, 29, 30, 86)
      let calendar = { connected: false, status: 'skipped', attempts: 0 };
      try {
        calendar = await writeToCalendarWithRetry(session, join);
      } catch (error) {
        calendar = { connected: true, status: 'failed', attempts: 1, lastError: error && error.message, destination: process.env.GOOGLE_CALENDAR_ID || 'primary' };
      }

      const calRpc = await rpc('certainty_set_calendar', {
        p_id: session.id,
        p_event_id: calendar.eventId || null,
        p_status: calendar.status
      }, userToken);

      if (!calRpc.ok) {
        await recordEvent(userToken, 'certainty_rpc_error', {
          schema: 1, rpc: 'certainty_set_calendar', code: resultCode(calRpc)
        }, correlationId);
      }

      // Outbound calendar write outcome event (Developer 23, 24, 27, 77)
      await recordEvent(userToken, 'certainty_calendar', {
        schema: 1,
        sessionId: session.id,
        destination: calendar.destination || null,
        status: calendar.status,
        connected: Boolean(calendar.connected),
        attempts: calendar.attempts,
        lastError: calendar.lastError || null
      }, correlationId);

      // Alert if calendar write failed after all retries (Developer 22, 72)
      if (calendar.status === 'failed') {
        await recordEvent(userToken, 'certainty_calendar_alert', {
          schema: 1,
          alert: 'calendar_sync_failed',
          sessionId: session.id,
          destination: calendar.destination || null,
          attempts: calendar.attempts,
          lastError: calendar.lastError || null,
          severity: 'warning'
        }, correlationId);
      }

      await recordEvent(userToken, 'certainty_book', {
        schema: 1, outcome: 'ok', mode: String(session.mode || ''), calendarStatus: calendar.status,
        calendarConnected: Boolean(calendar.connected), latencyMs: Date.now() - startedAt,
        safetyTripped: safetyAssessment.tripped
      }, correlationId);

      const crisisPayload = safetyAssessment.tripped ? {
        tripped: true,
        line: safetyAssessment.line,
        category: safetyAssessment.category
      } : null;

      const enrichedSession = enrichSessionWithSyncState({
        ...session,
        calendar_status: calendar.status,
        join
      });

      return json(res, 200, {
        session: enrichedSession,
        calendar,
        crisis: crisisPayload,
        safety: safetyAssessment.tripped ? true : undefined,
        correlationId
      });
    }

    if (action === 'cancel') {
      const cancelled = await rpc('cancel_certainty_session', { p_id: String(req.body && req.body.id || '') }, userToken);
      if (!cancelled.ok) {
        await recordEvent(userToken, 'certainty_cancel', {
          schema: 1, outcome: 'error', code: resultCode(cancelled), latencyMs: Date.now() - startedAt
        }, correlationId);
        return fail(res, cancelled, correlationId);
      }
      await recordEvent(userToken, 'certainty_cancel', {
        schema: 1, outcome: 'ok', latencyMs: Date.now() - startedAt
      }, correlationId);
      return json(res, 200, { cancelled: true, correlationId });
    }

    // Member-initiated hard-delete of their own past sessions and phone (Developer 98)
    if (action === 'delete_data' || action === 'delete_member_data') {
      const deleted = await rpc('certainty_delete_member_data', {}, userToken);
      if (!deleted.ok) {
        await recordEvent(userToken, 'certainty_delete_error', {
          schema: 1, outcome: 'error', code: resultCode(deleted), latencyMs: Date.now() - startedAt
        }, correlationId);
        return fail(res, deleted, correlationId);
      }

      await recordEvent(userToken, 'certainty_member_data_deleted', {
        schema: 1,
        outcome: 'ok',
        deletedSessions: deleted.data && deleted.data.deleted_sessions,
        phoneCleared: Boolean(deleted.data && deleted.data.phone_cleared),
        latencyMs: Date.now() - startedAt
      }, correlationId);

      return json(res, 200, {
        ok: true,
        deleted_sessions: deleted.data ? deleted.data.deleted_sessions : 0,
        phone_cleared: Boolean(deleted.data && deleted.data.phone_cleared),
        correlationId
      });
    }

    // In-place booking update (Stranger 45, 46, 49; UX 83)
    if (action === 'update' || action === 'update_session') {
      const body = req.body || {};
      if (!body.id) {
        return json(res, 400, { error: 'Session ID is required to update a booking.', code: 'ID_REQUIRED', correlationId });
      }

      if (body.topic != null && typeof body.topic === 'string') {
        if (body.topic.trim().length > CERTAINTY_TOPIC_MAX_LENGTH) {
          return json(res, 400, {
            error: `Topic must be ${CERTAINTY_TOPIC_MAX_LENGTH} characters or fewer.`,
            code: 'TOPIC_TOO_LONG',
            correlationId
          });
        }
      }

      if (body.mode === 'phone' && body.phone && !isDialablePhone(String(body.phone))) {
        return json(res, 400, { error: SETTINGS_ERRORS.BAD_PHONE, code: 'BAD_PHONE', correlationId });
      }

      const updated = await rpc('update_certainty_session', {
        p_id: String(body.id),
        p_local_date: body.date ? String(body.date) : null,
        p_hour: body.hour != null ? Number(body.hour) : null,
        p_mode: body.mode ? String(body.mode) : null,
        p_phone: body.phone ? String(body.phone) : null,
        p_topic: body.topic ? String(body.topic) : null
      }, userToken);

      if (!updated.ok) {
        await recordEvent(userToken, 'certainty_update', {
          schema: 1, outcome: 'error', code: resultCode(updated), latencyMs: Date.now() - startedAt
        }, correlationId);
        return fail(res, updated, correlationId);
      }

      const session = updated.data;
      const join = joinFor(session);
      const enriched = enrichSessionWithSyncState({ ...session, join });

      await recordEvent(userToken, 'certainty_update', {
        schema: 1, outcome: 'ok', mode: String(session.mode || ''), latencyMs: Date.now() - startedAt
      }, correlationId);

      return json(res, 200, {
        ok: true,
        session: enriched,
        correlationId
      });
    }

    // Retry calendar sync action (Developer 28, 86)
    if (action === 'retry_calendar') {
      const sessionId = String(req.body && req.body.id || '');
      if (!sessionId) {
        return json(res, 400, { error: 'Session ID required for calendar retry.', code: 'ID_REQUIRED', correlationId });
      }

      // Fetch member state to get session
      const stateRes = await rpc('certainty_state', { p_days: 21 }, userToken);
      if (stateRes.unreachable) return fail(res, stateRes, correlationId);
      const upcoming = stateRes.ok && stateRes.data && stateRes.data.upcoming;
      if (!upcoming || String(upcoming.id) !== sessionId) {
        return json(res, 404, { error: 'Upcoming session not found.', code: 'NOT_FOUND', correlationId });
      }

      const join = joinFor(upcoming);
      const calendar = await writeToCalendarWithRetry(upcoming, join);
      await rpc('certainty_set_calendar', {
        p_id: sessionId,
        p_event_id: calendar.eventId || null,
        p_status: calendar.status
      }, userToken);

      await recordEvent(userToken, 'certainty_calendar_retry', {
        schema: 1,
        status: calendar.status,
        attempts: calendar.attempts,
        sessionId,
        destination: calendar.destination || null
      }, correlationId);

      const enriched = enrichSessionWithSyncState({ ...upcoming, calendar_status: calendar.status, join });
      return json(res, 200, {
        ok: true,
        calendar,
        session: enriched,
        correlationId
      });
    }

    return json(res, 400, { error: 'Unknown action.', correlationId });
  } catch (error) {
    await recordEvent(userToken, 'certainty_error', {
      schema: 1, outcome: 'error', action, error: error && error.message, latencyMs: Date.now() - startedAt
    }, correlationId);
    return json(res, 500, {
      error: (error && error.message) || 'The session service is unavailable right now.',
      correlationId
    });
  }
}
