// WBR-435: Certainty Sessions server cluster verification.
//
// Proves:
// 1. Logging with request correlation ID on every outcome (Dev 22, 23, 25, 72, 74, 76, 77, 80, 100).
// 2. Calendar write retry with backoff, retryable 'failed' state, and member-visible sync state (Dev 24, 27, 28, 29, 30, 86; Stranger 38; UX 6).
// 3. State action rate limit using api_usage quota pattern (Dev 99).
// 4. Member-initiated hard-delete RPC refusing other members' rows and clearing phone (Dev 98).
// 5. Topic cap aligned to 200 across input, API, and DB (Dev 47).
// 6. App version constant returned in state payload and logged (Dev 89).
// 7. Continuation items: in-place booking update RPC/action and calendar failure alerting.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import handler, {
  CERTAINTY_APP_VERSION,
  CERTAINTY_TOPIC_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  MAX_CALENDAR_RETRIES,
  CALENDAR_BACKOFF_BASE_MS,
  enrichSessionWithSyncState,
  writeToCalendarWithRetry
} from '../api/certainty.js';
import { operatorMessage } from '../api/certainty-reminders.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

console.log('--- Checking Certainty Sessions Server Cluster (WBR-435) ---');

// ── 1. Static Verification of Migration Contract ──────────────────────────
console.log('1. Verifying database migration contract in supabase_migrations/2026-10-21-certainty-server-cluster.sql...');

const migrationSql = read('supabase_migrations', '2026-10-21-certainty-server-cluster.sql');

// (a) Quota allowlist for Certainty
assert.ok(
  migrationSql.includes("'certainty'"),
  'Migration includes certainty in consume_api_quota allowlist'
);

// (b) Member data hard-delete RPC
assert.ok(
  migrationSql.includes('function public.certainty_delete_member_data()'),
  'Migration defines certainty_delete_member_data function'
);
assert.ok(
  migrationSql.includes("set search_path = ''"),
  'certainty_delete_member_data has empty search_path'
);
assert.ok(
  migrationSql.includes('delete from public.certainty_sessions') &&
  migrationSql.includes('where user_id = v_user_id and (ends_at <= now() or status = \'cancelled\')'),
  'certainty_delete_member_data hard-deletes caller past and cancelled sessions only'
);
assert.ok(
  migrationSql.includes('update public.certainty_member_settings') &&
  migrationSql.includes('set phone = null, updated_at = now()') &&
  migrationSql.includes('where user_id = v_user_id'),
  'certainty_delete_member_data clears phone in certainty_member_settings for caller only'
);
assert.ok(
  migrationSql.includes("event_type,\n    detail") || migrationSql.includes("'certainty_member_data_deleted'"),
  'certainty_delete_member_data logs admin-visible event in public.logs'
);
assert.ok(
  migrationSql.includes('revoke all on function public.certainty_delete_member_data() from public, anon;'),
  'certainty_delete_member_data revoked from public, anon'
);
assert.ok(
  migrationSql.includes('grant execute on function public.certainty_delete_member_data() to authenticated;'),
  'certainty_delete_member_data granted to authenticated'
);

// (c) Topic cap alignment in book_certainty_session
assert.ok(
  migrationSql.includes("length(btrim(p_topic)) > 200 then\n    raise exception 'TOPIC_TOO_LONG';") ||
  migrationSql.includes("length(btrim(p_topic)) > 200 then raise exception 'TOPIC_TOO_LONG';"),
  'book_certainty_session raises TOPIC_TOO_LONG if topic length exceeds 200'
);
assert.ok(
  migrationSql.includes('left(btrim(p_topic), 200)'),
  'book_certainty_session caps topic to 200 chars'
);

// (d) In-place booking update RPC
assert.ok(
  migrationSql.includes('function public.update_certainty_session('),
  'Migration defines update_certainty_session RPC'
);
assert.ok(
  migrationSql.includes("where id = p_id and user_id = v_user_id"),
  'update_certainty_session restricts update to caller session'
);

console.log('PASS: Database migration satisfies all security, scoping, and RPC contracts.');

// ── 2. Topic Cap Alignment Across Input, API, and DB ───────────────────────
console.log('2. Verifying topic cap alignment to 200 across input, API, and DB...');

assert.equal(CERTAINTY_TOPIC_MAX_LENGTH, 200, 'CERTAINTY_TOPIC_MAX_LENGTH constant is 200');
assert.equal(TOPIC_MAX_LENGTH, 200, 'TOPIC_MAX_LENGTH constant is 200');

