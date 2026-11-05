// Studio-served Supabase response bytes and the shared 5 GB monthly budget.
// The ledger uses the existing logs table. Details contain routes, byte counts,
// thresholds and dates only, never member content.

export const MONTHLY_EGRESS_BUDGET_BYTES = 5 * 1024 * 1024 * 1024;
export const EGRESS_WARNING_THRESHOLDS = [60, 80, 95];
export const EGRESS_RESPONSE_EVENT = 'studio_egress_response';
export const EGRESS_WARNING_EVENT = 'studio_egress_warning';
// What the ledger still cannot count: sign-in before a member token exists, the
// small guard reads in api/hub-page and api/navigator, the Boardroom app, and
// sampling noise. scripts/sim/studio-egress.mjs proves this covers the model, so
// each warning fires early rather than late. docs/certainty-readiness.md has the
// counted percent where each one fires.
export const EGRESS_UNMETERED_MARGIN = 0.25;
// One reported event can only move the month so far. A browser or a script can
// report anything, so a bad number cannot trip every warning by itself.
export const REPORTED_EVENT_MAX_BYTES = 64 * 1024 * 1024;
const REPORTED_ROUTE = /^(client:|workerbee-tooling)/;

export function byteLength(raw) {
  return Buffer.byteLength(String(raw || ''), 'utf8');
}

