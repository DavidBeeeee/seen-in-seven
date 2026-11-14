#!/usr/bin/env node
/**
 * WBR-462 (UX 99): Rendered-surface gate for StorySculpt.
 *
 * Renders every StorySculpt state in a real headless browser and fails if any
 * state exposes:
 *   1. Visible placeholder text (TODO, TBD, lorem ipsum, undefined, NaN,
 *      [object Object], {{template}}, [placeholder])
 *   2. Raw error text (TypeError, ReferenceError, PGRST*, SQLSTATE,
 *      409 Conflict, 500 Internal Server Error, stack traces, raw JSON errors)
 *   3. Duplicate primary actions in the active foreground surface (more than
 *      one visible .primary-button, or composer #story-send visible alongside
 *      a .primary-button in the main workspace)
 *
 * Also verifies its own detector against planted negative cases (planted raw
 * error, planted visible placeholder, planted duplicate primary action) before
 * certifying the clean surface.
 */

import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { homedir } from 'node:os';

const selfFile = fileURLToPath(import.meta.url);
const root = dirname(dirname(selfFile));
const defaultDeps = existsSync('/private/tmp/certainty-walk-deps/node_modules')
  ? '/private/tmp/certainty-walk-deps/node_modules'
  : join(root, 'node_modules');
const modules = process.env.WALK_NODE_MODULES || defaultDeps;
const req = createRequire(join(modules, 'noop.js'));
const { chromium } = req('playwright-core');

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

const ORIGIN = 'http://storysculpt.surface.test';
const fixtures = JSON.parse(readFileSync(join(root, 'scripts', 'sim', 'fixtures', 'storysculpt-states.json'), 'utf8'));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

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
        select: function() { return b; },
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

function makeWorld(stateName) {
  let f = fixtures.states[stateName] || fixtures.states.interview || { projects: [], memory: {} };
  if (stateName === 'lapsed') {
    const base = JSON.parse(JSON.stringify(fixtures.states.interview.projects[0]));
    base.id = 'proj-lapsed-1';
    base.title = 'Old Pottery Lesson';
    base.updated_at = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    f = {
      projects: [base],
      memory: JSON.parse(JSON.stringify(fixtures.states.interview.memory || {}))
    };
  }
  const w = {
    projects: JSON.parse(JSON.stringify(f.projects || [])),
    memory: JSON.parse(JSON.stringify(f.memory || {})),
    memory_updated_at: '2026-08-15T12:00:00.000Z',
    mode: {},
    projectSeq: 100,
    async handleDb(op) {
      if (w.mode.db === 'error') return { data: null, error: { message: 'Database error' } };
      if (op.table === 'users' || op.table === 'profiles') {
        return { data: { id: 'walk-user', auth_id: 'walk-user', email: 'walk.member@example.invalid', name: 'Walk Member' }, error: null };
      }
      if (op.table === 'storysculpt_member_context') {
        if (op.opType === 'upsert') {
          w.memory = Object.assign({}, w.memory, op.updateData.profile || {});
          w.memory_updated_at = new Date().toISOString();
          return { data: { profile: w.memory, updated_at: w.memory_updated_at }, error: null };
        }
        return { data: { profile: w.memory, updated_at: w.memory_updated_at }, error: null };
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
          const idFlt = op.filters.find(flt => flt.col === 'id');
          const target = idFlt ? w.projects.find(p => p.id === idFlt.val) : w.projects[0];
          if (target) {
            const payload = { ...op.updateData };
            const hasExpected = payload.expected_version != null;
            if (hasExpected && payload.expected_version !== (target.version || 1)) {
              return { data: null, error: { message: 'STALE_VERSION' } };
            }
            delete payload.expected_version;
            Object.assign(target, payload, {
              updated_at: new Date().toISOString(),
              version: hasExpected ? (target.version || 1) + 1 : (target.version || 1)
            });
            return { data: target, error: null };
          }
          return { data: null, error: { message: 'Project not found' } };
        }
        if (op.opType === 'delete') {
          const idFlt = op.filters.find(flt => flt.col === 'id');
          if (idFlt) w.projects = w.projects.filter(p => p.id !== idFlt.val);
          return { data: null, error: null };
        }
      }
      return { data: null, error: null };
    },
    async api(route, request) {
      const body = JSON.parse(request.postData() || '{}');
      const behave = w.mode[body.intent || 'interview'];
      if (behave === 'drop') return route.abort('internetdisconnected');
      if (behave && behave.status) {
        return route.fulfill({
          status: behave.status,
          contentType: 'application/json',
          body: JSON.stringify(behave.body || {})
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          content: 'What is the specific story or proof that showed you this was true?',
          step: 'B3',
          idempotencyKey: body.idempotencyKey || ('gen:turn:' + Date.now())
        })
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
      const file = url.pathname === '/storysculpt'
        ? join(root, 'api', '_hub', 'storysculpt.html')
        : join(root, url.pathname.replace(/^\/+/, ''));
      if (!file.startsWith(root) || !existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    }
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('supabase-js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: SUPABASE_STUB });
    }
    if (url.hostname === 'unpkg.com' && url.pathname.includes('lucide')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.lucide = { createIcons: function(){} };' });
    }
    return route.abort('blockedbyclient');
  });
}

