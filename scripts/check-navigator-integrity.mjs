// WBR-459: drive the shipped Navigator stores against the migration contract.
// The mock enforces owner scoping, declared transitions, trigger-owned versions,
// keyed saves/completions, server trail rows and caller-only erasure.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadCurrent, saveCurrent, saveCurrentWithRetry, archiveCurrent, listVersions,
  exportNavigatorData, eraseNavigatorData, isStaleVersion
} from '../js/navigator-roadmap-store.mjs';
import { markMoveComplete, newIdempotencyKey } from '../js/navigator-moves-store.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const key = () => newIdempotencyKey();
const allowed = new Set(['in_progress>complete', 'complete>in_progress', 'in_progress>archived', 'complete>archived']);

function validProfile(profile) {
  return profile && typeof profile === 'object' && !Array.isArray(profile)
    && (profile.name === undefined || typeof profile.name === 'string')
    && (profile.niche === undefined || typeof profile.niche === 'string')
    && (profile.answers === undefined || typeof profile.answers === 'object')
    && (profile.progress === undefined || typeof profile.progress === 'object')
    && (profile.todos === undefined || Array.isArray(profile.todos))
    && (profile.assets === undefined || typeof profile.assets === 'object');
}

function database() {
  return { roadmaps: [], moves: [], states: [], receipts: [], logs: [], failSaves: 0, sequence: 0 };
}

function logLifecycle(db, row, kind, from) {
  db.logs.push({
    user_id: row.user_id,
    event_type: kind === 'roadmap' ? 'navigator_roadmap_lifecycle' : 'navigator_move_lifecycle',
    detail: kind === 'roadmap'
      ? { schema: 1, side: 'server', roadmapId: row.id, from, to: row.status, version: row.version }
      : { schema: 1, side: 'server', moveId: row.id, from, to: row.status }
  });
}

