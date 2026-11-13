// StorySculpt real screen-reader pass (WBR-462: UX 95, 74, 76).
//
// storysculpt-walk.mjs proves roles, names and live-region wiring from the
// accessibility tree. This one listens to VoiceOver itself, the way
// certainty-voiceover.mjs does for Certainty. It opens the real
// api/_hub/storysculpt.html in a visible WebKit window with a stubbed world
// (no request leaves the machine, nothing reaches the model or the database),
// drives VoiceOver over AppleScript, and records what VoiceOver actually spoke
// over the interview: start, answer, generate, finish, refine, delete, and a
// send that loses the network.
//
// Needs macOS with VoiceOver running and "Allow VoiceOver to be controlled
// with AppleScript" on (VoiceOver Utility, General). The script never changes
// that setting. VoiceOver speaks aloud and the test window must stay in
// front, so run it when nobody is using the Mac. Needs playwright-core, which
// is not a product dependency:
//   WALK_NODE_MODULES=/path/to/node_modules node scripts/sim/storysculpt-voiceover.mjs
// Writes docs/storysculpt-walk/voiceover.json and replaces the VoiceOver
// section of docs/storysculpt-walk/screen-reader.md.

import { createRequire } from 'node:module';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const defaultDeps = existsSync('/private/tmp/certainty-walk-deps/node_modules') ? '/private/tmp/certainty-walk-deps/node_modules' : join(root, 'node_modules');
const modules = process.env.WALK_NODE_MODULES || defaultDeps;
const { webkit } = createRequire(join(modules, 'noop.js'))('playwright-core');
const outFile = join(root, 'docs', 'storysculpt-walk', 'voiceover.json');
const mdFile = join(root, 'docs', 'storysculpt-walk', 'screen-reader.md');
const ORIGIN = 'http://storysculpt.walk.test';
const fixtures = JSON.parse(readFileSync(join(root, 'scripts', 'sim', 'fixtures', 'storysculpt-states.json'), 'utf8'));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

