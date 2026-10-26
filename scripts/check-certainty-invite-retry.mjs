#!/usr/bin/env node

// Certainty invite versioning and retry (WBR-458), closing the two failures the
// WO-20261025-afternoon review recorded against the invite build:
// 1. Through the real handler, book, edit, edit, cancel carry SEQUENCE values
//    that strictly increase (they read 0,1,1 before), whatever the client sends.
// 2. Every Resend call carries a per-recipient Idempotency-Key for that version.
// 3. When David's half fails after the member's went out, the failure log names
//    only David, with the member's message id and the version that failed.
// 4. The next hourly tick retries that failure once, to David only, with the
//    same version and key, and logs certainty_invite_retried.
// 5. A second tick does not retry it again.
// 6. A failure superseded by a newer edit is not retried; a cancelled session
//    is not sent a REQUEST; pre-retry failures with no version are left alone.
// Every network call is a fixture. Nothing reaches Resend or Supabase.

import assert from 'node:assert/strict';
import handler from '../api/certainty.js';
import { invitesToRetry, retryFailedInvites } from '../api/_lib/certainty-invite-retry.js';
import { certaintyInviteSequence } from '../api/_lib/certainty-ics.js';

let n = 0;
const pass = (msg) => { n += 1; console.log(`  PASS [${n}]: ${msg}`); };

process.env.RESEND_API_KEY = 'test-resend-key';
process.env.CERTAINTY_OPERATOR_EMAIL = 'email@davidbee.me';

function harness({ failDavidOnce = false } = {}) {
  const events = [];
  const resend = [];
  let davidFails = failDavidOnce;
  let clock = Date.UTC(2026, 9, 25, 23, 0, 0);
  let session = null;
  const reply = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() });
  const fetchFn = async (url, options = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return reply({ id: 'auth-1', email: 'member@example.com', user_metadata: { name: 'Member' } });
    if (u.includes('/rpc/has_studio_app_access')) return reply(true);
    if (u.includes('/rpc/record_log_event')) {
      const b = JSON.parse(options.body || '{}');
      events.push({ event_type: b.p_event_type, detail: b.p_detail, created_at: new Date(clock).toISOString() });
      return reply(null);
    }
    if (u.includes('/rpc/book_certainty_session')) {
      session = { id: '11111111-2222-4333-8444-555555555555', user_id: 'usr-1', member_email: 'member@example.com', member_name: 'Member', starts_at: '2026-11-02T15:00:00.000Z', ends_at: '2026-11-02T17:00:00.000Z', mode: 'zoom', phone: null, topic: 'Funnel', status: 'booked', calendar_status: 'skipped', created_at: new Date(clock).toISOString() };
      return reply(session);
    }
    if (u.includes('/rpc/update_certainty_session')) { session = { ...session, starts_at: '2026-11-02T18:00:00.000Z', ends_at: '2026-11-02T20:00:00.000Z' }; return reply(session); }
    if (u.includes('/rpc/cancel_certainty_session')) { session = { ...session, status: 'cancelled' }; return reply(session); }
    if (u.includes('api.resend.com')) {
      const body = JSON.parse(options.body || '{}');
      const key = options.headers && options.headers['Idempotency-Key'];
      const ics = Buffer.from(body.attachments[0].content, 'base64').toString('utf8');
      const toDavid = body.to.includes('email@davidbee.me');
      if (toDavid && davidFails) {
        davidFails = false;
        return { ok: false, status: 503, text: async () => 'unavailable', json: async () => ({}) };
      }
      resend.push({ to: body.to[0], key, sequence: Number(ics.match(/SEQUENCE:(\d+)/)[1]), method: ics.match(/METHOD:(\w+)/)[1] });
      return reply({ id: `msg_${resend.length}` });
    }
    // Service-key reads and writes used by the retry.
    if (u.includes('/rest/v1/logs?')) return reply(events.slice());
    if (u.includes('/rest/v1/certainty_sessions?')) return reply(session ? [session] : []);
    if (u.endsWith('/rest/v1/logs') && options.method === 'POST') {
      const b = JSON.parse(options.body);
      events.push({ event_type: b.event_type, detail: b.detail, created_at: new Date(clock).toISOString() });
      return reply(null);
    }
    return reply({});
  };
  return { fetchFn, events, resend, tick: (ms) => { clock += ms; }, now: () => clock, session: () => session };
}

async function call(h, body) {
  const realNow = Date.now;
  Date.now = () => h.now();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = h.fetchFn;
  const res = { code: 200, body: null, setHeader() { return this; }, status(c) { this.code = c; return this; }, json(p) { this.body = p; return p; } };
  try {
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res, { fetchFn: h.fetchFn });
  } finally {
    Date.now = realNow;
    globalThis.fetch = oldFetch;
  }
  assert.equal(res.code, 200, JSON.stringify(res.body));
  return res.body;
}

console.log('--- Certainty invite versioning and retry (WBR-458) ---');

