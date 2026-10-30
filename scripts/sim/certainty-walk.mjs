// Certainty rendered walk (WBR-458: UX 78, 95, 96, 97, 98, 99, 100).
//
// Drives the real api/_hub/certainty.html in headless Chromium and WebKit the
// way a member meets it: 375px and 1280px, 200% zoom, a 24px default font,
// light and dark, keyboard-only booking with the focus order recorded,
// axe-core and accessibility-tree passes on every state, and the full
// lifecycle (first visit, book, edit, cancel, rebook, lapsed, ended, sign-in
// failure, network drop, slot taken, double submit). WebKit uses Alt+Tab,
// Safari's full-keyboard-navigation equivalent; Chromium uses Tab. Every
// network call is answered locally: the page, its CSS and JS
// come from this checkout, Supabase auth is a stub session, and /api/certainty
// is a stub state machine fed from scripts/sim/fixtures. Anything else that
// would leave the machine is refused and counted, so no booking can reach
// David's calendar or inbox. The run fails if a single request was refused
// that was not a GET for a font or icon file.
//
// Needs playwright-core and axe-core, which are not product dependencies:
//   WALK_NODE_MODULES=/path/to/node_modules node scripts/sim/certainty-walk.mjs
// Optional: CHROMIUM_PATH to a Chromium binary, --browser chromium|webkit,
// --out <dir> (default docs/certainty-walk), --no-shots,
// --only lifecycle,keyboard,axe,layout,accessibility.

import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const selfFile = fileURLToPath(import.meta.url);
const root = dirname(dirname(dirname(selfFile)));
const args = process.argv.slice(2);
const browserName = args.includes('--browser') ? args[args.indexOf('--browser') + 1] : null;
if (browserName && !['chromium', 'webkit'].includes(browserName)) throw new Error('--browser must be chromium or webkit');
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(root, 'docs', 'certainty-walk', ...(browserName ? [browserName] : []));
const shots = !args.includes('--no-shots');
const modules = process.env.WALK_NODE_MODULES || join(root, 'node_modules');
const req = createRequire(join(modules, 'noop.js'));
const { chromium, webkit } = req('playwright-core');
const axeSource = readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const def = chromium.executablePath();
  if (existsSync(def)) return def;
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  for (const dir of existsSync(cache) ? readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort().reverse() : []) {
    const mac = join(cache, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    const linux = join(cache, dir, 'chrome-linux', 'chrome');
    if (existsSync(mac)) return mac;
    if (existsSync(linux)) return linux;
  }
  return def;
}

const ORIGIN = 'http://certainty.walk.test';
const fixtures = JSON.parse(readFileSync(join(root, 'scripts', 'sim', 'fixtures', 'certainty-states.json'), 'utf8'));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

// ── Time-relative fixtures ─────────────────────────────────────────────────
// Labels match what certainty_state formats in America/New_York.
function et(d, opts) { return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'America/New_York' }, opts)).format(d); }
function heldRow(n, daysAgo, topic) {
  const start = new Date(Date.now() - daysAgo * 86400000);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 7200000);
  return {
    id: 'held-' + n, starts_at: start.toISOString(), ends_at: end.toISOString(), mode: n % 2 ? 'zoom' : 'phone',
    topic, outcome: 'held',
    label_day: et(start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    label_start: et(start, { hour: 'numeric', minute: '2-digit' }), label_end: et(end, { hour: 'numeric', minute: '2-digit' })
  };
}
function upcomingRow(date, hour, mode, phone, topic, id) {
  const start = new Date(date + 'T' + String(hour).padStart(2, '0') + ':00:00-04:00');
  const end = new Date(start.getTime() + 7200000);
  return {
    id: id || 'upcoming-1', starts_at: start.toISOString(), ends_at: end.toISOString(), mode, phone: phone || null, topic: topic || null,
    calendar_status: 'pending', calendar_sync_state: 'pending', local_date: date, local_hour: hour,
    label_day: et(start, { weekday: 'long', month: 'long', day: 'numeric' }),
    label_start: et(start, { hour: 'numeric', minute: '2-digit' }), label_end: et(end, { hour: 'numeric', minute: '2-digit' }),
    join: mode === 'zoom' ? { mode: 'zoom', label: 'Join on Zoom', joinUrl: 'https://zoom.example.invalid/j/1' } : { mode: 'phone', label: 'David will call you', phone }
  };
}
function etDatePlus(days) {
  const d = new Date(Date.now() + days * 86400000);
  return et(d, { year: 'numeric' }) + '-' + et(d, { month: '2-digit' }) + '-' + et(d, { day: '2-digit' });
}
function buildState(name) {
  const f = fixtures.states[name];
  if (!f) throw new Error('unknown fixture ' + name);
  const history = (f.held || []).map(([n, daysAgo, topic]) => heldRow(n, daysAgo, topic));
  const last = history[0] || null;
  const days = last ? Math.floor((Date.now() - Date.parse(last.ends_at)) / 86400000) : null;
  return {
    signedIn: true, currentWeek: 'walk', bookedThisWeek: Boolean(f.upcoming), taken: [],
    upcoming: f.upcoming ? upcomingRow(etDatePlus(f.upcoming.inDays), f.upcoming.hour, f.upcoming.mode, f.upcoming.phone, f.upcoming.topic) : null,
    history, historyCount: history.length,
    engagement: f.engagement || (last ? 'active' : 'new'),
    membership_ended: Boolean(f.membership_ended),
    lastHeld: last ? { ends_at: last.ends_at, topic: last.topic, label_day: et(new Date(last.starts_at), { month: 'long', day: 'numeric' }) } : null,
    daysSinceLastHeld: days, weeksSinceLastHeld: days == null ? null : Math.floor(days / 7), lapseThresholdDays: 21,
    window: { startHour: 10, endHour: 22, durationHours: 2, tz: 'America/New_York' },
    settings: { time_zone: 'America/New_York', phone: f.phone || '', default_mode: 'zoom' }
  };
}

// ── Stubbed world ──────────────────────────────────────────────────────────
const SUPABASE_STUB = `
window.supabase = { createClient: function () {
  var signedIn = !window.__walkSignedOut;
  var session = signedIn ? { access_token: 'walk-token', user: { id: 'walk-user', email: 'walk.member@example.invalid' } } : null;
  function q(result) { var p = Promise.resolve(result); var b = { select: function(){return b;}, eq: function(){return b;}, maybeSingle: function(){return p;}, single: function(){return p;}, then: function(a,c){return p.then(a,c);} }; return b; }
  return {
    auth: { getSession: function(){ return Promise.resolve({ data: { session: session } }); }, onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; }, signOut: function(){ return Promise.resolve({}); } },
    from: function(){ return q({ data: signedIn ? { name: 'Walk Member', email: 'walk.member@example.invalid' } : null, error: null }); },
    rpc: function(name){ if (name === 'my_hub_apps') return Promise.resolve({ data: ['certainty','storysculpt','navigator','vault','hub'], error: null }); return Promise.resolve({ data: signedIn, error: null }); }
  };
} };`;

