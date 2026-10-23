// Solution Vault Device-Independent Gift Landing Verification Gate (WBR-445)
//
// Verifies:
// 1. Plain sign-in emailRedirectTo is exactly origin + '/'
// 2. Fast path: localStorage studio_next_v1 takes precedence when present
// 3. Device-independent path:
//    - Signed-in member with an unopened gifted book is sent to /vault?book=<slug> once
//    - Marked shown in localStorage so it never loops on subsequent visits
//    - Member whose gifted book has reading progress stays on /
//    - Member without any gift grants stays on /
//    - Multi-gift selection chooses the newest unread gift
//    - Owner-scoped isolation: queries filter strictly by member user_id
// 4. Zero em dashes across all code and copy

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const studioJs = readFileSync(join(root, 'js', 'studio.js'), 'utf8');

console.log('--- Checking Solution Vault Device-Independent Gift Landing (WBR-445) ---');

// 1. Redirect URL safety
console.log('1. Verifying emailRedirectTo safety...');
assert.match(studioJs, /options:\s*\{\s*emailRedirectTo:\s*window\.location\.origin\s*\+\s*'\/'/, 'plain sign-in emailRedirectTo is exactly origin + /');
assert.ok(!studioJs.includes('emailRedirectTo: window.location.origin + next'), 'does not construct redirect from unverified params');
console.log('PASS: emailRedirectTo verified.');

// 2. Fast path vs device-independent path order
console.log('2. Verifying precedence order...');
const fastIdx = studioJs.indexOf('followStudioNext()');
const devIndIdx = studioJs.indexOf('findNewestUnopenedGiftBook');
assert.ok(fastIdx !== -1 && devIndIdx !== -1, 'both fast path and device-independent checks exist');
assert.ok(fastIdx < devIndIdx, 'fast path next check runs before device-independent check');
console.log('PASS: precedence order verified.');

// 3. Mark shown logic prevents redirect loops
console.log('3. Verifying loop prevention mechanism...');
assert.match(studioJs, /function markGiftBookShown/, 'markGiftBookShown helper exists');
assert.match(studioJs, /function isGiftBookShown/, 'isGiftBookShown helper exists');
assert.match(studioJs, /markGiftBookShown\(studioProfile\.id,\s*unopenedSlug\)/, 'marks gift book shown before or during redirect');
console.log('PASS: loop prevention verified.');

// 4. Owner-scoped database queries
console.log('4. Verifying owner-scoped query constraints...');
assert.match(studioJs, /\.from\('solution_vault_book_grants'\)[\s\S]*?\.eq\('user_id',\s*userProfile\.id\)/, 'grants query is scoped to caller user_id');
assert.match(studioJs, /\.from\('solution_vault_book_progress'\)[\s\S]*?\.eq\('user_id',\s*userProfile\.id\)/, 'progress query is scoped to caller user_id');
assert.match(studioJs, /\.eq\('grant_kind',\s*'gift'\)/, 'filters strictly for gift grants');
assert.match(studioJs, /\.order\('granted_at',\s*\{\s*ascending:\s*false\s*\}\)/, 'orders by newest grant first');
console.log('PASS: owner-scoped queries verified.');

// 5. Functional simulation of findNewestUnopenedGiftBook
console.log('5. Simulating device-independent gift landing scenarios...');
const findFnSrc = studioJs.match(/async function findNewestUnopenedGiftBook\(userProfile\) \{[\s\S]*?\n\}/);
assert.ok(findFnSrc, 'findNewestUnopenedGiftBook function extracted');

const mockStorage = new Map();
globalThis.localStorage = {
  getItem: k => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: k => mockStorage.delete(k)
};

function createMockStudioSb({ grants = [], progress = [] }) {
  return {
    from(table) {
      if (table === 'solution_vault_book_grants') {
        return {
          select() {
            return {
              eq(col1, val1) {
                return {
                  eq(col2, val2) {
                    return {
                      eq(col3, val3) {
                        return {
                          order(orderCol, { ascending } = {}) {
                            let res = [...grants];
                            if (col1 === 'user_id') res = res.filter(g => g.user_id === val1);
                            if (col2 === 'grant_kind') res = res.filter(g => g.grant_kind === val2);
                            if (col3 === 'status') res = res.filter(g => g.status === val3);
                            res.sort((a, b) => ascending ? a[orderCol].localeCompare(b[orderCol]) : b[orderCol].localeCompare(a[orderCol]));
                            return Promise.resolve({ data: res, error: null });
                          }
                        };
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
      if (table === 'solution_vault_book_progress') {
        return {
          select() {
            return {
              eq(col, val) {
                const res = progress.filter(p => p.user_id === val);
                return Promise.resolve({ data: res, error: null });
              }
            };
          }
        };
      }
      throw new Error('Unknown table: ' + table);
    }
  };
}

const userProfile = { id: 'user-uuid-1', name: 'Reader One' };
const isShownSrc = studioJs.match(/function isGiftBookShown\(userId, slug\) \{[\s\S]*?\n\}/);
const markShownSrc = studioJs.match(/function markGiftBookShown\(userId, slug\) \{[\s\S]*?\n\}/);

const runnerFactory = new Function(
  'studioSb', 'STUDIO_GIFT_SHOWN_PREFIX',
  `${isShownSrc[0]}; ${markShownSrc[0]}; return ${findFnSrc[0]};`
);

// Scenario A: Member with unopened gifted book -> returns book slug
{
  mockStorage.clear();
  const mockSb = createMockStudioSb({
    grants: [
      {
        user_id: 'user-uuid-1',
        book_id: 'book-1',
        grant_kind: 'gift',
        status: 'active',
        granted_at: '2026-10-23T10:00:00Z',
        solution_vault_books: { slug: '5e-framework', title: 'The 5E Framework', status: 'published' }
      }
    ],
    progress: []
  });
  const findFn = runnerFactory(mockSb, 'studio_gift_shown_v1_');
  const slug = await findFn(userProfile);
  assert.equal(slug, '5e-framework', 'finds newest unopened gifted book');

  // Once marked shown, subsequent call on same device returns null (no redirect loop)
  globalThis.localStorage.setItem('studio_gift_shown_v1_user-uuid-1_5e-framework', String(Date.now()));
  const repeatSlug = await findFn(userProfile);
  assert.equal(repeatSlug, null, 'does not loop once marked shown');
}

// Scenario B: Member whose gifted book has reading progress -> returns null (stays on /)
{
  mockStorage.clear();
  const mockSb = createMockStudioSb({
    grants: [
      {
        user_id: 'user-uuid-1',
        book_id: 'book-1',
        grant_kind: 'gift',
        status: 'active',
        granted_at: '2026-10-23T10:00:00Z',
        solution_vault_books: { slug: '5e-framework', title: 'The 5E Framework', status: 'published' }
      }
    ],
    progress: [
      { user_id: 'user-uuid-1', book_id: 'book-1', last_page: 3, last_chapter_id: null, completed: false }
    ]
  });
  const findFn = runnerFactory(mockSb, 'studio_gift_shown_v1_');
  const slug = await findFn(userProfile);
  assert.equal(slug, null, 'stays on / when book has reading progress');
}

// Scenario C: Plain sign-in with no gift -> returns null (stays on /)
{
  mockStorage.clear();
  const mockSb = createMockStudioSb({ grants: [], progress: [] });
  const findFn = runnerFactory(mockSb, 'studio_gift_shown_v1_');
  const slug = await findFn(userProfile);
  assert.equal(slug, null, 'stays on / when member has no gifts');
}

// Scenario D: Multi-gift ordering picks the newest unread gift
{
  mockStorage.clear();
  const mockSb = createMockStudioSb({
    grants: [
      {
        user_id: 'user-uuid-1',
        book_id: 'book-older',
        grant_kind: 'gift',
        status: 'active',
        granted_at: '2026-10-20T10:00:00Z',
        solution_vault_books: { slug: 'older-book', title: 'Older Book', status: 'published' }
      },
      {
        user_id: 'user-uuid-1',
        book_id: 'book-newer',
        grant_kind: 'gift',
        status: 'active',
        granted_at: '2026-10-23T10:00:00Z',
        solution_vault_books: { slug: 'newer-book', title: 'Newer Book', status: 'published' }
      }
    ],
    progress: []
  });
  const findFn = runnerFactory(mockSb, 'studio_gift_shown_v1_');
  const slug = await findFn(userProfile);
  assert.equal(slug, 'newer-book', 'selects the newest unread gift');
}

console.log('PASS: simulation scenarios verified.');

// 6. Zero em dashes
console.log('6. Verifying zero em dashes in studio.js...');
const emDashCount = (studioJs.match(/\u2014/g) || []).length;
assert.equal(emDashCount, 0, 'zero em dashes in studio.js');
console.log('PASS: zero em dashes verified.');

console.log('\nALL VAULT GIFT LANDING CHECKS PASSED');