// ── VoiceOver over AppleScript ─────────────────────────────────────────────
function osa(script) {
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('osascript: ' + (r.stderr || '').trim());
  return (r.stdout || '').trim();
}
// --dry walks the same steps headless with VoiceOver silent, to prove the
// flow and selectors before a real pass; its transcript has no speech.
const DRY = process.argv.includes('--dry');
const vo = body => DRY ? '' : osa('tell application "VoiceOver"\n' + body + '\nend tell');
// VoiceOver reads whatever app is in front. If that is not the test window,
// stop: a transcript of some other window is wrong and may be private.
const frontmost = () => osa('tell application "System Events" to get name of first process whose frontmost is true');
function bringForward() {
  if (DRY) return;
  for (let i = 0; i < 10; i += 1) {
    try { osa('tell application "System Events" to set frontmost of first process whose name is "Playwright" to true'); } catch {}
    spawnSync('sleep', ['0.4']);
    if (frontmost() === 'Playwright') return;
  }
  throw new Error('The Playwright window would not come to the front (frontmost: ' + frontmost() + '). Stopping rather than recording another window.');
}
const lastPhrase = () => {
  if (DRY) return '';
  if (frontmost() !== 'Playwright') throw new Error('Focus left the test window (frontmost: ' + frontmost() + '). Stopping rather than recording another window.');
  return vo('return content of last phrase');
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function listen(ms = 1600) {
  const heard = [];
  for (let t = 0; t < ms; t += 200) {
    await sleep(200);
    const p = lastPhrase();
    if (p && heard[heard.length - 1] !== p) heard.push(p);
  }
  return heard;
}

// Someone at the keyboard would have the screen taken and talked over. The
// 11-01 evening found David active and did not start; this keeps that rule.
function idleSeconds() {
  const r = spawnSync('ioreg', ['-c', 'IOHIDSystem'], { encoding: 'utf8' });
  const m = (r.stdout || '').match(/"HIDIdleTime" = (\d+)/);
  return m ? Math.floor(Number(m[1]) / 1e9) : 0;
}

function preflight() {
  if (DRY) return;
  if (!existsSync('/private/var/db/Accessibility/.VoiceOverAppleScriptEnabled')) {
    throw new Error('VoiceOver AppleScript control is off (VoiceOver Utility, General). Not changing it.');
  }
  const idle = idleSeconds();
  if (idle < 300 && !process.argv.includes('--attended')) {
    throw new Error('The Mac was in use ' + idle + ' s ago. VoiceOver would take the screen and speak over that person; rerun when idle, or pass --attended when the person running it is watching.');
  }
  if (spawnSync('pgrep', ['-x', 'VoiceOver']).status !== 0) {
    spawnSync('open', ['-a', 'VoiceOver']);
    spawnSync('sleep', ['3']);
  }
  vo('output "StorySculpt screen reader pass starting"');
}

// ── The walk's stubbed world (same fixtures, same refusal of the network) ──
const SUPABASE_STUB = `
window.supabase = { createClient: function () {
  var session = { access_token: 'walk-token', user: { id: 'walk-user', email: 'walk.member@example.invalid' } };
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
        then: function(onSuccess, onError) { return window.__walkDbOp(op).then(onSuccess, onError); }
      };
      return b;
    },
    rpc: function(name) {
      if (name === 'my_hub_apps') return Promise.resolve({ data: ['certainty','storysculpt','navigator','vault','hub'], error: null });
      return Promise.resolve({ data: true, error: null });
    }
  };
} };`;

const refused = [];
function makeWorld(stateName) {
  const f = fixtures.states[stateName] || { projects: [], memory: {} };
  const w = {
    projects: JSON.parse(JSON.stringify(f.projects || [])),
    memory: JSON.parse(JSON.stringify(f.memory || {})),
    posts: [], mode: {}, seq: 100,
    async db(op) {
      if (op.table === 'users' || op.table === 'profiles') return { data: { id: 'walk-user', auth_id: 'walk-user', email: 'walk.member@example.invalid', name: 'Walk Member' }, error: null };
      if (op.table === 'storysculpt_member_context') {
        if (op.opType === 'upsert') w.memory = Object.assign({}, w.memory, op.updateData.profile || {});
        return { data: { profile: w.memory, updated_at: '2026-08-15T12:00:00.000Z' }, error: null };
      }
      if (op.table !== 'storysculpt_projects') return { data: null, error: null };
      const idFlt = op.filters.find(x => x.col === 'id');
      if (op.opType === 'select') {
        let list = [...w.projects];
        for (const flt of op.filters) if (flt.val !== undefined) list = list.filter(p => p[flt.col] === flt.val);
        if (op.orderCol) list.sort((a, b) => (op.orderAsc ? 1 : -1) * String(a[op.orderCol] || '').localeCompare(String(b[op.orderCol] || '')));
        if (op.isSingle) return { data: list[0] || null, error: list[0] ? null : { message: 'Not found' } };
        if (op.isMaybeSingle) return { data: list[0] || null, error: null };
        return { data: list, error: null };
      }
      if (op.opType === 'insert') {
        const now = new Date().toISOString();
        const doc = Object.assign({ id: 'proj-' + (++w.seq), user_id: 'walk-user', version: 1, created_at: now, updated_at: now }, op.insertData);
        w.projects.unshift(doc);
        return { data: doc, error: null };
      }
      if (op.opType === 'update') {
        const target = idFlt ? w.projects.find(p => p.id === idFlt.val) : w.projects[0];
        if (!target) return { data: null, error: { message: 'Project not found' } };
        Object.assign(target, op.updateData, { updated_at: new Date().toISOString(), version: (target.version || 1) + 1 });
        return { data: target, error: null };
      }
      if (op.opType === 'delete') {
        const inFlt = op.filters.find(x => x.in);
        w.projects = w.projects.filter(p => idFlt ? p.id !== idFlt.val : !(inFlt && inFlt.in.includes(p.id)));
      }
      return { data: null, error: null };
    },
    async api(route, request) {
      const body = JSON.parse(request.postData() || '{}');
      w.posts.push(body);
      const behave = w.mode[body.intent || 'interview'];
      if (behave === 'drop') return route.abort('internetdisconnected');
      const ok = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (body.intent === 'refine') {
        return ok({ ok: true, final: true, title: (body.projectTitle || 'Revised script') + ' (Revised)', step: 'final',
          content: 'Here is the revised talking-head script with your requested changes.\n\nStop pitching features to people who have not agreed on the problem.\n\nStart with the relief they feel when it is gone.' });
      }
      const count = Array.isArray(body.messages) ? body.messages.length : 0;
      if (count >= 4) {
        return ok({ ok: true, final: true, title: body.projectTitle || 'Outcome-First Positioning', step: 'final', idempotencyKey: body.idempotencyKey,
          content: 'Here is your finished talking-head script.\n\nStop pitching features to people who have not agreed on the problem.\n\nWhen you lead with the pain and the exact result, conversions follow.\n\nStart with the outcome.' });
      }
      return ok({ ok: true, step: 'evidence', idempotencyKey: body.idempotencyKey, content: 'What is the specific story or proof that showed you this was true?' });
    }
  };
  return w;
}
async function wire(page, world) {
  await page.exposeFunction('__walkDbOp', op => world.db(op));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === ORIGIN) {
      if (url.pathname === '/api/storysculpt') return world.api(route, request);
      if (url.pathname === '/api/storysculpt-research') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"data":{"claims":[],"angles":[]}}' });
      const file = url.pathname === '/storysculpt' ? join(root, 'api', '_hub', 'storysculpt.html') : join(root, url.pathname.replace(/^\/+/, ''));
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
let stoppedAt = null;
let screen = null;
const log = (step, heard, extra = {}) => {
  transcript.push({ screen, step, heard, ...extra });
  console.log('[' + screen + '] ' + step + '\n   ' + heard.join('\n   '));
};
async function open(browser, stateName) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 880 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('sis_theme_v1', 'light'); } catch (e) {} });
  const world = makeWorld(stateName);
  await wire(page, world);
  await page.goto(ORIGIN + '/storysculpt');
  await page.waitForFunction(() => {
    const app = document.getElementById('eee-app');
    const start = document.getElementById('story-start');
    const editor = document.getElementById('story-editor');
    return app && !app.hidden && ((start && !start.hidden) || (editor && !editor.hidden));
  }, null, { timeout: 15000 });
  await page.bringToFront();
  bringForward();
  await sleep(1000);
  await enterPage(page);
  return { context, page, world };
}
async function enterPage(page, selector = 'a[href="/"]') {
  for (let i = 0; i < 3; i += 1) {
    vo('tell vo cursor to move into item');
    await sleep(500);
    await page.focus(selector);
    const heard = await listen(1000);
    if (!heard.some(p => /web content|toolbar/.test(p) && !/link|button/.test(p))) return;
  }
}
let activePage = null;
async function focus(page, selector, step) {
  activePage = page;
  await page.focus(selector);
  log(step || 'focus ' + selector, await listen(1400));
}
async function activate(step, ms = 2400) {
  if (DRY) await activePage.keyboard.press('Enter');
  vo('tell vo cursor to perform action');
  log(step, await listen(ms));
}
// The VoiceOver cursor does not always follow keyboard focus into a dialog.
// Read what is under it and step right until it is the wanted control; stop
// with a named error rather than acting on the wrong item.
const underCursor = () => (DRY ? '' : vo('return text under cursor of vo cursor'));
async function waitForVoCursor(pattern, label, max = 8) {
  if (DRY) return;
  for (let i = 0; i < max; i += 1) {
    await sleep(400);
    const text = underCursor() || lastPhrase();
    if (pattern.test(text)) { log('VoiceOver cursor on ' + label, [text]); return; }
    vo('tell vo cursor to move right');
  }
  throw new Error('The VoiceOver cursor never reached ' + label);
}
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
  await page.keyboard.type(text, { delay: 15 });
  log(step, await listen(1200));
}
const state = page => page.evaluate(() => ({
  status: (document.getElementById('story-generation-status') || {}).textContent || '',
  live: (document.getElementById('story-latest-live') || {}).textContent || '',
  focus: document.activeElement && (document.activeElement.id || document.activeElement.getAttribute('data-action') || document.activeElement.tagName),
  finished: Boolean(document.getElementById('story-output') && !document.getElementById('story-output').hidden)
}));