const refused = [];
const findings = [];
const checks = [];
const layoutResults = [];
const keyboardResults = [];
const accessibilityResults = [];
function finding(area, screen, step, row, detail, shot) { findings.push({ browser: browserName || 'chromium', area, screen, step, row, detail, shot: shot || null }); }
function check(name, pass, evidence) { checks.push({ browser: browserName || 'chromium', name, pass: Boolean(pass), evidence }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (evidence ? ' :: ' + evidence : '')); }

async function wire(page, world) {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === ORIGIN) {
      if (url.pathname === '/api/certainty') return world.api(route, request);
      let file = url.pathname === '/certainty' ? join(root, 'api', '_hub', 'certainty.html') : join(root, url.pathname.replace(/^\/+/, ''));
      if (!file.startsWith(root) || !existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    }
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('supabase-js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_STUB });
    }
    const benign = request.method() === 'GET' && (url.hostname === 'unpkg.com' || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname));
    if (benign && process.env.WALK_OFFLINE !== '1') return route.continue();
    refused.push({ method: request.method(), url: url.origin + url.pathname, benign });
    return route.abort('blockedbyclient');
  });
}

function makeWorld(stateName) {
  const w = {
    state: buildState(stateName), posts: [], mode: {},
    async api(route, request) {
      const body = JSON.parse(request.postData() || '{}');
      w.posts.push(body);
      const behave = w.mode[body.action];
      if (behave === 'drop') return route.abort('internetdisconnected');
      if (behave === 'slow') await new Promise(r => setTimeout(r, 600));
      if (behave && behave.status) return route.fulfill({ status: behave.status, contentType: 'application/json', body: JSON.stringify(behave.body || {}) });
      const ok = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      switch (body.action) {
        case 'state': return ok(w.state);
        case 'history': return ok({ signedIn: true, history: [], total: w.state.historyCount, offset: body.offset, limit: body.limit, nextOffset: null, hasMore: false });
        case 'book':
        case 'update': {
          const u = upcomingRow(body.date, body.hour, body.mode, body.phone, body.topic, body.id || 'upcoming-' + w.posts.length);
          w.state = Object.assign({}, w.state, { upcoming: u, bookedThisWeek: true, engagement: 'active' });
          return ok({ session: u, calendar: { status: 'pending' } });
        }
        case 'cancel':
          w.state = Object.assign({}, w.state, { upcoming: null, bookedThisWeek: false });
          return ok({ cancelled: true });
        case 'save_settings': return ok({ ok: true, settings: { time_zone: body.time_zone, phone: body.phone, default_mode: body.default_mode } });
        default: return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'unknown action' }) });
      }
    }
  };
  return w;
}

async function open(browser, stateName, cfg = {}) {
  const width = cfg.zoom ? Math.round(cfg.width / 2) : cfg.width || 1280;
  const context = await browser.newContext({
    viewport: { width, height: cfg.height || 900 }, deviceScaleFactor: cfg.zoom ? 2 : 1,
    colorScheme: cfg.theme === 'light' ? 'light' : 'dark', reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  if (cfg.font && browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: cfg.font, fixed: cfg.font } });
  }
  await page.addInitScript(([theme, signedOut]) => {
    try { localStorage.setItem('sis_theme_v1', theme); } catch (e) {}
    if (signedOut) window.__walkSignedOut = true;
  }, [cfg.theme === 'light' ? 'light' : 'dark', Boolean(cfg.signedOut)]);
  const world = makeWorld(stateName);
  await wire(page, world);
  await page.goto(ORIGIN + '/certainty');
  await page.waitForFunction(() => {
    const gate = document.getElementById('eee-access-gate');
    const hero = document.getElementById('cs-hero');
    return (gate && !gate.hidden && !/One moment/.test(gate.textContent)) || (hero && !hero.classList.contains('cs-hide'));
  }, null, { timeout: 15000 });
  // WebKit has no CDP font-size command. Emulate the same 24px root-font
  // condition after load and record the computed size in the render matrix.
  if (cfg.font && browserName === 'webkit') await page.addStyleTag({ content: `html { font-size: ${cfg.font}px !important; }` });
  await page.waitForTimeout(150);
  return { context, page, world, errors };
}

let shotCount = 0;
async function shot(page, name) {
  if (!shots) return null;
  const file = join(outDir, 'shots', String(++shotCount).padStart(3, '0') + '-' + name + '.jpg');
  await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 40 });
  return file.slice(root.length + 1);
}

// Layout faults a member at big text actually hits: the page scrolls sideways,
// or a control's own text is cut off inside its box.
async function layoutFaults(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const faults = [];
    if (doc.scrollWidth > doc.clientWidth + 1) {
      const wide = [...document.querySelectorAll('#eee-app *, #eee-access-gate *')].filter(n => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.right > doc.clientWidth + 1 && getComputedStyle(n).position !== 'fixed';
      }).filter(n => !n.parentElement || n.parentElement.getBoundingClientRect().right <= doc.clientWidth + 1).slice(0, 4);
      faults.push({ kind: 'horizontal-scroll', detail: 'page is ' + doc.scrollWidth + 'px wide in a ' + doc.clientWidth + 'px viewport; widest: ' + wide.map(n => (n.id ? '#' + n.id : n.tagName.toLowerCase() + '.' + [...n.classList].join('.')) + ' right=' + Math.round(n.getBoundingClientRect().right)).join(', ') });
    }
    for (const n of document.querySelectorAll('button, a, .cs-time, .cs-day, label, h1, h2, h3, .cs-input')) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (!r.width || cs.visibility === 'hidden') continue;
      const clipsX = cs.overflowX !== 'visible' && n.scrollWidth > n.clientWidth + 2 && n.tagName !== 'SELECT' && n.tagName !== 'INPUT';
      const clipsY = cs.overflowY !== 'visible' && n.scrollHeight > n.clientHeight + 2;
      if (clipsX || clipsY) faults.push({ kind: 'clipped-text', detail: (n.id ? '#' + n.id : n.tagName.toLowerCase() + '.' + [...n.classList].join('.')) + ' "' + n.textContent.trim().slice(0, 40) + '"' });
    }
    // A member's own default font size must reach body text, not only headings.
    const rootPx = parseFloat(getComputedStyle(doc).fontSize);
    const pinned = [...document.querySelectorAll('#eee-app p, #eee-app li, #eee-gate-copy')].filter(n => n.getBoundingClientRect().width && parseFloat(getComputedStyle(n).fontSize) < rootPx * 0.72);
    if (rootPx > 16 && pinned.length) faults.push({ kind: 'font-ignored', detail: pinned.length + ' text blocks stay small when the default font is ' + rootPx + 'px, e.g. "' + pinned[0].textContent.trim().slice(0, 40) + '" at ' + getComputedStyle(pinned[0]).fontSize });
    return { faults, rootFont: getComputedStyle(doc).fontSize };
  });
}

