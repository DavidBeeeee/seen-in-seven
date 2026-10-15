// WBR-373: Certainty Sessions topic safety check.
//
// In the book action of api/certainty.js, run detectCrisis on the topic before
// the booking confirms. If it trips:
// 1. Keep the booking (the seat is theirs).
// 2. Set safety_flag true and safety_flagged_at on the session.
// 3. Return a crisis payload the page shows as one plain human line pointing
//    to real help (988 in the US), in David's voice, no em dashes.
// 4. Log a certainty_safety event that carries NO topic text.
//
// Pure helper plus check-certainty-safety.mjs: a crisis topic flags and returns
// the help line, an ordinary topic does not, an empty topic does not.

import assert from 'node:assert/strict';
import {
  evaluateCertaintyTopicSafety,
  CERTAINTY_CRISIS_LINE
} from '../api/certainty.js';

console.log('1. Testing pure helper evaluateCertaintyTopicSafety...');

// Crisis topics: must trip and return help line
const CRISIS_TOPICS = [
  'I honestly want to kill myself, nothing is working in my business',
  "I've been thinking about suicide since the launch flopped",
  "I don't want to be here anymore, I want to end my life",
  'everyone would be better off without me',
  'I keep hurting myself when the numbers look bad',
  'been cutting myself again, anyway about the client issue',
  "I'm thinking of taking an overdose tonight",
  "I can't go on anymore, there's no point in living"
];

for (const topic of CRISIS_TOPICS) {
  const res = evaluateCertaintyTopicSafety(topic);
  assert.equal(res.tripped, true, `Expected crisis detection for: "${topic}"`);
  assert.ok(typeof res.line === 'string' && res.line.includes('988'), 'Help line must point to 988');
  assert.ok(!res.line.includes('\u2014'), 'No em dashes in help line');
  assert.ok(!res.line.includes('--'), 'No ASCII double dashes in help line');
}

// Ordinary frustration topics: must NOT trip
const ORDINARY_TOPICS = [
  'Fixing my email automation',
  'This launch is killing me, I need a concrete next step for today',
  "We're dead in the water without a reliable lead source",
  "I'm so frustrated I could scream, conversion dropped to 0.4%",
  'Should I kill the offer or try to fix the messaging?',
  "I'm dying to get this video recorded and live by Friday",
  'My competitor is killing it on YouTube and I feel behind',
  "I'm exhausted and burned out, how do I simplify my daily routine",
  'Kill the funnel and rebuild the email sequence from scratch',
  'Looking over my numbers before the launch next week'
];

for (const topic of ORDINARY_TOPICS) {
  const res = evaluateCertaintyTopicSafety(topic);
  assert.equal(res.tripped, false, `Ordinary topic must not trip: "${topic}"`);
  assert.equal(res.line, null, `Line must be null for ordinary topic: "${topic}"`);
}

// Empty topics: must NOT trip
const EMPTY_TOPICS = ['', '   ', null, undefined];
for (const topic of EMPTY_TOPICS) {
  const res = evaluateCertaintyTopicSafety(topic);
  assert.equal(res.tripped, false, 'Empty topic must not trip');
  assert.equal(res.line, null, 'Line must be null for empty topic');
}

assert.ok(CERTAINTY_CRISIS_LINE.includes('988'), 'Crisis line references 988');
assert.ok(!CERTAINTY_CRISIS_LINE.includes('\u2014'), 'Crisis line contains no em dashes');
assert.ok(!CERTAINTY_CRISIS_LINE.includes('--'), 'Crisis line contains no double dashes');
console.log('PASS: pure helper verified with 100% crisis detection, 0 false trips, and clean empty handling.');

// 2. Testing handler integration with mock Supabase calls
console.log('2. Driving api/certainty.js handler with crisis, ordinary, and empty topic cases...');

const { default: handler } = await import('../api/certainty.js');

