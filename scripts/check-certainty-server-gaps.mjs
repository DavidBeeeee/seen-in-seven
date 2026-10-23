// WBR-435: the last Certainty server gaps (Developer 27, 82, 97).
//
// Proves:
// 1. The certainty_calendar event carries the destination calendar id and the
//    session id on success and on failure (Developer 27).
// 2. When Supabase is unreachable (network failure or a 5xx), state and book
//    answer a coded 503 in plain words and log it, never a hang or a blank page
//    (Developer 82).
// 3. The Zoom room is no longer in source: it comes from CERTAINTY_ZOOM_URL, and
//    a missing setting shows the honest "link coming from David" state, in the
//    booking endpoint and the reminder alike (Developer 97).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import handler, {
  SESSIONS_UNREACHABLE,
  ZOOM_PENDING_LABEL,
  joinFor,
  writeToCalendarWithRetry
} from '../api/certainty.js';
import { memberMessage } from '../api/certainty-reminders.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

// ── 3. Zoom room out of source ─────────────────────────────────────────────
for (const file of ['api/certainty.js', 'api/certainty-reminders.js', 'api/_hub/certainty.html']) {
  const text = read(file);
  assert.ok(!/zoom\.us\/my\//.test(text), file + ' carries no hard-coded Zoom room');
  assert.ok(!/pwd=/.test(text), file + ' carries no Zoom password');
}

const savedZoom = process.env.CERTAINTY_ZOOM_URL;
delete process.env.CERTAINTY_ZOOM_URL;
const pending = joinFor({ mode: 'zoom' });
assert.equal(pending.joinUrl, null, 'missing setting gives no link');
assert.equal(pending.pending, true, 'missing setting is marked pending');
assert.equal(pending.label, ZOOM_PENDING_LABEL, 'missing setting says the link is coming from David');
const pendingReminder = memberMessage({ mode: 'zoom', label_day: 'Monday', label_start: '2:00 PM', label_end: '3:00 PM', member_name: 'Pat Lee' });
assert.ok(pendingReminder.text.includes('David will send the Zoom link'), 'reminder without the setting is honest');

process.env.CERTAINTY_ZOOM_URL = 'https://example.test/room';
assert.equal(joinFor({ mode: 'zoom' }).joinUrl, 'https://example.test/room', 'setting supplies the link');
assert.ok(memberMessage({ mode: 'zoom', label_day: 'Monday', label_start: '2:00 PM', label_end: '3:00 PM' }).text.includes('https://example.test/room'),
  'reminder uses the setting');
console.log('PASS: Zoom room comes from CERTAINTY_ZOOM_URL, with an honest pending state.');

// ── 1. Calendar destination on every outcome ───────────────────────────────
process.env.GOOGLE_CALENDAR_ID = 'sessions@example.test';
const session = { id: 'sess-1', mode: 'zoom', member_email: 'm@example.test', starts_at: '2026-11-01T15:00:00Z', ends_at: '2026-11-01T16:00:00Z' };
const ok = await writeToCalendarWithRetry(session, null, {
  googleAccessTokenFn: async () => 'tok',
  fetchFn: async () => ({ ok: true, status: 200, json: async () => ({ id: 'evt-1' }) })
});
assert.equal(ok.destination, 'sessions@example.test', 'success names the destination');
const bad = await writeToCalendarWithRetry(session, null, {
  googleAccessTokenFn: async () => 'tok', sleepFn: async () => {},
  fetchFn: async () => ({ ok: false, status: 503, text: async () => '' })
});
assert.equal(bad.status, 'failed');
assert.equal(bad.destination, 'sessions@example.test', 'failure names the destination');
const rejected = await writeToCalendarWithRetry(session, null, {
  googleAccessTokenFn: async () => 'tok',
  fetchFn: async () => ({ ok: false, status: 400, text: async () => 'bad' })
});
assert.equal(rejected.destination, 'sessions@example.test', 'non-retryable failure names the destination');

// ── Handler driving ────────────────────────────────────────────────────────
function call(action, body = {}) {
  let statusCode = 200; let data = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return res; },
    json(d) { data = d; return res; }
  };
  const req = { method: 'POST', headers: { authorization: 'Bearer member-token' }, body: { action, ...body } };
  return handler(req, res).then(() => ({ statusCode, data }));
}

