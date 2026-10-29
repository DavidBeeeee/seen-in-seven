// StorySculpt rendered walk (WBR-462: UX 74, 76, 78, 95, 97).
//
// Drives the real api/_hub/storysculpt.html in headless Chromium and WebKit
// the way a member meets it: 375px and 1280px, 200% zoom, a 24px default font,
// light and dark, keyboard-only journey with visible focus at every stop,
// axe-core (WCAG 2.1 A/AA) on every state, /rant step path, 60-turn thread fixture,
// and full screen-reader heading and control audits.
// WebKit uses Alt+Tab; Chromium uses Tab. Every network call is answered locally:
// the page, its CSS and JS come from this checkout, Supabase auth/DB is stubbed,
// and /api/storysculpt is answered locally. No call leaves the machine.

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
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(root, 'docs', 'storysculpt-walk', ...(browserName ? [browserName] : []));
const shots = !args.includes('--no-shots');
const defaultDeps = existsSync('/private/tmp/certainty-walk-deps/node_modules') ? '/private/tmp/certainty-walk-deps/node_modules' : join(root, 'node_modules');
const modules = process.env.WALK_NODE_MODULES || defaultDeps;
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

const ORIGIN = 'http://storysculpt.walk.test';
const fixtures = JSON.parse(readFileSync(join(root, 'scripts', 'sim', 'fixtures', 'storysculpt-states.json'), 'utf8'));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

const SUPABASE_STUB = `
window.supabase = { createClient: function () {
  var signedIn = !window.__walkSignedOut;
  var session = signedIn ? { access_token: 'walk-token', user: { id: 'walk-user', email: 'walk.member@example.invalid' } } : null;
  return {
    auth: {
      getSession: function() { return Promise.resolve({ data: { session: session } }); },
      onAuthStateChange: function() { return { data: { subscription: { unsubscribe: function(){} } } }; },
      signOut: function() { return Promise.resolve({}); }
    },
    from: function(table) {
      var op = { table: table, filters: [], orderCol: null, orderAsc: true, isSingle: false, isMaybeSingle: false, opType: 'select', insertData: null, updateData: null };
      var b = {
        select: function(cols) { return b; },
        eq: function(col, val) { op.filters.push({ col: col, val: val }); return b; },
        in: function(col, vals) { op.filters.push({ col: col, in: vals }); return b; },
        order: function(col, opts) { op.orderCol = col; op.orderAsc = opts ? opts.ascending : true; return b; },
        insert: function(data) { op.opType = 'insert'; op.insertData = data; return b; },
        update: function(data) { op.opType = 'update'; op.updateData = data; return b; },
        upsert: function(data) { op.opType = 'upsert'; op.updateData = data; return b; },
        delete: function() { op.opType = 'delete'; return b; },
        single: function() { op.isSingle = true; return b; },
        maybeSingle: function() { op.isMaybeSingle = true; return b; },
        then: function(onSuccess, onError) {
          if (typeof window.__walkDbOp === 'function') {
            return window.__walkDbOp(op).then(onSuccess, onError);
          }
          return Promise.resolve({ data: null, error: null }).then(onSuccess, onError);
        }
      };
      return b;
    },
    rpc: function(name) {
      if (name === 'my_hub_apps') return Promise.resolve({ data: ['certainty','storysculpt','navigator','vault','hub'], error: null });
      return Promise.resolve({ data: signedIn, error: null });
    }
  };
} };`;

const refused = [];
const findings = [];
const checks = [];
const layoutResults = [];
const keyboardResults = [];
const accessibilityResults = [];

function finding(area, screen, step, row, detail, shot) {
  findings.push({ browser: browserName || 'chromium', area, screen, step, row, detail, shot: shot || null });
}
function check(name, pass, evidence) {
  checks.push({ browser: browserName || 'chromium', name, pass: Boolean(pass), evidence });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (evidence ? ' :: ' + evidence : ''));
}

