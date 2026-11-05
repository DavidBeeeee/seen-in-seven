import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  EGRESS_RESPONSE_EVENT,
  EGRESS_UNMETERED_MARGIN,
  REPORTED_EVENT_MAX_BYTES,
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
// The counted bytes that put the margin-adjusted estimate at this percent.
const countedFor = (percent) => MONTHLY_EGRESS_BUDGET_BYTES * percent / 100 / (1 + EGRESS_UNMETERED_MARGIN);
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
    detail: { route: 'storysculpt', reader: 'recent_finished', bytes: Math.ceil(countedFor(threshold)) }
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
      if (body.event_type === EGRESS_WARNING_EVENT) receipts.push(body);
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
  detail: { route: 'certainty', bytes: countedFor(80) }
}], NOW);
assert.ok(Math.abs(at80.percent - 80) < 1e-9);
assert.ok(at80.monthlyBytes < MONTHLY_EGRESS_BUDGET_BYTES * 0.65, 'the margin fires the 80 percent warning at 64 percent counted');
assert.equal(assertWithinWarningBudget(at80), true);
const above80 = summarizeEgress([{
  event_type: EGRESS_RESPONSE_EVENT,
  created_at: NOW.toISOString(),
  detail: { route: 'certainty', bytes: countedFor(80.01) }
}], NOW);
assert.throws(() => assertWithinWarningBudget(above80), /above the 80% warning budget/);
pass('80% check boundary', '80.0% passes; 80.01% fails');

// WBR-458 Developer 100: the browser's direct reads reach the same warning.
const reportContext = { module: { exports: {} }, URL, TextEncoder };
vm.createContext(reportContext);
vm.runInContext(readFileSync(new URL('../js/egress-report.js', import.meta.url), 'utf8'), reportContext);
const { createMeter, readerFor } = reportContext.module.exports;
const MEMBER_HEADERS = { apikey: 'anon-key', Authorization: 'Bearer member-token' };
function browserFetch(calls) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response('x'.repeat(1000), { status: 200 });
  };
}
const unsampledCalls = [];
const unsampled = createMeter({ page: 'vault', sampleEvery: 10, random: () => 0.9, fetchImpl: browserFetch(unsampledCalls) });
await unsampled.fetch('https://fixture.supabase.co/rest/v1/scripts?select=*', { headers: MEMBER_HEADERS });
await unsampled.settle();
assert.equal(unsampled.flush(), null, 'an unsampled page reports nothing');
assert.equal(unsampledCalls.length, 1, 'an unsampled page adds no request');

const anonCalls = [];
const anon = createMeter({ page: 'home', sampleEvery: 1, fetchImpl: browserFetch(anonCalls) });
await anon.fetch('https://fixture.supabase.co/rest/v1/points_config', { headers: { apikey: 'anon-key', Authorization: 'Bearer anon-key' } });
await anon.settle();
assert.equal(anon.flush(), null, 'no member token, no event the database would only drop');

const clientCalls = [];
const meter = createMeter({ page: 'vault', sampleEvery: 10, random: () => 0.01, fetchImpl: browserFetch(clientCalls) });
const memberResponse = await meter.fetch('https://fixture.supabase.co/rest/v1/rpc/admin_get_scripts', { headers: new Headers(MEMBER_HEADERS) });
assert.equal((await memberResponse.text()).length, 1000, 'the page still gets its whole response');
meter.note('storage-book', 500);
await meter.settle();
await meter.flush();
assert.equal(readerFor('https://fixture.supabase.co/storage/v1/object/sign/x'), 'storage');
const reportCall = clientCalls.find((call) => call.url.endsWith('/rest/v1/rpc/record_log_event'));
const reported = JSON.parse(reportCall.init.body);
assert.equal(reported.p_event_type, EGRESS_RESPONSE_EVENT);
assert.equal(reported.p_detail.bytes, 15000, 'sampled bytes are scaled up by the sample rate');
assert.equal(reported.p_detail.reader, 'admin_get_scripts');
assert.equal(reported.p_detail.route, 'client:vault');
assert.equal(reportCall.init.keepalive, true, 'the report survives the page closing');
assert.ok(!/x{10}/.test(reportCall.init.body), 'the report carries sizes, never content');
assert.equal(meter.flush(), null, 'a second flush does not count the same bytes twice');

// The bytes the browser really reported are what move the month total.
const reportedRow = { event_type: EGRESS_RESPONSE_EVENT, created_at: NOW.toISOString(), detail: reported.p_detail };
const justUnder80 = { event_type: EGRESS_RESPONSE_EVENT, created_at: NOW.toISOString(), detail: { route: 'certainty', bytes: Math.ceil(countedFor(80)) - 15000 + 1 } };
const earlierWarning = { event_type: EGRESS_WARNING_EVENT, created_at: NOW.toISOString(), detail: { period: '2026-11', threshold: 60 } };
const beforeReport = summarizeEgress([justUnder80, earlierWarning], NOW);
assert.deepEqual(warningsDue(beforeReport), [], 'just under 80 percent nothing is due');
const clientRows = [justUnder80, earlierWarning, reportedRow];
const clientSent = [];
const clientRun = await checkAndWarnEgress({
  fetchFn: async (url) => (String(url).includes('/rest/v1/logs?') ? response(clientRows) : response('', 201)),
  supabaseUrl: 'https://fixture.supabase.co',
  serviceKey: 'fixture-service-key',
  to: 'david@example.com',
  now: NOW,
  send: async (message) => { clientSent.push(message); return 'resend-client'; }
});
assert.deepEqual(clientRun.sent, [80], 'the client-reported read trips the 80 percent warning');
assert.equal(clientRun.status.monthlyBytes - beforeReport.monthlyBytes, 15000);
assert.match(clientSent[0].text, /client:vault/, 'the warning names the client page');
assert.match(clientSent[0].text, /What to do: cut the heaviest route/, 'the warning says what to do');
pass('client-reported read', '15000 sampled bytes moved the month total and tripped the 80% warning; unsampled pages add no request');

const spoofed = summarizeEgress([{ event_type: EGRESS_RESPONSE_EVENT, created_at: NOW.toISOString(), detail: { route: 'client:vault', bytes: 1e15 } }], NOW);
assert.equal(spoofed.monthlyBytes, REPORTED_EVENT_MAX_BYTES);
pass('reported bytes are capped', 'one event cannot trip every warning by itself');


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