async function axe(page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 12).map(n => n.target.join(' ') + (n.any[0] && n.any[0].data && n.any[0].data.contrastRatio ? ' (' + n.any[0].data.fgColor + ' on ' + n.any[0].data.bgColor + ' = ' + n.any[0].data.contrastRatio + ')' : '')) }));
  });
}

async function focusInfo(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body || a === document.documentElement) return { tag: 'body', visible: false, label: '(nothing focused)' };
    const cs = getComputedStyle(a);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const ring = cs.boxShadow && cs.boxShadow !== 'none';
    const r = a.getBoundingClientRect();
    const label = (a.getAttribute('aria-label') || a.textContent || a.value || a.id || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    return { tag: a.tagName.toLowerCase(), id: a.id || null, cls: a.className || '', label, visible: Boolean((outline || ring) && r.width && r.height), inBook: Boolean(a.closest('#cs-book')) };
  });
}

const navigationKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';

async function tabUntil(page, predicate, max, log) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(navigationKey);
    const f = await focusInfo(page);
    if (log) log.push(f);
    if (predicate(f)) return f;
  }
  return null;
}

// ── 1. Render matrix ───────────────────────────────────────────────────────
async function renderMatrix(browser) {
  const configs = [];
  for (const width of [375, 1280]) for (const theme of ['dark', 'light']) for (const mode of ['normal', 'zoom200', 'font24']) configs.push({ width, theme, mode });
  const screens = ['first', 'booked', 'returning', 'lapsed', 'ended', 'paged'];
  let faultCount = 0;
  for (const name of screens) {
    for (const c of configs) {
      const { context, page, errors } = await open(browser, name, { width: c.width, theme: c.theme, zoom: c.mode === 'zoom200', font: c.mode === 'font24' ? 24 : null });
      if (name === 'first' || name === 'returning') {
        const btn = page.locator('#cs-open-book');
        if (await btn.count()) { await btn.click(); await page.locator('.cs-day').nth(1).click(); }
      }
      const tag = name + '-' + c.width + '-' + c.theme + '-' + c.mode;
      const { faults, rootFont } = await layoutFaults(page);
      let file = null;
      const representative = browserName === 'webkit' || (c.mode !== 'normal' && c.width === 375 && c.theme === 'dark') || faults.length;
      if (representative) file = await shot(page, tag);
      layoutResults.push({ browser: browserName || 'chromium', screen: name, width: c.width, theme: c.theme, mode: c.mode, rootFont, pass: faults.length === 0, shot: file });
      for (const f of faults) { faultCount++; finding('layout', name, c.width + 'px ' + c.theme + ' ' + c.mode + ' (root font ' + rootFont + ')', 'UX 95, 96', f.kind + ': ' + f.detail, file); }
      for (const e of errors) finding('script', name, tag, 'UX 78', 'page error: ' + e, file);
      await context.close();
    }
  }
  check('layout holds at 375/1280, 200% zoom, 24px font, light and dark across ' + screens.length + ' screens', faultCount === 0, faultCount + ' layout faults');
}

// ── 2. axe-core ────────────────────────────────────────────────────────────
async function axeAll(browser) {
  let serious = 0;
  for (const name of ['first', 'booked', 'returning', 'lapsed', 'ended', 'signedout']) {
    for (const theme of ['dark', 'light']) {
      const { context, page } = await open(browser, name === 'signedout' ? 'first' : name, { width: 1280, theme, signedOut: name === 'signedout' });
      if (name === 'first' || name === 'returning') { await page.click('#cs-open-book'); await page.locator('.cs-day').nth(1).click(); await page.locator('.cs-time:not([disabled])').first().click(); await page.click('.cs-mode[data-mode="phone"]'); }
      const v = await axe(page);
      for (const x of v) {
        if (x.impact === 'serious' || x.impact === 'critical') serious++;
        finding('axe', name, theme + ' 1280px', 'UX 97', x.impact + ' ' + x.id + ': ' + x.help + ' [' + x.nodes.join(' | ') + ']', null);
      }
      await context.close();
    }
  }
  check('zero serious or critical axe-core violations (WCAG 2.1 A/AA) on every state, light and dark', serious === 0, serious + ' serious/critical');
}

