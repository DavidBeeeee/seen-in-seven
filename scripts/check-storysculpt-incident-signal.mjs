// WBR-458 (Momentum 300 StorySculpt Developer 76 to 80, 82, 83). The incident
// signal tells an outside-service failure, an app error, a rejected answer and
// a member walk-away apart, names which provider failed, and alerts David past
// a per-kind threshold; it runs hourly on the Certainty reminder tick. A failed
// save is retried and the work kept on the device. A product-page failure is
// recorded as its own provider, not as DeepSeek.
import { readFileSync } from 'node:fs';
import {
  incidentSignal, incidentKind, providerFor, incidentAlertMessage, buildEventDetail, classifyFailure, INCIDENT_THRESHOLDS
} from '../api/_lib/storysculpt-observability.js';
import { checkStorySculptIncidents } from '../api/_lib/storysculpt-incidents.js';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

// The four kinds and the providers.
check(incidentKind('deepseek-error') === 'provider' && incidentKind('database-error') === 'provider' && incidentKind('research-error') === 'provider', 'outside services are the provider kind');
check(incidentKind('internal-error') === 'app', 'our own code is the app kind');
check(incidentKind('output-rejected') === 'rejected', 'a rejected answer is its own kind');
check(incidentKind('member-walkaway', 'walkaway', 'storysculpt_walkaway') === 'walkaway', 'a walk-away is its own kind');
check(incidentKind('denied-entitlement') === null && incidentKind('bad-request') === null, 'refusals have no kind');
check(providerFor('deepseek-timeout') === 'deepseek' && providerFor('save-error') === 'supabase' && providerFor('research-error') === 'web-research', 'each provider is named');
check(classifyFailure('research') === 'research-error', 'a research failure classifies as research-error');
const detail = buildEventDetail({ outcome: 'error', failureClass: 'research-error' });
check(detail.provider === 'web-research' && detail.layer === 'research' && detail.failureKind === 'provider-infrastructure', 'a research failure event names its provider and is not DeepSeek');
check(buildEventDetail({ outcome: 'error', failureClass: 'deepseek-error' }).provider === 'deepseek', 'a DeepSeek failure event names DeepSeek');

const now = Date.parse('2026-10-23T22:00:00Z');
const at = (m) => new Date(now - m * 60000).toISOString();
const ev = (type, failureClass, m, extra = {}) => ({ event_type: 'storysculpt_' + type, created_at: at(m), detail: { outcome: type === 'generation' ? 'generation' : type, failureClass, ...extra } });
const busy = Array.from({ length: 12 }, (_, i) => ev('generation', undefined, 50 - i));

// Each kind alone, below and at its threshold.
const cases = {
  provider: (n) => Array.from({ length: n }, (_, i) => ev('error', i % 2 ? 'database-error' : 'research-error', 10 + i)),
  app: (n) => Array.from({ length: n }, (_, i) => ev('error', 'internal-error', 10 + i)),
  rejected: (n) => Array.from({ length: n }, (_, i) => ev('output_rejected', 'output-rejected', 10 + i)),
  walkaway: (n) => Array.from({ length: n }, (_, i) => ev('walkaway', 'member-walkaway', 10 + i))
};
for (const [kind, make] of Object.entries(cases)) {
  const limit = INCIDENT_THRESHOLDS[kind];
  const below = incidentSignal([...busy, ...make(limit - 1)], { now });
  const atLimit = incidentSignal([...busy, ...make(limit)], { now });
  check(below.kinds[kind] === limit - 1 && !below.tripped.includes(kind), kind + ' below its threshold does not trip');
  check(atLimit.level === 'incident' && atLimit.tripped.includes(kind), kind + ' at its threshold trips');
  for (const other of Object.keys(cases)) if (other !== kind) check(atLimit.kinds[other] === 0, kind + ' events are not counted as ' + other);
}
const mixed = incidentSignal([...busy, ...cases.provider(2), ...cases.app(1), ...cases.rejected(1), ...cases.walkaway(1)], { now });
check(mixed.kinds.provider === 2 && mixed.kinds.app === 1 && mixed.kinds.rejected === 1 && mixed.kinds.walkaway === 1, 'a mixed window counts each kind separately');
check(mixed.byProvider['web-research'] === 1 && mixed.byProvider.supabase === 1 && !mixed.byProvider.deepseek, 'provider failures are split by provider');
check(mixed.level === 'incident' && mixed.tripped.length === 0 && /failure\(s\)/.test(mixed.reason), 'four real failures in an hour still trip the overall rule with no single kind over its line');
const quiet = incidentSignal([...busy, ...cases.app(1), ...cases.walkaway(2)], { now });
check(quiet.level === 'ok' && incidentAlertMessage(quiet) === null, 'a window below every threshold sends nothing');

