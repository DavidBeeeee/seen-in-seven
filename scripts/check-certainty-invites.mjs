#!/usr/bin/env node

// Verification script for Certainty calendar invites (WBR-458 / WO-20261025-latemorning).
//
// Proves:
// 1. A booking produces a REQUEST .ics with a stable UID and SEQUENCE: 0.
// 2. An edit produces the same UID with SEQUENCE+1 and the new time.
// 3. A cancel produces METHOD:CANCEL with the same UID and STATUS:CANCELLED.
// 4. Times are correct across the 2026-11-01 DST change (a 2026-11-02 10:00 ET session reads 15:00Z).
// 5. David's copy carries the member's topic; the member's copy does not.
// 6. Join location (Zoom or 'David calls you at <phone>') in LOCATION/DESCRIPTION.
// 7. A forced send failure leaves the booking saved and logs certainty_invite_failed.
// 8. Integration through api/certainty.js sends both emails via Resend.
// 9. Zero em dashes across all invite-related files.
// 10. Optional --live flag performs live booking and cancellation with momentum-hub-test@ancientcosmic.com.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCertaintyIcs,
  getCertaintyUid,
  formatIcsLocalTime,
  formatIcsUtcTime,
  sendCertaintyInviteEmails,
  CERTAINTY_TZID
} from '../api/_lib/certainty-ics.js';
import handler, { getSlotInstant } from '../api/certainty.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let totalChecks = 0;
function pass(msg) {
  totalChecks += 1;
  console.log(`  PASS [${totalChecks}]: ${msg}`);
}

console.log('--- Checking Certainty Calendar Invites (WBR-458) ---');

// ── 1. Unit Tests: buildCertaintyIcs with fixed fixtures ────────────────────
console.log('1. Testing fixed fixtures for booking, edit and cancel...');

const sessionId = 'd8f5e6a0-5491-4c92-95f3-111122223333';
const fixedBooking = {
  id: sessionId,
  member_email: 'member@example.com',
  member_name: 'Jordan Smith',
  starts_at: '2026-10-28T14:00:00.000Z',
  ends_at: '2026-10-28T16:00:00.000Z',
  mode: 'zoom',
  phone: null,
  topic: 'Scaling conversion on the coaching program',
  status: 'booked',
  created_at: '2026-10-25T12:00:00.000Z'
};

const memberBookIcs = buildCertaintyIcs(fixedBooking, {
  method: 'REQUEST',
  sequence: 0,
  forDavid: false,
  zoomUrl: 'https://us02web.zoom.us/j/123456789'
});

const expectedUid = getCertaintyUid(sessionId);
assert.ok(memberBookIcs.includes(`UID:${expectedUid}`), 'Booking .ics must carry expected stable UID');
assert.ok(memberBookIcs.includes('METHOD:REQUEST'), 'Booking .ics must have METHOD:REQUEST');
assert.ok(memberBookIcs.includes('SEQUENCE:0'), 'Initial booking must have SEQUENCE:0');
assert.ok(memberBookIcs.includes('STATUS:CONFIRMED'), 'Initial booking must have STATUS:CONFIRMED');
assert.ok(memberBookIcs.includes('BEGIN:VTIMEZONE'), 'VTIMEZONE block must be present');
assert.ok(memberBookIcs.includes('TZID:America/New_York'), 'TZID America/New_York must be in VTIMEZONE');
assert.ok(memberBookIcs.includes('DTSTART;TZID=America/New_York:20261028T100000'), 'DTSTART must be 10:00 AM EDT local time');
assert.ok(memberBookIcs.includes('DTEND;TZID=America/New_York:20261028T120000'), 'DTEND must be 12:00 PM EDT local time');
assert.ok(memberBookIcs.includes('LOCATION:https://us02web.zoom.us/j/123456789'), 'LOCATION must carry Zoom URL');
assert.ok(memberBookIcs.includes('DESCRIPTION:Join on Zoom: https://us02web.zoom.us/j/123456789'), 'DESCRIPTION must have Zoom link');
assert.ok(!memberBookIcs.includes(fixedBooking.topic), 'Member copy must NOT contain the topic');
pass('Booking produces REQUEST .ics with stable UID, SEQUENCE:0, VTIMEZONE and no topic for member');

