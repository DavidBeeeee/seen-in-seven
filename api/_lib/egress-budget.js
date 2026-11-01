// Studio-served Supabase response bytes and the shared 5 GB monthly budget.
// The ledger uses the existing logs table. Details contain routes, byte counts,
// thresholds and dates only, never member content.

export const MONTHLY_EGRESS_BUDGET_BYTES = 5 * 1024 * 1024 * 1024;
export const EGRESS_WARNING_THRESHOLDS = [60, 80, 95];
export const EGRESS_RESPONSE_EVENT = 'studio_egress_response';
export const EGRESS_WARNING_EVENT = 'studio_egress_warning';

export function byteLength(raw) {
  return Buffer.byteLength(String(raw || ''), 'utf8');
}

export async function readJsonWithBytes(response) {
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
    if (row.event_type !== EGRESS_RESPONSE_EVENT || monthKey(created) !== currentMonth) continue;
    const bytes = Number(detail.bytes);
    if (!Number.isFinite(bytes) || bytes < 0) continue;
    monthlyBytes += bytes;
    if (dayKey(created) === currentDay) dailyBytes += bytes;
    const route = String(detail.route || 'unknown');
    if (!byRoute[route]) byRoute[route] = { route, requests: 0, bytes: 0 };
    byRoute[route].requests += 1;
    byRoute[route].bytes += bytes;
  }

  const percent = monthlyBytes / MONTHLY_EGRESS_BUDGET_BYTES * 100;
  return {
    period: currentMonth,
    day: currentDay,
    dailyBytes,
    monthlyBytes,
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

export function egressWarningMessage(status, threshold) {
  const usedGiB = (status.monthlyBytes / (1024 ** 3)).toFixed(2);
  return {
    subject: `Studio database bandwidth: ${threshold}% warning`,
    text: [
      `Studio-served Supabase responses have reached ${usedGiB} GiB of the 5 GiB monthly budget (${status.percent.toFixed(1)}%).`,
      `Today's measured responses: ${(status.dailyBytes / (1024 ** 2)).toFixed(2)} MiB.`,
      `This is the one ${threshold}% warning for ${status.period}. Certainty will show its calm paused screen if Supabase exhausts the shared quota.`,
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
    or: `(event_type.eq.${EGRESS_RESPONSE_EVENT},event_type.eq.${EGRESS_WARNING_EVENT})`,
    limit: '50000'
  });
  const response = await fetchFn(String(supabaseUrl).replace(/\/$/, '') + '/rest/v1/logs?' + query, {
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
  });
  if (!response.ok) return { ok: false, error: 'ledger-read-failed', status: response.status };
  const measured = await readJsonWithBytes(response);
  const rows = Array.isArray(measured.data) ? measured.data : [];
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