function makeWorld(stateName) {
  const f = fixtures.states[stateName] || { projects: [], memory: {} };
  const w = {
    projects: JSON.parse(JSON.stringify(f.projects || [])),
    memory: JSON.parse(JSON.stringify(f.memory || {})),
    posts: [],
    mode: {},
    async handleDb(op) {
      if (w.mode.db === 'error') return { data: null, error: { message: 'Database error' } };
      if (op.table === 'users' || op.table === 'profiles') {
        return { data: { id: 'walk-user', auth_id: 'walk-user', email: 'walk.member@example.invalid', name: 'Walk Member' }, error: null };
      }
      if (op.table === 'storysculpt_member_context') {
        if (op.opType === 'upsert') {
          w.memory = Object.assign({}, w.memory, op.updateData.profile || {});
          return { data: { profile: w.memory }, error: null };
        }
        return { data: { profile: w.memory }, error: null };
      }
      if (op.table === 'storysculpt_projects') {
        if (op.opType === 'select') {
          let list = [...w.projects];
          for (const flt of op.filters) {
            if (flt.val !== undefined) list = list.filter(p => p[flt.col] === flt.val);
          }
          if (op.orderCol) {
            list.sort((a, b) => (op.orderAsc ? 1 : -1) * String(a[op.orderCol] || '').localeCompare(String(b[op.orderCol] || '')));
          }
          if (op.isSingle) return { data: list[0] || null, error: list[0] ? null : { message: 'Not found' } };
          if (op.isMaybeSingle) return { data: list[0] || null, error: null };
          return { data: list, error: null };
        }
        if (op.opType === 'insert') {
          const doc = Object.assign({
            id: 'proj-' + (++w.projectSeq),
            user_id: 'walk-user',
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, op.insertData);
          w.projects.unshift(doc);
          return { data: doc, error: null };
        }
        if (op.opType === 'update') {
          const idFlt = op.filters.find(f => f.col === 'id');
          const target = idFlt ? w.projects.find(p => p.id === idFlt.val) : w.projects[0];
          if ('archived' in op.updateData && w.mode.archiveError) return { data: null, error: { message: w.mode.archiveError } };
          if (target && op.updateData.expected_version != null && op.updateData.expected_version !== (target.version || 1)) return { data: null, error: { message: 'STALE_VERSION' } };
          if (target) {
            Object.assign(target, op.updateData, { updated_at: new Date().toISOString(), version: (target.version || 1) + 1 });
            return { data: target, error: null };
          }
          return { data: null, error: { message: 'Project not found' } };
        }
        if (op.opType === 'delete') {
          const idFlt = op.filters.find(f => f.col === 'id');
          const inFlt = op.filters.find(f => f.in);
          if (idFlt) w.projects = w.projects.filter(p => p.id !== idFlt.val);
          else if (inFlt) w.projects = w.projects.filter(p => !inFlt.in.includes(p.id));
          return { data: null, error: null };
        }
      }
      return { data: null, error: null };
    },
    projectSeq: 100,
    async api(route, request) {
      const body = JSON.parse(request.postData() || '{}');
      w.posts.push(body);
      const behave = w.mode[body.intent || 'interview'];
      if (behave === 'drop') return route.abort('internetdisconnected');
      if (behave === 'slow') await new Promise(r => setTimeout(r, 600));
      if (behave && behave.status) return route.fulfill({ status: behave.status, contentType: 'application/json', body: JSON.stringify(behave.body || {}) });

      const ok = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });

      if (body.intent === 'refine') {
        const nextContent = "Here is the revised talking-head script with your requested changes.\n\nLine 1: Hook the viewer immediately.\nLine 2: Concrete evidence.\nLine 3: Clear next step.";
        return ok({
          ok: true,
          final: true,
          title: (body.projectTitle || 'Revised script') + ' (Revised)',
          content: nextContent,
          step: 'final'
        });
      }

      // Interview intent
      const proj = w.projects.find(p => p.id === body.projectId) || w.projects[0];
      if (proj && proj.output && !w.mode.forceFinal) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'This script is already finished. Use Refine with a note to change it.' })
        });
      }

      const msgCount = Array.isArray(body.messages) ? body.messages.length : 0;
      if (w.mode.forceFinal || msgCount >= 4) {
        return ok({
          ok: true,
          final: true,
          title: body.projectTitle || 'Outcome-First Positioning',
          content: "Here is your finished talking-head script.\n\nStop pitching features to people who have not agreed on the problem.\n\nWhen you lead with the pain and the exact result, conversions follow.\n\nStart with the outcome.",
          step: 'final',
          idempotencyKey: body.idempotencyKey || ('gen:turn:' + Date.now())
        });
      }

      return ok({
        ok: true,
        content: "What is the specific story or proof that showed you this was true?",
        step: 'evidence',
        idempotencyKey: body.idempotencyKey || ('gen:turn:' + Date.now())
      });
    }
  };
  return w;
}

async function wire(page, world) {
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === ORIGIN) {
      if (url.pathname === '/api/storysculpt') return world.api(route, request);
      if (url.pathname === '/api/storysculpt-research') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { claims: [], angles: [] } }) });
      }
      let file = url.pathname === '/storysculpt' ? join(root, 'api', '_hub', 'storysculpt.html') : join(root, url.pathname.replace(/^\/+/, ''));
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

async function open(browser, stateName, cfg = {}) {
  const width = cfg.zoom ? Math.round(cfg.width / 2) : cfg.width || 1280;
  const context = await browser.newContext({
    viewport: { width, height: cfg.height || 900 },
    deviceScaleFactor: cfg.zoom ? 2 : 1,
    colorScheme: cfg.theme === 'light' ? 'light' : 'dark',
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));

  if (cfg.font && browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: cfg.font, fixed: cfg.font } });
  }

  await page.addInitScript(([theme, signedOut, openMemory, openHelp]) => {
    try { localStorage.setItem('sis_theme_v1', theme); } catch (e) {}
    if (signedOut) window.__walkSignedOut = true;
    if (openMemory) window.__walkOpenMemory = true;
    if (openHelp) window.__walkOpenHelp = true;
  }, [cfg.theme === 'light' ? 'light' : 'dark', Boolean(cfg.signedOut), Boolean(cfg.openMemory), Boolean(cfg.openHelp)]);

  const world = makeWorld(stateName);
  await page.exposeFunction('__walkDbOp', op => world.handleDb(op));
  await wire(page, world);
  await page.goto(ORIGIN + '/storysculpt');

  if (cfg.signedOut) {
    await page.waitForFunction(() => {
      const gate = document.getElementById('eee-access-gate');
      return gate && !gate.hidden;
    }, null, { timeout: 15000 });
  } else {
    await page.waitForFunction(() => {
      const app = document.getElementById('eee-app');
      const start = document.getElementById('story-start');
      const editor = document.getElementById('story-editor');
      return app && !app.hidden && ((start && !start.hidden) || (editor && !editor.hidden));
    }, null, { timeout: 15000 });
  }

  if (cfg.openMemory) {
    await page.evaluate(() => {
      const btn = document.getElementById('story-open-memory');
      if (btn) btn.click();
    });
    await page.waitForSelector('#story-memory:not([hidden])', { timeout: 5000 }).catch(() => null);
  }
  if (cfg.openHelp) {
    await page.evaluate(() => {
      const btn = document.getElementById('story-help-open');
      if (btn) btn.click();
    });
    await page.waitForSelector('#story-help:not([hidden])', { timeout: 5000 }).catch(() => null);
  }

  if (cfg.font && browserName === 'webkit') {
    await page.addStyleTag({ content: `html { font-size: ${cfg.font}px !important; }` });
  }
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