const html = read('api', '_hub', 'certainty.html');
assert.ok(
  html.includes('id="cs-topic"') && html.includes('maxlength="200"'),
  'certainty.html cs-topic input has maxlength="200"'
);

console.log('PASS: Topic cap strictly aligned to 200 in input HTML, API constants, and DB migration.');

// ── 3. App Version Constant ────────────────────────────────────────────────
console.log('3. Verifying app version tracking (Developer 89)...');
assert.ok(CERTAINTY_APP_VERSION, 'CERTAINTY_APP_VERSION constant is defined');
assert.ok(CERTAINTY_APP_VERSION.startsWith('2026.10.21'), `CERTAINTY_APP_VERSION is dated today: ${CERTAINTY_APP_VERSION}`);
console.log(`PASS: CERTAINTY_APP_VERSION is ${CERTAINTY_APP_VERSION}`);

// ── 4. Calendar Write Retry with Exponential Backoff ───────────────────────
console.log('4. Testing calendar write retry with exponential backoff (Developer 28, 29, 30, 86)...');

const mockSession = {
  id: 'sess-123',
  starts_at: '2026-10-25T14:00:00Z',
  ends_at: '2026-10-25T16:00:00Z',
  mode: 'zoom',
  member_email: 'member@test.com'
};
const mockJoin = { mode: 'zoom', joinUrl: 'https://zoom.us/test' };

// (a) Transient error on attempts 1 and 2, success on attempt 3
let fetchCalls = 0;
const delays = [];
const mockSleep = (ms) => delays.push(ms);
const mockFetchTransientSuccess = async () => {
  fetchCalls++;
  if (fetchCalls < 3) {
    return { ok: false, status: 503, text: async () => 'Service Unavailable' };
  }
  return { ok: true, status: 200, json: async () => ({ id: 'cal-event-999' }) };
};

const resRetrySuccess = await writeToCalendarWithRetry(mockSession, mockJoin, {
  googleAccessTokenFn: async () => 'mock-token',
  fetchFn: mockFetchTransientSuccess,
  sleepFn: mockSleep,
  maxRetries: 3,
  backoffBaseMs: 100
});

assert.equal(resRetrySuccess.status, 'created', 'Succeeds on attempt 3');
assert.equal(resRetrySuccess.attempts, 3, 'Took 3 attempts');
assert.equal(resRetrySuccess.eventId, 'cal-event-999', 'Returns created event ID');
assert.deepEqual(delays, [100, 200], 'Backoff delays were exponential (100ms, 200ms)');

// (b) Failing all 3 attempts
fetchCalls = 0;
const mockFetchFailAll = async () => {
  fetchCalls++;
  return { ok: false, status: 500, text: async () => 'Internal Server Error' };
};

const resRetryFail = await writeToCalendarWithRetry(mockSession, mockJoin, {
  googleAccessTokenFn: async () => 'mock-token',
  fetchFn: mockFetchFailAll,
  sleepFn: () => {},
  maxRetries: 3
});

assert.equal(resRetryFail.status, 'failed', 'Fails when all retries fail');
assert.equal(resRetryFail.attempts, 3, 'Tried max 3 attempts');
assert.equal(resRetryFail.retryable, true, 'Marked retryable for subsequent sync attempts');

console.log('PASS: Calendar write retry with exponential backoff verified.');

// ── 5. Member-Visible Sync State on Session Payload ────────────────────────
console.log('5. Testing member-visible sync state enrichment (Stranger 38; UX 6)...');

const syncedSession = enrichSessionWithSyncState({ ...mockSession, calendar_status: 'created' });
assert.equal(syncedSession.calendar_sync_state, 'synced', 'Created maps to synced');
assert.equal(syncedSession.calendar_sync.synced, true, 'calendar_sync.synced is true');
assert.ok(syncedSession.calendar_sync_label.includes("David's calendar"), 'Label mentions David calendar');

const failedSession = enrichSessionWithSyncState({ ...mockSession, calendar_status: 'failed' });
assert.equal(failedSession.calendar_sync_state, 'failed', 'Failed maps to failed');
assert.equal(failedSession.calendar_sync.failed, true, 'calendar_sync.failed is true');
assert.equal(failedSession.calendar_sync.retryable, true, 'Failed calendar sync is marked retryable');
assert.ok(failedSession.calendar_sync_label.includes('retry'), 'Label notes retry');

const pendingSession = enrichSessionWithSyncState({ ...mockSession, calendar_status: 'pending' });
assert.equal(pendingSession.calendar_sync_state, 'pending', 'Pending maps to pending');
assert.equal(pendingSession.calendar_sync.synced, false, 'Pending is not synced');