function makeMockFetch() {
  const events = [];
  const rpcCalls = [];
  let bookedSession = null;

  const fetch = async (url, options = {}) => {
    const sUrl = String(url);
    if (sUrl.endsWith('/auth/v1/user')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'usr-certainty-1', email: 'test@example.com', name: 'Test Member' }),
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
      rpcCalls.push({ name: 'book_certainty_session', args: body });
      bookedSession = {
        id: 'sess-test-123',
        user_id: 'usr-certainty-1',
        starts_at: '2026-10-20T14:00:00Z',
        ends_at: '2026-10-20T16:00:00Z',
        mode: body.p_mode || 'zoom',
        phone: body.p_phone || null,
        topic: body.p_topic || null,
        safety_flag: false,
        safety_flagged_at: null
      };
      return {
        ok: true,
        status: 200,
        json: async () => bookedSession,
        text: async () => JSON.stringify(bookedSession),
        headers: new Headers()
      };
    }
    if (sUrl.includes('/rpc/certainty_flag_safety')) {
      const body = JSON.parse(options.body || '{}');
      rpcCalls.push({ name: 'certainty_flag_safety', args: body });
      if (bookedSession) {
        bookedSession.safety_flag = true;
        bookedSession.safety_flagged_at = new Date().toISOString();
      }
      return {
        ok: true,
        status: 200,
        json: async () => bookedSession,
        text: async () => JSON.stringify(bookedSession),
        headers: new Headers()
      };
    }
    if (sUrl.includes('/rpc/certainty_set_calendar')) {
      const body = JSON.parse(options.body || '{}');
      rpcCalls.push({ name: 'certainty_set_calendar', args: body });
      return { ok: true, status: 200, json: async () => ({}), text: async () => '{}', headers: new Headers() };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}', headers: new Headers() };
  };

  return { fetch, events, rpcCalls, getBookedSession: () => bookedSession };
}

function makeReqRes(body) {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer member-token-xyz' },
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

// Case A: Crisis topic in booking
{
  const mock = makeMockFetch();
  globalThis.fetch = mock.fetch;
  const { req, res } = makeReqRes({
    action: 'book',
    date: '2026-10-20',
    hour: 14,
    mode: 'zoom',
    topic: 'I honestly want to kill myself, nothing is working in my business'
  });
  await handler(req, res);

  assert.equal(res.code, 200, 'Booking must succeed (seat is kept)');
  assert.ok(res.body.session, 'Returns booked session');
  assert.equal(res.body.session.safety_flag, true, 'Session is flagged for safety');
  assert.ok(res.body.crisis, 'Returns crisis payload');
  assert.equal(res.body.crisis.tripped, true);
  assert.ok(res.body.crisis.line.includes('988'), 'Crisis line points to 988');
  assert.ok(!res.body.crisis.line.includes('\u2014'), 'No em dashes in crisis line');

  const safetyEvent = mock.events.find(e => e.type === 'certainty_safety');
  assert.ok(safetyEvent, 'Must log certainty_safety event');
  assert.equal(safetyEvent.detail.sessionId, 'sess-test-123');
  // CRITICAL REQUIREMENT: "Log a certainty_safety event that carries no topic text."
  const eventStr = JSON.stringify(safetyEvent);
  assert.ok(!eventStr.includes('kill myself'), 'Safety event must carry NO topic text');
  assert.ok(!eventStr.includes('business'), 'Safety event must carry NO topic text');
}

// Case B: Ordinary topic in booking
{
  const mock = makeMockFetch();
  globalThis.fetch = mock.fetch;
  const { req, res } = makeReqRes({
    action: 'book',
    date: '2026-10-21',
    hour: 15,
    mode: 'phone',
    phone: '555-123-4567',
    topic: 'Fixing my email automation'
  });
  await handler(req, res);

  assert.equal(res.code, 200);
  assert.ok(res.body.session);
  assert.equal(res.body.crisis, null, 'No crisis payload for ordinary topic');
  const safetyEvent = mock.events.find(e => e.type === 'certainty_safety');
  assert.equal(safetyEvent, undefined, 'No certainty_safety event for ordinary topic');
}

// Case C: Empty topic in booking
{
  const mock = makeMockFetch();
  globalThis.fetch = mock.fetch;
  const { req, res } = makeReqRes({
    action: 'book',
    date: '2026-10-22',
    hour: 16,
    mode: 'zoom',
    topic: ''
  });
  await handler(req, res);

  assert.equal(res.code, 200);
  assert.ok(res.body.session);
  assert.equal(res.body.crisis, null, 'No crisis payload for empty topic');
  const safetyEvent = mock.events.find(e => e.type === 'certainty_safety');
  assert.equal(safetyEvent, undefined, 'No certainty_safety event for empty topic');
}

console.log('PASS check-certainty-safety: crisis topic flags and returns help line, ordinary and empty topics do not, no topic text logged');