export async function readJsonWithBytes(response) {
  if (typeof response.text !== 'function') {
    const data = await response.json();
    const raw = data == null ? '' : JSON.stringify(data);
    return { data, bytes: byteLength(raw) };
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { data, bytes: byteLength(raw) };
}

export async function recordResponseBytes({
  fetchFn = fetch,
  supabaseUrl,
  anonKey,
  userToken,
  route,
  reader,
  bytes
}) {
  if (!userToken || !Number.isFinite(bytes) || bytes < 0) return false;
  try {
    const response = await fetchFn(String(supabaseUrl).replace(/\/$/, '') + '/rest/v1/rpc/record_log_event', {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + userToken,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        p_event_type: EGRESS_RESPONSE_EVENT,
        p_detail: { schema: 1, route, reader, bytes: Math.round(bytes) }
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

// A server-side reader with no member token, such as WorkerBee's own tooling. It
// writes with the service key, the same way the warning receipt does.
export async function recordServiceBytes({ fetchFn = fetch, supabaseUrl, serviceKey, route, reader, bytes }) {
  if (!serviceKey || !Number.isFinite(bytes) || bytes < 0) return false;
  try {
    const response = await fetchFn(String(supabaseUrl).replace(/\/$/, '') + '/rest/v1/logs', {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        user_id: null,
        event_type: EGRESS_RESPONSE_EVENT,
        detail: { schema: 1, route, reader, bytes: Math.round(bytes) }
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export function summarizeEgress(rows, now = new Date()) {
  const currentMonth = monthKey(now);
  const currentDay = dayKey(now);
  let monthlyBytes = 0;
  let dailyBytes = 0;
  const byRoute = {};
  const warnings = new Set();

  for (const row of rows || []) {
    const created = new Date(row && row.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const detail = row.detail || {};
    if (row.event_type === EGRESS_WARNING_EVENT && detail.period === currentMonth) {
      warnings.add(Number(detail.threshold));
      continue;
    }
    const measurement = row.event_type === EGRESS_RESPONSE_EVENT ? detail : detail.egress;
    if (!measurement || monthKey(created) !== currentMonth) continue;
    const reported = Number(measurement.bytes);
    if (!Number.isFinite(reported) || reported < 0) continue;
    const bytes = REPORTED_ROUTE.test(String(measurement.route)) ? Math.min(reported, REPORTED_EVENT_MAX_BYTES) : reported;
    monthlyBytes += bytes;
    if (dayKey(created) === currentDay) dailyBytes += bytes;
    const route = String(measurement.route || 'unknown');
    if (!byRoute[route]) byRoute[route] = { route, requests: 0, bytes: 0 };
    byRoute[route].requests += 1;
    byRoute[route].bytes += bytes;
  }

  const estimatedBytes = monthlyBytes * (1 + EGRESS_UNMETERED_MARGIN);
  const percent = estimatedBytes / MONTHLY_EGRESS_BUDGET_BYTES * 100;
  return {
    period: currentMonth,
    day: currentDay,
    dailyBytes,
    monthlyBytes,
    estimatedBytes,
    budgetBytes: MONTHLY_EGRESS_BUDGET_BYTES,
    percent,
    over80: percent > 80,
    exhausted: percent >= 100,
    byRoute: Object.values(byRoute).sort((a, b) => b.bytes - a.bytes),
    warningsSent: [...warnings].sort((a, b) => a - b)
  };
}

export function warningsDue(status) {
  return EGRESS_WARNING_THRESHOLDS.filter(threshold =>
    status.percent >= threshold && !status.warningsSent.includes(threshold)
  );
}

const EGRESS_WARNING_ACTIONS = {
  60: 'nothing urgent. Look at the heaviest route below, and if it is workerbee-tooling, check for a run looping on a publish.',
  80: 'cut the heaviest route below today. Members are not affected yet.',
  95: 'stop non-essential WorkerBee publishing now. If the quota runs out, every Hub app that reads Supabase stops until the monthly reset.'
};

export function egressWarningMessage(status, threshold) {
  const usedGiB = (status.monthlyBytes / (1024 ** 3)).toFixed(2);
  return {
    subject: `Studio database bandwidth: ${threshold}% warning`,
    text: [
      `Counted Supabase responses have reached ${usedGiB} GiB. With the ${Math.round(EGRESS_UNMETERED_MARGIN * 100)}% margin for what cannot be counted, that is about ${(status.estimatedBytes / (1024 ** 3)).toFixed(2)} GiB of the 5 GiB monthly budget (${status.percent.toFixed(1)}%).`,
      `Today's measured responses: ${(status.dailyBytes / (1024 ** 2)).toFixed(2)} MiB.`,
      `This is the one ${threshold}% warning for ${status.period}. Certainty will show its calm paused screen if Supabase exhausts the shared quota.`,
      '',
      `What to do: ${EGRESS_WARNING_ACTIONS[threshold] || EGRESS_WARNING_ACTIONS[95]}`,
      '',
      'Heaviest measured routes:',
      ...(status.byRoute.length
        ? status.byRoute.map(row => `- ${row.route}: ${row.bytes} bytes across ${row.requests} responses`)
        : ['- No route rows in this fixture.'])
    ].join('\n')
  };
}

async function writeWarningReceipt({ fetchFn, supabaseUrl, serviceKey, status, threshold, providerId }) {
  const response = await fetchFn(String(supabaseUrl).replace(/\/$/, '') + '/rest/v1/logs', {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      user_id: null,
      event_type: EGRESS_WARNING_EVENT,
      detail: { schema: 1, period: status.period, threshold, bytes: status.monthlyBytes, providerId: providerId || null }
    })
  });
  if (!response.ok) throw new Error('egress warning receipt failed (' + response.status + ')');
}

export async function checkAndWarnEgress({
  fetchFn = fetch,
  supabaseUrl,
  serviceKey,
  send,
  to,
  now = new Date()
}) {
  if (!serviceKey) return { ok: false, error: 'service-key-not-configured' };
  const monthStart = monthKey(now) + '-01T00:00:00.000Z';
  const query = new URLSearchParams({
    select: 'event_type,detail,created_at',
    'created_at': 'gte.' + monthStart,
    // Only the StorySculpt events that carry a measurement. This read is itself egress.
    or: `(event_type.eq.${EGRESS_RESPONSE_EVENT},event_type.eq.${EGRESS_WARNING_EVENT},and(event_type.like.storysculpt_*,detail->egress.not.is.null))`,
    limit: '50000'
  });
  const response = await fetchFn(String(supabaseUrl).replace(/\/$/, '') + '/rest/v1/logs?' + query, {
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
  });
  if (!response.ok) return { ok: false, error: 'ledger-read-failed', status: response.status };
  const measured = await readJsonWithBytes(response);
  const rows = Array.isArray(measured.data) ? measured.data : [];
  // This read is itself egress, and it grows with the month.
  await recordServiceBytes({ fetchFn, supabaseUrl, serviceKey, route: 'certainty-reminders', reader: 'egress-ledger', bytes: measured.bytes });
  const status = summarizeEgress(rows, now);
  const due = warningsDue(status);
  const sent = [];
  const failed = [];

  for (const threshold of due) {
    if (!send || !to) {
      failed.push({ threshold, reason: 'email-not-configured' });
      continue;
    }
    try {
      const message = egressWarningMessage(status, threshold);
      const providerId = await send({
        to,
        ...message,
        idempotencyKey: `studio-egress-${status.period}-${threshold}`
      });
      await writeWarningReceipt({ fetchFn, supabaseUrl, serviceKey, status, threshold, providerId });
      sent.push(threshold);
      status.warningsSent.push(threshold);
    } catch (error) {
      failed.push({ threshold, reason: String(error && error.message || error).slice(0, 160) });
    }
  }
  return { ok: failed.length === 0, status, due, sent, failed };
}

export function assertWithinWarningBudget(status) {
  if (!status || !Number.isFinite(status.percent)) throw new Error('Egress budget could not be calculated.');
  if (status.percent > 80) {
    throw new Error(`Measured Studio egress is ${status.percent.toFixed(1)}%, above the 80% warning budget.`);
  }
  return true;
}

// Small, bounded server cache for read-mostly Supabase calls. Keys are hashes,
// never bearer tokens, and writes can invalidate the member's cached entry.
export function createReadCache({ ttlMs = 30000, maxEntries = 200 } = {}) {
  const entries = new Map();
  return {
    async getOrCreate(key, read) {
      const now = Date.now();
      const prior = entries.get(key);
      if (prior && prior.expiresAt > now) return prior.value;
      const pending = Promise.resolve().then(read);
      entries.delete(key);
      entries.set(key, { value: pending, expiresAt: now + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      try {
        return await pending;
      } catch (error) {
        if (entries.get(key)?.value === pending) entries.delete(key);
        throw error;
      }
    },
    delete(key) { entries.delete(key); },
    clear() { entries.clear(); },
    get size() { return entries.size; }
  };
}
