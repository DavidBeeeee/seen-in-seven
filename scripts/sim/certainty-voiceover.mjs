// Certainty real screen-reader pass (WBR-458: UX 95, 99, 100, Stranger 100).
//
// certainty-walk.mjs proves roles, names and live-region wiring from the
// accessibility tree. This one listens to VoiceOver itself. It opens the real
// api/_hub/certainty.html in a visible WebKit window with the same stubbed
// world as the walk (no request leaves the machine, no booking reaches David's
// calendar), drives VoiceOver over AppleScript, and records what VoiceOver
// actually spoke at each step: a linear read of every screen, each control as
// focus lands on it, and what is announced after each action, for first
// visit, book, edit, cancel and the error paths.
//
// Needs macOS with VoiceOver running and "Allow VoiceOver to be controlled
// with AppleScript" on (VoiceOver Utility, General). The script never changes
// that setting. Needs playwright-core, which is not a product dependency:
//   WALK_NODE_MODULES=/path/to/node_modules node scripts/sim/certainty-voiceover.mjs
// Writes docs/certainty-walk/voiceover.json; the readable transcript lives in
// docs/certainty-walk/screen-reader.md.

import { createRequire } from 'node:module';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const modules = process.env.WALK_NODE_MODULES || join(root, 'node_modules');
const { webkit } = createRequire(join(modules, 'noop.js'))('playwright-core');
const outFile = join(root, 'docs', 'certainty-walk', 'voiceover.json');
const ORIGIN = 'http://certainty.walk.test';
const fixtures = JSON.parse(readFileSync(join(root, 'scripts', 'sim', 'fixtures', 'certainty-states.json'), 'utf8'));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