async function run() {
  preflight();
  const browser = await webkit.launch({ headless: DRY });
  try {
    // First visit: read the start screen, then start a script with VoiceOver.
    screen = 'start';
    let { context, page, world } = await open(browser, 'first');
    vo('tell vo cursor to move to first item');
    log('VO to the first item', await listen(900));
    await readOn('VO-Right through the first-visit screen', 60, /UGC \/ Product Video/);
    await focus(page, '[data-mode="rant"]', 'focus the 5E Talking Head format');
    await activate('VO-Space on 5E Talking Head: what is announced as the chat opens', 3200);
    log('after start', [], await state(page));

    // Answer twice; the second answer completes the interview.
    screen = 'answer';
    await typeInto(page, '#story-answer', 'Most coaches pitch features before anyone agrees there is a problem.', 'type the first answer');
    await focus(page, '#story-send', 'focus Send');
    await activate('VO-Space on Send: what is announced while the next question arrives', 4000);
    log('after first answer', [], await state(page));
    await readOn('VO-Right from the composer back into the latest message', 8);

    screen = 'generate';
    await typeInto(page, '#story-answer', 'A client doubled bookings after leading with the outcome instead of the offer.', 'type the second answer');
    await focus(page, '#story-send', 'focus Send');
    await activate('VO-Space on Send: what is announced while the script is written', 5000);

    screen = 'finish';
    log('after generation', [], await state(page));
    await focus(page, '#story-finished-line', 'focus the finished line');
    await readOn('VO-Right through the finished script', 20, /Refine|refine/);
    await focus(page, '#story-output-copy', 'focus the finished script text');

    screen = 'refine';
    await typeInto(page, '#story-refine-note', 'Make the hook punchier and end on relief.', 'type a refine note');
    await focus(page, '#story-refine-send', 'focus the refine button');
    await activate('VO-Space on refine: what is announced when version 2 lands', 5000);
    log('after refine', [], { ...(await state(page)), refineStatus: await page.evaluate(() => (document.getElementById('story-refine-status') || {}).textContent || '') });

    screen = 'delete';
    await focus(page, '[data-action="delete-project"]', 'focus Delete chat in the chat list');
    await activate('VO-Space on Delete chat: the dialog opens', 3000);
    log('keyboard focus is inside the dialog', [String(await page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('#story-delete-dialog'))))]);
    await readOn('VO-Right through the delete dialog', 8);
    await page.keyboard.press('Escape');
    log('Escape: what is announced', await listen(2000), { remaining: world.projects.length, focusAfter: (await state(page)).focus });
    await focus(page, '[data-action="delete-project"]', 'focus Delete chat again');
    await activate('VO-Space on Delete chat again', 2400);
    await focus(page, '#story-delete-dialog-confirm', 'focus the delete confirm');
    // 11-11 and 11-12: VO-Space on the confirm did nothing because the VoiceOver
    // cursor was still on the dialog text, not the button keyboard focus moved
    // to. Wait until VoiceOver itself is on the confirm before acting.
    await waitForVoCursor(/delete project/i, 'the delete confirm');
    await activate('VO-Space on confirm: what is announced after deleting', 3200);
    await page.waitForSelector('[data-action="undo-delete"]', { timeout: 8000 })
      .catch(() => { throw new Error('VO-Space on the delete confirm did not delete: no Undo appeared'); });
    await focus(page, '[data-action="undo-delete"]', 'focus Undo');
    await activate('VO-Space on Undo: what is announced after undoing', 3000);
    log('after undo', [], { projects: world.projects.length });
    await context.close();

    // A send that loses the network mid-interview.
    screen = 'connection-lost';
    ({ context, page, world } = await open(browser, 'interview'));
    world.mode.interview = 'drop';
    await typeInto(page, '#story-answer', 'Testing a dropped connection.', 'type an answer with the network about to drop');
    await focus(page, '#story-send', 'focus Send');
    await activate('VO-Space on Send: network drop', 3600);
    log('after the drop', [], await state(page));
    await context.close();
  } catch (error) {
    // WBR-462, 2026-11-11 evening: a real session that stopped partway used
    // to throw its whole transcript away. What VoiceOver already spoke is the
    // evidence; keep it and name the step that stopped. A focus-safety stop
    // (another window in front) still records nothing past that point.
    stoppedAt = { screen, error: String(error.message || error).split('\n')[0] };
    transcript.push({ screen, step: 'STOPPED: ' + stoppedAt.error, heard: [] });
  } finally {
    await browser.close();
    vo('output "StorySculpt screen reader pass finished"');
  }
  const record = { at: new Date().toISOString(), reader: 'VoiceOver (macOS ' + osVersion() + ')', browser: 'WebKit ' + browser.version(), refused, stoppedAt, transcript };
  if (DRY) { console.log(JSON.stringify(transcript.filter(e => !e.heard.length && Object.keys(e).length > 3), null, 1)); return; }
  writeFileSync(outFile, JSON.stringify(record, null, 2) + '\n');
  writeMarkdown(record);
  console.log('wrote ' + outFile + (refused.length ? '; refused ' + refused.length + ' requests' : '') + (stoppedAt ? '; STOPPED on ' + stoppedAt.screen + ': ' + stoppedAt.error : ''));
  if (stoppedAt) process.exitCode = 1;
}