// ── 3. Keyboard-only booking ───────────────────────────────────────────────
async function keyboardBooking(browser) {
  for (const theme of ['dark', 'light']) for (const width of [1280, 375]) {
    const { context, page, world } = await open(browser, 'first', { width, theme });
    const log = [];
    const where = theme + ' ' + width + 'px';
    const focusOrder = width === 1280 && theme === 'dark' ? 'focus-order.json' : null;
    const opener = await tabUntil(page, f => f.id === 'cs-open-book', 60, log);
    if (!opener) {
      const after = await shot(page, 'keyboard-opener-unreachable-' + theme + '-' + width);
      finding('keyboard', 'first', where, 'UX 98', 'could not reach "Book my first session" by ' + navigationKey, after);
      if (focusOrder) writeFileSync(join(outDir, focusOrder), JSON.stringify(log, null, 1));
      keyboardResults.push({ browser: browserName || 'chromium', navigationKey, theme, width, pass: false, stops: log.length, invisibleFocusStops: 0, booking: null, focusOrder, shot: after });
      check('keyboard-only booking ' + where, false, 'opener unreachable by ' + navigationKey + ', ' + log.length + ' stops');
      await context.close();
      continue;
    }
    await page.keyboard.press('Enter');
    let f = await focusInfo(page);
    if (!f.inBook) finding('keyboard', 'booking', where + ' after Enter on Book', 'UX 98', 'focus stayed on ' + (f.id || f.label) + ', not in the booking panel; a keyboard member must Tab past the hero to reach the days');
    const day = await tabUntil(page, x => /cs-day/.test(x.cls), 30, log);
    await page.keyboard.press(navigationKey); // second day: today may have no open hours left
    await page.keyboard.press('Enter');
    f = await focusInfo(page);
    if (!/cs-day/.test(f.cls)) finding('keyboard', 'booking', where + ' after Enter on a day', 'UX 98', 'focus fell to ' + f.label + ' when the day list re-rendered');
    const time = await tabUntil(page, x => /cs-time/.test(x.cls), 30, log);
    await page.keyboard.press('Space');
    f = await focusInfo(page);
    if (!/cs-time/.test(f.cls)) finding('keyboard', 'booking', where + ' after Space on a time', 'UX 98', 'focus fell to ' + f.label + ' when the time list re-rendered');
    const mode = await tabUntil(page, x => /cs-mode/.test(x.cls), 30, log);
    await page.keyboard.press('ArrowRight');
    await tabUntil(page, x => x.id === 'cs-phone', 5, log);
    await page.keyboard.type('(555) 010-2030');
    await tabUntil(page, x => x.id === 'cs-topic', 5, log);
    await page.keyboard.type('Keyboard walk topic');
    const confirm = await tabUntil(page, x => x.id === 'cs-confirm', 5, log);
    if (confirm) await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const book = world.posts.find(p => p.action === 'book');
    f = await focusInfo(page);
    const after = await shot(page, 'keyboard-booked-' + theme + '-' + width);
    if (!book) finding('keyboard', 'booking', where, 'UX 98', 'keyboard-only booking never sent a book request (reached day=' + Boolean(day) + ' time=' + Boolean(time) + ' mode=' + Boolean(mode) + ' confirm=' + Boolean(confirm) + ')', after);
    else if (book.mode !== 'phone' || !book.phone || book.topic !== 'Keyboard walk topic') finding('keyboard', 'booking', where, 'UX 98', 'booked with wrong values ' + JSON.stringify(book), after);
    if (book && f.tag === 'body') finding('keyboard', 'booked', where + ' after confirming', 'UX 98', 'focus was dropped to the page body when the panel closed; the confirmation is never announced to a keyboard or screen-reader member', after);
    const invisible = log.filter(x => x.tag !== 'body' && !x.visible);
    for (const x of invisible.slice(0, 6)) finding('keyboard', 'first/booking', where, 'UX 99', 'focus stop with no visible focus: ' + x.tag + (x.id ? '#' + x.id : '') + ' "' + x.label + '"');
    if (focusOrder) writeFileSync(join(outDir, focusOrder), JSON.stringify(log, null, 1));
    keyboardResults.push({ browser: browserName || 'chromium', navigationKey, theme, width, pass: Boolean(book) && invisible.length === 0, stops: log.length, invisibleFocusStops: invisible.length, booking: book || null, focusOrder, shot: after });
    await context.close();
    check('keyboard-only booking ' + where, Boolean(book) && invisible.length === 0, (book ? 'booked ' + book.date + ' ' + book.hour + ':00 ' + book.mode : 'no booking') + ' via ' + navigationKey + ', ' + log.length + ' stops, ' + invisible.length + ' without visible focus');
  }
  // Escape
  const { context, page } = await open(browser, 'first', { width: 1280 });
  await page.focus('#cs-open-book');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  const stillOpen = await page.locator('#cs-book.open').count();
  const f = await focusInfo(page);
  if (stillOpen) finding('keyboard', 'booking', 'Escape in the open panel', 'UX 98', 'Escape does not close the booking panel');
  else if (f.id !== 'cs-open-book') finding('keyboard', 'booking', 'Escape in the open panel', 'UX 98', 'panel closed but focus went to ' + f.label + ' instead of back to the Book button');
  check('Escape closes the booking panel and returns focus to the Book button', !stillOpen && f.id === 'cs-open-book', stillOpen ? 'panel stayed open' : 'focus on ' + f.label);
  await context.close();
}

// ── 4. Lifecycle ───────────────────────────────────────────────────────────
async function pickAndConfirm(page, topic) {
  await page.locator('.cs-day').nth(1).click();
  await page.locator('.cs-time:not([disabled])').first().click();
  if (topic != null) await page.fill('#cs-topic', topic);
  await page.click('#cs-confirm');
}
async function msg(page) { return (await page.locator('#cs-msg').textContent() || '').trim(); }

