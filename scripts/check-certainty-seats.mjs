import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deliverSeatAlerts, seatAlertMessage } from '../api/certainty-reminders.js';

// Exercise the real sender with a faithful durable-claim fixture, not emails.
let members = 34;
const receipts = new Map();
const sent = [];
const rpc = async (name, args) => {
  if (name === 'certainty_claim_seat_alerts') {
    const data = [35,42,47].filter(t => members >= t && !receipts.has(t)).map(threshold => {
      receipts.set(threshold, 'claimed');
      return { threshold, activeMembers: members, weeklyCapacity: 49, seatsLeft: Math.max(0,49-members) };
    });
    return { ok: true, data };
  }
  assert.equal(name,'certainty_finish_seat_alert');
  receipts.set(args.p_threshold,args.p_outcome);
  return { ok: true };
};
const run = active => deliverSeatAlerts({ active, rpc, to: 'operator@example.test', send: async message => { sent.push(message); return 'fixture-'+sent.length; } });
await run(true); assert.equal(sent.length,0);
for (const count of [35,42,47]) {
  members=count;
  await Promise.all([run(true),run(true)]);
  await run(true);
  assert.equal(sent.length,[35,42,47].indexOf(count)+1);
}
assert.match(sent[2].text,/2 seats left/);
assert.equal(new Set(sent.map(m=>m.idempotencyKey)).size,3);
assert.match(seatAlertMessage({activeMembers:49,weeklyCapacity:49,seatsLeft:0,threshold:47}).text,/one two-hour session per week/);
members=60; await run(true); assert.equal(sent.length,3);
let heldCalled=false;
await deliverSeatAlerts({active:false,rpc:async()=>{heldCalled=true;},to:'operator@example.test'});
assert.equal(heldCalled,false);
const sql=fs.readFileSync('supabase_migrations/2026-10-25-certainty-seat-status.sql','utf8');
assert.match(sql,/app_key = 'certainty' and status = 'active'/);
assert.match(sql,/expires_at > now\(\)/);
assert.match(sql,/count\(distinct user_id\)/);
assert.match(sql,/if not public.is_admin\(\)/);
assert.match(sql,/on conflict \(threshold\) do update/);
assert.match(sql,/outcome <> 'sent'/);
assert.match(sql,/enable row level security/);
assert.match(sql,/interval '23 hours'/);
assert.match(fs.readFileSync('js/workerbee.js','utf8'),/of \$\{seat.weeklyCapacity\} weekly seats used/);
console.log('PASS certainty seats: 34/35/42/47, overlapping/repeated ticks, held channel, expiry/status/admin boundaries and 49-seat display');
