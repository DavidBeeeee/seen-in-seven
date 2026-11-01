import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  EGRESS_RESPONSE_EVENT,
  EGRESS_WARNING_EVENT,
  MONTHLY_EGRESS_BUDGET_BYTES,
  assertWithinWarningBudget,
  checkAndWarnEgress,
  createReadCache,
  summarizeEgress,
  warningsDue
} from '../api/_lib/egress-budget.js';

const browserContext = { module: { exports: {} } };
vm.createContext(browserContext);
vm.runInContext(readFileSync(new URL('../js/certainty-egress.js', import.meta.url), 'utf8'), browserContext);
const browser = browserContext.module.exports;
const NOW = new Date('2026-11-01T18:00:00.000Z');
const results = [];

function pass(name, detail) {
  results.push({ name, result: 'pass', detail });
  console.log('PASS', name, detail);
}

function response(body, status = 200) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return raw; },
    async json() { return JSON.parse(raw); }
  };
}

async function warningFixture(threshold) {
  const rows = [{
    event_type: EGRESS_RESPONSE_EVENT,
    created_at: NOW.toISOString(),
    detail: { route: 'storysculpt', reader: 'recent_finished', bytes: Math.round(MONTHLY_EGRESS_BUDGET_BYTES * threshold / 100) }
  }, ...[60, 80, 95].filter(value => value < threshold).map(value => ({
    event_type: EGRESS_WARNING_EVENT,
    created_at: NOW.toISOString(),
    detail: { period: '2026-11', threshold: value }
  }))];
  const sent = [];
  const receipts = [];
  const fetchFn = async (url, init = {}) => {
    if (String(url).includes('/rest/v1/logs?')) return response(rows);
    if (String(url).endsWith('/rest/v1/logs') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      receipts.push(body);
      rows.push({ ...body, created_at: NOW.toISOString() });
      return response('', 201);
    }
    throw new Error('Unexpected fixture fetch: ' + url);
  };
  const input = {
    fetchFn,
    supabaseUrl: 'https://fixture.supabase.co',
    serviceKey: 'fixture-service-key',
    to: 'david@example.com',
    now: NOW,
    send: async (message) => { sent.push(message); return 'resend-fixture-' + threshold; }
  };
  const first = await checkAndWarnEgress(input);
  const second = await checkAndWarnEgress(input);
  assert.deepEqual(first.sent, [threshold]);
  assert.deepEqual(second.sent, []);
  assert.equal(sent.length, 1);
  assert.equal(receipts.length, 1);
  assert.equal(sent[0].idempotencyKey, `studio-egress-2026-11-${threshold}`);
  assert.match(sent[0].text, /5 GiB monthly budget/);
  pass(`${threshold}% warning`, 'one Resend send and one log receipt; repeat sends zero');
}

for (const threshold of [60, 80, 95]) await warningFixture(threshold);

const at80 = summarizeEgress([{
  event_type: EGRESS_RESPONSE_EVENT,
  created_at: NOW.toISOString(),
  detail: { route: 'certainty', bytes: MONTHLY_EGRESS_BUDGET_BYTES * 0.8 }
}], NOW);
assert.equal(at80.percent, 80);
assert.equal(assertWithinWarningBudget(at80), true);
const above80 = summarizeEgress([{
  event_type: EGRESS_RESPONSE_EVENT,
  created_at: NOW.toISOString(),
  detail: { route: 'certainty', bytes: MONTHLY_EGRESS_BUDGET_BYTES * 0.8001 }
}], NOW);
assert.throws(() => assertWithinWarningBudget(above80), /above the 80% warning budget/);
pass('80% check boundary', '80.0% passes; 80.01% fails');

const cache = createReadCache({ ttlMs: 30000 });
let reads = 0;
const read = () => { reads += 1; return Promise.resolve({ ok: true }); };
await Promise.all([cache.getOrCreate('member-hash', read), cache.getOrCreate('member-hash', read)]);
await cache.getOrCreate('member-hash', read);
assert.equal(reads, 1);
cache.delete('member-hash');
await cache.getOrCreate('member-hash', read);
assert.equal(reads, 2);
pass('short-lived read cache', 'two repeat hits use one read; invalidation forces a fresh read');