// ── VoiceOver over AppleScript ─────────────────────────────────────────────
function osa(script) {
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('osascript: ' + (r.stderr || '').trim());
  return (r.stdout || '').trim();
}
const vo = body => osa('tell application "VoiceOver"\n' + body + '\nend tell');
// VoiceOver reads whatever app is in front. If that is not the test window,
// stop: a transcript of some other window is wrong and may be private.
const frontmost = () => osa('tell application "System Events" to get name of first process whose frontmost is true');
function bringForward() {
  for (let i = 0; i < 10; i += 1) {
    try { osa('tell application "System Events" to set frontmost of first process whose name is "Playwright" to true'); } catch {}
    spawnSync('sleep', ['0.4']);
    if (frontmost() === 'Playwright') return;
  }
  throw new Error('The Playwright window would not come to the front (frontmost: ' + frontmost() + '). Stopping rather than recording another window.');
}
const lastPhrase = () => {
  if (frontmost() !== 'Playwright') throw new Error('Focus left the test window (frontmost: ' + frontmost() + '). Stopping rather than recording another window.');
  return vo('return content of last phrase');
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
// VoiceOver speaks asynchronously; a focus move can be followed by a live
// announcement. Collect every distinct phrase spoken over a short window.
async function listen(ms = 1600) {
  const heard = [];
  for (let t = 0; t < ms; t += 200) {
    await sleep(200);
    const p = lastPhrase();
    if (p && heard[heard.length - 1] !== p) heard.push(p);
  }
  return heard;
}

function preflight() {
  if (!existsSync('/private/var/db/Accessibility/.VoiceOverAppleScriptEnabled')) {
    throw new Error('VoiceOver AppleScript control is off (VoiceOver Utility, General). Not changing it.');
  }
  if (spawnSync('pgrep', ['-x', 'VoiceOver']).status !== 0) {
    spawnSync('open', ['-a', 'VoiceOver']);
    spawnSync('sleep', ['3']);
  }
  vo('output "Certainty screen reader pass starting"');
}

// ── The walk's stubbed world (same fixtures, same refusal of the network) ──
function et(d, opts) { return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'America/New_York' }, opts)).format(d); }
function etDatePlus(days) {
  const d = new Date(Date.now() + days * 86400000);
  return et(d, { year: 'numeric' }) + '-' + et(d, { month: '2-digit' }) + '-' + et(d, { day: '2-digit' });
}
function heldRow(n, daysAgo, topic) {
  const start = new Date(Date.now() - daysAgo * 86400000); start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 7200000);
  return { id: 'held-' + n, starts_at: start.toISOString(), ends_at: end.toISOString(), mode: n % 2 ? 'zoom' : 'phone', topic, outcome: 'held',
    label_day: et(start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    label_start: et(start, { hour: 'numeric', minute: '2-digit' }), label_end: et(end, { hour: 'numeric', minute: '2-digit' }) };
}
function upcomingRow(date, hour, mode, phone, topic, id) {
  const start = new Date(date + 'T' + String(hour).padStart(2, '0') + ':00:00-04:00');
  const end = new Date(start.getTime() + 7200000);
  return { id: id || 'upcoming-1', starts_at: start.toISOString(), ends_at: end.toISOString(), mode, phone: phone || null, topic: topic || null,
    calendar_status: 'pending', calendar_sync_state: 'pending', local_date: date, local_hour: hour,
    label_day: et(start, { weekday: 'long', month: 'long', day: 'numeric' }),
    label_start: et(start, { hour: 'numeric', minute: '2-digit' }), label_end: et(end, { hour: 'numeric', minute: '2-digit' }) };
}
function buildState(name) {
  const f = fixtures.states[name];
  const history = (f.held || []).map(([n, daysAgo, topic]) => heldRow(n, daysAgo, topic));
  const last = history[0] || null;
  const days = last ? Math.floor((Date.now() - Date.parse(last.ends_at)) / 86400000) : null;
  return {
    signedIn: true, currentWeek: 'walk', bookedThisWeek: Boolean(f.upcoming), taken: [],
    upcoming: f.upcoming ? upcomingRow(etDatePlus(f.upcoming.inDays), f.upcoming.hour, f.upcoming.mode, f.upcoming.phone, f.upcoming.topic) : null,
    history, historyCount: history.length, engagement: f.engagement || (last ? 'active' : 'new'), membership_ended: Boolean(f.membership_ended),
    lastHeld: last ? { ends_at: last.ends_at, topic: last.topic, label_day: et(new Date(last.starts_at), { month: 'long', day: 'numeric' }) } : null,
    daysSinceLastHeld: days, weeksSinceLastHeld: days == null ? null : Math.floor(days / 7), lapseThresholdDays: 21,
    window: { startHour: 10, endHour: 22, durationHours: 2, tz: 'America/New_York' },
    settings: { time_zone: 'America/New_York', phone: f.phone || '', default_mode: 'zoom' }
  };
}
const SUPABASE_STUB = `
window.supabase = { createClient: function () {
  var session = { access_token: 'walk-token', user: { id: 'walk-user', email: 'walk.member@example.invalid' } };
  function q(result) { var p = Promise.resolve(result); var b = { select: function(){return b;}, eq: function(){return b;}, maybeSingle: function(){return p;}, single: function(){return p;}, then: function(a,c){return p.then(a,c);} }; return b; }
  return {
    auth: { getSession: function(){ return Promise.resolve({ data: { session: session } }); }, onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; }, signOut: function(){ return Promise.resolve({}); } },
    from: function(){ return q({ data: { name: 'Walk Member', email: 'walk.member@example.invalid' }, error: null }); },
    rpc: function(name){ if (name === 'my_hub_apps') return Promise.resolve({ data: ['certainty','storysculpt','navigator','vault','hub'], error: null }); return Promise.resolve({ data: true, error: null }); }
  };
} };`;
const refused = [];
function makeWorld(stateName) {
  const w = {
    state: buildState(stateName), posts: [], mode: {},
    async api(route, request) {
      const body = JSON.parse(request.postData() || '{}');
      w.posts.push(body);
      const behave = w.mode[body.action];
      if (behave === 'drop') return route.abort('internetdisconnected');
      if (behave && behave.status) return route.fulfill({ status: behave.status, contentType: 'application/json', body: JSON.stringify(behave.body || {}) });
      const ok = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      switch (body.action) {
        case 'state': return ok(w.state);
        case 'history': return ok({ signedIn: true, history: [], total: w.state.historyCount, offset: body.offset, limit: body.limit, nextOffset: null, hasMore: false });
        case 'book': case 'update': {
          const u = upcomingRow(body.date, body.hour, body.mode, body.phone, body.topic, body.id || 'upcoming-' + w.posts.length);
          w.state = Object.assign({}, w.state, { upcoming: u, bookedThisWeek: true, engagement: 'active' });
          return ok({ session: u, calendar: { status: 'pending' } });
        }
        case 'cancel': w.state = Object.assign({}, w.state, { upcoming: null, bookedThisWeek: false }); return ok({ cancelled: true });
        case 'save_settings': return ok({ ok: true, settings: { time_zone: body.time_zone, phone: body.phone, default_mode: body.default_mode } });
        default: return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"unknown action"}' });
      }
    }
  };
  return w;
}
async function wire(page, world) {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === ORIGIN) {
      if (url.pathname === '/api/certainty') return world.api(route, request);
      const file = url.pathname === '/certainty' ? join(root, 'api', '_hub', 'certainty.html') : join(root, url.pathname.replace(/^\/+/, ''));
      if (!file.startsWith(root) || !existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    }
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('supabase-js')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_STUB });
    if (request.method() === 'GET' && (url.hostname === 'unpkg.com' || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))) return route.continue();
    refused.push({ method: request.method(), url: url.origin + url.pathname });
    return route.abort('blockedbyclient');
  });
}

