// Retry a failed Certainty calendar invite once, on the next hourly reminder
// tick (WBR-458; the WO-20261025-afternoon review found the promised retry was
// missing). Not a Vercel function: api/certainty-reminders.js calls it.
//
// It reads the last day of certainty_invite_* events with the service key. A
// certainty_invite_failed event is retried when nothing has answered it yet:
// no certainty_invite_retried / certainty_invite_retry_failed for the same
// session, method and sequence, and no newer invite for that session (a later
// edit or cancel already carries the current state). The session is read back
// from the table, so the retry sends what is true now, and only to the
// recipients the failure names. Resend's per-recipient Idempotency-Key, built
// from the same session, method and sequence, means an overlapping run or a
// lost log write cannot send a duplicate inside Resend's 24-hour window, which
// is also how far back this looks.

import { sendCertaintyInviteEmails } from './certainty-ics.js';

const LOOKBACK_HOURS = 24;
const ANSWERS = new Set(['certainty_invite_retried', 'certainty_invite_retry_failed']);

function versionKey(detail) {
  return `${detail.sessionId}/${String(detail.method || '').toUpperCase()}/${Number(detail.sequence)}`;
}

// Pure selection, exported for the check. rows are ascending by created_at.
export function invitesToRetry(rows) {
  const answered = new Set();
  const newest = new Map();
  for (const row of rows || []) {
    const d = row && row.detail;
    if (!d || !d.sessionId) continue;
    if (ANSWERS.has(row.event_type)) answered.add(versionKey(d));
    if (row.event_type === 'certainty_invite_sent' || row.event_type === 'certainty_invite_failed') {
      const seq = Number(d.sequence);
      const prior = newest.get(d.sessionId);
      if (Number.isFinite(seq) && (prior == null || seq >= prior)) newest.set(d.sessionId, seq);
    }
  }
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    const d = row && row.detail;
    if (!row || row.event_type !== 'certainty_invite_failed' || !d || !d.sessionId) continue;
    // Failures logged before the retry existed carry no method or sequence;
    // retrying them would guess the version, so they stay as logged.
    if (!d.method || d.sequence == null || !Number.isFinite(Number(d.sequence))) continue;
    const key = versionKey(d);
    if (answered.has(key) || seen.has(key)) continue;
    if (newest.get(d.sessionId) !== Number(d.sequence)) continue;
    seen.add(key);
    const recipients = Array.isArray(d.failedRecipients) && d.failedRecipients.length
      ? d.failedRecipients.filter(r => r === 'member' || r === 'david')
      : ['member', 'david'];
    if (!recipients.length) continue;
    out.push({ sessionId: d.sessionId, action: d.action, method: String(d.method).toUpperCase(), sequence: Number(d.sequence), recipients });
  }
  return out;
}

function base(url) {
  return String(url).replace(/\/$/, '');
}

async function readInviteEvents({ supabaseUrl, serviceKey, fetchFn, now }) {
  const since = new Date(now - LOOKBACK_HOURS * 3600000).toISOString();
  const url = `${base(supabaseUrl)}/rest/v1/logs?select=event_type,detail,created_at&event_type=like.certainty_invite_*&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=2000`;
  const response = await fetchFn(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!response.ok) throw new Error(`could not read invite events (${response.status})`);
  return response.json();
}

async function readSession({ supabaseUrl, serviceKey, fetchFn, id }) {
  const url = `${base(supabaseUrl)}/rest/v1/certainty_sessions?id=eq.${encodeURIComponent(id)}&select=*`;
  const response = await fetchFn(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function writeEvent({ supabaseUrl, serviceKey, fetchFn, userId, type, detail }) {
  if (!userId) return;
  try {
    await fetchFn(`${base(supabaseUrl)}/rest/v1/logs`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, event_type: type, detail })
    });
  } catch (error) {
    console.error('certainty-invite-retry: event write failed', type, String(error));
  }
}

// Returns { retried, failed, skipped } counts. Never throws for one invite.
export async function retryFailedInvites({ supabaseUrl, serviceKey, fetchFn = fetch, send = sendCertaintyInviteEmails, now = Date.now() }) {
  const rows = await readInviteEvents({ supabaseUrl, serviceKey, fetchFn, now });
  const due = invitesToRetry(rows);
  const counts = { due: due.length, retried: 0, failed: 0, skipped: 0 };
  for (const item of due) {
    const session = await readSession({ supabaseUrl, serviceKey, fetchFn, id: item.sessionId });
    const wantStatus = item.method === 'CANCEL' ? 'cancelled' : 'booked';
    const info = { schema: 1, action: item.action, sessionId: item.sessionId, method: item.method, sequence: item.sequence };
    if (!session || session.status !== wantStatus) {
      counts.skipped += 1;
      if (session) await writeEvent({ supabaseUrl, serviceKey, fetchFn, userId: session.user_id, type: 'certainty_invite_retry_failed', detail: { ...info, reason: 'session-state-changed' } });
      continue;
    }
    const zoomUrl = String(process.env.CERTAINTY_ZOOM_URL || '').trim() || null;
    try {
      const result = await send({
        session,
        action: item.action,
        method: item.method,
        sequence: item.sequence,
        zoomUrl: session.mode === 'zoom' ? zoomUrl : null,
        recipients: item.recipients,
        fetchFn
      });
      counts.retried += 1;
      await writeEvent({ supabaseUrl, serviceKey, fetchFn, userId: session.user_id, type: 'certainty_invite_retried', detail: { ...info, recipients: item.recipients, memberMessageId: result.memberMessageId, davidMessageId: result.davidMessageId } });
    } catch (error) {
      counts.failed += 1;
      console.error('certainty-invite-retry: retry failed', item.sessionId, String(error));
      await writeEvent({ supabaseUrl, serviceKey, fetchFn, userId: session.user_id, type: 'certainty_invite_retry_failed', detail: { ...info, recipients: item.recipients, reason: String(error && error.message || error).slice(0, 240) } });
    }
  }
  return counts;
}
