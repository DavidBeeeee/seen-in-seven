// WBR-373: the Navigator roadmap follows the member to any device.
//
// Runs the shipped js/navigator-roadmap-store.mjs against a mock Supabase that
// enforces what the 2026-10-09-navigator-roadmaps migration enforces: a member
// reads and writes only rows whose user_id is theirs, and holds at most one
// current row. Proves cross-device restore with the last-updated date, member
// isolation, Start Fresh keeping the prior version, and newer-copy selection.
// Then checks the page is wired to it and its new member copy has no em dashes.
// The live RLS proof against zdtkwpzdwnzzmdwrvmka is recorded separately in
// WorkerBee state/evidence.

import { readFileSync } from 'node:fs';
import {
  loadCurrent, saveCurrent, archiveCurrent, listVersions, chooseNewer, formatUpdated
} from '../js/navigator-roadmap-store.mjs';

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

// One shared table; each client sees it through its own member id (RLS).
const table = [];
let seq = 0;

function client(memberId) {
  return {
    from(name) {
      if (name !== 'navigator_roadmaps') throw new Error('unexpected table ' + name);
      return query(memberId);
    }
  };
}

function query(memberId) {
  const filters = [];
  let op = 'select';
  let patch = null;
  let row = null;
  let order = null;
  let limit = Infinity;
  const visible = () => table.filter(r => r.user_id === memberId && filters.every(([k, v]) => r[k] === v));
  const run = () => {
    if (op === 'insert') {
      if (row.user_id !== memberId) return { data: null, error: { message: 'new row violates row-level security policy' } };
      if (row.is_current && table.some(r => r.user_id === row.user_id && r.is_current)) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint "navigator_roadmaps_one_current_idx"' } };
      }
      const r = { id: 'r' + (++seq), archived_at: null, created_at: new Date().toISOString(), ...row };
      table.push(r);
      return { data: [{ id: r.id }], error: null };
    }
    if (op === 'update') {
      const hit = visible();
      hit.forEach(r => Object.assign(r, patch));
      return { data: hit.map(r => ({ id: r.id })), error: null };
    }
    let rows = visible().map(r => JSON.parse(JSON.stringify(r)));
    if (order) rows.sort((a, b) => (a[order.col] < b[order.col] ? 1 : -1) * (order.ascending ? -1 : 1));
    return { data: rows.slice(0, limit), error: null };
  };
  const q = {
    select() { return q; },
    update(p) { op = 'update'; patch = p; return q; },
    insert(r) { op = 'insert'; row = r; return q; },
    eq(k, v) { filters.push([k, v]); return q; },
    order(col, opts) { order = { col, ascending: !!(opts && opts.ascending) }; return q; },
    limit(n) { limit = n; return q; },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); }
  };
  return q;
}

const A = 'member-a';
const B = 'member-b';
const sbA = client(A);
const sbB = client(B);

// 1. Member A saves a roadmap on device one.
const profileA = { name: 'Ana', niche: 'Health Coaching', answers: { storefront: { depth: 1 } }, progress: {}, viewedTasks: [], todos: [], assets: {}, updatedAt: '2026-10-09T20:00:00.000Z' };
const save1 = await saveCurrent(sbA, A, profileA);
check(!save1.error, 'save for member A failed: ' + JSON.stringify(save1.error));

// A second save updates the same current row rather than adding one.
await saveCurrent(sbA, A, { ...profileA, updatedAt: '2026-10-09T20:05:00.000Z' });
check(table.filter(r => r.user_id === A && r.is_current).length === 1, 'member A should hold exactly one current roadmap');

// 2. Fresh context, empty localStorage: the account copy comes back with its date.
const fresh = await loadCurrent(client(A), A);
const restored = chooseNewer(null, fresh.row);
check(restored.source === 'account', 'fresh device should restore from the account, got ' + restored.source);
check(restored.profile && restored.profile.niche === 'Health Coaching', 'restored roadmap lost its content');
check(restored.profile && restored.profile.updatedAt === '2026-10-09T20:05:00.000Z', 'restored roadmap lost its last-updated date');
check(/2026/.test(formatUpdated(restored.profile.updatedAt)), 'last-updated date does not format');

// 3. Member B cannot read, overwrite, or plant a row for member A.
const peek = await loadCurrent(sbB, A);
check(peek.row === null, 'member B read member A\'s roadmap');
const bVersions = await listVersions(sbB, A);
check(bVersions.versions.length === 0, 'member B listed member A\'s versions');
await saveCurrent(sbB, A, { name: 'Intruder', updatedAt: '2026-10-10T00:00:00.000Z' });
const after = await loadCurrent(sbA, A);
check(after.row && after.row.profile.name === 'Ana', 'member B changed member A\'s roadmap');

// 4. Start Fresh keeps the prior roadmap as a retrievable version.
await archiveCurrent(sbA, A);
const cleared = await loadCurrent(sbA, A);
check(cleared.row === null, 'after Start Fresh there should be no current roadmap until the next save');
const newProfile = { name: 'Ana', niche: 'Yoga', answers: {}, progress: {}, viewedTasks: [], todos: [], assets: {}, updatedAt: '2026-10-09T21:00:00.000Z' };
const save2 = await saveCurrent(sbA, A, newProfile);
check(!save2.error, 'save after Start Fresh failed: ' + JSON.stringify(save2.error));
const versions = await listVersions(sbA, A);
check(versions.versions.length === 1 && versions.versions[0].profile.niche === 'Health Coaching', 'Start Fresh did not keep the prior roadmap as a version');
const now = await loadCurrent(sbA, A);
check(now.row && now.row.profile.niche === 'Yoga', 'new roadmap is not current after Start Fresh');

// 5. The newer copy wins, and the page says which.
const older = { name: 'Ana', updatedAt: '2026-10-01T00:00:00.000Z' };
const newer = { name: 'Ana', updatedAt: '2026-10-09T00:00:00.000Z' };
check(chooseNewer(newer, { profile: older }).source === 'device', 'newer device copy should win');
check(chooseNewer(older, { profile: newer }).source === 'account', 'newer account copy should win');
check(chooseNewer({ name: 'Ana' }, { profile: newer }).source === 'account', 'a pre-WBR-373 local copy with no date should yield to the account');
check(chooseNewer(null, null).source === 'none', 'no copies anywhere should say none');

// 6. The page is wired to the store, and its new member copy has no em dashes.
const page = readFileSync('api/_hub/navigator.html', 'utf8');
check(page.includes('/js/navigator-roadmap-store.mjs'), 'navigator.html does not load the roadmap store');
check(/function saveData\(\)[\s\S]{0,300}scheduleRoadmapSync\(\)/.test(page), 'saveData does not sync the roadmap to the account');
check(/async function resetApp\(\)[\s\S]{0,500}archiveCurrent/.test(page), 'Start Fresh does not keep the prior version');
check(page.includes('mountRoadmapSync(context)'), 'the page never loads the account roadmap');
check(/Next Move you have made is kept/.test(page), 'the Danger reset does not say moves are kept');
const block = page.slice(page.indexOf('function readLocalProfile'), page.indexOf('function startFromScratch'));
check(!block.includes('—'), 'roadmap sync copy contains an em dash');
const danger = page.match(/onclick="if\(confirm\('This clears[^']*'\)/);
check(danger && !danger[0].includes('—'), 'Danger reset copy missing or contains an em dash');

if (failures.length) {
  console.error('FAIL check-navigator-roadmaps');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('PASS check-navigator-roadmaps: cross-device restore with date, member isolation, Start Fresh keeps the prior version, newer copy wins, page wired');
