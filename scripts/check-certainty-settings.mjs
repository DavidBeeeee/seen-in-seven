// WBR-373: Certainty Sessions member settings check.
//
// Asserts:
// 1. A slot renders in the member's zone with ET alongside.
// 2. Saved settings prefill booking mode, phone number, and time zone.
// 3. The settings panel explains what each setting changes.
// 4. The migration schema enforces own-row RLS, security definer with empty search_path,
//    and is revoked from anon.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formatSlotTime, getSlotInstant } from '../api/certainty.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

console.log('1. Testing slot rendering in member zone with ET alongside...');

// A slot on 2026-10-20 at 14:00 ET (2:00 PM Eastern Daylight Time)
const testDate = '2026-10-20';
const testEtHour = 14;

// Instant check: 2:00 PM EDT is 18:00:00 UTC
const instant = getSlotInstant(testDate, testEtHour);
assert.equal(instant.toISOString(), '2026-10-20T18:00:00.000Z', 'Slot instant must resolve accurately to UTC');

// Pacific Time (America/Los_Angeles): 18:00 UTC is 11:00 AM PDT
const ptSlot = formatSlotTime(testDate, testEtHour, 'America/Los_Angeles');
assert.ok(ptSlot.includes('11:00 AM'), `Pacific slot must render 11:00 AM in member zone: got "${ptSlot}"`);
assert.ok(ptSlot.includes('2:00 PM ET'), `Pacific slot must render ET alongside: got "${ptSlot}"`);

// Central Time (America/Chicago): 18:00 UTC is 1:00 PM CDT
const ctSlot = formatSlotTime(testDate, testEtHour, 'America/Chicago');
assert.ok(ctSlot.includes('1:00 PM'), `Central slot must render 1:00 PM in member zone: got "${ctSlot}"`);
assert.ok(ctSlot.includes('2:00 PM ET'), `Central slot must render ET alongside: got "${ctSlot}"`);

// Mountain Time (America/Denver): 18:00 UTC is 12:00 PM MDT
const mtSlot = formatSlotTime(testDate, testEtHour, 'America/Denver');
assert.ok(mtSlot.includes('12:00 PM'), `Mountain slot must render 12:00 PM in member zone: got "${mtSlot}"`);
assert.ok(mtSlot.includes('2:00 PM ET'), `Mountain slot must render ET alongside: got "${mtSlot}"`);

// London Time (Europe/London): 18:00 UTC is 7:00 PM BST in late October
const londonSlot = formatSlotTime(testDate, testEtHour, 'Europe/London');
assert.ok(londonSlot.includes('7:00 PM'), `London slot must render 7:00 PM in member zone: got "${londonSlot}"`);
assert.ok(londonSlot.includes('2:00 PM ET'), `London slot must render ET alongside: got "${londonSlot}"`);

// Eastern Time: renders 2:00 PM ET
const etSlot = formatSlotTime(testDate, testEtHour, 'America/New_York');
assert.ok(etSlot.includes('2:00 PM ET'), `Eastern slot must render 2:00 PM ET: got "${etSlot}"`);

console.log('PASS: slot renders in member zone with ET alongside across all tested zones.');

// 2. Testing HTML markup and prefilling contracts
console.log('2. Inspecting certainty.html for settings panel and prefill implementation...');

const html = read('api', '_hub', 'certainty.html');

// Settings panel exists
assert.ok(html.includes('id="cs-settings"'), 'certainty.html has #cs-settings section');
assert.ok(html.includes('id="cs-setting-tz"'), 'certainty.html has timezone selector #cs-setting-tz');
assert.ok(html.includes('id="cs-setting-mode"'), 'certainty.html has default mode selector #cs-setting-mode');
assert.ok(html.includes('id="cs-setting-phone"'), 'certainty.html has remembered phone input #cs-setting-phone');
assert.ok(html.includes('id="cs-save-settings"'), 'certainty.html has save settings button');

// Explanations for what each setting changes:
assert.ok(
  html.includes('Shows session times in your local time zone while keeping David\'s Eastern time visible alongside'),
  'Explains what time zone setting changes'
);
assert.ok(
  html.includes('Prefills whether you usually meet on Zoom or by phone on new bookings'),
  'Explains what default meeting format setting changes'
);
assert.ok(
  html.includes('Remembered and prefilled when you choose phone sessions so you do not have to type it every time'),
  'Explains what remembered phone number setting changes'
);

// Prefilling logic in JS:
assert.ok(html.includes('settings.default_mode'), 'openBooking prefills default_mode');
assert.ok(html.includes('settings.phone'), 'openBooking prefills phone number');
assert.ok(html.includes('formatSlotLabel'), 'renderTimes formats slots using member timezone and ET alongside');

console.log('PASS: certainty.html includes the settings panel, explanations of each setting, and prefill logic.');

// 3. Testing migration schema and safety properties
console.log('3. Inspecting supabase migration for certainty member safety and settings...');

const migration = read('supabase_migrations', '2026-10-15-certainty-member-safety-and-settings.sql');