function client(db, memberId) {
  function save(args) {
    if (db.failSaves > 0) {
      db.failSaves -= 1;
      return { data: null, error: { message: 'network unavailable' } };
    }
    if (!validProfile(args.p_profile)) return { data: null, error: { code: '23514', message: 'profile shape' } };
    if (!args.p_idempotency_key) return { data: null, error: { message: 'BAD_IDEMPOTENCY_KEY' } };
    const receipt = db.receipts.find(r => r.user_id === memberId && r.idempotency_key === args.p_idempotency_key);
    if (receipt) return { data: clone(db.roadmaps.find(r => r.id === receipt.roadmap_id)), error: null };
    let row = db.roadmaps.find(r => r.user_id === memberId && r.is_current);
    if (row) {
      if (args.p_expected_version != null && args.p_expected_version !== row.version) {
        return { data: null, error: { code: 'P0001', message: 'STALE_VERSION' } };
      }
      if (row.status !== args.p_status && !allowed.has(`${row.status}>${args.p_status}`)) {
        return { data: null, error: { code: 'P0001', message: 'ILLEGAL_TRANSITION' } };
      }
      const from = row.status;
      row.profile = clone(args.p_profile);
      row.profile_updated_at = args.p_profile_updated_at;
      row.status = args.p_status;
      row.version += 1;
      row.updated_at = new Date().toISOString();
      if (from !== row.status) logLifecycle(db, row, 'roadmap', from);
    } else {
      if (args.p_status === 'archived') return { data: null, error: { message: 'ILLEGAL_TRANSITION' } };
      row = {
        id: `roadmap-${++db.sequence}`, user_id: memberId, profile: clone(args.p_profile),
        profile_updated_at: args.p_profile_updated_at, status: args.p_status,
        version: 1, is_current: true, archived_at: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      db.roadmaps.push(row);
    }
    db.receipts.push({ user_id: memberId, idempotency_key: args.p_idempotency_key, roadmap_id: row.id });
    return { data: clone(row), error: null };
  }

  function query(table) {
    const filters = [];
    let patch = null;
    let order = null;
    let limit = Infinity;
    const rows = () => db[table].filter(r => r.user_id === memberId && filters.every(([k, v]) => r[k] === v));
    const q = {
      select() { return q; },
      update(value) { patch = value; return q; },
      eq(k, v) { filters.push([k, v]); return q; },
      order(col, options) { order = { col, ascending: !!options?.ascending }; return q; },
      limit(value) { limit = value; return q; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (patch) {
            const hit = rows();
            for (const row of hit) {
              if (patch.expected_version != null && patch.expected_version !== row.version) {
                return { data: null, error: { code: 'P0001', message: 'STALE_VERSION' } };
              }
              const to = patch.status || row.status;
              if (to !== row.status && !allowed.has(`${row.status}>${to}`)) {
                return { data: null, error: { code: 'P0001', message: 'ILLEGAL_TRANSITION' } };
              }
              const from = row.status;
              Object.assign(row, patch, { version: row.version + 1, expected_version: null });
              if (row.status === 'archived') row.is_current = false;
              if (from !== row.status) logLifecycle(db, row, 'roadmap', from);
            }
            return { data: clone(hit), error: null };
          }
          let result = clone(rows());
          if (order) result.sort((a, b) => (a[order.col] < b[order.col] ? 1 : -1) * (order.ascending ? -1 : 1));
          return { data: result.slice(0, limit), error: null };
        }).then(resolve, reject);
      }
    };
    return q;
  }

  return {
    from(table) {
      if (!['navigator_roadmaps', 'navigator_moves', 'navigator_states'].includes(table)) throw new Error('unexpected table ' + table);
      return query(table.replace('navigator_', ''));
    },
    async rpc(name, args = {}) {
      if (name === 'save_navigator_roadmap') return save(args);
      if (name === 'complete_navigator_move') {
        if (!args.p_idempotency_key) return { data: null, error: { message: 'BAD_IDEMPOTENCY_KEY' } };
        const row = db.moves.find(r => r.id === args.p_move_id && r.user_id === memberId);
        if (!row) return { data: null, error: { message: 'NOT_FOUND' } };
        if (row.status !== 'completed') {
          row.status = 'completed';
          row.completed_at = new Date().toISOString();
          row.completion_idempotency_key = args.p_idempotency_key;
          logLifecycle(db, row, 'move', 'active');
        }
        return { data: clone(row), error: null };
      }
      if (name === 'erase_navigator_data') {
        const counts = {
          roadmaps: db.roadmaps.filter(r => r.user_id === memberId).length,
          moves: db.moves.filter(r => r.user_id === memberId).length,
          states: db.states.filter(r => r.user_id === memberId).length
        };
        for (const table of ['roadmaps', 'moves', 'states', 'receipts']) {
          db[table] = db[table].filter(r => r.user_id !== memberId);
        }
        return { data: counts, error: null };
      }
      throw new Error('unexpected rpc ' + name);
    }
  };
}

const profile = (name, niche, updatedAt) => ({
  name, niche, answers: {}, progress: {}, viewedTasks: [], todos: [], assets: {}, updatedAt
});

// First run, keyed save and an exact repeat.
{
  const db = database();
  const sb = client(db, A);
  const empty = await loadCurrent(sb, A);
  assert.equal(empty.row, null, 'a member with no roadmap gets the normal first run');
  const firstKey = key();
  const first = await saveCurrent(sb, A, profile('Ana', 'Health Coaching', '2026-10-23T20:00:00Z'), {
    expectedVersion: null, idempotencyKey: firstKey, status: 'in_progress'
  });
  assert.equal(first.error, null);
  assert.equal(first.row.version, 1);
  const repeated = await saveCurrent(sb, A, profile('SHOULD NOT WRITE', 'Health Coaching', '2026-10-23T20:01:00Z'), {
    expectedVersion: 1, idempotencyKey: firstKey, status: 'in_progress'
  });
  assert.equal(repeated.row.version, 1, 'a repeated save key does not bump version');
  assert.equal(repeated.row.profile.name, 'Ana', 'a repeated save key writes once');
  assert.equal(db.receipts.length, 1);
}

// Two tabs: the newer save survives; the stale writer gets STALE_VERSION.
{
  const db = database();
  const tabA = client(db, A);
  const tabB = client(db, A);
  await saveCurrent(tabA, A, profile('Ana', 'Original', '2026-10-23T20:00:00Z'), { expectedVersion: null, idempotencyKey: key() });
  await saveCurrent(tabA, A, profile('Ana', 'Newer screen', '2026-10-23T20:05:00Z'), { expectedVersion: 1, idempotencyKey: key() });
  const stale = await saveCurrent(tabB, A, profile('Ana', 'Older screen', '2026-10-23T20:02:00Z'), { expectedVersion: 1, idempotencyKey: key() });
  assert.equal(isStaleVersion(stale.error), true);
  const current = await loadCurrent(tabA, A);
  assert.equal(current.row.version, 2);
  assert.equal(current.row.profile.niche, 'Newer screen', 'the newer account copy is kept');
}

