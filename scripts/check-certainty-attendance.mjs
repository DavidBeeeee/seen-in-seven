// WBR-373 (Momentum 300 Developer 4, 5, 38): Certainty attendance check.
//
// A session now carries an outcome David sets once it has ended: held,
// no_show, or null while unmarked. This check has two halves.
//
// Static, always: reads supabase_migrations/2026-10-15-certainty-attendance.sql
// and asserts the writer is SECURITY DEFINER with an empty search_path, is_admin
// gated, revoked from public and anon, refuses cancelled and not-yet-ended
// sessions, logs certainty_outcome without the topic, that every held read in
// certainty_state and admin_get_certainty_engagement skips no_show, and that
// certainty_engagement() itself is not redefined. Then it runs the held
// derivation over seeded rows and asserts a no_show is never counted as held.
//
// Live, against production: `--print-probe` prints one DO block that seeds two
// sessions for the test member, calls the real RPCs as the first admin account
// (David) and as the member, and always raises at the end so every write rolls
// back. Run it through the Supabase SQL runner, save the error text, and pass it
// back with `--probe-result <file>`; the check then asserts future and cancelled
// were refused, ended was accepted, a non-admin was refused, and no_show left
// the held counts.
import { readFileSync } from 'node:fs';

const MIGRATION = 'supabase_migrations/2026-10-15-certainty-attendance.sql';
const TEST_MEMBER = 'momentum-hub-test@ancientcosmic.com';

const PROBE = `do $probe$
declare
  v_admin_auth uuid;
  v_member_id uuid;
  v_member_auth uuid;
  v_ended uuid;
  v_future uuid;
  v_cancelled uuid;
  v_out jsonb := '{}'::jsonb;
  v_held_before int;
  v_held_after int;
  v_hist_before int;
  v_hist_after int;
  v_eng jsonb;
begin
  select u.auth_id into v_admin_auth from public.users u
    where coalesce(u.is_admin, false) order by u.created_at asc limit 1;
  select u.id, u.auth_id into v_member_id, v_member_auth
    from public.users u join auth.users au on au.id = u.auth_id
    where au.email = '${TEST_MEMBER}';

  insert into public.certainty_sessions (user_id, member_email, starts_at, ends_at, mode, topic, status, iso_week, calendar_status)
  values (v_member_id, '${TEST_MEMBER}', '2001-01-01 15:00Z', '2001-01-01 17:00Z', 'zoom', 'probe', 'booked', 'PROBE-ENDED', 'skipped')
  returning id into v_ended;
  insert into public.certainty_sessions (user_id, member_email, starts_at, ends_at, mode, topic, status, iso_week, calendar_status)
  values (v_member_id, '${TEST_MEMBER}', '2099-01-01 15:00Z', '2099-01-01 17:00Z', 'zoom', 'probe', 'booked', 'PROBE-FUTURE', 'skipped')
  returning id into v_future;
  insert into public.certainty_sessions (user_id, member_email, starts_at, ends_at, mode, topic, status, iso_week, calendar_status, cancelled_at)
  values (v_member_id, '${TEST_MEMBER}', '2001-01-02 15:00Z', '2001-01-02 17:00Z', 'zoom', 'probe', 'cancelled', 'PROBE-CANCELLED', 'skipped', now())
  returning id into v_cancelled;

  -- As the member: refused, and their history before marking.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.certainty_mark_outcome(v_ended, 'held');
    v_out := v_out || '{"nonAdmin":"accepted"}';
  exception when others then
    v_out := v_out || jsonb_build_object('nonAdmin', 'refused:' || sqlstate);
  end;
  v_hist_before := (public.certainty_state(21) ->> 'historyCount')::int;

  -- As David.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_auth, 'role', 'authenticated')::text, true);
  select (m ->> 'held_count')::int into v_held_before
    from jsonb_array_elements(public.admin_get_certainty_engagement() -> 'members') m
    where m ->> 'member_email' = '${TEST_MEMBER}';
  begin
    perform public.certainty_mark_outcome(v_future, 'held');
    v_out := v_out || '{"future":"accepted"}';
  exception when others then
    v_out := v_out || jsonb_build_object('future', 'refused:' || sqlstate);
  end;
  begin
    perform public.certainty_mark_outcome(v_cancelled, 'no_show');
    v_out := v_out || '{"cancelled":"accepted"}';
  exception when others then
    v_out := v_out || jsonb_build_object('cancelled', 'refused:' || sqlstate);
  end;
  begin
    perform public.certainty_mark_outcome(v_ended, 'no_show');
    v_out := v_out || '{"ended":"accepted"}';
  exception when others then
    v_out := v_out || jsonb_build_object('ended', 'refused:' || sqlstate);
  end;
  select (m ->> 'held_count')::int into v_held_after
    from jsonb_array_elements(public.admin_get_certainty_engagement() -> 'members') m
    where m ->> 'member_email' = '${TEST_MEMBER}';
  select p into v_eng from jsonb_array_elements(public.admin_get_certainty_sessions() -> 'past') p
    where (p ->> 'id')::uuid = v_ended;

  perform set_config('request.jwt.claims', json_build_object('sub', v_member_auth, 'role', 'authenticated')::text, true);
  v_hist_after := (public.certainty_state(21) ->> 'historyCount')::int;

  execute 'reset role';
  v_out := v_out || jsonb_build_object(
    'heldBefore', v_held_before, 'heldAfter', v_held_after,
    'historyBefore', v_hist_before, 'historyAfter', v_hist_after,
    'panelOutcome', v_eng ->> 'outcome', 'panelEnded', v_eng ->> 'ended',
    'outcomeEvents', (select count(*) from public.logs l where l.event_type = 'certainty_outcome' and l.detail ->> 'session_id' = v_ended::text),
    'eventHasTopic', exists (select 1 from public.logs l where l.event_type = 'certainty_outcome' and l.detail ->> 'session_id' = v_ended::text and l.detail ? 'topic')
  );
  raise exception 'PROBE_RESULT %', v_out;
end;
$probe$;`;