// The readable transcript, kept in screen-reader.md between markers so the
// tree-based Chromium and WebKit sections below it stay as they are.
const START = '<!-- voiceover:start -->';
const END = '<!-- voiceover:end -->';
function writeMarkdown(record) {
  const lines = [START, '', '## VoiceOver', '', 'Reader: ' + record.reader + '. Browser: ' + record.browser + '. Recorded ' + record.at + ' by `scripts/sim/storysculpt-voiceover.mjs`; every network call was stubbed' + (record.refused.length ? ' (' + record.refused.length + ' refused)' : '') + '.', ''];
  if (record.stoppedAt) lines.push('**Stopped on ' + record.stoppedAt.screen + ':** ' + record.stoppedAt.error + ' Everything below is what VoiceOver actually spoke before it stopped.', '');
  let current = null;
  for (const entry of record.transcript) {
    if (entry.screen !== current) { current = entry.screen; lines.push('### ' + current, ''); }
    const extra = Object.keys(entry).filter(k => !['screen', 'step', 'heard'].includes(k));
    lines.push('**' + entry.step + '**', '');
    for (const phrase of entry.heard) lines.push('> ' + phrase.replace(/\n/g, ' '));
    if (entry.heard.length) lines.push('');
    if (extra.length) lines.push('`' + JSON.stringify(Object.fromEntries(extra.map(k => [k, entry[k]]))) + '`', '');
  }
  lines.push(END);
  const block = lines.join('\n');
  const existing = existsSync(mdFile) ? readFileSync(mdFile, 'utf8') : '# StorySculpt screen-reader transcripts\n';
  const next = existing.includes(START)
    ? existing.slice(0, existing.indexOf(START)) + block + existing.slice(existing.indexOf(END) + END.length)
    : existing.replace(/\n---\n/, '\n' + block + '\n\n---\n');
  writeFileSync(mdFile, next);
}
function osVersion() { return (spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout || '').trim(); }

run().catch(e => { console.error(e.message || e); process.exit(1); });