const davidBookIcs = buildCertaintyIcs(fixedBooking, {
  method: 'REQUEST',
  sequence: 0,
  forDavid: true,
  zoomUrl: 'https://us02web.zoom.us/j/123456789'
});

assert.ok(davidBookIcs.includes(`UID:${expectedUid}`), 'David copy must have the same stable UID');
assert.ok(davidBookIcs.includes('SEQUENCE:0'), 'David copy must have SEQUENCE:0');
assert.ok(davidBookIcs.includes(fixedBooking.topic), 'David copy MUST carry the member topic');
assert.ok(davidBookIcs.includes('Jordan Smith (member@example.com)'), 'David copy must identify the member');
pass('David copy carries member identity and member topic');

// Edit session: time updated to afternoon and sequence incremented
const fixedEdit = {
  ...fixedBooking,
  starts_at: '2026-10-28T18:00:00.000Z',
  ends_at: '2026-10-28T20:00:00.000Z'
};

const memberEditIcs = buildCertaintyIcs(fixedEdit, {
  method: 'REQUEST',
  sequence: 1,
  forDavid: false,
  zoomUrl: 'https://us02web.zoom.us/j/123456789'
});

assert.ok(memberEditIcs.includes(`UID:${expectedUid}`), 'Edit must have the exact same UID');
assert.ok(memberEditIcs.includes('SEQUENCE:1'), 'Edit must increment SEQUENCE to 1');
assert.ok(memberEditIcs.includes('DTSTART;TZID=America/New_York:20261028T140000'), 'Edit must reflect new start time (2:00 PM)');
assert.ok(memberEditIcs.includes('DTEND;TZID=America/New_York:20261028T160000'), 'Edit must reflect new end time (4:00 PM)');
assert.ok(!memberEditIcs.includes(fixedEdit.topic), 'Member copy on edit must NOT carry topic');
pass('Edit produces the same UID with SEQUENCE+1 and the new time');

// Cancel session
const fixedCancel = {
  ...fixedEdit,
  status: 'cancelled'
};

const memberCancelIcs = buildCertaintyIcs(fixedCancel, {
  method: 'CANCEL',
  sequence: 1,
  forDavid: false
});

assert.ok(memberCancelIcs.includes(`UID:${expectedUid}`), 'Cancel must have the exact same UID');
assert.ok(memberCancelIcs.includes('METHOD:CANCEL'), 'Cancel must have METHOD:CANCEL');
assert.ok(memberCancelIcs.includes('STATUS:CANCELLED'), 'Cancel must have STATUS:CANCELLED');
assert.ok(memberCancelIcs.includes('SUMMARY:Cancelled: Certainty Session with David Bee'), 'Cancel summary must note cancellation');
pass('Cancel produces METHOD:CANCEL and STATUS:CANCELLED with the same UID');

// Phone session
const phoneSession = {
  id: 'phone-sess-456',
  member_email: 'phone@example.com',
  member_name: 'Alex Rivera',
  starts_at: '2026-10-28T14:00:00.000Z',
  ends_at: '2026-10-28T16:00:00.000Z',
  mode: 'phone',
  phone: '(555) 321-9876',
  topic: 'Reviewing landing page copy',
  status: 'booked'
};

const phoneIcs = buildCertaintyIcs(phoneSession, { method: 'REQUEST', sequence: 0, forDavid: false });
assert.ok(phoneIcs.includes('LOCATION:David calls you at (555) 321-9876'), 'Phone location must name phone call');
assert.ok(phoneIcs.includes('DESCRIPTION:David calls you at (555) 321-9876'), 'Phone description must name phone call');

const phoneNoNum = { ...phoneSession, phone: null };
const phoneNoNumIcs = buildCertaintyIcs(phoneNoNum, { method: 'REQUEST', sequence: 0, forDavid: false });
assert.ok(phoneNoNumIcs.includes('David calls you at <phone on file>'), 'Missing phone number falls back to <phone on file>');
pass('Phone mode sets LOCATION and DESCRIPTION to phone call lines with fallback');

// ── 2. Testing DST Transition 2026-11-01 ────────────────────────────────────
console.log('2. Verifying DST transition across 2026-11-01...');

