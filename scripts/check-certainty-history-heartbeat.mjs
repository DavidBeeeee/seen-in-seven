// WBR-458 (Momentum 300 UX 71, 72; Developer 80, 84): Certainty history pages
// past fifty, every reminder run writes a heartbeat, a gap past 26 hours alerts
// David even when nothing is due, and the hourly pg_cron tick is accepted only
// with a database-minted nonce.
//
// Drives the real handler with a mocked network, so it needs no secret. The
// production half (paging past 50 rows, the 26-hour gap, nonce replay) is
// scripts/sql/check-certainty-history-heartbeat.sql, which runs in a
// transaction that always rolls back.
import { readFileSync } from 'node:fs';

process.env.CRON_SECRET = 'test-cron-secret';
process.env.SUPABASE_SECRET_KEY = 'test-service-key';
process.env.CERTAINTY_REMINDER_CHANNEL = 'email';
process.env.RESEND_API_KEY = 'test-resend';
process.env.CERTAINTY_REMINDER_FROM = 'Certainty <reminders@example.invalid>';
process.env.CERTAINTY_OPERATOR_EMAIL = 'operator@example.invalid';

const mod = await import('../api/certainty-reminders.js');
const { default: handler, missedRunAlert, tickNonce, operatorMessage, MISSED_AFTER_HOURS } = mod;

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

// Pure pieces.
check(MISSED_AFTER_HOURS === 26, 'missed-run threshold must be 26 hours');
check(missedRunAlert({ missed: false, gapHours: 3 }) === null, 'no alert inside the threshold');
const alert = missedRunAlert({ missed: true, gapHours: 27, previousRanAt: '2026-10-22T12:00:00Z', thresholdHours: 26 });
check(alert && /27 hours ago/.test(alert.line) && /26-hour limit/.test(alert.line), 'alert names the gap and the limit');
check(alert && !/—/.test(alert.subject + alert.text), 'alert copy carries no em dash');
const nonce = '0f8fad5b-d9cb-469f-a165-70867728950e';
check(tickNonce({ headers: { 'x-certainty-tick': nonce } }) === nonce, 'a well-formed tick header is read');
check(tickNonce({ headers: { 'x-certainty-tick': 'not-a-uuid' } }) === null, 'a malformed tick header is ignored');
const digest = operatorMessage([{ label_day: 'Monday', label_start: '2:00 PM', member_email: 'm@example.invalid', mode: 'zoom' }], alert);
check(digest.text.split('\n')[0] === alert.line, "the missed-run alert leads David's coming-up email");

// The handler, with every outbound call recorded.
function harness({ run, due = [], consume = true }) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    const name = String(url).split('/rpc/')[1];
    const reply = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
    if (String(url).includes('api.resend.com')) return reply({ id: 'email' });
    if (name === 'certainty_consume_tick') return reply(consume);
    if (name === 'certainty_record_reminder_run') return reply(run);
    if (name === 'certainty_due_reminders') return reply(due);
    if (name === 'certainty_claim_reminder') return reply(true);
    return reply(null);
  };
  return calls;
}
async function invoke(headers, query = {}) {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
  await handler({ method: 'GET', headers, query }, res);
  return res;
}
const rpcNames = (calls) => calls.filter(c => c.url.includes('/rpc/')).map(c => c.url.split('/rpc/')[1]);

// 1. Daily cron, nothing due, no gap: heartbeat written first, no email.
let calls = harness({ run: { id: 'r1', missed: false, gapHours: 1 } });
let res = await invoke({ authorization: 'Bearer test-cron-secret' });
check(res.statusCode === 200 && res.body.trigger === 'vercel-cron', 'daily cron run succeeds as vercel-cron');
check(rpcNames(calls)[0] === 'certainty_record_reminder_run', 'the heartbeat is the first write of every run');
check(calls.find(c => c.url.includes('certainty_record_reminder_run')).body.p_missed_after_hours === 26, 'heartbeat carries the 26-hour threshold');
check(rpcNames(calls).includes('certainty_finish_reminder_run'), 'the run records its counts when it finishes');
check(!calls.some(c => c.url.includes('resend')), 'no email when nothing is due and no run was missed');

// 2. A 27-hour gap with nothing due: David still gets the alert.
calls = harness({ run: { id: 'r2', missed: true, gapHours: 27, previousRanAt: '2026-10-22T12:00:00Z', thresholdHours: 26 } });
res = await invoke({ authorization: 'Bearer test-cron-secret' });
const sent = calls.filter(c => c.url.includes('resend'));
check(sent.length === 1 && sent[0].body.to[0] === 'operator@example.invalid' && /missed/.test(sent[0].body.subject), 'a missed run emails David even with nothing due');
check(res.body.heartbeat && res.body.heartbeat.missed === true && res.body.heartbeat.alertOutcome === 'sent', 'the response reports the missed run and the alert outcome');
const finish = calls.find(c => c.url.includes('certainty_finish_reminder_run'));
check(finish && finish.body.p_alert_outcome === 'sent', 'the alert outcome is written to the heartbeat row');

// 3. Hourly tick: nonce consumed before anything else, trigger recorded.
calls = harness({ run: { id: 'r3', missed: false, gapHours: 1 } });
res = await invoke({ 'x-certainty-tick': nonce });
check(res.statusCode === 200 && res.body.trigger === 'hourly-tick', 'a valid tick runs the job as hourly-tick');
check(rpcNames(calls)[0] === 'certainty_consume_tick' && calls[0].body.p_nonce === nonce, 'the tick nonce is consumed before the run');

// 4. Replayed or forged tick: refused, nothing recorded, nothing sent.
calls = harness({ run: { id: 'r4', missed: false }, consume: false });
res = await invoke({ 'x-certainty-tick': nonce });
check(res.statusCode === 401 && res.body.error === 'tick-not-accepted', 'a replayed tick is refused');
check(!rpcNames(calls).includes('certainty_record_reminder_run'), 'a refused tick writes no heartbeat');

// 5. No credential at all: refused before any network call.
calls = harness({ run: { id: 'r5' } });
res = await invoke({});
check(res.statusCode === 401 && calls.length === 0, 'an unauthenticated request is refused with no calls');

// Source and migration.
const api = readFileSync('api/certainty.js', 'utf8');
check(/action === 'history'/.test(api) && /certainty_history', \{ p_offset: offset, p_limit: limit \}/.test(api), 'the Certainty API exposes a paged history action');
check(/rpc\('certainty_state', \{ p_days: 21 \}/.test(api), 'the state read is unchanged');
const sql = readFileSync('supabase_migrations/2026-10-23-certainty-history-paging-and-heartbeat.sql', 'utf8');
check(/offset v_offset\s+limit v_limit/.test(sql) && /'total', v_total/.test(sql), 'certainty_history pages and returns the true total');
check(/grant execute on function public\.certainty_consume_tick\(uuid\) to service_role/.test(sql) && !/grant execute on function public\.certainty_mint_tick/.test(sql), 'only service_role consumes ticks and nobody but the owner mints them');
check(/'5 \* \* \* \*'/.test(sql) && /x-certainty-tick/.test(sql), 'pg_cron calls the job hourly with a minted tick');
check(!/CRON_SECRET/.test(sql.replace(/^--.*$/gm, '')), 'the migration copies no secret into the database');

if (failures.length) {
  console.error('check-certainty-history-heartbeat FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('PASS check-certainty-history-heartbeat');