// 1 and 2: the real handler, book/edit/edit/cancel, client sends a stale sequence.
{
  const h = harness();
  await call(h, { action: 'book', date: '2026-11-02', hour: 10, mode: 'zoom', topic: 'Funnel' });
  h.tick(60_000);
  await call(h, { action: 'update', id: h.session().id, date: '2026-11-02', hour: 13, sequence: 1 });
  h.tick(60_000);
  await call(h, { action: 'update', id: h.session().id, date: '2026-11-02', hour: 13, sequence: 1 });
  h.tick(60_000);
  await call(h, { action: 'cancel', id: h.session().id, sequence: 1 });
  const member = h.resend.filter(r => r.to === 'member@example.com');
  const seqs = member.map(r => r.sequence);
  assert.equal(seqs.length, 4);
  assert.equal(seqs[0], 0, 'booking is SEQUENCE:0');
  for (let i = 1; i < seqs.length; i += 1) assert.ok(seqs[i] > seqs[i - 1], `SEQUENCE must strictly increase: ${seqs.join(',')}`);
  assert.deepEqual(member.map(r => r.method), ['REQUEST', 'REQUEST', 'REQUEST', 'CANCEL']);
  const david = h.resend.filter(r => r.to === 'email@davidbee.me').map(r => r.sequence);
  assert.deepEqual(david, seqs, "David's copy carries the same versions");
  pass(`book, edit, edit, cancel read ${seqs.join(', ')} through the handler; a stale client sequence is ignored`);

  const keys = h.resend.map(r => r.key);
  assert.ok(keys.every(Boolean), 'every send carries an Idempotency-Key');
  assert.equal(new Set(keys).size, keys.length, 'each recipient and version has its own key');
  assert.ok(keys[0].endsWith('/REQUEST/0/member') && keys[1].endsWith('/REQUEST/0/david'));
  pass('every Resend call carries a per-recipient, per-version Idempotency-Key');
  assert.ok(certaintyInviteSequence('update', Date.UTC(2094, 0, 1)) < 2 ** 31, 'fits a 32-bit integer for decades');
}

// 3 to 5: David's half fails, then the tick retries only David, once.
{
  const h = harness({ failDavidOnce: true });
  const booked = await call(h, { action: 'book', date: '2026-11-02', hour: 10, mode: 'zoom', topic: 'Funnel' });
  assert.ok(booked.session && booked.session.id, 'the booking is saved');
  const failed = h.events.find(e => e.event_type === 'certainty_invite_failed');
  assert.ok(failed, 'certainty_invite_failed logged');
  assert.deepEqual(failed.detail.failedRecipients, ['david']);
  assert.equal(failed.detail.memberMessageId, 'msg_1');
  assert.equal(failed.detail.method, 'REQUEST');
  assert.equal(failed.detail.sequence, 0);
  assert.equal(h.resend.length, 1, 'only the member copy went out');
  pass('a half-sent invite logs only the missing recipient, the version and the member message id');

  h.tick(3_600_000);
  const first = await retryFailedInvites({ supabaseUrl: 'https://db.test', serviceKey: 'svc', fetchFn: h.fetchFn, now: h.now() });
  assert.deepEqual(first, { due: 1, retried: 1, failed: 0, skipped: 0 });
  assert.equal(h.resend.length, 2);
  const retry = h.resend[1];
  assert.equal(retry.to, 'email@davidbee.me', 'retry goes to David only; the member is not sent a duplicate');
  assert.equal(retry.sequence, 0);
  assert.ok(retry.key.endsWith('/REQUEST/0/david'), 'retry reuses the original version key');
  assert.ok(h.events.some(e => e.event_type === 'certainty_invite_retried' && e.detail.sessionId === h.session().id));
  pass('the next tick retries the failed half once, same version and key, and logs certainty_invite_retried');

  h.tick(3_600_000);
  const second = await retryFailedInvites({ supabaseUrl: 'https://db.test', serviceKey: 'svc', fetchFn: h.fetchFn, now: h.now() });
  assert.equal(second.due, 0, 'already answered');
  assert.equal(h.resend.length, 2, 'no second retry');
  pass('a later tick does not retry it again');
}

// 6: selection rules.
{
  const sid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const failedEdit = { event_type: 'certainty_invite_failed', detail: { sessionId: sid, action: 'update', method: 'REQUEST', sequence: 100, failedRecipients: ['member', 'david'] } };
  const laterEdit = { event_type: 'certainty_invite_sent', detail: { sessionId: sid, action: 'update', method: 'REQUEST', sequence: 200 } };
  assert.equal(invitesToRetry([failedEdit, laterEdit]).length, 0);
  assert.equal(invitesToRetry([failedEdit]).length, 1);
  pass('a failure superseded by a newer invite for the same session is not retried');

  const legacy = { event_type: 'certainty_invite_failed', detail: { schema: 1, sessionId: sid, action: 'book', reason: 'x' } };
  assert.equal(invitesToRetry([legacy]).length, 0);
  pass('failures logged before versioning existed are left as logged, not guessed at');

  const h = harness();
  await call(h, { action: 'book', date: '2026-11-02', hour: 10, mode: 'zoom', topic: 'Funnel' });
  await call(h, { action: 'cancel', id: h.session().id });
  h.events.length = 0;
  h.events.push({ event_type: 'certainty_invite_failed', detail: { sessionId: h.session().id, action: 'book', method: 'REQUEST', sequence: 0, failedRecipients: ['member'] }, created_at: new Date(h.now()).toISOString() });
  const before = h.resend.length;
  const out = await retryFailedInvites({ supabaseUrl: 'https://db.test', serviceKey: 'svc', fetchFn: h.fetchFn, now: h.now() + 1000 });
  assert.equal(out.skipped, 1);
  assert.equal(h.resend.length, before, 'a cancelled session is never sent a REQUEST');
  assert.ok(h.events.some(e => e.event_type === 'certainty_invite_retry_failed' && e.detail.reason === 'session-state-changed'));
  pass('a cancelled session is not re-invited, and the skip is recorded so it is not tried again');
}

console.log(`\nALL CERTAINTY INVITE RETRY CHECKS PASSED (${n}/${n})`);