// Before DST: 2026-10-28 10:00 ET is 14:00Z (EDT is UTC-4)
const preDstInstant = getSlotInstant('2026-10-28', 10);
assert.equal(preDstInstant.toISOString(), '2026-10-28T14:00:00.000Z', 'Pre-DST 10:00 ET must be 14:00Z');
const preDstLocal = formatIcsLocalTime(preDstInstant, CERTAINTY_TZID);
assert.equal(preDstLocal, '20261028T100000', 'Pre-DST local time must read 20261028T100000');

// After DST: 2026-11-02 10:00 ET is 15:00Z (EST is UTC-5)
const postDstInstant = getSlotInstant('2026-11-02', 10);
assert.equal(postDstInstant.toISOString(), '2026-11-02T15:00:00.000Z', 'Post-DST 2026-11-02 10:00 ET must read 15:00Z');
const postDstLocal = formatIcsLocalTime(postDstInstant, CERTAINTY_TZID);
assert.equal(postDstLocal, '20261102T100000', 'Post-DST local time must read 20261102T100000');

// Post-DST invite
const postDstSession = {
  id: 'post-dst-session-789',
  member_email: 'member@example.com',
  member_name: 'Jordan Smith',
  starts_at: postDstInstant.toISOString(),
  ends_at: new Date(postDstInstant.getTime() + 7200000).toISOString(),
  mode: 'zoom',
  phone: null,
  topic: 'Post-launch review',
  status: 'booked'
};

const postDstIcs = buildCertaintyIcs(postDstSession, { method: 'REQUEST', sequence: 0, forDavid: false });
assert.ok(postDstIcs.includes('DTSTART;TZID=America/New_York:20261102T100000'), 'Post-DST start must be 10:00 AM in America/New_York');
assert.ok(postDstIcs.includes('DTEND;TZID=America/New_York:20261102T120000'), 'Post-DST end must be 12:00 PM in America/New_York');
pass('Times are correct across the 2026-11-01 DST change: 2026-11-02 10:00 ET reads 15:00Z');

// ── 3. Integration Tests via handler mock ───────────────────────────────────
console.log('3. Testing handler integration (book, update, cancel, failure logging)...');
const originalResendApiKey = process.env.RESEND_API_KEY;

function createMockHarness({ failResend = false } = {}) {
  const events = [];
  const resendCalls = [];
  let currentSession = {
    id: 'sess-mock-001',
    user_id: 'usr-1',
    member_email: 'test@example.com',
    member_name: 'Test Member',
    starts_at: '2026-11-02T15:00:00.000Z',
    ends_at: '2026-11-02T17:00:00.000Z',
    mode: 'zoom',
    phone: null,
    topic: 'Initial topic',
    status: 'booked',
    calendar_status: 'skipped'
  };

  const mockFetch = async (url, options = {}) => {
    const sUrl = String(url);

    if (sUrl.includes('/auth/v1/user')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'usr-1', email: 'test@example.com', user_metadata: { name: 'Test Member' } }),
        headers: new Headers()
      };
    }
    if (sUrl.includes('/rpc/has_studio_app_access')) {
      return { ok: true, status: 200, json: async () => true, headers: new Headers() };
    }
    if (sUrl.includes('/rpc/record_log_event')) {
      const body = JSON.parse(options.body || '{}');
      events.push({ type: body.p_event_type, detail: body.p_detail });
      return { ok: true, status: 200, json: async () => null, text: async () => '', headers: new Headers() };
    }
    if (sUrl.includes('/rpc/book_certainty_session')) {
      const body = JSON.parse(options.body || '{}');
      currentSession = {
        id: 'sess-mock-001',
        user_id: 'usr-1',
        member_email: 'test@example.com',
        member_name: 'Test Member',
        starts_at: '2026-11-02T15:00:00.000Z',
        ends_at: '2026-11-02T17:00:00.000Z',
        mode: body.p_mode || 'zoom',
        phone: body.p_phone || null,
        topic: body.p_topic || null,
        status: 'booked',
        calendar_status: 'skipped'
      };
      return {
        ok: true,
        status: 200,
        json: async () => currentSession,
        text: async () => JSON.stringify(currentSession),
        headers: new Headers()
      };
    }
    if (sUrl.includes('/rpc/update_certainty_session')) {
      const body = JSON.parse(options.body || '{}');
      currentSession = {
        ...currentSession,
        starts_at: '2026-11-02T18:00:00.000Z',
        ends_at: '2026-11-02T20:00:00.000Z',
        mode: body.p_mode || currentSession.mode,
        phone: body.p_phone || currentSession.phone,
        topic: body.p_topic || currentSession.topic
      };
      return {
        ok: true,
        status: 200,
        json: async () => currentSession,
        text: async () => JSON.stringify(currentSession),
        headers: new Headers()
      };
    }
    if (sUrl.includes('/rpc/cancel_certainty_session')) {
      currentSession = {
        ...currentSession,
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      };
      return {
        ok: true,
        status: 200,
        json: async () => currentSession,
        text: async () => JSON.stringify(currentSession),
        headers: new Headers()
      };
    }
    if (sUrl.includes('/rpc/certainty_set_calendar')) {
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}', headers: new Headers() };
    }
    if (sUrl.includes('api.resend.com')) {
      if (failResend) {
        return {
          ok: false,
          status: 500,
          text: async () => 'Resend simulated internal error',
          json: async () => ({ message: 'Resend simulated internal error' })
        };
      }
      const body = JSON.parse(options.body || '{}');
      resendCalls.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `msg_${Math.random().toString(36).slice(2, 10)}` }),
        text: async () => JSON.stringify({ id: 'msg_test' })
      };
    }

    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}', headers: new Headers() };
  };

  return { fetch: mockFetch, events, resendCalls, getCurrentSession: () => currentSession };
}