async function lifecycle(browser) {
  // first visit → book → edit → cancel → rebook
  {
    const { context, page, world, errors } = await open(browser, 'first', { width: 375 });
    page.on('dialog', d => d.accept());
    const firstCopy = await page.locator('[data-first-session="true"]').count();
    check('first visit greets a first-timer', firstCopy === 1, 'first-session heading ' + firstCopy);
    await page.click('#cs-open-book');
    await pickAndConfirm(page, 'Fix my funnel');
    await page.waitForSelector('#cs-edit', { timeout: 5000 }).catch(() => null);
    const booked = await page.locator('#cs-primary').textContent();
    check('book: the next session shows with its topic', /Fix my funnel/.test(booked), booked.replace(/\s+/g, ' ').slice(0, 90));
    await shot(page, 'lifecycle-booked');
    await page.click('#cs-edit');
    await page.fill('#cs-topic', 'Fix my funnel, part two');
    await page.click('#cs-confirm');
    await page.waitForTimeout(300);
    const upd = world.posts.find(p => p.action === 'update');
    const edited = await page.locator('#cs-primary').textContent();
    check('edit: update sent with the session id and the new topic shows', upd && upd.id && /part two/.test(edited), upd ? 'update id=' + upd.id : 'no update');
    await page.click('#cs-cancel');
    await page.click('#cs-dialog-confirm');
    await page.waitForTimeout(300);
    const afterCancel = await page.locator('#cs-primary').textContent();
    check('cancel: the session is gone and booking is offered again', world.posts.some(p => p.action === 'cancel') && /Book my/.test(afterCancel), afterCancel.replace(/\s+/g, ' ').slice(0, 80));
    await page.click('#cs-open-book');
    await pickAndConfirm(page, 'Rebooked topic');
    await page.waitForTimeout(300);
    check('rebook after cancel', /Rebooked topic/.test(await page.locator('#cs-primary').textContent()), world.posts.filter(p => p.action === 'book').length + ' book requests');
    for (const e of errors) finding('script', 'lifecycle', 'book/edit/cancel/rebook', 'UX 78', 'page error: ' + e);
    await context.close();
  }
  // lapsed, ended, sign-in failure, server unreachable
  {
    const { context, page } = await open(browser, 'lapsed', { width: 375 });
    const t = await page.locator('#cs-primary').textContent();
    check('lapsed member is welcomed back with their last topic', /Welcome back/.test(t) && /Pricing page rewrite/.test(t), t.replace(/\s+/g, ' ').slice(0, 90));
    await shot(page, 'lifecycle-lapsed'); await context.close();
  }
  {
    const { context, page } = await open(browser, 'ended', { width: 375 });
    const gate = await page.locator('#eee-access-gate').isVisible();
    const t = await page.locator('#eee-gate-title').textContent();
    check('ended membership closes booking and says how to come back', gate && /has ended/.test(t), t);
    await shot(page, 'lifecycle-ended'); await context.close();
  }
  {
    const { context, page } = await open(browser, 'first', { width: 375, signedOut: true });
    const t = await page.locator('#eee-gate-title').textContent();
    check('sign-in failure shows the sign-in gate', /Sign in/.test(t), t);
    await shot(page, 'lifecycle-signed-out'); await context.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    const world = makeWorld('first'); world.mode.state = 'drop';
    await wire(page, world);
    await page.goto(ORIGIN + '/certainty');
    await page.waitForFunction(() => /could not reach/.test(document.getElementById('eee-gate-title').textContent), null, { timeout: 8000 }).catch(() => null);
    const t = await page.locator('#eee-gate-title').textContent();
    check('server unreachable on load shows a retry, not a blank page', /could not reach/.test(t), t);
    world.mode.state = null;
    await page.click('#eee-gate-button');
    await page.waitForSelector('#cs-hero:not(.cs-hide)', { timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(300);
    check('Try again recovers once the server answers', await page.locator('#cs-hero:not(.cs-hide)').count() === 1, '');
    const recoveryAnnouncement = await page.evaluate(() => {
      const el = document.getElementById('cs-session-msg');
      return {
        text: el ? el.textContent.trim() : '',
        role: el ? el.getAttribute('role') : null,
        live: el ? el.getAttribute('aria-live') : null,
        focusedTag: document.activeElement ? document.activeElement.tagName.toLowerCase() : '',
        focusedId: document.activeElement ? document.activeElement.id : ''
      };
    });
    const recoveryPass = /loaded/i.test(recoveryAnnouncement.text) &&
      (recoveryAnnouncement.role === 'status' || recoveryAnnouncement.live === 'polite') &&
      Boolean(recoveryAnnouncement.focusedTag && recoveryAnnouncement.focusedTag !== 'body');
    check('Try again after a failed load announces the loaded state and moves focus', recoveryPass, JSON.stringify(recoveryAnnouncement));
    await ctx.close();
  }
  // network drop mid-booking, slot taken, double submit
  {
    const { context, page, world } = await open(browser, 'first', { width: 375 });
    await page.click('#cs-open-book');
    world.mode.book = 'drop';
    await pickAndConfirm(page, 'Dropped');
    await page.waitForTimeout(300);
    const m = await msg(page);
    const enabled = await page.locator('#cs-confirm').isEnabled();
    check('network drop mid-booking: says so, keeps the choice, button usable', /interrupted/i.test(m) && enabled && (await page.locator('#cs-topic').inputValue()) === 'Dropped', m);
    world.mode.book = { status: 409, body: { error: 'Someone just took that time.', code: 'SLOT_TAKEN' } };
    await page.click('#cs-confirm');
    await page.waitForTimeout(300);
    const m2 = await msg(page);
    check('slot taken by someone else: plain message and a fresh pick', /Someone just took/.test(m2), m2);
    await shot(page, 'lifecycle-slot-taken');
    world.mode.book = 'slow';
    const before = world.posts.filter(p => p.action === 'book').length;
    await page.locator('.cs-time:not([disabled])').first().click();
    await page.evaluate(() => { const b = document.getElementById('cs-confirm'); b.click(); b.click(); });
    await page.locator('#cs-confirm').dblclick({ force: true }).catch(() => null);
    await page.keyboard.press('Enter').catch(() => null);
    await page.waitForTimeout(900);
    const sent = world.posts.filter(p => p.action === 'book').length - before;
    check('double submit sends exactly one booking', sent === 1, sent + ' book requests');
    await context.close();
  }
  // a booking by someone else at 14:00 blocks 13:00, 14:00 and 15:00 (two-hour sessions)
  {
    const { context, page, world } = await open(browser, 'first', { width: 1280 });
    world.state.taken = [{ date: etDatePlus(1), hour: 14 }];
    await page.reload();
    await page.waitForSelector('#cs-hero:not(.cs-hide)');
    await page.click('#cs-open-book');
    // By date, not position: after 10 PM Eastern today is no longer offered.
    await page.locator('.cs-day[data-date="' + etDatePlus(1) + '"]').click();
    const disabled = await page.evaluate(() => [...document.querySelectorAll('.cs-time')].map((b, i) => b.disabled ? 10 + i : null).filter(x => x != null));
    check('a neighbour\'s two-hour session blocks the overlapping hours', [13, 14, 15].every(h => disabled.includes(h)) && !disabled.includes(12) && !disabled.includes(16), 'disabled hours ' + disabled.join(','));
    await context.close();
  }
  // cancel failures
  for (const [label, behave] of [['network drop', 'drop'], ['server error', { status: 500, body: { error: 'Could not cancel that session.' } }]]) {
    const { context, page, world, errors } = await open(browser, 'booked', { width: 375 });
    world.mode.cancel = behave;
    await page.click('#cs-cancel');
    await page.click('#cs-dialog-confirm');
    await page.waitForTimeout(400);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.cs-msg.show.err, [role=alert]')].map(n => n.textContent.trim()).filter(Boolean).join(' | '));
    const file = await shot(page, 'lifecycle-cancel-' + (behave.status ? 'error' : 'drop'));
    if (!shown) finding('lifecycle', 'booked', 'Cancel with ' + label, 'UX 78', 'cancel failed and the page said nothing; the member believes the time was released' + (errors.length ? ' (page error: ' + errors[0] + ')' : ''), file);
    check('cancel ' + label + ' is reported to the member', Boolean(shown), shown || 'silent');
    await context.close();
  }
  // reschedule failure must not open a second booking
  {
    const { context, page, world } = await open(browser, 'booked', { width: 375 });
    world.mode.cancel = { status: 500, body: { error: 'Could not cancel that session.' } };
    await page.click('#cs-reschedule');
    await page.click('#cs-dialog-confirm');
    await page.waitForTimeout(400);
    const opened = await page.locator('#cs-book.open').count();
    const shown = await page.evaluate(() => [...document.querySelectorAll('.cs-msg.show.err, [role=alert]')].map(n => n.textContent.trim()).filter(Boolean).join(' | '));
    if (opened || !shown) finding('lifecycle', 'booked', 'Reschedule when releasing the old time fails', 'UX 78', (opened ? 'the booking panel opened anyway, inviting a second booking while the first still stands; ' : '') + (shown ? '' : 'no error shown'));
    check('reschedule stops and says so when the old time cannot be released', !opened && Boolean(shown), (opened ? 'panel opened; ' : '') + (shown || 'silent'));
    await context.close();
  }
  // in-page dialog tests (WBR-458): Cancel Escape keeps session, Reschedule labelled and focus-trapped
  {
    const { context, page, world } = await open(browser, 'booked', { width: 1280 });
    // Cancel asks in an in-page dialog; Escape keeps the session and returns focus
    await page.click('#cs-cancel');
    await page.waitForTimeout(200);
    const dialogState = await page.evaluate(() => {
      const backdrop = document.getElementById('cs-confirm-dialog-backdrop');
      const dialog = document.getElementById('cs-confirm-dialog');
      const title = document.getElementById('cs-dialog-title');
      const desc = document.getElementById('cs-dialog-desc');
      const active = document.activeElement;
      return {
        open: backdrop && !backdrop.classList.contains('cs-hide'),
        role: dialog ? dialog.getAttribute('role') : null,
        modal: dialog ? dialog.getAttribute('aria-modal') : null,
        title: title ? title.textContent.trim() : '',
        desc: desc ? desc.textContent.trim() : '',
        activeId: active ? active.id : null
      };
    });
    const asksInDialog = dialogState.open &&
      (dialogState.role === 'alertdialog' || dialogState.role === 'dialog') &&
      dialogState.modal === 'true' &&
      /Cancel/i.test(dialogState.title) &&
      dialogState.activeId === 'cs-dialog-cancel';

    // Press Escape to cancel the dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const afterEscape = await page.evaluate(() => {
      const backdrop = document.getElementById('cs-confirm-dialog-backdrop');
      const active = document.activeElement;
      return {
        closed: backdrop && backdrop.classList.contains('cs-hide'),
        activeId: active ? active.id : null
      };
    });
    const cancelSent = world.posts.some(p => p.action === 'cancel');
    const cancelEscapePass = asksInDialog && afterEscape.closed && !cancelSent && afterEscape.activeId === 'cs-cancel';
    check('Cancel asks in an in-page dialog; Escape keeps the session and returns focus', cancelEscapePass,
      JSON.stringify({ dialogState, afterEscape, cancelSent }));

    // Reschedule confirm is labelled and focus-trapped
    await page.click('#cs-reschedule');
    await page.waitForTimeout(200);
    const reschedDialog = await page.evaluate(() => {
      const dialog = document.getElementById('cs-confirm-dialog');
      const title = document.getElementById('cs-dialog-title');
      const desc = document.getElementById('cs-dialog-desc');
      const labelledby = dialog ? dialog.getAttribute('aria-labelledby') : null;
      const describedby = dialog ? dialog.getAttribute('aria-describedby') : null;
      return {
        labelled: labelledby === 'cs-dialog-title' && Boolean(title && title.textContent.trim()),
        described: describedby === 'cs-dialog-desc' && Boolean(desc && desc.textContent.trim()),
        titleText: title ? title.textContent.trim() : '',
        descText: desc ? desc.textContent.trim() : '',
        activeId: document.activeElement ? document.activeElement.id : null
      };
    });

    // Test focus trapping: Tab from confirm wraps to cancel, Shift+Tab from cancel wraps to confirm
    const isWebKit = (browserName === 'webkit');
    const tabKey = isWebKit ? 'Alt+Tab' : 'Tab';

    // Currently focused on cs-dialog-cancel. Shift+Tab should wrap to cs-dialog-confirm
    await page.keyboard.press(isWebKit ? 'Alt+Shift+Tab' : 'Shift+Tab');
    const focusWrappedBack = await page.evaluate(() => document.activeElement ? document.activeElement.id : null);

    // Tab from cs-dialog-confirm should wrap to cs-dialog-cancel
    await page.keyboard.press(tabKey);
    const focusWrappedForward = await page.evaluate(() => document.activeElement ? document.activeElement.id : null);

    const trapPass = (focusWrappedBack === 'cs-dialog-confirm') && (focusWrappedForward === 'cs-dialog-cancel');
    const reschedPass = reschedDialog.labelled && reschedDialog.described && /Reschedule/i.test(reschedDialog.titleText) && trapPass;

    check('Reschedule confirm is labelled and focus-trapped', reschedPass,
      JSON.stringify({ reschedDialog, focusWrappedBack, focusWrappedForward }));

    // Dismiss reschedule dialog
    await page.keyboard.press('Escape');
    await context.close();
  }
}