const args = process.argv.slice(2);
if (args.includes('--print-probe')) {
  console.log(PROBE);
  process.exit(0);
}

const failures = [];
const must = (cond, msg) => { if (!cond) failures.push(msg); };

// ── Static: the migration ───────────────────────────────────────────────────
const sql = readFileSync(MIGRATION, 'utf8');
const fn = (name) => {
  const start = sql.indexOf('create or replace function public.' + name + '(');
  if (start < 0) return '';
  const end = sql.indexOf('\n$$;', start);
  return sql.slice(start, end);
};

must(/add column if not exists outcome text/.test(sql), 'outcome column missing');
must(/add column if not exists outcome_at timestamptz/.test(sql), 'outcome_at column missing');
must(/check \(outcome is null or outcome in \('held', 'no_show'\)\)/.test(sql), 'outcome check constraint missing');

const mark = fn('certainty_mark_outcome');
must(mark, 'certainty_mark_outcome not defined');
must(/security definer\s+set search_path = ''/.test(mark), 'certainty_mark_outcome must be SECURITY DEFINER with an empty search_path');
must(/coalesce\(u\.is_admin, false\)/.test(mark) && /42501/.test(mark), 'certainty_mark_outcome must be is_admin gated');
must(/status = 'cancelled' then\s+raise exception/.test(mark), 'certainty_mark_outcome must refuse cancelled sessions');
must(/ends_at > v_now then\s+raise exception/.test(mark), 'certainty_mark_outcome must refuse a session that has not ended');
must(/'certainty_outcome'/.test(mark), 'certainty_mark_outcome must log certainty_outcome');
must(!/'topic'|\.topic/.test(mark), 'certainty_outcome event must not carry topic text');
must(/revoke all on function public\.certainty_mark_outcome\(uuid, text\) from public, anon;/.test(sql), 'certainty_mark_outcome must be revoked from public and anon');
must(!/grant execute on function public\.certainty_mark_outcome\(uuid, text\) to (anon|public)/.test(sql), 'certainty_mark_outcome granted to anon or public');