const originalFetch = globalThis.fetch;
const originalError = console.error;
const events = [];
const runtimeLog = [];
let mode = 'up';
let calendarOk = true;

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  let body = {};
  try { body = JSON.parse(String(options.body || '{}')); } catch (e) {}
  const reply = (status, payload) => ({
    ok: status < 400, status,
    json: async () => payload,
    text: async () => (payload == null ? '' : JSON.stringify(payload))
  });
  if (u.includes('oauth2.googleapis.com')) return reply(200, { access_token: 'tok' });
  if (u.includes('googleapis.com/calendar')) return calendarOk ? reply(200, { id: 'evt-9' }) : reply(400, { error: 'bad' });
  if (mode === 'down') throw new TypeError('fetch failed');
  if (u.includes('/auth/v1/user')) return reply(200, { id: 'user-1' });
  if (u.includes('has_studio_app_access')) return reply(200, true);
  if (u.includes('record_log_event')) { events.push({ type: body.p_event_type, detail: body.p_detail }); return reply(200, null); }
  if (u.includes('consume_api_quota')) return reply(200, true);
  if (mode === 'rest-503') return reply(503, { message: 'upstream unavailable' });
  if (u.includes('book_certainty_session')) {
    return reply(200, { id: 'sess-9', mode: 'zoom', member_email: 'm@example.test', starts_at: '2026-11-01T15:00:00Z', ends_at: '2026-11-01T16:00:00Z' });
  }
  if (u.includes('certainty_set_calendar')) return reply(200, null);
  if (u.includes('certainty_state')) return reply(200, { signedIn: true, upcoming: null });
  if (u.includes('certainty_get_settings')) return reply(200, {});
  return reply(404, null);
};
console.error = (line) => runtimeLog.push(String(line));

process.env.GOOGLE_CALENDAR_CLIENT_ID = 'id';
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'secret';
process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = 'refresh';

try {
  const booked = await call('book', { date: '2026-11-01', hour: 11, mode: 'zoom' });
  assert.equal(booked.statusCode, 200);
  const calEvent = events.find(e => e.type === 'certainty_calendar');
  assert.ok(calEvent, 'calendar event recorded');
  assert.equal(calEvent.detail.sessionId, 'sess-9', 'calendar success event carries the session id');
  assert.equal(calEvent.detail.destination, 'sessions@example.test', 'calendar success event carries the destination');
  assert.ok(!JSON.stringify(calEvent.detail).includes('secret'), 'no secret in the calendar event');

  events.length = 0; calendarOk = false;
  await call('book', { date: '2026-11-01', hour: 11, mode: 'zoom' });
  const failEvent = events.find(e => e.type === 'certainty_calendar');
  assert.equal(failEvent.detail.status, 'failed');
  assert.equal(failEvent.detail.sessionId, 'sess-9', 'calendar failure event carries the session id');
  assert.equal(failEvent.detail.destination, 'sessions@example.test', 'calendar failure event carries the destination');
  console.log('PASS: certainty_calendar carries destination and session id on success and failure.');

  // ── 2. Database outage ───────────────────────────────────────────────────
  for (const outage of ['down', 'rest-503']) {
    mode = outage;
    for (const action of ['state', 'book']) {
      runtimeLog.length = 0;
      const started = Date.now();
      const r = await call(action, { date: '2026-11-01', hour: 11, mode: 'zoom' });
      assert.equal(r.statusCode, 503, `${outage}/${action} answers 503`);
      assert.equal(r.data.code, SESSIONS_UNREACHABLE.code, `${outage}/${action} answers the coded outage`);
      assert.equal(r.data.error, SESSIONS_UNREACHABLE.error, `${outage}/${action} answers in plain words`);
      assert.ok(r.data.correlationId, `${outage}/${action} carries a correlation id`);
      assert.ok(Date.now() - started < 7000, `${outage}/${action} does not hang`);
      assert.ok(runtimeLog.some(l => l.includes('certainty_unreachable')), `${outage}/${action} is logged`);
    }
  }
  assert.ok(!/fetch failed/.test(JSON.stringify(SESSIONS_UNREACHABLE)), 'no raw error text reaches the member');
  console.log('PASS: an unreachable database returns the coded, plain answer and is logged.');
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  if (savedZoom === undefined) delete process.env.CERTAINTY_ZOOM_URL; else process.env.CERTAINTY_ZOOM_URL = savedZoom;
}

console.log('Certainty server gaps (WBR-435): all checks pass.');