// ── 5. Accessibility tree ──────────────────────────────────────────────────
async function auditAccessibility(page) {
  return page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"]');
    };
    const text = value => String(value || '').trim().replace(/\s+/g, ' ');
    const nameFor = el => {
      const labelled = el.getAttribute('aria-labelledby');
      const byId = labelled ? labelled.split(/\s+/).map(id => text(document.getElementById(id)?.textContent)).join(' ') : '';
      return text(el.getAttribute('aria-label') || byId || [...(el.labels || [])].map(n => n.textContent).join(' ') || el.textContent || el.value || el.placeholder || el.title);
    };
    const implicitRole = el => ({ BUTTON: 'button', A: el.hasAttribute('href') ? 'link' : null, INPUT: ({ checkbox: 'checkbox', radio: 'radio', range: 'slider' })[el.type] || 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox' })[el.tagName] || null;
    const controls = [...document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="radio"], [role="tab"], [role="option"]')].filter(visible).map(el => ({
      id: el.id || null, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || implicitRole(el), name: nameFor(el)
    }));
    const faults = [];
    for (const c of controls) {
      if (!c.role || !c.name || /^(button|click here|icon|menu)$/i.test(c.name)) faults.push('unnamed or roleless control ' + c.tag + (c.id ? '#' + c.id : '') + ' "' + c.name + '"');
    }
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map(h => ({ level: Number(h.tagName.slice(1)), text: text(h.textContent) }));
    if (!headings.length || headings[0].level !== 1) faults.push('heading outline does not begin with a visible h1');
    headings.forEach((h, i) => { if (i && h.level > headings[i - 1].level + 1) faults.push('heading outline skips from h' + headings[i - 1].level + ' to h' + h.level + ' at "' + h.text + '"'); });
    return { controls, headings, faults };
  });
}

async function captureAccessibility(page, name) {
  await page.waitForTimeout(100);
  const file = await shot(page, 'a11y-' + name);
  const audit = await auditAccessibility(page);
  const tree = await page.locator('body').ariaSnapshot();
  const a11yDir = join(outDir, 'a11y');
  mkdirSync(a11yDir, { recursive: true });
  writeFileSync(join(a11yDir, name + '.yml'), tree + '\n');
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const raw = await cdp.send('Accessibility.getFullAXTree');
    writeFileSync(join(a11yDir, name + '.cdp.json'), JSON.stringify(raw, null, 1));
    await cdp.detach();
  }
  for (const fault of audit.faults) finding('accessibility', name, 'accessibility-tree pass', 'UX 95', fault, file);
  check('screen-reader ' + name + ': every control is named and headings form an outline', audit.faults.length === 0, audit.faults.length + ' faults, ' + audit.controls.length + ' controls, ' + audit.headings.length + ' headings');
  const result = { browser: browserName || 'chromium', screen: name, pass: audit.faults.length === 0, shot: file, transcript: 'a11y/' + name + '.yml', headings: audit.headings, controls: audit.controls.length };
  accessibilityResults.push(result);
  return { ...result, tree };
}

async function assertLiveAnnouncement(page, selector, expected, name) {
  const result = await page.evaluate(({ selector }) => {
    const el = document.querySelector(selector);
    if (!el) return { text: '', live: null };
    const region = el.closest('[aria-live], [role="status"], [role="alert"]');
    const role = region?.getAttribute('role');
    return { text: (el.textContent || '').trim(), live: region?.getAttribute('aria-live') || (role === 'alert' ? 'assertive' : role === 'status' ? 'polite' : null) };
  }, { selector });
  const pass = result.text.includes(expected) && Boolean(result.live);
  if (!pass) finding('accessibility', name, 'message announcement', 'UX 95', 'message is not announced through a live region: ' + JSON.stringify(result), accessibilityResults.at(-1)?.shot);
  check('live announcement ' + name, pass, JSON.stringify(result));
}