// ── Steps ──────────────────────────────────────────────────────────────────
const transcript = [];
let screen = null;
const log = (step, heard, extra = {}) => {
  const entry = { screen, step, heard, ...extra };
  transcript.push(entry);
  console.log('[' + screen + '] ' + step + '\n   ' + heard.join('\n   '));
};

async function open(browser, stateName) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 860 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('sis_theme_v1', 'light'); } catch (e) {} });
  const world = makeWorld(stateName);
  await wire(page, world);
  await page.goto(ORIGIN + '/certainty');
  await page.waitForSelector('#cs-hero:not(.cs-hide)', { timeout: 15000 });
  await page.bringToFront();
  bringForward();
  await sleep(1000);
  await enterPage(page);
  return { context, page, world };
}
// VoiceOver starts on the window. Step it inside, then hand it keyboard focus
// on a real control; until then a page focus() does not reach VoiceOver.
async function enterPage(page, selector = 'a[href="/"]') {
  for (let i = 0; i < 3; i += 1) {
    vo('tell vo cursor to move into item');
    await sleep(500);
    await page.focus(selector);
    const heard = await listen(1000);
    if (!heard.some(p => /web content|toolbar/.test(p) && !/link|button/.test(p))) return;
  }
}
// Keyboard focus moves; VoiceOver follows it and speaks the control.
async function focus(page, selector, step) {
  await page.focus(selector);
  log(step || 'focus ' + selector, await listen(1400));
}
// VO-Space on whatever VoiceOver is on: the real screen-reader activation.
async function activate(step, ms = 2400) {
  vo('tell vo cursor to perform action');
  log(step, await listen(ms));
}
// VO-Right through the page from the current VO position: what a listener
// hears reading the screen top to bottom.
async function readOn(step, max = 45, stopAt) {
  const heard = [];
  let same = 0;
  for (let i = 0; i < max; i += 1) {
    vo('tell vo cursor to move right');
    await sleep(650);
    const p = lastPhrase();
    if (p === heard[heard.length - 1]) { if (++same >= 2) break; continue; }
    same = 0;
    heard.push(p);
    if (stopAt && stopAt.test(p)) break;
  }
  log(step, heard);
}
async function typeInto(page, selector, text, step) {
  await page.focus(selector);
  await listen(900);
  await page.keyboard.type(text, { delay: 20 });
  log(step, await listen(1200));
}