must(!/function public\.certainty_engagement\(/.test(sql), 'certainty_engagement() must not be redefined here; the thresholds stay as they are');

// Every held read (booked and ended) in the member state and the lapse list skips no_show.
for (const [name, min] of [['certainty_state', 2], ['admin_get_certainty_engagement', 3]]) {
  const body = fn(name);
  must(body, name + ' not redefined');
  const heldReads = body.split("s.status = 'booked' and s.ends_at <= now()").slice(1);
  must(heldReads.length >= min, name + ': expected at least ' + min + ' held reads, found ' + heldReads.length);
  heldReads.forEach((rest, i) => {
    must(/^\s*and s\.outcome is distinct from 'no_show'/.test(rest), name + ': held read ' + (i + 1) + ' does not skip no_show');
  });
}
const sessions = fn('admin_get_certainty_sessions');
must(/s\.outcome, s\.outcome_at/.test(sessions), 'admin_get_certainty_sessions must return outcome on past rows');
must(/order by p\.safety_flag desc/.test(sessions) && /order by u\.safety_flag desc/.test(sessions), 'flagged sessions must still sort first');

// ── Simulation: the held derivation over seeded rows ────────────────────────
const DAY = 86400000;
const NOW = Date.parse('2026-10-15T16:00:00Z');
const row = (daysAgo, status = 'booked', outcome = null) => ({ status, outcome, endsAt: NOW - daysAgo * DAY });
const held = (rows) => rows.filter(s => s.status === 'booked' && s.endsAt <= NOW && s.outcome !== 'no_show');
const cases = [
  { name: 'unmarked ended session still counts as held', rows: [row(2)], count: 1, last: 2 },
  { name: 'held counts', rows: [row(2, 'booked', 'held')], count: 1, last: 2 },
  { name: 'no_show alone is not held', rows: [row(2, 'booked', 'no_show')], count: 0, last: null },
  { name: 'no_show does not move the last held session', rows: [row(30, 'booked', 'held'), row(3, 'booked', 'no_show')], count: 1, last: 30 },
  { name: 'cancelled never held', rows: [row(4, 'cancelled')], count: 0, last: null },
  { name: 'future booking is not held', rows: [row(-3)], count: 0, last: null }
];
for (const c of cases) {
  const h = held(c.rows);
  const last = h.length ? Math.round((NOW - Math.max(...h.map(s => s.endsAt))) / DAY) : null;
  must(h.length === c.count && last === c.last, c.name + ': got count ' + h.length + ', last ' + last);
}

// ── Panel: David's Certainty rows render the right outcome cell ─────────────
const admin = readFileSync('admin-seeninseven.html', 'utf8');
const grab = (name) => {
  const start = admin.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = admin.indexOf('\n}\n', start);
  return admin.slice(start, end + 2);
};
const panelSrc = grab('certaintyNeedsOutcome') + grab('certaintyOutcomeCell');
must(panelSrc.includes('certaintyOutcomeCell'), 'admin panel has no certaintyOutcomeCell');
if (panelSrc.includes('certaintyOutcomeCell')) {
  const h = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cell = new Function('h', panelSrc + '\nreturn certaintyOutcomeCell;')(h);
  const past = new Date(Date.now() - 3 * DAY).toISOString();
  const future = new Date(Date.now() + 3 * DAY).toISOString();
  const unmarked = cell({ id: 'a', status: 'booked', ends_at: past, ended: true, outcome: null });
  must(/data-certainty-outcome="held"/.test(unmarked) && /data-certainty-outcome="no_show"/.test(unmarked), 'ended unmarked session does not show Held and No-show buttons');
  must(!/<button/.test(cell({ id: 'b', status: 'booked', ends_at: future, ended: false, outcome: null })), 'a session that has not ended shows outcome buttons');
  must(!/<button/.test(cell({ id: 'c', status: 'cancelled', ends_at: past, ended: true, outcome: null })), 'a cancelled session shows outcome buttons');
  const marked = cell({ id: 'd', status: 'booked', ends_at: past, ended: true, outcome: 'no_show' });
  must(/No-show/.test(marked) && !/<button/.test(marked), 'a marked session does not show its outcome');
}
must(/sb\.rpc\('certainty_mark_outcome', \{ p_id: id, p_outcome: outcome \}\)/.test(admin), 'panel does not call certainty_mark_outcome');

// ── Live: the rolled-back production probe ──────────────────────────────────
const resultIdx = args.indexOf('--probe-result');
let live = 'not run (pass --probe-result <file>)';
if (resultIdx >= 0) {
  const text = readFileSync(args[resultIdx + 1], 'utf8');
  const m = text.match(/PROBE_RESULT (\{.*?\})(?:"|\\n|\n|$)/s);
  if (!m) {
    failures.push('probe result file has no PROBE_RESULT payload');
  } else {
    const r = JSON.parse(m[1].replace(/\\"/g, '"'));
    must(String(r.nonAdmin).startsWith('refused:42501'), 'non-admin was not refused: ' + r.nonAdmin);
    must(String(r.future).startsWith('refused'), 'future session was not refused: ' + r.future);
    must(String(r.cancelled).startsWith('refused'), 'cancelled session was not refused: ' + r.cancelled);
    must(r.ended === 'accepted', 'ended session was not accepted: ' + r.ended);
    must(r.heldAfter === r.heldBefore - 1, 'no_show still counted in David\'s held count: ' + r.heldBefore + ' -> ' + r.heldAfter);
    must(r.historyAfter === r.historyBefore - 1, 'no_show still counted in member history: ' + r.historyBefore + ' -> ' + r.historyAfter);
    must(r.panelOutcome === 'no_show' && r.panelEnded === 'true', 'panel row does not show the outcome');
    must(Number(r.outcomeEvents) === 1 && r.eventHasTopic === false, 'certainty_outcome event missing or carries topic');
    live = 'future and cancelled refused, ended accepted, non-admin refused, no_show out of held (' + r.heldBefore + ' -> ' + r.heldAfter + ') and history (' + r.historyBefore + ' -> ' + r.historyAfter + '), all rolled back';
  }
}

if (failures.length) {
  console.error('check-certainty-attendance FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('PASS check-certainty-attendance (static + ' + cases.length + ' held cases; live: ' + live + ')');