async function accessibilityPass(browser) {
  const transcripts = [];
  const capture = async (page, name) => {
    const result = await captureAccessibility(page, name);
    transcripts.push(result);
    return result;
  };
  {
    const { context, page } = await open(browser, 'first', { width: 375 });
    await capture(page, 'first-visit');
    await page.click('#cs-open-book');
    await capture(page, 'picker');
    await page.locator('.cs-day').nth(1).click();
    await page.locator('.cs-time:not([disabled])').first().click();
    const mode = await capture(page, 'mode-choice');
    const selected = await page.evaluate(() => ['.cs-day.sel', '.cs-time.sel'].map(selector => {
      const el = document.querySelector(selector);
      return { selector, pressed: el?.getAttribute('aria-pressed'), name: el?.getAttribute('aria-label') || el?.textContent?.trim().replace(/\s+/g, ' ') };
    }));
    const selectedPass = selected.every(x => x.pressed === 'true' && x.name) && /pressed/i.test(mode.tree);
    if (!selectedPass) finding('accessibility', 'mode-choice', 'selected day and time', 'UX 95', 'selection is not exposed as pressed in the accessibility tree: ' + JSON.stringify(selected), mode.shot);
    check('selected day and time are announced as selected', selectedPass, JSON.stringify(selected));
    await page.click('.cs-mode[data-mode="phone"]');
    await page.fill('#cs-phone', '(555) 010-2030');
    await page.fill('#cs-topic', 'Screen reader booking');
    await capture(page, 'confirm');
    await page.click('#cs-confirm');
    await page.waitForSelector('#cs-edit', { timeout: 5000 });
    const booked = await capture(page, 'booked');
    const announced = await page.evaluate(() => {
      const primary = document.getElementById('cs-primary');
      const active = document.activeElement;
      const focused = active && primary?.contains(active) ? active.textContent.trim() : '';
      const live = [...document.querySelectorAll('#cs-primary[aria-live], #cs-primary [aria-live], #cs-session-msg[aria-live], #cs-session-msg[role="status"]')].map(n => n.textContent.trim()).join(' ');
      return { focused, live };
    });
    const bookedPass = /Screen reader booking/.test(announced.focused + ' ' + announced.live) && /Screen reader booking/.test(booked.tree);
    if (!bookedPass) finding('accessibility', 'booked', 'booking confirmation announcement', 'UX 95', 'confirmation is neither focused nor live-announced: ' + JSON.stringify(announced), booked.shot);
    check('booked confirmation is announced', bookedPass, JSON.stringify(announced));
    await page.click('#cs-edit');
    await capture(page, 'edit');
    await page.keyboard.press('Escape');
    await page.click('#cs-cancel');
    await page.click('#cs-dialog-confirm');
    await page.waitForTimeout(350);
    await capture(page, 'cancel');
    await context.close();
  }
  for (const [state, name] of [['lapsed', 'lapsed'], ['ended', 'ended']]) {
    const { context, page } = await open(browser, state, { width: 375 });
    await capture(page, name);
    await context.close();
  }
  {
    const { context, page } = await open(browser, 'first', { width: 375, signedOut: true });
    await capture(page, 'signed-out-gate');
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    const world = makeWorld('first');
    world.mode.state = 'drop';
    await wire(page, world);
    await page.goto(ORIGIN + '/certainty');
    await page.waitForFunction(() => /could not reach/.test(document.getElementById('eee-gate-title').textContent), null, { timeout: 8000 });
    await capture(page, 'server-error-gate');
    await context.close();
  }
  {
    const { context, page, world } = await open(browser, 'first', { width: 375 });
    await page.click('#cs-open-book');
    await page.locator('.cs-day').nth(1).click();
    await page.locator('.cs-time:not([disabled])').first().click();
    world.mode.book = 'drop';
    await page.click('#cs-confirm');
    await page.waitForTimeout(350);
    await capture(page, 'network-error');
    await assertLiveAnnouncement(page, '#cs-msg', 'interrupted', 'network-error');
    world.mode.book = { status: 409, body: { error: 'Someone just took that time.', code: 'SLOT_TAKEN' } };
    await page.click('#cs-confirm');
    await page.waitForTimeout(350);
    await capture(page, 'slot-taken');
    await assertLiveAnnouncement(page, '#cs-msg', 'Someone just took', 'slot-taken');
    await context.close();
  }
  const lines = [
    '# Certainty: what a screen reader hears', '',
    'Browser: `' + (browserName || 'chromium') + '`. Captured from the rendered accessibility tree; every network call was stubbed.', '',
    '**Limit:** this is an accessibility-tree inspection, not a real VoiceOver session. It proves roles, names, selected state, live-region wiring and heading structure, not every spoken behavior of a particular screen reader.', ''
  ];
  for (const t of transcripts) {
    lines.push('## ' + t.screen, '', 'Screenshot: `' + (t.shot || 'not captured') + '`  ', 'Transcript: `' + t.transcript + '`', '', 'Heading outline: ' + t.headings.map(h => 'h' + h.level + ' “' + h.text + '”').join(' → '), '', '```yaml', t.tree, '```', '');
  }
  writeFileSync(join(outDir, 'screen-reader.md'), lines.join('\n'));
}

// ── Run one browser ────────────────────────────────────────────────────────
async function runSingleBrowser() {
  if (shots) { rmSync(join(outDir, 'shots'), { recursive: true, force: true }); mkdirSync(join(outDir, 'shots'), { recursive: true }); }
  mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const browser = browserName === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ executablePath: chromiumPath(), headless: true });
  try {
    const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
    const parts = { lifecycle, keyboard: keyboardBooking, axe: axeAll, layout: renderMatrix, accessibility: accessibilityPass };
    for (const [name, run] of Object.entries(parts)) if (!only || only.includes(name)) await run(browser);
  } finally {
    await browser.close();
  }
  const harmful = refused.filter(r => !r.benign);
  check('no request left the machine except font and icon GETs; zero POSTs to production', harmful.length === 0 && !refused.some(r => r.method !== 'GET'), refused.length + ' refused, ' + harmful.length + ' non-benign');
  const failed = checks.filter(c => !c.pass);
  const lines = [
    '# Certainty rendered walk: ' + browserName, '',
    'Run ' + new Date().toISOString() + ' in ' + Math.round((Date.now() - started) / 1000) + 's against `api/_hub/certainty.html` in ' + browserName + ' with every network call stubbed.', '',
    '**' + (checks.length - failed.length) + ' of ' + checks.length + ' checks pass. ' + findings.length + ' findings.** Requests refused: ' + refused.length + ' (' + harmful.length + ' that could have reached production).', '',
    '## Checks', '', ...checks.map(c => '- ' + (c.pass ? 'PASS' : 'FAIL') + ' ' + c.name + (c.evidence ? ': ' + c.evidence : '')), '',
    '## Findings', '',
    findings.length ? '| Area | Screen | Step | Row | Defect | Screenshot |\n|---|---|---|---|---|---|\n' + findings.map(f => '| ' + [f.area, f.screen, f.step, f.row, f.detail.replace(/\|/g, '/'), f.shot || ''].join(' | ') + ' |').join('\n') : 'None.', ''
  ];
  writeFileSync(join(outDir, 'findings.md'), lines.join('\n'));
  writeFileSync(join(outDir, 'findings.json'), JSON.stringify({ at: new Date().toISOString(), browser: browserName, checks, findings, refused, layoutResults, keyboardResults, accessibilityResults }, null, 1));
  console.log('\n' + browserName + ': ' + (checks.length - failed.length) + '/' + checks.length + ' checks pass, ' + findings.length + ' findings -> ' + join(outDir, 'findings.md'));
  process.exitCode = failed.length || findings.some(f => f.area === 'keyboard') ? 1 : 0;
}