// Drive the real Certainty handler. First load a booking, then return the exact
// Supabase quota response on history and render the actual browser pause helper.
const { default: certaintyHandler } = await import('../api/certainty.js');
const upcoming = {
  id: 'booked-safe',
  starts_at: '2026-11-03T19:00:00.000Z',
  ends_at: '2026-11-03T21:00:00.000Z',
  mode: 'zoom',
  label_day: 'Tuesday, November 3, 2026',
  label_start: '2:00 PM',
  label_end: '4:00 PM'
};
let quotaPaused = false;
let unexpected = 0;
const priorFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const value = String(url);
  if (value.includes('/auth/v1/user')) return response({ id: 'member-1', email: 'member@example.com' });
  if (value.includes('/rpc/has_studio_app_access')) return response(true);
  if (value.includes('/rpc/consume_api_quota')) return response(true);
  if (value.includes('/rpc/certainty_state')) return response({ signedIn: true, bookedThisWeek: true, upcoming, held: [], historyCount: 0, engagement: 'active' });
  if (value.includes('/rpc/certainty_get_settings')) return response({ time_zone: 'America/New_York', default_mode: 'zoom' });
  if (value.includes('/rpc/certainty_history') && quotaPaused) return response({ code: 'exceed_egress_quota', message: 'Service restricted' }, 402);
  if (value.includes('/rpc/record_log_event')) return response({});
  unexpected += 1;
  throw new Error('Unexpected handler fetch: ' + value);
};

function mockRes() {
  const result = { status: 200, body: null, headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
    status(code) { result.status = code; return res; },
    json(body) { result.body = body; return res; }
  };
  return { res, result };
}

try {
  const goodReq = { method: 'POST', headers: { authorization: 'Bearer good-member' }, body: { action: 'state' } };
  const good = mockRes();
  await certaintyHandler(goodReq, good.res);
  assert.equal(good.result.status, 200);
  assert.equal(good.result.body.upcoming.id, 'booked-safe');

  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: (key) => values.get(key) || null };
  browser.saveLastGood(storage, good.result.body);
  quotaPaused = true;
  const pausedReq = { method: 'POST', headers: { authorization: 'Bearer paused-member' }, body: { action: 'history', offset: 0, limit: 20 } };
  const paused = mockRes();
  await certaintyHandler(pausedReq, paused.res);
  assert.equal(paused.result.status, 503);
  assert.equal(paused.result.body.code, 'SESSIONS_PAUSED');
  assert.equal(paused.result.body.error, 'Booking is paused for a few hours, your session is safe');
  assert.ok(Date.parse(paused.result.body.retryAfter) > Date.now());

  function node(extra = {}) {
    return {
      hidden: false,
      textContent: '',
      className: '',
      classList: { add() {}, remove() {} },
      querySelector(selector) { return extra[selector] || null; },
      ...extra
    };
  }
  const day = node();
  const time = node();
  const nodes = {
    'eee-access-gate': node(),
    'eee-app': node(),
    'cs-state-skeleton': node(),
    'cs-hero': node(),
    'cs-primary': node({ '.cs-next-day': day, '.cs-next-time': time }),
    'cs-session-msg': node()
  };
  const rendered = browser.showPaused({ getElementById: id => nodes[id] || null }, browser.lastGood(storage), paused.result.body.retryAfter, NOW, () => {});
  assert.equal(rendered.visible, 'session-and-pause');
  assert.equal(day.textContent, upcoming.label_day);
  assert.match(time.textContent, /2:00 PM/);
  assert.match(nodes['cs-session-msg'].textContent, /Booking is paused for a few hours, your session is safe/);
  assert.match(nodes['cs-session-msg'].textContent, /expected back by/);
  assert.equal(unexpected, 0);
  pass('402 paused screen', 'real handler returns SESSIONS_PAUSED; cached booked session and recovery time stay visible');
} finally {
  globalThis.fetch = priorFetch;
}

console.log(`\n${results.length}/${results.length} Certainty egress checks passed.`);