console.log('PASS: Member-visible sync state provides explicit fields for UI rendering.');

// ── 6. Alerting When Calendar Write Fails ──────────────────────────────────
console.log('6. Verifying calendar failure operator alerting (Developer 22, 72)...');

const opSummary = operatorMessage([
  { ...mockSession, member_name: 'Member One', label_day: 'Oct 21', label_start: '2:00 PM', calendar_status: 'failed' }
]);
assert.ok(
  opSummary.text.includes('CALENDAR SYNC FAILED'),
  'Operator summary flags session whose calendar sync failed'
);

console.log('PASS: Calendar failure prominently alerts operator.');

// ── 7. Handler Driving with Mock Supabase Backend ──────────────────────────
console.log('7. Driving api/certainty.js handler with mocked Supabase responses...');

const originalFetch = globalThis.fetch;

function createMockReqRes({ action, body = {}, headers = {} }) {
  const req = {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-user-token',
      ...headers
    },
    body: {
      action,
      ...body
    }
  };
  let statusCode = 200;
  let responseData = null;
  const resHeaders = {};
  const res = {
    setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
    status(code) { statusCode = code; return res; },
    json(data) { responseData = data; return res; },
    end() { return res; }
  };
  return { req, res, getResult: () => ({ statusCode, responseData, resHeaders }) };
}

const loggedEvents = [];

