// WBR-373: Certainty lapse awareness stays honest.
// The threshold lives in one SQL function, the operator list stays is_admin
// gated, and the member return state carries no em dashes and no guilt words.
import { readFileSync } from 'node:fs';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const sql = readFileSync('supabase_migrations/2026-10-06-certainty-lapse-awareness.sql', 'utf8');
const page = readFileSync('api/_hub/certainty.html', 'utf8');
const admin = readFileSync('admin-seeninseven.html', 'utf8');

check(/interval '8 days' then 'current'/.test(sql), 'current window must be under 8 days');
check(/interval '21 days' then 'skipped'/.test(sql), 'skipped must end at the documented 21-day lapse threshold');
check((sql.match(/'lapseThresholdDays', 21/g) || []).length >= 3, 'every payload must report the 21-day threshold');
check(/admin_get_certainty_engagement[\s\S]*coalesce\(u\.is_admin, false\) into v_is_admin[\s\S]*'isAdmin', false/.test(sql), 'operator list must return an empty shape to non-admins');
check(/when not st\.active then 'churned'/.test(sql), 'churned (membership ended) must stay distinct from lapsed');
check(/security definer/.test(sql) && /set search_path = ''/.test(sql), 'functions stay security definer with empty search_path');
check(!/grant execute on function public\.admin_get_certainty_engagement\(\) to anon/.test(sql), 'operator list must not be granted to anon');

const branch = page.slice(page.indexOf("state.engagement === 'lapsed'"), page.indexOf("'<p class=\"cs-eyebrow\">This week</p>'"));
check(branch.length > 200, 'member page must render a lapsed return state');
check(!/—/.test(branch), 'member return copy must not contain em dashes');
check(!/\b(missed|failed|behind|should have|wasted)\b/i.test(branch), 'member return copy must be a way back, not a guilt banner');
check(/escapeHtml\(last\.topic\)/.test(branch), 'the member topic must be escaped');

check(/rpcSafe\('certaintyEngagement', 'admin_get_certainty_engagement'\)/.test(admin), 'admin page must load the engagement RPC');
check(/renderCertaintyLapse\(\);/.test(admin), 'admin page must render the lapsed list');

if (failures.length) {
  console.error('check-certainty-lapse FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('check-certainty-lapse PASS');