async function openState(browser, stateName) {
  const signedOut = stateName === 'signedout';
  const baseState = ['ugc-entry', 'ugc-experience', 'ugc-angles', 'ugc-review'].includes(stateName)
    ? 'ugc'
    : (['memory', 'help', 'delete-dialog', 'interrupted-error', 'save-failed', 'signedout'].includes(stateName) ? 'interview' : stateName);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  await page.addInitScript(([isSignedOut]) => {
    try { localStorage.setItem('sis_theme_v1', 'dark'); } catch {}
    if (isSignedOut) window.__walkSignedOut = true;
  }, [signedOut]);

  const world = makeWorld(baseState);
  await page.exposeFunction('__walkDbOp', op => world.handleDb(op));
  await wire(page, world);
  await page.goto(ORIGIN + '/storysculpt');

  if (signedOut) {
    await page.waitForFunction(() => {
      const gate = document.getElementById('eee-access-gate');
      return gate && !gate.hidden;
    }, null, { timeout: 10000 });
    return { context, page, world };
  }

  await page.waitForFunction(() => {
    const app = document.getElementById('eee-app');
    const start = document.getElementById('story-start');
    const editor = document.getElementById('story-editor');
    return app && !app.hidden && ((start && !start.hidden) || (editor && !editor.hidden));
  }, null, { timeout: 10000 });

  // Wait for the saved project to open before injecting a fault or clicking its controls.
  // The start screen can briefly be visible while that asynchronous read finishes.
  if (world.projects.length) await page.waitForSelector('#story-editor:not([hidden])', { timeout: 10000 });

  if (stateName === 'ugc-entry') {
    await page.evaluate(() => {
      document.getElementById('ugc-step-entry').hidden = false;
      document.getElementById('ugc-step-experience').hidden = true;
      document.getElementById('ugc-step-angles').hidden = true;
      document.getElementById('ugc-step-review').hidden = true;
    });
  } else if (stateName === 'ugc-experience') {
    await page.evaluate(() => {
      document.getElementById('ugc-step-entry').hidden = true;
      document.getElementById('ugc-step-experience').hidden = false;
      document.getElementById('ugc-step-angles').hidden = true;
      document.getElementById('ugc-step-review').hidden = true;
    });
  } else if (stateName === 'ugc-angles') {
    await page.evaluate(() => {
      document.getElementById('ugc-step-entry').hidden = true;
      document.getElementById('ugc-step-experience').hidden = true;
      document.getElementById('ugc-step-angles').hidden = false;
      document.getElementById('ugc-step-review').hidden = true;
    });
  } else if (stateName === 'ugc-review') {
    await page.evaluate(() => {
      document.getElementById('ugc-step-entry').hidden = true;
      document.getElementById('ugc-step-experience').hidden = true;
      document.getElementById('ugc-step-angles').hidden = true;
      document.getElementById('ugc-step-review').hidden = false;
    });
  } else if (stateName === 'memory') {
    await page.click('#story-open-memory');
    await page.waitForSelector('#story-memory:not([hidden])', { timeout: 5000 });
  } else if (stateName === 'help') {
    await page.click('#eee-account-button');
    await page.click('#story-help-open');
    await page.waitForSelector('#story-help:not([hidden])', { timeout: 5000 });
  } else if (stateName === 'delete-dialog') {
    await page.click('[data-action="delete-project"]');
    await page.waitForSelector('#story-delete-dialog-backdrop:not([hidden])', { timeout: 5000 });
  } else if (stateName === 'interrupted-error') {
    world.mode.interview = {
      status: 502,
      body: { error: 'The writing attempt did not finish.' }
    };
    await page.fill('#story-answer', 'I kept undercharging until a client told me my rate made them nervous.');
    await page.click('#story-send');
    await page.waitForSelector('#story-retry-btn', { timeout: 5000 });
  } else if (stateName === 'save-failed') {
    world.mode.db = 'error';
    await page.click('#story-notes-toggle');
    await page.fill('#story-title', 'Edited under save failure');
    await page.waitForTimeout(1900);
  }

  return { context, page, world };
}