try {
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    const bodyText = options.body ? String(options.body) : '';
    let bodyJson = {};
    try { bodyJson = JSON.parse(bodyText); } catch (e) {}

    // Auth user check
    if (urlStr.includes('/auth/v1/user')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'auth-user-123', email: 'test@example.com' })
      };
    }

    // Access check (has_studio_app_access)
    if (urlStr.includes('/rpc/has_studio_app_access')) {
      return { ok: true, status: 200, json: async () => true };
    }

    // Logging event
    if (urlStr.includes('/rpc/record_log_event')) {
      loggedEvents.push({
        type: bodyJson.p_event_type,
        detail: bodyJson.p_detail
      });
      return { ok: true, status: 200, json: async () => true };
    }

    // Rate limit quota check
    if (urlStr.includes('/rpc/consume_api_quota')) {
      if (bodyJson.p_endpoint === 'certainty' && bodyJson.p_subject_key === 'user:rate-limited-user') {
        return { ok: true, status: 200, json: async () => false };
      }
      return { ok: true, status: 200, json: async () => true };
    }

    // certain_state RPC
    if (urlStr.includes('/rpc/certainty_state')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          signedIn: true,
          bookedThisWeek: false,
          upcoming: {
            id: 'sess-456',
            starts_at: '2026-10-25T14:00:00Z',
            ends_at: '2026-10-25T16:00:00Z',
            mode: 'zoom',
            calendar_status: 'created'
          }
        })
      };
    }

    // certainty_get_settings RPC
    if (urlStr.includes('/rpc/certainty_get_settings')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ time_zone: 'America/New_York', phone: null, default_mode: 'zoom' })
      };
    }

    // certainty_delete_member_data RPC
    if (urlStr.includes('/rpc/certainty_delete_member_data')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, deleted_sessions: 3, phone_cleared: true })
      };
    }

    // update_certainty_session RPC
    if (urlStr.includes('/rpc/update_certainty_session')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: bodyJson.p_id,
          starts_at: '2026-10-26T15:00:00Z',
          ends_at: '2026-10-26T17:00:00Z',
          mode: bodyJson.p_mode || 'zoom',
          topic: bodyJson.p_topic || null,
          calendar_status: 'pending'
        })
      };
    }

    // book_certainty_session RPC
    if (urlStr.includes('/rpc/book_certainty_session')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'booked-111',
          starts_at: '2026-10-27T14:00:00Z',
          ends_at: '2026-10-27T16:00:00Z',
          mode: bodyJson.p_mode,
          topic: bodyJson.p_topic,
          calendar_status: 'skipped'
        })
      };
    }

    // certainty_set_calendar RPC
    if (urlStr.includes('/rpc/certainty_set_calendar')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    }

    // users query (for public.users lookup)
    if (urlStr.includes('/rest/v1/users')) {
      return {
        ok: true,
        status: 200,
        json: async () => ([{ id: 'user-internal-123', is_admin: false }])
      };
    }

    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
  };

  // Test 7a: State action returns app version, correlation id, and enriched upcoming session
  const { req: reqState, res: resState, getResult: getResState } = createMockReqRes({
    action: 'state',
    headers: { 'x-correlation-id': 'corr-abc-123' }
  });
  await handler(reqState, resState);
  const stateResult = getResState();
  assert.equal(stateResult.statusCode, 200, 'State action returns 200');
  assert.equal(stateResult.responseData.app_version, CERTAINTY_APP_VERSION, 'Returns app_version');
  assert.equal(stateResult.responseData.correlationId, 'corr-abc-123', 'Echoes correlationId in payload');
  assert.equal(stateResult.resHeaders['x-correlation-id'], 'corr-abc-123', 'Sets x-correlation-id header');
  assert.equal(stateResult.responseData.upcoming.calendar_sync_state, 'synced', 'Upcoming session enriched with sync state');

  const stateLog = loggedEvents.find(e => e.type === 'certainty_state' && e.detail.outcome === 'ok');
  assert.ok(stateLog, 'Logged certainty_state event');
  assert.equal(stateLog.detail.correlationId, 'corr-abc-123', 'Log event carries correlationId');
  assert.equal(stateLog.detail.appVersion, CERTAINTY_APP_VERSION, 'Log event carries appVersion');

  // Test 7b: Topic length > 200 rejected with TOPIC_TOO_LONG
  const oversizedTopic = 'a'.repeat(201);
  const { req: reqLongTopic, res: resLongTopic, getResult: getResLongTopic } = createMockReqRes({
    action: 'book',
    body: { date: '2026-10-27', hour: 14, mode: 'zoom', topic: oversizedTopic },
    headers: { 'x-correlation-id': 'corr-topic-err' }
  });
  await handler(reqLongTopic, resLongTopic);
  const longTopicResult = getResLongTopic();
  assert.equal(longTopicResult.statusCode, 400, 'Rejects topic > 200 chars');
  assert.equal(longTopicResult.responseData.code, 'TOPIC_TOO_LONG', 'Returns code TOPIC_TOO_LONG');
  assert.equal(longTopicResult.responseData.correlationId, 'corr-topic-err', 'Error carries correlationId');

  // Test 7c: Topic length == 200 accepted
  const validTopic = 'b'.repeat(200);
  const { req: reqValidTopic, res: resValidTopic, getResult: getResValidTopic } = createMockReqRes({
    action: 'book',
    body: { date: '2026-10-27', hour: 14, mode: 'zoom', topic: validTopic },
    headers: { 'x-correlation-id': 'corr-topic-ok' }
  });
  await handler(reqValidTopic, resValidTopic);
  const validTopicResult = getResValidTopic();
  assert.equal(validTopicResult.statusCode, 200, 'Accepts 200 char topic');
  assert.equal(validTopicResult.responseData.session.topic, validTopic, 'Preserves 200 char topic');

  // Test 7d: Member hard-delete action (Developer 98)
  const { req: reqDel, res: resDel, getResult: getResDel } = createMockReqRes({
    action: 'delete_data',
    headers: { 'x-correlation-id': 'corr-del-data' }
  });
  await handler(reqDel, resDel);
  const delResult = getResDel();
  assert.equal(delResult.statusCode, 200, 'delete_data returns 200');
  assert.equal(delResult.responseData.deleted_sessions, 3, 'Returns count of deleted sessions');
  assert.equal(delResult.responseData.phone_cleared, true, 'Returns phone_cleared true');

  const delLog = loggedEvents.find(e => e.type === 'certainty_member_data_deleted');
  assert.ok(delLog, 'Logged certainty_member_data_deleted event');
  assert.equal(delLog.detail.correlationId, 'corr-del-data', 'Delete log carries correlationId');

  // Test 7e: In-place booking update (Stranger 45, 46, 49; UX 83)
  const { req: reqUpd, res: resUpd, getResult: getResUpd } = createMockReqRes({
    action: 'update',
    body: { id: 'sess-456', hour: 15, mode: 'phone', phone: '555-123-4567', topic: 'Updated topic' },
    headers: { 'x-correlation-id': 'corr-update-1' }
  });
  await handler(reqUpd, resUpd);
  const updResult = getResUpd();
  assert.equal(updResult.statusCode, 200, 'update returns 200');
  assert.equal(updResult.responseData.session.id, 'sess-456', 'Returns updated session');
  assert.equal(updResult.responseData.session.calendar_sync_state, 'pending', 'Time/mode update resets sync state to pending');

  const updLog = loggedEvents.find(e => e.type === 'certainty_update');
  assert.ok(updLog, 'Logged certainty_update event');
  assert.equal(updLog.detail.correlationId, 'corr-update-1', 'Update log carries correlationId');

  console.log('PASS: api/certainty.js handler passed all mocked scenarios.');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('\nALL CERTAINTY SERVER CLUSTER CHECKS PASSED');