const tripped = incidentSignal([...busy, ...cases.app(2)], { now });
const alert = incidentAlertMessage(tripped);
check(alert && /app/.test(alert.subject) && /App errors \(our code\): 2/.test(alert.text) && /walked away mid-step: 0/.test(alert.text), 'the alert names the tripped kind with every kind counted');
check(alert && !/—/.test(alert.subject + alert.text), 'alert copy carries no em dash');

// The shared runner emails once when tripped, holds without a channel, and
// sends nothing when quiet.
const rowsFetch = (rows) => async () => ({ ok: true, status: 200, json: async () => rows });
let sent = [];
const send = async (msg) => { sent.push(msg); };
let run = await checkStorySculptIncidents({ supabaseUrl: 'https://x.invalid', serviceKey: 'k', send, fetchFn: rowsFetch(cases.app(2).map(e => ({ ...e, created_at: new Date().toISOString() }))) });
check(run.alertOutcome === 'sent' && sent.length === 1, 'a tripped signal emails David once');
sent = [];
run = await checkStorySculptIncidents({ supabaseUrl: 'https://x.invalid', serviceKey: 'k', send: null, fetchFn: rowsFetch(cases.app(2).map(e => ({ ...e, created_at: new Date().toISOString() }))) });
check(run.alertOutcome === 'held' && sent.length === 0, 'with no channel the alert is held, not dropped silently');
run = await checkStorySculptIncidents({ supabaseUrl: 'https://x.invalid', serviceKey: 'k', send, fetchFn: rowsFetch([]) });
check(run.alertOutcome === null && sent.length === 0, 'a quiet window sends nothing');

// Wiring.
const reminders = readFileSync('api/certainty-reminders.js', 'utf8');
check(/checkStorySculptIncidents\(/.test(reminders) && /trigger !== 'vercel-cron'/.test(reminders), 'the check rides the hourly tick, not the daily run');
const api = readFileSync('api/storysculpt.js', 'utf8');
check(/onFailure: \(extra\) => recordEvent\(token, user\.id, 'storysculpt_error'/.test(api) && /classifyFailure\('research'\)/.test(api), 'a research failure is recorded as its own event');
const client = readFileSync('js/storysculpt.js', 'utf8');
check(/for \(let attempt = 0; attempt < 2; attempt\+\+\)/.test(client) && /SAVE_RETRY_DELAY_MS/.test(client), 'a failed save is retried once');
check(/keepUnsavedStory\(saving\.id, updates\)/.test(client) && /restoreUnsavedStory\(project\)/.test(client) && /addEventListener\('online'/.test(client), 'unsaved work is kept on the device and saved again later');
check(/Number\(kept\.expected_version\) !== \(Number\(project\.version\) \|\| 1\)/.test(client), 'kept work never overwrites a newer server copy');
check(/if \(!error \|\| isStaleVersionError\(error\)\) break;/.test(client), 'a stale-version refusal is not retried');

if (failures.length) {
  console.error('check-storysculpt-incident-signal FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('PASS check-storysculpt-incident-signal: four kinds apart, providers named, per-kind thresholds alert David, hourly wiring, save retry with on-device keep.');
