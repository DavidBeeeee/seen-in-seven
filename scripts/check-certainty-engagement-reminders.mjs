// WBR-373 (Momentum 300 Developer 96): the reminder job stands down for a
// safety-flagged session, and member reminder copy carries no em dash.
import { readFileSync } from 'node:fs';
import { planMemberReminder, memberMessage, operatorMessage } from '../api/certainty-reminders.js';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const email = { active: true, name: 'email', reason: null };
const held = { active: false, name: 'held', reason: 'no-channel-configured' };
const base = { session_id: 's1', lead_window: '24h', member_email: 'm@example.com', member_name: 'Test Member', mode: 'zoom', label_day: 'Monday, October 12', label_start: '2:00 PM', label_end: '4:00 PM' };
const flagged = Object.assign({}, base, { safety_flag: true });

let plan = planMemberReminder(flagged, email);
check(plan.send === false && plan.outcome === 'held' && plan.holdReason === 'safety-flag', 'flagged session with email live must hold with safety-flag');
plan = planMemberReminder(flagged, held);
check(plan.send === false && plan.holdReason === 'safety-flag', 'flagged session with channel held must still record safety-flag');
plan = planMemberReminder(base, email);
check(plan.send === true && plan.holdReason === null, 'ordinary session with email live must send');
plan = planMemberReminder(base, held);
check(plan.send === false && plan.outcome === 'held' && plan.holdReason === null, 'ordinary session with no channel holds without a safety reason');

for (const item of [base, Object.assign({}, base, { lead_window: '1h' }), Object.assign({}, base, { mode: 'phone', phone: '555' })]) {
  const msg = memberMessage(item);
  check(!/—/.test(msg.subject + msg.text), 'member reminder copy must not contain an em dash (' + item.lead_window + ', ' + item.mode + ')');
}

const op = operatorMessage([base, flagged]);
const lines = op.text.split('\n').filter(l => l.startsWith('- '));
check(/Needs a human look before this session/.test(lines[0] || ''), "David's digest must list the flagged session first with the label");
check(!/Needs a human look/.test(lines[1] || ''), 'unflagged session must carry no label');

const src = readFileSync('api/certainty-reminders.js', 'utf8');
check(!/—/.test(src), 'api/certainty-reminders.js must contain no em dash');
check(/p_hold_reason: plan\.holdReason/.test(src), 'the job must record the hold reason on finalize');

const admin = readFileSync('admin-seeninseven.html', 'utf8');
check(/Needs a human look before this session/.test(admin), 'admin Certainty panel must label flagged sessions');
check(/b\.safety_flag\)\) - Number\(Boolean\(a\.safety_flag\)\)/.test(admin), 'admin Certainty panel must sort flagged sessions first');

const sql = readFileSync('supabase_migrations/2026-10-10-certainty-reminder-safety.sql', 'utf8');
check(/SAFETY_FLAGGED_SESSION_SEND/.test(sql), 'database must refuse a sent outcome for a flagged session');
check(/order by u\.safety_flag desc, u\.starts_at asc/.test(sql), 'admin RPC must order flagged sessions first');
check(/'holdReason', coalesce\(p_hold_reason, 'none'\)/.test(sql) && !/'topic'/.test(sql.slice(sql.indexOf('certainty_reminder\','))), 'reminder event records the hold reason and no topic');

if (failures.length) {
  console.error('check-certainty-engagement-reminders FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('check-certainty-engagement-reminders PASS');