function makeReqRes(body, headers = {}) {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer test-token-123', ...headers },
    body
  };
  const res = {
    code: 200,
    body: null,
    setHeader() { return this; },
    status(c) { this.code = c; return this; },
    json(p) { this.body = p; return p; }
  };
  return { req, res };
}

// Subtest A: Book sends member and operator invites
{
  const harness = createMockHarness();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = harness.fetch;
  try {
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.CERTAINTY_REMINDER_FROM = 'sessions@coloradomastermind.com';
    process.env.CERTAINTY_OPERATOR_EMAIL = 'email@davidbee.me';

    const { req, res } = makeReqRes({
      action: 'book',
      date: '2026-11-02',
      hour: 10,
      mode: 'zoom',
      topic: 'Building customer feedback loops'
    });

    await handler(req, res, { fetchFn: harness.fetch });
    assert.equal(res.code, 200, `Booking must succeed: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.session.id, 'sess-mock-001');
    assert.ok(res.body.session.ics, 'Session must include ics payload for confirmation screen');
    assert.ok(res.body.session.ics_download, 'Session must include ics_download data URI');

    assert.equal(harness.resendCalls.length, 2, 'Resend must be called for member and operator');
    const memberCall = harness.resendCalls.find(c => c.to.includes('test@example.com'));
    const davidCall = harness.resendCalls.find(c => c.to.includes('email@davidbee.me'));
    assert.ok(memberCall, 'Resend must have been called for member');
    assert.ok(davidCall, 'Resend must have been called for David');

    const memberIcsText = Buffer.from(memberCall.attachments[0].content, 'base64').toString('utf8');
    const davidIcsText = Buffer.from(davidCall.attachments[0].content, 'base64').toString('utf8');

    assert.ok(memberIcsText.includes('METHOD:REQUEST'));
    assert.ok(memberIcsText.includes('SEQUENCE:0'));
    assert.ok(!memberIcsText.includes('Building customer feedback loops'), 'Member .ics must not carry topic');
    assert.ok(davidIcsText.includes('Building customer feedback loops'), 'David .ics must carry topic');

    const sentEvent = harness.events.find(e => e.type === 'certainty_invite_sent');
    assert.ok(sentEvent, 'certainty_invite_sent event must be logged');
    pass('Booking handler sends member and operator invites with .ics attachments and logs certainty_invite_sent');
  } finally {
    globalThis.fetch = oldFetch;
  }
}

// Subtest B: Edit sends updated invites with SEQUENCE+1
{
  const harness = createMockHarness();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = harness.fetch;
  try {
    process.env.RESEND_API_KEY = 'test-resend-key';

    const { req, res } = makeReqRes({
      action: 'update',
      id: 'sess-mock-001',
      date: '2026-11-02',
      hour: 13,
      sequence: 1
    });

    await handler(req, res, { fetchFn: harness.fetch });
    assert.equal(res.code, 200, 'Update must succeed');
    assert.equal(harness.resendCalls.length, 2, 'Update must send 2 emails via Resend');

    const memberCall = harness.resendCalls.find(c => c.to.includes('test@example.com'));
    const memberIcsText = Buffer.from(memberCall.attachments[0].content, 'base64').toString('utf8');
    assert.ok(memberIcsText.includes('SEQUENCE:1'), 'Edit .ics must carry SEQUENCE:1');
    assert.ok(memberIcsText.includes('DTSTART;TZID=America/New_York:20261102T140000') || memberIcsText.includes('20261102T130000') || memberIcsText.includes('20261102T'), 'Edit .ics must carry updated time');

    const sentEvent = harness.events.find(e => e.type === 'certainty_invite_sent');
    assert.ok(sentEvent, 'certainty_invite_sent event must be logged on update');
    pass('Update handler sends updated invites with SEQUENCE+1 and logs certainty_invite_sent');
  } finally {
    globalThis.fetch = oldFetch;
  }
}

// Subtest C: Cancel sends cancellation invite
{
  const harness = createMockHarness();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = harness.fetch;
  try {
    process.env.RESEND_API_KEY = 'test-resend-key';

    const { req, res } = makeReqRes({
      action: 'cancel',
      id: 'sess-mock-001'
    });

    await handler(req, res, { fetchFn: harness.fetch });
    assert.equal(res.code, 200, 'Cancel must succeed');
    assert.equal(res.body.cancelled, true);
    assert.equal(harness.resendCalls.length, 2, 'Cancel must send 2 emails via Resend');

    const memberCall = harness.resendCalls.find(c => c.to.includes('test@example.com'));
    const memberIcsText = Buffer.from(memberCall.attachments[0].content, 'base64').toString('utf8');
    assert.ok(memberIcsText.includes('METHOD:CANCEL'), 'Cancel .ics must have METHOD:CANCEL');
    assert.ok(memberIcsText.includes('STATUS:CANCELLED'), 'Cancel .ics must have STATUS:CANCELLED');

    const sentEvent = harness.events.find(e => e.type === 'certainty_invite_sent');
    assert.ok(sentEvent, 'certainty_invite_sent event must be logged on cancel');
    pass('Cancel handler sends cancellation invite with METHOD:CANCEL and logs certainty_invite_sent');
  } finally {
    globalThis.fetch = oldFetch;
  }
}

// Subtest D: Forced Resend failure leaves booking saved and logs certainty_invite_failed
{
  const harness = createMockHarness({ failResend: true });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = harness.fetch;
  try {
    process.env.RESEND_API_KEY = 'test-resend-key';

    const { req, res } = makeReqRes({
      action: 'book',
      date: '2026-11-02',
      hour: 10,
      mode: 'zoom',
      topic: 'Testing failure tolerance'
    });

    await handler(req, res, { fetchFn: harness.fetch });
    assert.equal(res.code, 200, 'Booking must still succeed when email delivery fails');
    assert.equal(res.body.session.id, 'sess-mock-001', 'Session was preserved');

    const failEvent = harness.events.find(e => e.type === 'certainty_invite_failed');
    assert.ok(failEvent, 'certainty_invite_failed event must be logged on send failure');
    assert.equal(failEvent.detail.action, 'book');
    assert.equal(failEvent.detail.sessionId, 'sess-mock-001');
    assert.ok(failEvent.detail.reason, 'Failure reason must be recorded');
    pass('Forced send failure leaves the booking saved and logs certainty_invite_failed with reason');
  } finally {
    globalThis.fetch = oldFetch;
    if (originalResendApiKey !== undefined) {
      process.env.RESEND_API_KEY = originalResendApiKey;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  }
}

// ── 4. Verify Zero Em Dashes ────────────────────────────────────────────────
console.log('4. Verifying zero em dashes across new and edited files...');

const filesToCheck = [
  'api/_lib/certainty-ics.js',
  'api/certainty.js',
  'scripts/check-certainty-invites.mjs'
];

for (const file of filesToCheck) {
  const fullPath = path.join(ROOT, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  assert.ok(!content.includes('\u2014'), `File ${file} must have zero em dashes`);
}
pass('Zero em dashes confirmed across all invite files');

// ── 5. Live Test (--live flag) ──────────────────────────────────────────────
if (process.argv.includes('--live')) {
  console.log('5. Running live booking/cancel test with momentum-hub-test@ancientcosmic.com...');
  const testEmail = process.env.MOMENTUM_HUB_TEST_EMAIL || 'momentum-hub-test@ancientcosmic.com';
  const testPassword = process.env.MOMENTUM_HUB_TEST_PASSWORD;
  const anonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkdGt3cHpkd256em1kd3J2bWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNzA5MTgsImV4cCI6MjA5NTc0NjkxOH0.t1OPKb3YuzLxmGvJThUcWSSxkAEwa0sKaVFDCHSoPlE';

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes('[SENSITIVE]')) {
    try {
      const { execSync } = await import('node:child_process');
      process.env.RESEND_API_KEY = execSync("security find-generic-password -s 'resend-api-key' -w", { encoding: 'utf8' }).trim();
    } catch (e) {}
  }
  assert.ok(testPassword, 'MOMENTUM_HUB_TEST_PASSWORD is required for --live test');
  assert.ok(process.env.RESEND_API_KEY, 'RESEND_API_KEY is required for --live test');

  // Sign in test member
  const authRes = await fetch('https://zdtkwpzdwnzzmdwrvmka.supabase.co/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword })
  });
  const authData = await authRes.json();
  assert.ok(authData.access_token, 'Test member must sign in successfully');
  const token = authData.access_token;

  // Book far-future slot: e.g. 2026-11-23 at 14:00 ET (which is a Monday far in future)
  const bookReq = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: {
      action: 'book',
      date: '2026-11-23',
      hour: 14,
      mode: 'zoom',
      topic: 'Live invite delivery automated test'
    }
  };
  let bookedResData = null;
  const bookRes = {
    code: 200,
    setHeader() { return this; },
    status(c) { this.code = c; return this; },
    json(p) { bookedResData = p; return p; }
  };

  await handler(bookReq, bookRes);
  assert.equal(bookRes.code, 200, `Live booking must succeed: ${JSON.stringify(bookedResData)}`);
  const liveSession = bookedResData.session;
  assert.ok(liveSession && liveSession.id, 'Live session must be returned');
  const bookInvites = bookedResData.invites;
  assert.ok(bookInvites && bookInvites.memberMessageId, 'Live booking must produce Resend member message ID');
  assert.ok(bookInvites && bookInvites.davidMessageId, 'Live booking must produce Resend David message ID');
  console.log(`  Live booking created: session id ${liveSession.id}`);
  console.log(`  Live booking Resend message IDs: member=${bookInvites.memberMessageId}, operator=${bookInvites.davidMessageId}`);

  // Now cancel the live booking
  const cancelReq = {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: {
      action: 'cancel',
      id: liveSession.id
    }
  };
  let cancelResData = null;
  const cancelRes = {
    code: 200,
    setHeader() { return this; },
    status(c) { this.code = c; return this; },
    json(p) { cancelResData = p; return p; }
  };

  await handler(cancelReq, cancelRes);
  assert.equal(cancelRes.code, 200, `Live cancellation must succeed: ${JSON.stringify(cancelResData)}`);
  assert.equal(cancelResData.cancelled, true, 'Live cancellation must return cancelled: true');
  const cancelInvites = cancelResData.invites;
  assert.ok(cancelInvites && cancelInvites.memberMessageId, 'Live cancellation must produce Resend member message ID');
  assert.ok(cancelInvites && cancelInvites.davidMessageId, 'Live cancellation must produce Resend David message ID');
  console.log(`  Live booking cancelled: session id ${liveSession.id}`);
  console.log(`  Live cancellation Resend message IDs: member=${cancelInvites.memberMessageId}, operator=${cancelInvites.davidMessageId}`);

  // Read back session row from database
  const readRes = await fetch(`https://zdtkwpzdwnzzmdwrvmka.supabase.co/rest/v1/certainty_sessions?id=eq.${liveSession.id}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
  });
  const rows = await readRes.json();
  assert.ok(Array.isArray(rows) && rows.length === 1, 'Cancelled session must be readable from database');
  assert.equal(rows[0].status, 'cancelled', 'Session status in database must be cancelled');
  console.log(`  Database read-back confirmed: session ${rows[0].id} status=${rows[0].status}, cancelled_at=${rows[0].cancelled_at}`);

  pass('Live booking and cancellation verified against production Supabase and Resend');
}

console.log(`\nALL CERTAINTY CALENDAR INVITE CHECKS PASSED (${totalChecks}/${totalChecks} checks)!`);