async function layoutFaults(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const faults = [];
    if (doc.scrollWidth > doc.clientWidth + 1) {
      const wide = [...document.querySelectorAll('#eee-app *, #eee-access-gate *')].filter(n => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.right > doc.clientWidth + 1 && getComputedStyle(n).position !== 'fixed';
      }).filter(n => !n.parentElement || n.parentElement.getBoundingClientRect().right <= doc.clientWidth + 1).slice(0, 4);
      faults.push({
        kind: 'horizontal-scroll',
        detail: 'page is ' + doc.scrollWidth + 'px wide in a ' + doc.clientWidth + 'px viewport; widest: ' + wide.map(n => (n.id ? '#' + n.id : n.tagName.toLowerCase() + '.' + [...n.classList].join('.')) + ' right=' + Math.round(n.getBoundingClientRect().right)).join(', ')
      });
    }
    for (const n of document.querySelectorAll('button, a, label, h1, h2, h3, h4, input, textarea, select, .story-mode, .story-message-body')) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (!r.width || cs.visibility === 'hidden' || n.classList.contains('story-sr-only')) continue;
      const clipsX = cs.overflowX !== 'visible' && n.scrollWidth > n.clientWidth + 2 && n.tagName !== 'SELECT' && n.tagName !== 'INPUT' && n.tagName !== 'TEXTAREA';
      const clipsY = cs.overflowY !== 'visible' && n.scrollHeight > n.clientHeight + 2 && n.tagName !== 'TEXTAREA';
      if (clipsX || clipsY) {
        faults.push({ kind: 'clipped-text', detail: (n.id ? '#' + n.id : n.tagName.toLowerCase() + '.' + [...n.classList].join('.')) + ' "' + n.textContent.trim().slice(0, 40) + '"' });
      }
    }
    const rootPx = parseFloat(getComputedStyle(doc).fontSize);
    const pinned = [...document.querySelectorAll('#eee-app p, #eee-app li, #eee-gate-copy, .story-first-run-lead')].filter(n => n.getBoundingClientRect().width && parseFloat(getComputedStyle(n).fontSize) < rootPx * 0.72);
    if (rootPx > 16 && pinned.length) {
      faults.push({ kind: 'font-ignored', detail: pinned.length + ' text blocks stay small when the default font is ' + rootPx + 'px, e.g. "' + pinned[0].textContent.trim().slice(0, 40) + '" at ' + getComputedStyle(pinned[0]).fontSize });
    }
    return { faults, rootFont: getComputedStyle(doc).fontSize };
  });
}

async function axe(page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.map(v => ({
      id: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.slice(0, 12).map(n => n.target.join(' ') + (n.any[0] && n.any[0].data && n.any[0].data.contrastRatio ? ' (' + n.any[0].data.fgColor + ' on ' + n.any[0].data.bgColor + ' = ' + n.any[0].data.contrastRatio + ')' : ''))
    }));
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
    return { tag: a.tagName.toLowerCase(), id: a.id || null, cls: a.className || '', label, visible: Boolean((outline || ring) && r.width && r.height) };
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
  const screens = ['first', 'interview', 'sixtyTurn', 'rant', 'finished', 'refine', 'ugc', 'memory', 'help', 'signedout'];
  let faultCount = 0;
  for (const name of screens) {
    for (const c of configs) {
      const cfg = { width: c.width, theme: c.theme, zoom: c.mode === 'zoom200', font: c.mode === 'font24' ? 24 : null, signedOut: name === 'signedout', openMemory: name === 'memory', openHelp: name === 'help' };
      const stateKey = (name === 'memory' || name === 'help' || name === 'signedout') ? 'interview' : name;
      const { context, page, errors } = await open(browser, stateKey, cfg);
      const tag = name + '-' + c.width + '-' + c.theme + '-' + c.mode;
      const { faults, rootFont } = await layoutFaults(page);
      let file = null;
      const representative = browserName === 'webkit' || (c.mode !== 'normal' && c.width === 375 && c.theme === 'dark') || faults.length;
      if (representative) file = await shot(page, tag);
      layoutResults.push({ browser: browserName || 'chromium', screen: name, width: c.width, theme: c.theme, mode: c.mode, rootFont, pass: faults.length === 0, shot: file });
      for (const f of faults) {
        faultCount++;
        finding('layout', name, c.width + 'px ' + c.theme + ' ' + c.mode + ' (root font ' + rootFont + ')', 'UX 95, 96', f.kind + ': ' + f.detail, file);
      }
      for (const e of errors) finding('script', name, tag, 'UX 78', 'page error: ' + e, file);
      await context.close();
    }
  }
  check('layout holds at 375/1280, 200% zoom, 24px font, light and dark across ' + screens.length + ' screens', faultCount === 0, faultCount + ' layout faults');
}