// A failed request keeps the caller's local copy and retries once with the same key.
{
  const db = database();
  const sb = client(db, A);
  const local = profile('Ana', 'Still on this device', '2026-10-23T20:00:00Z');
  const localBefore = JSON.stringify(local);
  const retryKey = key();
  const waits = [];
  db.failSaves = 1;
  const recovered = await saveCurrentWithRetry(sb, A, local, {
    expectedVersion: null, idempotencyKey: retryKey, retryDelayMs: 25,
    sleep: async ms => waits.push(ms)
  });
  assert.equal(recovered.error, null);
  assert.equal(recovered.attempts, 2, 'one failure causes exactly one retry');
  assert.deepEqual(waits, [25], 'the retry uses backoff');
  assert.equal(JSON.stringify(local), localBefore, 'a failed save never mutates the local copy');
  assert.equal(db.receipts[0].idempotency_key, retryKey, 'the retry reuses the logical save key');

  db.failSaves = 2;
  const failed = await saveCurrentWithRetry(sb, A, profile('Ana', 'Offline', '2026-10-23T20:10:00Z'), {
    expectedVersion: 1, idempotencyKey: key(), sleep: async () => {}
  });
  assert.equal(failed.attempts, 2);
  assert.ok(failed.error, 'two failed attempts return an honest error');
}

// Declared status moves and one server trail row per transition, with no member text.
{
  const db = database();
  const sb = client(db, A);
  await saveCurrent(sb, A, profile('Ana', 'Health Coaching', '2026-10-23T20:00:00Z'), { expectedVersion: null, idempotencyKey: key() });
  const completed = await saveCurrent(sb, A, profile('Ana', 'Health Coaching', '2026-10-23T20:06:00Z'), {
    expectedVersion: 1, idempotencyKey: key(), status: 'complete'
  });
  assert.equal(completed.row.status, 'complete');
  assert.equal(db.logs.filter(l => l.event_type === 'navigator_roadmap_lifecycle').length, 1);
  const archived = await archiveCurrent(sb, A, { expectedVersion: 2 });
  assert.equal(archived.error, null);
  assert.equal(db.logs.filter(l => l.event_type === 'navigator_roadmap_lifecycle').length, 2, 'Start Fresh writes its own archive event');
  const versions = await listVersions(sb, A);
  assert.equal(versions.versions.length, 1, 'the archived roadmap remains downloadable');
  assert.equal(versions.versions[0].status, 'archived');
  assert.ok(!JSON.stringify(db.logs).includes('Ana'));
  assert.ok(!JSON.stringify(db.logs).includes('Health Coaching'));

  db.roadmaps[0].is_current = true; // direct guard probe: archived is terminal
  const illegal = await saveCurrent(sb, A, profile('Ana', 'Health Coaching', '2026-10-23T20:07:00Z'), {
    expectedVersion: 3, idempotencyKey: key(), status: 'in_progress'
  });
  assert.match(illegal.error.message, /ILLEGAL_TRANSITION/);
  const badShape = await saveCurrent(sb, A, { name: 42 }, { expectedVersion: null, idempotencyKey: key() });
  assert.equal(badShape.error.code, '23514', 'the profile shape check is enforced');
}

// A double-tapped completion writes one completion and one trail row.
{
  const db = database();
  db.moves.push(
    { id: 'move-a', user_id: A, status: 'active', next_action: 'Send the welcome email' },
    { id: 'move-b', user_id: B, status: 'active', next_action: 'Another member move' }
  );
  const sb = client(db, A);
  const completionKey = key();
  const first = await markMoveComplete(sb, 'move-a', completionKey);
  const second = await markMoveComplete(sb, 'move-a', completionKey);
  assert.equal(first.error, null);
  assert.equal(second.error, null);
  assert.equal(db.moves.filter(r => r.id === 'move-a' && r.status === 'completed').length, 1);
  assert.equal(db.logs.filter(l => l.event_type === 'navigator_move_lifecycle').length, 1);
  assert.ok(!JSON.stringify(db.logs).includes('welcome email'));
  const otherMember = await markMoveComplete(client(db, B), 'move-a', key());
  assert.match(otherMember.error.message, /NOT_FOUND/);
}