async function run() {
  preflight();
  const browser = await webkit.launch({ headless: false });
  try {
    // First visit, read top to bottom, then book.
    screen = 'first-visit';
    let { context, page, world } = await open(browser, 'first');
    page.on('dialog', d => d.accept());
    await focus(page, '#cs-open-book', 'focus lands on the primary action');
    vo('tell vo cursor to move to first item');
    log('VO to the first item', await listen(900));
    await readOn('VO-Right through the first-visit screen', 60, /Book my first session/);
    await focus(page, '#cs-open-book', 'focus the primary action');
    screen = 'book';
    await activate('VO-Space on "Book my first session"');
    await readOn('VO-Right through the picker', 14);
    await focus(page, '.cs-day >> nth=1', 'focus the second day');
    await activate('VO-Space on that day');
    await focus(page, '.cs-time:not([disabled]) >> nth=0', 'focus the first open time');
    await activate('VO-Space on that time');
    await typeInto(page, '#cs-topic', 'Fix my funnel', 'type a topic');
    await focus(page, '#cs-confirm', 'focus Confirm');
    await activate('VO-Space on Confirm: what is announced after booking', 3200);
    screen = 'booked';
    await focus(page, '#cs-edit', 'focus Edit session on the booked card');
    await readOn('VO-Right after the booked card actions', 8);
    screen = 'edit';
    await focus(page, '#cs-edit', 'focus Edit session');
    await activate('VO-Space on Edit session');
    await page.fill('#cs-topic', '');
    await typeInto(page, '#cs-topic', 'Fix my funnel, part two', 'retype the topic');
    await focus(page, '#cs-confirm', 'focus the save button');
    await activate('VO-Space on save: what is announced after the edit', 3200);
    screen = 'cancel';
    await focus(page, '#cs-cancel', 'focus Cancel');
    await activate('VO-Space on Cancel (the confirm dialog is accepted by the harness)', 3200);
    await context.close();

    // Errors: network drop mid-booking, then the slot taken.
    screen = 'errors';
    ({ context, page, world } = await open(browser, 'first'));
    await page.click('#cs-open-book');
    await page.locator('.cs-day').nth(1).click();
    await page.locator('.cs-time:not([disabled])').first().click();
    await page.fill('#cs-topic', 'Dropped');
    world.mode.book = 'drop';
    await focus(page, '#cs-confirm', 'focus Confirm with the network about to drop');
    await activate('VO-Space on Confirm: network drop', 3200);
    world.mode.book = { status: 409, body: { error: 'Someone just took that time.', code: 'SLOT_TAKEN' } };
    await focus(page, '#cs-confirm', 'focus Confirm again');
    await activate('VO-Space on Confirm: someone took the time', 3200);
    await context.close();

    screen = 'cancel-error';
    ({ context, page, world } = await open(browser, 'booked'));
    page.on('dialog', d => d.accept());
    world.mode.cancel = { status: 500, body: { error: 'Could not cancel that session.' } };
    await focus(page, '#cs-cancel', 'focus Cancel on a booked session');
    await activate('VO-Space on Cancel: the server refuses', 3200);
    await context.close();

    screen = 'load-error';
    {
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 860 }, colorScheme: 'light' });
      const p = await ctx.newPage();
      const w = makeWorld('first'); w.mode.state = 'drop';
      await wire(p, w);
      await p.goto(ORIGIN + '/certainty');
      await p.waitForFunction(() => /could not reach/.test(document.getElementById('eee-gate-title').textContent), null, { timeout: 8000 }).catch(() => null);
      await p.bringToFront();
      bringForward();
      await sleep(800);
      await enterPage(p, '#eee-gate-button');
      await focus(p, '#eee-gate-button', 'focus the retry button on a failed load');
      vo('tell vo cursor to move left'); await sleep(600);
      log('VO-Left from the retry button', [lastPhrase()]);
      w.mode.state = null;
      // VoiceOver stays on the paragraph here rather than following focus to
      // the link, so VO-Space would act on text. The harness clicks the link
      // and records what VoiceOver says once the page recovers.
      await p.click('#eee-gate-button');
      log('Try again (clicked by the harness) with the server back', await listen(3200));
      await ctx.close();
    }
  } finally {
    await browser.close();
    vo('output "Certainty screen reader pass finished"');
  }
  writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), reader: 'VoiceOver (macOS ' + osVersion() + ')', browser: 'WebKit ' + browser.version(), refused, transcript }, null, 2) + '\n');
  console.log('wrote ' + outFile + (refused.length ? '; refused ' + refused.length + ' requests' : ''));
}
function osVersion() { return (spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout || '').trim(); }

run().catch(e => { console.error(e); process.exit(1); });