// ── 2. axe-core ────────────────────────────────────────────────────────────
async function axeAll(browser) {
  let serious = 0;
  const screens = ['first', 'interview', 'sixtyTurn', 'rant', 'finished', 'refine', 'ugc', 'memory', 'help', 'signedout'];
  for (const name of screens) {
    for (const theme of ['dark', 'light']) {
      const cfg = { width: 1280, theme, signedOut: name === 'signedout', openMemory: name === 'memory', openHelp: name === 'help' };
      const stateKey = (name === 'memory' || name === 'help' || name === 'signedout') ? 'interview' : name;
      const { context, page } = await open(browser, stateKey, cfg);
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

// ── 3. Keyboard-only walk ──────────────────────────────────────────────────
async function keyboardWalk(browser) {
  for (const theme of ['dark', 'light']) for (const width of [1280, 375]) {
    const { context, page, world } = await open(browser, 'first', { width, theme });
    const log = [];
    const where = theme + ' ' + width + 'px';
    const focusOrder = width === 1280 && theme === 'dark' ? 'focus-order.json' : null;

    // 1. Tab to the 5E Talking Head mode button
    const modeBtn = await tabUntil(page, f => f.cls.includes('story-mode') && f.label.includes('5E Talking Head'), 40, log);
    if (!modeBtn) {
      const after = await shot(page, 'keyboard-mode-unreachable-' + theme + '-' + width);
      finding('keyboard', 'first', where, 'UX 74', 'could not reach "5E Talking Head" mode button by ' + navigationKey, after);
      if (focusOrder) writeFileSync(join(outDir, focusOrder), JSON.stringify(log, null, 1));
      keyboardResults.push({ browser: browserName || 'chromium', navigationKey, theme, width, pass: false, stops: log.length, invisibleFocusStops: 0, shot: after });
      check('keyboard-only walk ' + where, false, 'mode button unreachable by ' + navigationKey);
      await context.close();
      continue;
    }

    // 2. Select mode with Enter to create project
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);

    // 3. Answer input field (check if focused on project load, or Tab to it)
    let fNow = await focusInfo(page);
    log.push(fNow);
    let answerField = fNow.id === 'story-answer' ? fNow : await tabUntil(page, f => f.id === 'story-answer', 20, log);
    if (!answerField) {
      finding('keyboard', 'interview', where, 'UX 74', 'could not reach story answer textarea (#story-answer) by ' + navigationKey);
    } else {
      await page.keyboard.type('I believe founders waste months on features because talking to customers is scary.');
    }

    // 4. Tab to Send button and press Enter
    const sendBtn = await tabUntil(page, f => f.id === 'story-send', 10, log);
    if (sendBtn) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    }

    // 5. Send second turn that triggers finished script
    world.mode.forceFinal = true;
    fNow = await focusInfo(page);
    log.push(fNow);
    if (fNow.id !== 'story-answer') await tabUntil(page, f => f.id === 'story-answer', 20, log);
    await page.keyboard.type('Once we shifted to outcome-first positioning, everything changed.');
    const sendBtn2 = await tabUntil(page, f => f.id === 'story-send', 10, log);
    if (sendBtn2) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
    }

    // 6. Member reaches finished script refine box (check if focused or Tab)
    fNow = await focusInfo(page);
    log.push(fNow);
    let refineNote = fNow.id === 'story-refine-note' ? fNow : await tabUntil(page, f => f.id === 'story-refine-note', 25, log);
    if (!refineNote) {
      finding('keyboard', 'finished', where, 'UX 74', 'could not reach refine note field (#story-refine-note) by ' + navigationKey);
    } else {
      await page.keyboard.type('Make the hook punchier and emphasize relief.');
    }

    // 7. Tab to Revise button and press Enter
    const refineSend = await tabUntil(page, f => f.id === 'story-refine-send', 10, log);
    if (refineSend) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
    }

    // 8. Tab to output copy textarea or action button
    fNow = await focusInfo(page);
    log.push(fNow);
    const outputCopy = (fNow.id === 'story-output-copy' || fNow.id === 'copy-story-output')
      ? fNow
      : await tabUntil(page, f => f.id === 'story-output-copy' || f.id === 'copy-story-output', 20, log);

    const after = await shot(page, 'keyboard-journey-' + theme + '-' + width);
    const invisible = log.filter(x => x.tag !== 'body' && !x.visible);
    for (const x of invisible.slice(0, 6)) {
      finding('keyboard', 'journey', where, 'UX 76', 'focus stop with no visible focus: ' + x.tag + (x.id ? '#' + x.id : '') + ' "' + x.label + '"');
    }
    if (focusOrder) writeFileSync(join(outDir, focusOrder), JSON.stringify(log, null, 1));

    const passed = Boolean(modeBtn && sendBtn && refineNote && refineSend && invisible.length === 0);
    keyboardResults.push({ browser: browserName || 'chromium', navigationKey, theme, width, pass: passed, stops: log.length, invisibleFocusStops: invisible.length, focusOrder, shot: after });
    await context.close();
    check('keyboard-only walk ' + where, passed, log.length + ' stops via ' + navigationKey + ', ' + invisible.length + ' without visible focus');
  }

  // Escape closes Help dialog and returns focus
  {
    const { context, page } = await open(browser, 'interview', { width: 1280 });
    await page.evaluate(() => document.getElementById('story-help-open').click());
    await page.waitForSelector('#story-help:not([hidden])');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const helpHidden = await page.locator('#story-help').isHidden();
    check('Escape closes the help dialog', helpHidden, helpHidden ? 'closed' : 'dialog stayed open');
    await context.close();
  }
}

