// WBR-373 (Momentum 300 Developer 53, 55, 56): an evaluation set for the
// Certainty lapse classifier, so the welcome-back logic cannot quietly drift.
//
// certainty_engagement() lives in SQL. This check reads the most recent
// migration that defines it, builds the same CASE from the intervals written
// there, derives each member's inputs from a seeded session history exactly the
// way admin_get_certainty_engagement does (held = booked and ended, upcoming =
// booked and not yet ended, churned = membership no longer active), and asserts
// the bucket for every case. Change a threshold in SQL without changing the
// cases and this fails.
import { readFileSync, readdirSync } from 'node:fs';

const DAY = 86400000;
const NOW = Date.parse('2026-10-10T16:00:00Z');

// ── The classifier, as written in SQL ───────────────────────────────────────
const migrations = readdirSync('supabase_migrations').filter(f => f.endsWith('.sql')).sort();
let sql = '';
for (const file of migrations) {
  const text = readFileSync('supabase_migrations/' + file, 'utf8');
  if (/create or replace function public\.certainty_engagement\(/.test(text)) sql = text;
}
if (!sql) {
  console.error('check-certainty-engagement FAIL\n- no migration defines certainty_engagement()');
  process.exit(1);
}
const body = sql.slice(sql.indexOf('function public.certainty_engagement('));
const current = body.match(/p_now - p_last_held_end < interval '(\d+) days' then 'current'/);
const skipped = body.match(/p_now - p_last_held_end < interval '(\d+) days' then 'skipped'/);
const upcomingFirst = /when coalesce\(p_has_upcoming, false\) then 'current'\s*when p_last_held_end is null then 'new'/.test(body);
const elseLapsed = /else 'lapsed'/.test(body);
if (!current || !skipped || !upcomingFirst || !elseLapsed) {
  console.error('check-certainty-engagement FAIL\n- certainty_engagement() no longer has the shape this check reads; update the check with the SQL');
  process.exit(1);
}
const CURRENT_DAYS = Number(current[1]);
const LAPSE_DAYS = Number(skipped[1]);

function certaintyEngagement(lastHeldEnd, hasUpcoming, now) {
  if (hasUpcoming) return 'current';
  if (lastHeldEnd == null) return 'new';
  const age = now - lastHeldEnd;
  if (age < CURRENT_DAYS * DAY) return 'current';
  if (age < LAPSE_DAYS * DAY) return 'skipped';
  return 'lapsed';
}

// admin_get_certainty_engagement's derivation, from raw session rows.
function classify(member, now = NOW) {
  if (!member.active) return 'churned';
  const booked = member.sessions.filter(s => s.status === 'booked');
  const held = booked.filter(s => s.endsAt <= now);
  const lastHeldEnd = held.length ? Math.max(...held.map(s => s.endsAt)) : null;
  const hasUpcoming = booked.some(s => s.endsAt > now);
  return certaintyEngagement(lastHeldEnd, hasUpcoming, now);
}

// A session that ended `daysAgo` days before NOW (negative = in the future).
const ended = (daysAgo, status = 'booked') => ({ status, endsAt: NOW - daysAgo * DAY });

const cases = [
  { name: 'never held, nothing booked', member: { active: true, sessions: [] }, want: 'new' },
  { name: 'never held, first session booked for next week', member: { active: true, sessions: [ended(-6)] }, want: 'current' },
  { name: 'upcoming booking with an old last session (60 days)', member: { active: true, sessions: [ended(60), ended(-2)] }, want: 'current' },
  { name: 'held yesterday', member: { active: true, sessions: [ended(1)] }, want: 'current' },
  { name: 'held 7 days 23 hours ago (just inside the week)', member: { active: true, sessions: [ended(7 + 23 / 24)] }, want: 'current' },
  { name: 'exactly 8 days since the last held session', member: { active: true, sessions: [ended(8)] }, want: 'skipped' },
  { name: '20 days since the last held session', member: { active: true, sessions: [ended(20)] }, want: 'skipped' },
  { name: 'exactly 21 days since the last held session', member: { active: true, sessions: [ended(21)] }, want: 'lapsed' },
  { name: '45 days since the last held session', member: { active: true, sessions: [ended(45), ended(52)] }, want: 'lapsed' },
  { name: 'only cancelled sessions, never held', member: { active: true, sessions: [ended(10, 'cancelled'), ended(3, 'cancelled')] }, want: 'new' },
  { name: 'only a cancelled upcoming session after an old held one', member: { active: true, sessions: [ended(30), ended(-3, 'cancelled')] }, want: 'lapsed' },
  { name: 'cancelled recent session does not reset the clock', member: { active: true, sessions: [ended(25), ended(2, 'cancelled')] }, want: 'lapsed' },
  { name: 'session in progress right now counts as upcoming', member: { active: true, sessions: [{ status: 'booked', endsAt: NOW + 30 * 60000 }] }, want: 'current' },
  { name: 'membership ended, last session yesterday', member: { active: false, sessions: [ended(1)] }, want: 'churned' },
  { name: 'membership ended, long lapsed', member: { active: false, sessions: [ended(90)] }, want: 'churned' },
  { name: 'membership ended, never held', member: { active: false, sessions: [] }, want: 'churned' }
];

const failures = [];
const seen = new Set();
for (const c of cases) {
  const got = classify(c.member);
  seen.add(got);
  if (got !== c.want) failures.push(c.name + ': expected ' + c.want + ', got ' + got);
}
for (const bucket of ['current', 'skipped', 'lapsed', 'new', 'churned']) {
  if (!seen.has(bucket)) failures.push('no case lands in ' + bucket);
}
if (cases.length < 12) failures.push('fewer than twelve cases');

if (failures.length) {
  console.error('check-certainty-engagement FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('check-certainty-engagement PASS (' + cases.length + ' cases; current < ' + CURRENT_DAYS + 'd, lapsed >= ' + LAPSE_DAYS + 'd)');