// Default: two isolated child runs, then one combined, reviewable artifact.
function runBothBrowsers() {
  const results = [];
  for (const name of ['chromium', 'webkit']) {
    const childOut = join(outDir, name);
    const childArgs = [selfFile, '--browser', name, '--out', childOut];
    if (args.includes('--only')) childArgs.push('--only', args[args.indexOf('--only') + 1]);
    if (!shots) childArgs.push('--no-shots');
    const proc = spawnSync(process.execPath, childArgs, { env: process.env, stdio: 'inherit' });
    const resultFile = join(childOut, 'findings.json');
    if (existsSync(resultFile)) {
      const data = JSON.parse(readFileSync(resultFile, 'utf8'));
      results.push({ ...data, exitCode: proc.status });
    } else {
      results.push({ browser: name, exitCode: proc.status, checks: [{ browser: name, name: 'browser walk completed', pass: false, evidence: 'no findings.json; child exit ' + proc.status }], findings: [], refused: [], layoutResults: [], keyboardResults: [], accessibilityResults: [] });
    }
  }
  const checks = results.flatMap(r => r.checks || []);
  const findings = results.flatMap(r => r.findings || []);
  const layouts = results.flatMap(r => r.layoutResults || []);
  const keyboards = results.flatMap(r => r.keyboardResults || []);
  const failed = checks.filter(c => !c.pass);
  const differences = [];
  for (const name of [...new Set(checks.map(c => c.name))]) {
    const c = checks.find(x => x.browser === 'chromium' && x.name === name);
    const w = checks.find(x => x.browser === 'webkit' && x.name === name);
    if (c && w && c.pass !== w.pass) differences.push({ name, chromium: c.pass, webkit: w.pass, evidence: 'Chromium: ' + c.evidence + '; WebKit: ' + w.evidence });
  }
  const lines = [
    '# Certainty rendered walk: Chromium and WebKit', '',
    'Run ' + new Date().toISOString() + ' against the real rendered `api/_hub/certainty.html`. Both browsers ran the same lifecycle, keyboard, axe, responsive-layout and accessibility-tree passes. Every network call was stubbed.', '',
    '**' + (checks.length - failed.length) + ' of ' + checks.length + ' checks pass across both browsers. ' + findings.length + ' findings.**', '',
    '## Browser differences', '',
    differences.length ? differences.map(d => '- ' + d.name + ': Chromium ' + d.chromium + ', WebKit ' + d.webkit + '. ' + d.evidence).join('\n') : 'No pass/fail differences between Chromium and WebKit were observed.', '',
    '## WebKit and Chromium render matrix', '',
    '| Browser | Screen | Width | Theme | Mode | Root font | Result | Screenshot |\n|---|---|---:|---|---|---|---|---|\n' + layouts.map(r => '| ' + [r.browser, r.screen, r.width, r.theme, r.mode, r.rootFont, r.pass ? 'PASS' : 'FAIL', r.shot || ''].join(' | ') + ' |').join('\n'), '',
    '## Keyboard-only booking', '',
    '| Browser | Navigation key | Theme | Width | Result | Focus stops | Invisible focus stops | Focus order | Screenshot |\n|---|---|---|---:|---|---:|---:|---|---|\n' + keyboards.map(r => '| ' + [r.browser, r.navigationKey || 'Tab', r.theme, r.width, r.pass ? 'PASS' : 'FAIL', r.stops, r.invisibleFocusStops, r.focusOrder ? r.browser + '/' + r.focusOrder : '', r.shot || ''].join(' | ') + ' |').join('\n'), '',
    '## Screen reader', '',
    'Readable per-screen transcripts are in `docs/certainty-walk/screen-reader.md`; raw accessibility snapshots are under each browser\'s `a11y/` directory. This is not a real VoiceOver session.', '',
    '## Checks', '',
    ...checks.map(c => '- ' + (c.pass ? 'PASS' : 'FAIL') + ' [' + c.browser + '] ' + c.name + (c.evidence ? ': ' + c.evidence : '')), '',
    '## Findings', '',
    findings.length ? '| Browser | Area | Screen | Step | Row | Defect | Screenshot |\n|---|---|---|---|---|---|---|\n' + findings.map(f => '| ' + [f.browser, f.area, f.screen, f.step, f.row, f.detail.replace(/\|/g, '/'), f.shot || ''].join(' | ') + ' |').join('\n') : 'None.', ''
  ];
  writeFileSync(join(outDir, 'findings.md'), lines.join('\n'));
  writeFileSync(join(outDir, 'findings.json'), JSON.stringify({ at: new Date().toISOString(), checks, findings, differences, browsers: results }, null, 1));
  const reader = ['# Certainty screen-reader transcripts', '', 'Chromium uses the CDP Accessibility tree and an ARIA snapshot; WebKit uses its rendered ARIA snapshot. Neither is a substitute for a real VoiceOver session.', ''];
  for (const name of ['chromium', 'webkit']) {
    const file = join(outDir, name, 'screen-reader.md');
    reader.push('---', '', existsSync(file) ? readFileSync(file, 'utf8').replace('# Certainty: what a screen reader hears', '## ' + name) : '## ' + name + '\n\nNot captured.', '');
  }
  writeFileSync(join(outDir, 'screen-reader.md'), reader.join('\n'));
  console.log('\nCombined: ' + (checks.length - failed.length) + '/' + checks.length + ' checks pass; ' + differences.length + ' pass/fail browser differences -> ' + join(outDir, 'findings.md'));
  process.exitCode = failed.length || results.some(r => r.exitCode !== 0) ? 1 : 0;
}

if (browserName) await runSingleBrowser();
else runBothBrowsers();