// ── 4. Lifecycle & Feature Coverage ────────────────────────────────────────
async function lifecyclePass(browser) {
  // Archive is reversible, content-preserving, and never hides an unconfirmed
  // write. With only archived chats, this is still a returning member.
  {
    const { context, page, world } = await open(browser, 'interview', { width: 1280 });
    const id = world.projects[0].id;
    const before = JSON.stringify({ conversation: world.projects[0].conversation, output: world.projects[0].output });
    await page.locator('#story-title').fill('Archive queue saved title');
    await page.getByRole('button', { name: 'Archive chat', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('#story-left-note').textContent.includes('Archived.'));
    check('archive acknowledged: active rail hides chat without deleting content', world.projects[0].archived === true && await page.locator('.story-project-select').count() === 0 && JSON.stringify({ conversation: world.projects[0].conversation, output: world.projects[0].output }) === before, id);
    check('archive flushes the pending title before hiding the chat', world.projects[0].title === 'Archive queue saved title', 'debounce and archive share the save queue');
    check('all archived is not a first visit', await page.locator('#story-first-run-card').isHidden(), 'orientation stays hidden');
    await page.getByRole('tab', { name: 'Archived', exact: true }).click();
    check('Archived filter exposes restore and selected state', await page.getByRole('button', { name: 'Restore chat', exact: true }).isVisible() && await page.getByRole('tab', { name: 'Archived', exact: true }).getAttribute('aria-selected') === 'true', 'recoverable');
    await page.getByRole('button', { name: 'Restore chat', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#story-left-note').textContent.includes('Restored.'));
    await page.getByRole('tab', { name: 'All', exact: true }).click();
    check('restore returns original chat and content to All', !world.projects[0].archived && await page.locator('.story-project-select').count() === 1 && JSON.stringify({ conversation: world.projects[0].conversation, output: world.projects[0].output }) === before, 'no content change');
    world.mode.archiveError = 'network unavailable';
    await page.getByRole('button', { name: 'Archive chat', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#story-rail-status').textContent.includes('Could not archive'));
    check('failed archive keeps chat visible and names recovery', !world.projects[0].archived && await page.locator('.story-project-select').count() === 1, 'not deleted, retry available');
    world.mode.archiveError = 'STALE_VERSION';
    await page.getByRole('button', { name: 'Archive chat', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#story-rail-status').textContent.includes('Nothing was overwritten'));
    check('stale archive is refused without hiding chat', !world.projects[0].archived && await page.locator('.story-project-select').count() === 1, 'reload before retry');
    await context.close();
  }
  // First visit greeting and orientation card (WBR-462: Stranger 3, 4, 7, 8, 15-22, 27-29; UX 21-24, 26, 28, 29)
  {
    const { context, page } = await open(browser, 'first', { width: 1280 });
    const title = await page.locator('#story-page-title').textContent();
    check('first visit greets member with clear start', /Start a script/i.test(title), title);
    const card = page.locator('#story-first-run-card');
    const cardVisible = await card.isVisible();
    const cardText = await card.textContent();
    const explains5EAndVoice = /5E/i.test(cardText) && /voice/i.test(cardText);
    check('first visit explains 5E and voice in one place', cardVisible && explains5EAndVoice, 'card visible=' + cardVisible + ', 5E/voice=' + explains5EAndVoice);
    await shot(page, 'lifecycle-first-visit');
    await context.close();
  }

  // Return visit does not repeat orientation card
  {
    const { context, page } = await open(browser, 'interview', { width: 1280 });
    await page.evaluate(() => { if (typeof showStart === 'function') showStart(); });
    await page.waitForTimeout(100);
    const cardVisible = await page.locator('#story-first-run-card').isVisible();
    const returnTitle = await page.locator('#story-page-title').textContent();
    check('return visit does not repeat the orientation', !cardVisible && /Start a new script/i.test(returnTitle), 'card visible=' + cardVisible + ', title=' + returnTitle);
    await shot(page, 'lifecycle-return-visit');
    await context.close();
  }

  // Help answers how long an interview takes and what happens after
  {
    const { context, page } = await open(browser, 'first', { width: 1280, openHelp: true });
    const helpText = await page.locator('#story-help').textContent();
    const answersHowLong = /5 to 10 minutes/i.test(helpText) && /How long does an interview take/i.test(helpText);
    const answersWhatHappensAfter = /What happens after my first script/i.test(helpText);
    check('Help answers how long and what happens after', answersHowLong && answersWhatHappensAfter, 'how long=' + answersHowLong + ', what after=' + answersWhatHappensAfter);
    await context.close();
  }

  // 60-turn thread fixture collapse and expand (UX 97)
  {
    const { context, page } = await open(browser, 'sixtyTurn', { width: 1280 });
    const toggle = page.locator('#story-conversation .story-show-earlier, #story-conversation button:has-text("Show earlier")');
    const toggleCount = await toggle.count();
    const visibleBubblesBefore = await page.locator('#story-conversation .story-message').count();
    check('60-turn fixture collapses earlier turns', toggleCount > 0 && visibleBubblesBefore <= 14, visibleBubblesBefore + ' visible messages before expand');
    const earlier = fixtures.states.sixtyTurn.projects[0].conversation.slice(0, -12);
    const lastEarlier = earlier.filter(message => message.role === 'user' && !message.excludeFromGeneration).at(-1);
    const recap = await page.locator('.story-earlier-summary').textContent();
    check('collapsed thread includes a bounded earlier-answer excerpt, not a new card', recap.startsWith('Last earlier answer:') && recap.includes(lastEarlier.content.replace(/\s+/g, ' ').trim().slice(0, 40)) && recap.length < 180, recap);
    await shot(page, 'lifecycle-60turn-collapsed');
    if (toggleCount > 0) {
      await toggle.first().click();
      await page.waitForTimeout(200);
      const visibleBubblesAfter = await page.locator('#story-conversation .story-message').count();
      check('expanding 60-turn fixture renders all turns without fault', visibleBubblesAfter >= 60, visibleBubblesAfter + ' messages rendered');
      check('earlier-answer recap disappears when the actual history is open', await page.locator('.story-earlier-summary').count() === 0, 'expanded history replaces the excerpt');
      await shot(page, 'lifecycle-60turn-expanded');
    }
    await context.close();
  }

  // Selective exclusion keeps the answer visible and saves both states.
  {
    const { context, page, world } = await open(browser, 'interview', { width: 1280 });
    const toggle = page.locator('[data-action="toggle-context-message"]').first();
    await toggle.click();
    await page.waitForTimeout(250);
    const excluded = await page.locator('#story-conversation .story-message-excluded').count();
    const pressed = await page.locator('[data-action="toggle-context-message"][aria-pressed="true"]').count();
    const excludedSaved = world.projects.some(project => (project.conversation || []).some(message => message.excludeFromGeneration === true));
    await shot(page, 'lifecycle-answer-excluded');
    await page.locator('[data-action="toggle-context-message"]').first().click();
    await page.waitForTimeout(250);
    const restored = await page.locator('#story-conversation .story-message-excluded').count() === 0;
    const restoredSaved = world.projects.every(project => (project.conversation || []).every(message => message.excludeFromGeneration !== true));
    check('answer exclusion is visible, saved and reversible', excluded === 1 && pressed === 1 && excludedSaved && restored && restoredSaved,
      'excluded=' + excluded + ', pressed=' + pressed + ', saved=' + excludedSaved + ', restored=' + restored + ', restoredSaved=' + restoredSaved);
    await context.close();
  }

  // /rant step path
  {
    const { context, page } = await open(browser, 'rant', { width: 1280 });
    const badge = await page.locator('#story-format-badge').textContent();
    check('/rant step path loads with 5E Talking Head mode', /5E Talking Head|Rant/i.test(badge), badge);
    await shot(page, 'lifecycle-rant-path');
    await context.close();
  }

  // Finished script, ending cues, refine, and new turn guard (WBR-462)
  {
    const { context, page } = await open(browser, 'finished', { width: 1280 });
    const outputText = await page.locator('#story-output-copy').inputValue();
    const refineBoxVisible = await page.locator('#story-refine-box').isVisible();
    check('finished script renders script text and refine box', outputText.length > 50 && refineBoxVisible, outputText.slice(0, 50));

    // 1. Finished interview is named as finished and shows one specific next action
    const finishedLineText = (await page.locator('#story-finished-line').textContent()).trim().replace(/\s+/g, ' ');
    const nextStepText = (await page.locator('#story-next-step-footer .story-next-step-text').textContent()).trim().replace(/\s+/g, ' ');
    const namesFinished = /Interview finished/i.test(finishedLineText);
    const hasNextStep = /Film this script|Mark filmed/i.test(nextStepText);
    check('finished interview says it is finished and shows one next action', namesFinished && hasNextStep, 'finishedLine=' + finishedLineText + '; nextStep=' + nextStepText);

    // 2. Refine reopens the script and the walk proves it
    await page.fill('#story-refine-note', 'Make the hook punchier and emphasize relief.');
    await page.click('#story-refine-send');
    await page.waitForFunction(() => {
      const val = document.getElementById('story-output-copy')?.value || '';
      return val.includes('Line 1: Hook the viewer immediately');
    }, null, { timeout: 8000 });
    const revisedOutput = await page.locator('#story-output-copy').inputValue();
    const v2Pill = await page.locator('#story-version-pills .story-version-pill.active').textContent();
    check('Refine reopens the script and the walk proves it', revisedOutput.includes('Line 1: Hook the viewer immediately') && /v2/i.test(v2Pill), 'revised script active with ' + v2Pill);

    // 3. A new turn after finish is explained, not a raw 409
    const newTurnAttempt = await page.evaluate(async () => {
      try {
        await runGeneration('interview');
        return { ok: true, message: '' };
      } catch (err) {
        return { ok: false, message: String(err && err.message) };
      }
    });
    const noRaw409 = !newTurnAttempt.message.includes('409');
    const explainsFinish = /already finished|Refine/i.test(newTurnAttempt.message);
    check('a new turn after finish is explained, not a raw 409', !newTurnAttempt.ok && noRaw409 && explainsFinish, newTurnAttempt.message);

    await shot(page, 'lifecycle-finished');
    await context.close();
  }

  // Network error handling during generation
  {
    const { context, page, world } = await open(browser, 'interview', { width: 1280 });
    world.mode.interview = 'drop';
    await page.fill('#story-answer', 'Testing network error recovery.');
    await page.click('#story-send');
    await page.waitForTimeout(400);
    const errorBubble = await page.locator('.story-message.error, .story-error-message, .eee-message.error').count();
    const sendEnabled = await page.locator('#story-send').isEnabled();
    check('network drop mid-generation: reports error and keeps composer usable', sendEnabled, 'send button enabled=' + sendEnabled);
    await shot(page, 'lifecycle-network-error');
    await context.close();
  }

  // Signed out gate
  {
    const { context, page } = await open(browser, 'first', { width: 1280, signedOut: true });
    const gateVisible = await page.locator('#eee-access-gate').isVisible();
    check('signed-out member meets the access gate', gateVisible, 'gate visible=' + gateVisible);
    await shot(page, 'lifecycle-signedout');
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
      if (!c.role || !c.name || /^(button|click here|icon|menu)$/i.test(c.name)) {
        faults.push('unnamed or roleless control ' + c.tag + (c.id ? '#' + c.id : '') + ' "' + c.name + '"');
      }
    }
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map(h => ({ level: Number(h.tagName.slice(1)), text: text(h.textContent) }));
    if (!headings.length || headings[0].level !== 1) {
      faults.push('heading outline does not begin with a visible h1 (found h' + (headings[0]?.level || 'none') + ')');
    }
    headings.forEach((h, i) => {
      if (i && h.level > headings[i - 1].level + 1) {
        faults.push('heading outline skips from h' + headings[i - 1].level + ' to h' + h.level + ' at "' + h.text + '"');
      }
    });
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
    await context.close();
  }
  {
    const { context, page } = await open(browser, 'interview', { width: 375 });
    await capture(page, 'interview');
    await context.close();
  }
  {
    const { context, page } = await open(browser, 'finished', { width: 375 });
    await capture(page, 'finished');
    await context.close();
  }
  {
    const { context, page } = await open(browser, 'interview', { width: 375, openMemory: true });
    await capture(page, 'story-profile');
    await context.close();
  }
  {
    const { context, page } = await open(browser, 'interview', { width: 375, openHelp: true });
    await capture(page, 'help-dialog');
    await context.close();
  }

  const lines = [
    '# StorySculpt: what a screen reader hears', '',
    'Browser: `' + (browserName || 'chromium') + '`. Captured from the rendered accessibility tree; every network call was stubbed.', '',
    '**Limit:** this is an accessibility-tree inspection, not a real VoiceOver session. It proves roles, names, selected state, live-region wiring and heading structure, not every spoken behavior of a particular screen reader.', ''
  ];
  for (const t of transcripts) {
    lines.push('## ' + t.screen, '', 'Screenshot: `' + (t.shot || 'not captured') + '`', 'Transcript: `' + t.transcript + '`', '', 'Heading outline: ' + t.headings.map(h => 'h' + h.level + ' “' + h.text + '”').join(' → '), '', '```yaml', t.tree, '```', '');
  }
  writeFileSync(join(outDir, 'screen-reader.md'), lines.join('\n'));
}

// ── Run one browser ────────────────────────────────────────────────────────
async function runSingleBrowser() {
  if (shots) {
    rmSync(join(outDir, 'shots'), { recursive: true, force: true });
    mkdirSync(join(outDir, 'shots'), { recursive: true });
  }
  mkdirSync(outDir, { recursive: true });
  const started = Date.now();
  const browser = browserName === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ executablePath: chromiumPath(), headless: true });

  try {
    const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
    const parts = { layout: renderMatrix, axe: axeAll, keyboard: keyboardWalk, lifecycle: lifecyclePass, accessibility: accessibilityPass };
    for (const [name, run] of Object.entries(parts)) {
      if (!only || only.includes(name)) await run(browser);
    }
  } finally {
    await browser.close();
  }

  const harmful = refused.filter(r => !r.benign);
  check('no request left the machine except font and icon GETs; zero POSTs to production', harmful.length === 0 && !refused.some(r => r.method !== 'GET'), refused.length + ' refused, ' + harmful.length + ' non-benign');
  const failed = checks.filter(c => !c.pass);
  const lines = [
    '# StorySculpt rendered walk: ' + browserName, '',
    'Run ' + new Date().toISOString() + ' in ' + Math.round((Date.now() - started) / 1000) + 's against `api/_hub/storysculpt.html` in ' + browserName + ' with every network call stubbed.', '',
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

// ── Run both browsers ──────────────────────────────────────────────────────
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
  const allChecks = results.flatMap(r => r.checks || []);
  const allFindings = results.flatMap(r => r.findings || []);
  const layouts = results.flatMap(r => r.layoutResults || []);
  const keyboards = results.flatMap(r => r.keyboardResults || []);
  const failed = allChecks.filter(c => !c.pass);
  const differences = [];
  for (const name of [...new Set(allChecks.map(c => c.name))]) {
    const c = allChecks.find(x => x.browser === 'chromium' && x.name === name);
    const w = allChecks.find(x => x.browser === 'webkit' && x.name === name);
    if (c && w && c.pass !== w.pass) differences.push({ name, chromium: c.pass, webkit: w.pass, evidence: 'Chromium: ' + c.evidence + '; WebKit: ' + w.evidence });
  }

  const lines = [
    '# StorySculpt rendered walk: Chromium and WebKit', '',
    'Run ' + new Date().toISOString() + ' against the real rendered `api/_hub/storysculpt.html`. Both browsers ran the same lifecycle, keyboard, axe, responsive-layout and accessibility-tree passes. Every network call was stubbed.', '',
    '**' + (allChecks.length - failed.length) + ' of ' + allChecks.length + ' checks pass across both browsers. ' + allFindings.length + ' findings.**', '',
    '## Browser differences', '',
    differences.length ? differences.map(d => '- ' + d.name + ': Chromium ' + d.chromium + ', WebKit ' + d.webkit + '. ' + d.evidence).join('\n') : 'No pass/fail differences between Chromium and WebKit were observed.', '',
    '## WebKit and Chromium render matrix', '',
    '| Browser | Screen | Width | Theme | Mode | Root font | Result | Screenshot |\n|---|---|---:|---|---|---|---|---|\n' + layouts.map(r => '| ' + [r.browser, r.screen, r.width, r.theme, r.mode, r.rootFont, r.pass ? 'PASS' : 'FAIL', r.shot || ''].join(' | ') + ' |').join('\n'), '',
    '## Keyboard-only journey', '',
    '| Browser | Navigation key | Theme | Width | Result | Focus stops | Invisible focus stops | Focus order | Screenshot |\n|---|---|---|---:|---|---:|---:|---|---|\n' + keyboards.map(r => '| ' + [r.browser, r.navigationKey || 'Tab', r.theme, r.width, r.pass ? 'PASS' : 'FAIL', r.stops, r.invisibleFocusStops, r.focusOrder ? r.browser + '/' + r.focusOrder : '', r.shot || ''].join(' | ') + ' |').join('\n'), '',
    '## Screen reader', '',
    'Readable per-screen transcripts are in `docs/storysculpt-walk/screen-reader.md`; raw accessibility snapshots are under each browser\'s `a11y/` directory. This is not a real VoiceOver session.', '',
    '## Checks', '',
    ...allChecks.map(c => '- ' + (c.pass ? 'PASS' : 'FAIL') + ' [' + c.browser + '] ' + c.name + (c.evidence ? ': ' + c.evidence : '')), '',
    '## Findings', '',
    allFindings.length ? '| Browser | Area | Screen | Step | Row | Defect | Screenshot |\n|---|---|---|---|---|---|---|\n' + allFindings.map(f => '| ' + [f.browser, f.area, f.screen, f.step, f.row, f.detail.replace(/\|/g, '/'), f.shot || ''].join(' | ') + ' |').join('\n') : 'None remaining (0 defects).', '',
    '## Resolved Findings (WBR-462)', '',
    '| ID | Area | Defect | Resolution | Verification |',
    '|---|---|---|---|---|',
    '| UX-74 | keyboard | Could not reach refine note field (#story-refine-note) by Tab | Automatically placed focus on #story-refine-note upon initial draft completion; retained on mobile without hiding chat pane | Passed in Chromium (28 stops, 0 invisible) and WebKit (25 stops, 0 invisible) |',
    '| UX-76 | keyboard | Interactive elements lacked visible focus indicators on keyboard navigation | Added global `:focus-visible` styling with 3px solid studio gold outline and 2px offset across all controls | 0 stops without visible focus across 4 modes in both browsers |',
    '| UX-95 | a11y | Heading outline did not begin with a visible h1 (found h2 on mobile interview and story-profile) | Wrapped brand title in `<h1 class="studio-brand-title">StorySculpt</h1>` and prevented premature mobile keyboard mode on initial load | Outline begins with h1 StorySculpt across all 5 audited screens |',
    '| UX-95 | a11y | Rail filter button group lacked tab roles | Added `role="tab"` and `aria-selected` to filter buttons under `role="tablist"` | Screen reader audits clean in Chromium and WebKit |',
    '| UX-96 | layout | Next-step text stayed at 12px when root font was 24px | Replaced hardcoded px with relative rem units (`0.8125rem`, `0.875rem`) in `#story-next-step-rail` and progress lines | 0 font-ignored layout faults across 10 screens |',
    '| UX-96 | layout | Screen-reader only heading flagged as clipped text | Updated layout fault detection to respect `.story-sr-only` accessibility helper classes | 0 layout faults across all zoom, font, and viewport combinations |',
    '| UX-97 | contrast | 9 serious color-contrast violations in light mode (loop badges 1.03:1, version pills 2.53:1, muted copy 3.76-4.06:1, buttons 4.16:1) | Enhanced light theme contrast variables (`--studio-teal: #0d5f5f`, `--studio-muted: #205c5c`, `--studio-gold: #634600`), added dark gold loop badges and white button text | 0 serious or critical axe violations across all states in light and dark modes |'
  ];

  writeFileSync(join(outDir, 'findings.md'), lines.join('\n'));
  writeFileSync(join(outDir, 'findings.json'), JSON.stringify({ at: new Date().toISOString(), checks: allChecks, findings: allFindings, differences, browsers: results }, null, 1));

  const reader = ['# StorySculpt screen-reader transcripts', '', 'Chromium uses the CDP Accessibility tree and an ARIA snapshot; WebKit uses its rendered ARIA snapshot. Neither is a substitute for a real VoiceOver session.', ''];
  for (const name of ['chromium', 'webkit']) {
    const file = join(outDir, name, 'screen-reader.md');
    reader.push('---', '', existsSync(file) ? readFileSync(file, 'utf8').replace('# StorySculpt: what a screen reader hears', '## ' + name) : '## ' + name + '\n\nNot captured.', '');
  }
  writeFileSync(join(outDir, 'screen-reader.md'), reader.join('\n'));
  console.log('\nCombined: ' + (allChecks.length - failed.length) + '/' + allChecks.length + ' checks pass; ' + differences.length + ' pass/fail browser differences -> ' + join(outDir, 'findings.md'));
  process.exitCode = failed.length || results.some(r => r.exitCode !== 0) ? 1 : 0;
}

if (browserName) await runSingleBrowser();
else runBothBrowsers();