// Export is owner-scoped; erase removes only the caller's three data sets.
{
  const db = database();
  const sbA = client(db, A);
  const sbB = client(db, B);
  await saveCurrent(sbA, A, profile('Ana', 'A roadmap', '2026-10-23T20:00:00Z'), { expectedVersion: null, idempotencyKey: key() });
  await saveCurrent(sbB, B, profile('Blake', 'B roadmap', '2026-10-23T20:00:00Z'), { expectedVersion: null, idempotencyKey: key() });
  db.moves.push({ id: 'move-a', user_id: A, status: 'active' }, { id: 'move-b', user_id: B, status: 'active' });
  db.states.push({ user_id: A, state: { tab: 'roadmap' } }, { user_id: B, state: { tab: 'nextmove' } });
  const exported = await exportNavigatorData(sbA, A);
  assert.equal(exported.data.roadmaps.length, 1);
  assert.equal(exported.data.roadmaps[0].profile.name, 'Ana');
  assert.equal(exported.data.moves.length, 1);
  assert.equal(exported.data.states.length, 1);
  const erased = await eraseNavigatorData(sbA);
  assert.deepEqual(erased.data, { roadmaps: 1, moves: 1, states: 1 });
  assert.ok(db.roadmaps.every(r => r.user_id === B));
  assert.ok(db.moves.every(r => r.user_id === B));
  assert.ok(db.states.every(r => r.user_id === B));
  assert.equal(db.roadmaps.length, 1, 'the other member roadmap is untouched');
  assert.equal(db.moves.length, 1, 'the other member move is untouched');
  assert.equal(db.states.length, 1, 'the other member state is untouched');
}

// A server commit followed by a lost response reuses the auto-generated key.
{
  const db = database();
  const sb = client(db, A);
  const rpc = sb.rpc.bind(sb);
  const keys = [];
  sb.rpc = async (name, args) => {
    keys.push(args.p_idempotency_key);
    const saved = await rpc(name, args);
    if (keys.length === 1) throw new Error('response lost after commit');
    return saved;
  };
  const saved = await saveCurrentWithRetry(sb, A, profile('Ana', 'Offline', '2026-10-24T19:00:00Z'), { sleep: async () => {} });
  assert.equal(saved.error, null);
  assert.equal(saved.attempts, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(db.receipts.length, 1);
  assert.equal(db.roadmaps[0].version, 1);
}

// The page carries the recovery and member-control behavior, not only the store.
{
  const page = readFileSync(new URL('../api/_hub/navigator.html', import.meta.url), 'utf8');
  const nav = readFileSync(new URL('../js/navigator.js', import.meta.url), 'utf8');
  assert.ok(page.includes('saveCurrentWithRetry'), 'the page uses the one-retry save');
  assert.ok(page.includes('A newer copy was saved on another screen'), 'the stale-save explanation is plain');
  assert.ok(page.includes('handleStaleRoadmap(snapshot, store)'), 'the stale path loads the newer copy');
  assert.ok(page.includes('Saved on this device only, will sync'), 'failed saves tell the truth');
  assert.ok(page.includes('STORAGE_KEY + \'_older_screen_backup\''), 'the older screen copy is kept locally');
  assert.ok(page.includes('id="screen-settings"'), 'settings screen exists');
  assert.ok(page.includes('downloadNavigatorData()'), 'JSON download is wired');
  assert.ok(page.includes('eraseMyNavigatorData()'), 'member erasure is wired');
  assert.ok(page.includes('Permanently erase every current and past Navigator roadmap'), 'erasure states the consequence first');
  assert.ok(nav.includes('markMoveComplete(ctx.sb, moveId, key)'), 'Mark complete uses the keyed RPC');
  assert.ok(nav.includes('pendingCompletionKeys.delete(moveId)'), 'a completion key is cleared only after success');
}

console.log('PASS check-navigator-integrity: illegal transition refused; stale version kept newer copy; keyed writes once; status and completion trails exclude member text; failed save kept local copy and retried once; caller-only erase; first run, export and page recovery wiring.');