assert.ok(migration.includes('create table if not exists public.certainty_member_settings'), 'Creates certainty_member_settings table');
assert.ok(migration.includes('user_id uuid primary key references public.users(id)'), 'Keyed by user_id with FK to public.users');
assert.ok(migration.includes('alter table public.certainty_member_settings enable row level security'), 'Enables RLS on certainty_member_settings');
assert.ok(migration.includes('create policy certainty_member_settings_own'), 'Enforces own-row RLS policy');

// SECURITY DEFINER RPCs with empty search_path and revoked from anon
for (const fn of ['certainty_flag_safety', 'certainty_get_settings', 'certainty_save_settings']) {
  assert.ok(migration.includes(`function public.${fn}`), `Defines ${fn} function`);
  assert.ok(migration.includes('security definer'), `${fn} must be security definer`);
  assert.ok(migration.includes("set search_path = ''"), `${fn} must set empty search_path`);
  assert.ok(new RegExp(`revoke all on function public\\.${fn}\\(.*?\\) from public, anon`).test(migration), `${fn} revoked from anon`);
  assert.ok(new RegExp(`grant execute on function public\\.${fn}\\(.*?\\) to authenticated`).test(migration), `${fn} granted to authenticated`);
}

console.log('PASS: migration satisfies RLS, security definer empty search_path, and anon revocation rules.');

// 4. Testing api/certainty.js settings action handling
console.log('4. Testing api/certainty.js settings actions with mock RPC...');

const { default: handler } = await import('../api/certainty.js');

let savedDbSettings = null;
const events = [];

globalThis.fetch = async (url, options = {}) => {
  const sUrl = String(url);
  if (sUrl.endsWith('/auth/v1/user')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'usr-1', email: 'member@example.com' }),
      headers: new Headers()
    };
  }
  if (sUrl.includes('/rpc/has_studio_app_access')) {
    return { ok: true, status: 200, json: async () => true, headers: new Headers() };
  }
  if (sUrl.includes('/rpc/record_log_event')) {
    const body = JSON.parse(options.body || '{}');
    events.push({ type: body.p_event_type, detail: body.p_detail });
    return { ok: true, status: 200, json: async () => null, text: async () => '', headers: new Headers() };
  }
  if (sUrl.includes('/rpc/certainty_save_settings')) {
    const body = JSON.parse(options.body || '{}');
    savedDbSettings = {
      time_zone: body.p_time_zone || 'America/New_York',
      phone: body.p_phone || null,
      default_mode: body.p_default_mode || 'zoom'
    };
    return {
      ok: true,
      status: 200,
      json: async () => savedDbSettings,
      text: async () => JSON.stringify(savedDbSettings),
      headers: new Headers()
    };
  }
  if (sUrl.includes('/rpc/certainty_get_settings')) {
    return {
      ok: true,
      status: 200,
      json: async () => savedDbSettings,
      text: async () => JSON.stringify(savedDbSettings),
      headers: new Headers()
    };
  }
  if (sUrl.includes('/rpc/certainty_state')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ upcoming: null, taken: [] }),
      text: async () => JSON.stringify({ upcoming: null, taken: [] }),
      headers: new Headers()
    };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '{}', headers: new Headers() };
};

function makeReqRes(body) {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer member-token-xyz' },
    body
  };
  const res = {
    code: 200,
    body: null,
    setHeader() { return this; },
    status(c) { this.code = c; return this; },
    json(p) { this.body = p; return p; }
  };
  return { req, res };
}

// Save settings action
{
  const { req, res } = makeReqRes({
    action: 'save_settings',
    time_zone: 'America/Los_Angeles',
    default_mode: 'phone',
    phone: '(555) 987-6543'
  });
  await handler(req, res);

  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.settings.time_zone, 'America/Los_Angeles');
  assert.equal(res.body.settings.default_mode, 'phone');
  assert.equal(res.body.settings.phone, '(555) 987-6543');

  const settingsEvent = events.find(e => e.type === 'certainty_settings');
  assert.ok(settingsEvent, 'Must log certainty_settings event');
  assert.equal(settingsEvent.detail.mode, 'phone');
  assert.ok(!JSON.stringify(settingsEvent).includes('555'), 'Settings event must not log member phone number');
}

// Get settings action
{
  const { req, res } = makeReqRes({ action: 'settings' });
  await handler(req, res);

  assert.equal(res.code, 200);
  assert.equal(res.body.settings.time_zone, 'America/Los_Angeles');
  assert.equal(res.body.settings.default_mode, 'phone');
  assert.equal(res.body.settings.phone, '(555) 987-6543');
}

// State action returns settings
{
  const { req, res } = makeReqRes({ action: 'state' });
  await handler(req, res);

  assert.equal(res.code, 200);
  assert.ok(res.body.settings);
  assert.equal(res.body.settings.time_zone, 'America/Los_Angeles');
}

console.log('PASS check-certainty-settings: slot renders in member zone with ET alongside, saved values prefill, and server RPCs verify');