/**
 * Runs inside the browser page to inspect the rendered visible surface.
 */
function scanRenderedSurfaceInPage() {
  const PLACEHOLDER_PATTERNS = [
    { name: 'todo-marker', re: /\b(?:TODO|TBD|FIXME|XXX)\b/ },
    { name: 'lorem-ipsum', re: /\blorem\s+ipsum\b/i },
    { name: 'undefined-token', re: /\bundefined\b/ },
    { name: 'nan-token', re: /\bNaN\b/ },
    { name: 'object-string', re: /\[object\s+[A-Za-z0-9_]+\]/ },
    { name: 'mustache-placeholder', re: /\{\{[^}]+\}\}/ },
    { name: 'bracket-placeholder', re: /\[placeholder[^\]]*\]|<placeholder>/i }
  ];

  const RAW_ERROR_PATTERNS = [
    { name: 'js-runtime-error', re: /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|AggregateError)\s*:/ },
    { name: 'db-or-network-code', re: /\b(?:PGRST\d+|SQLSTATE\[?[A-Z0-9]+\]?|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|ERR_[A-Z0-9_]+)\b/ },
    { name: 'raw-http-status', re: /\b(?:500 Internal Server Error|502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout|409 Conflict|status code \d{3})\b/i },
    { name: 'stack-trace', re: /\bat\s+[A-Za-z0-9_$.<>]+\s*\([^)]*:\d+:\d+\)/ },
    { name: 'raw-json-error', re: /\{\s*"(?:error|statusCode|stack|code)"\s*:/ }
  ];

  function isElementVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.closest('[hidden], [aria-hidden="true"], .story-sr-only, template, script, style')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function selectorFor(el) {
    if (!el) return '';
    if (el.id) return '#' + el.id;
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return el.tagName.toLowerCase() + cls;
  }

  const findings = [];

  // 1 & 2. Walk visible text nodes and form control values/placeholders
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    if (node instanceof Element && isElementVisible(node)) {
      const directText = Array.from(node.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.nodeValue || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const valueText = (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
        ? String(node.value || '').replace(/\s+/g, ' ').trim()
        : '';
      const attrPlaceholder = (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
        ? String(node.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim()
        : '';

      for (const sample of [
        { source: 'text', text: directText },
        { source: 'value', text: valueText },
        { source: 'placeholder-attr', text: attrPlaceholder }
      ]) {
        if (!sample.text) continue;
        for (const pat of PLACEHOLDER_PATTERNS) {
          if (pat.re.test(sample.text)) {
            findings.push({
              kind: 'visible-placeholder',
              rule: pat.name,
              selector: selectorFor(node),
              source: sample.source,
              excerpt: sample.text.slice(0, 140)
            });
          }
        }
        for (const pat of RAW_ERROR_PATTERNS) {
          if (pat.re.test(sample.text)) {
            findings.push({
              kind: 'raw-error',
              rule: pat.name,
              selector: selectorFor(node),
              source: sample.source,
              excerpt: sample.text.slice(0, 140)
            });
          }
        }
      }
    }
    node = walker.nextNode();
  }

  // 3. Duplicate primary action check within the active foreground surface
  const deleteDialog = document.getElementById('story-delete-dialog');
  const helpDialog = document.getElementById('story-help');
  const memoryPanel = document.getElementById('story-memory');
  const accessGate = document.getElementById('eee-access-gate');
  const mainWorkspace = document.querySelector('.story-main') || document.getElementById('story-workspace');

  let activeSurface = mainWorkspace;
  let surfaceName = 'story-main';
  if (deleteDialog && isElementVisible(deleteDialog)) {
    activeSurface = deleteDialog;
    surfaceName = 'story-delete-dialog';
  } else if (helpDialog && isElementVisible(helpDialog)) {
    activeSurface = helpDialog;
    surfaceName = 'story-help';
  } else if (memoryPanel && isElementVisible(memoryPanel)) {
    activeSurface = memoryPanel;
    surfaceName = 'story-memory';
  } else if (accessGate && isElementVisible(accessGate)) {
    activeSurface = accessGate;
    surfaceName = 'eee-access-gate';
  }

  if (activeSurface) {
    const primaryButtons = Array.from(
      activeSurface.querySelectorAll('.primary-button, button.story-send[type="submit"]')
    ).filter(isElementVisible);

    if (primaryButtons.length > 1) {
      findings.push({
        kind: 'duplicate-primary-action',
        rule: 'multiple-primary-buttons',
        surface: surfaceName,
        selectors: primaryButtons.map(selectorFor),
        labels: primaryButtons.map(b => (b.textContent || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      });
    }

    const actionContainers = Array.from(
      activeSurface.querySelectorAll('.ugc-actions-row, .story-refine-inner, .story-artifact-actions, .story-next-actions, .story-dialog-actions, .story-memory-foot-actions')
    ).filter(isElementVisible);

    for (const group of actionContainers) {
      const seenLabels = new Map();
      const buttons = Array.from(group.querySelectorAll('button, a.primary-button, a.secondary-button')).filter(isElementVisible);
      for (const btn of buttons) {
        const label = (btn.textContent || btn.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!label) continue;
        if (seenLabels.has(label)) {
          findings.push({
            kind: 'duplicate-primary-action',
            rule: 'duplicate-action-label',
            surface: selectorFor(group),
            selectors: [seenLabels.get(label), selectorFor(btn)],
            labels: [label]
          });
        } else {
          seenLabels.set(label, selectorFor(btn));
        }
      }
    }
  }

  return {
    surfaceName,
    findings
  };
}

async function main() {
  const args = process.argv.slice(2);
  const plantArg = args.includes('--plant') ? (args[args.indexOf('--plant') + 1] || 'raw-error') : null;
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });

  const STATES = [
    'first',
    'interview',
    'sixtyTurn',
    'rant',
    'finished',
    'refine',
    'ugc-entry',
    'ugc-experience',
    'ugc-angles',
    'ugc-review',
    'memory',
    'help',
    'delete-dialog',
    'interrupted-error',
    'save-failed',
    'lapsed',
    'signedout'
  ];

  const stateResults = [];
  let plantedChecksPassed = false;

  try {
    if (plantArg) {
      const { context, page } = await openState(browser, 'finished');
      await page.evaluate((mode) => {
        const el = document.getElementById('story-refine-status');
        el.hidden = false;
        if (mode === 'visible-placeholder' || mode === 'placeholder') {
          el.textContent = 'Draft for {{member_name}} — TODO replace [object Object]';
        } else if (mode === 'duplicate-primary-action' || mode === 'duplicate-primary') {
          const extraPrimary = document.createElement('button');
          extraPrimary.className = 'primary-button';
          extraPrimary.id = 'planted-duplicate-primary';
          extraPrimary.textContent = 'Publish now';
          document.querySelector('.story-refine-inner').appendChild(extraPrimary);
        } else {
          el.textContent = 'PGRST116: 409 Conflict — TypeError: Cannot read properties of undefined';
        }
      }, plantArg);
      const plantedScan = await page.evaluate(scanRenderedSurfaceInPage);
      await context.close();
      console.error(JSON.stringify({
        ok: plantedScan.findings.length === 0,
        planted: plantArg,
        findings: plantedScan.findings
      }, null, 2));
      process.exitCode = plantedScan.findings.length > 0 ? 1 : 0;
      return;
    }

    // Step 1: Verify the gate fails on planted violations (raw error, visible placeholder, duplicate primary action)
    {
      const { context, page } = await openState(browser, 'finished');

      // Plant 1: Raw error text
      await page.evaluate(() => {
        const el = document.getElementById('story-refine-status');
        el.hidden = false;
        el.textContent = 'PGRST116: 409 Conflict — TypeError: Cannot read properties of undefined';
      });
      const rawErrorScan = await page.evaluate(scanRenderedSurfaceInPage);
      const caughtRawError = rawErrorScan.findings.some(f => f.kind === 'raw-error');

      // Plant 2: Visible placeholder
      await page.evaluate(() => {
        const el = document.getElementById('story-refine-status');
        el.textContent = 'Draft for {{member_name}} — TODO replace [object Object]';
      });
      const placeholderScan = await page.evaluate(scanRenderedSurfaceInPage);
      const caughtPlaceholder = placeholderScan.findings.some(f => f.kind === 'visible-placeholder');

      // Plant 3: Duplicate primary action in active surface
      await page.evaluate(() => {
        const el = document.getElementById('story-refine-status');
        el.textContent = '';
        const extraPrimary = document.createElement('button');
        extraPrimary.className = 'primary-button';
        extraPrimary.id = 'planted-duplicate-primary';
        extraPrimary.textContent = 'Publish now';
        document.querySelector('.story-refine-inner').appendChild(extraPrimary);
      });
      const dupPrimaryScan = await page.evaluate(scanRenderedSurfaceInPage);
      const caughtDupPrimary = dupPrimaryScan.findings.some(f => f.kind === 'duplicate-primary-action');

      await context.close();

      if (!caughtRawError || !caughtPlaceholder || !caughtDupPrimary) {
        console.error(JSON.stringify({
          ok: false,
          reason: 'Planted violation self-check failed to trip the surface gate',
          caughtRawError,
          caughtPlaceholder,
          caughtDupPrimary
        }, null, 2));
        process.exitCode = 1;
        return;
      }
      plantedChecksPassed = true;
    }

    // Step 2: Scan every real StorySculpt state
    for (const state of STATES) {
      const { context, page } = await openState(browser, state);
      const scan = await page.evaluate(scanRenderedSurfaceInPage);
      stateResults.push({
        state,
        surface: scan.surfaceName,
        ok: scan.findings.length === 0,
        findings: scan.findings
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const failedStates = stateResults.filter(r => !r.ok);
  const summary = {
    ok: plantedChecksPassed && failedStates.length === 0,
    plantedSelfCheck: {
      ok: plantedChecksPassed,
      cases: ['raw-error', 'visible-placeholder', 'duplicate-primary-action']
    },
    statesChecked: stateResults.length,
    statesPassed: stateResults.filter(r => r.ok).length,
    failedStates
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

export { chromium, chromiumPath, openState };

if (process.argv[1] === selfFile) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
