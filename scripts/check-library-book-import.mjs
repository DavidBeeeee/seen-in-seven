// Verification gate for WBR-491 Part 2 Library Book Shelf import.
// Ensures the additive migration, cover asset, gifted-lifetime grants,
// zero em-dash rule, and web reader chapter fallback all hold together.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const migration = read('supabase_migrations', '2026-11-26-library-book-shelf-import.sql');
assert.equal((migration.match(/\u2014/g) || []).length, 0, 'migration has zero em dashes');

const coverPath = path.join(root, 'assets', 'vault', 'idk-wtf-im-doing-cover.jpg');
assert.ok(fs.existsSync(coverPath) && fs.statSync(coverPath).size > 10000, 'idk-wtf-im-doing cover asset exists');

assert.ok(/update public\.solution_vault_books[\s\S]*?'\/assets\/vault\/idk-wtf-im-doing-cover\.jpg'[\s\S]*?where slug = 'idk-wtf-im-doing'/.test(migration), 'migration attaches cover to idk-wtf-im-doing');

const expectedSlugs = [
  'what-to-post',
  'content-strategy-worksheet',
  'social-media-reply-strategy',
  'filming-video-shorts-guide',
  'hooks-and-cta-scripts',
];
for (const slug of expectedSlugs) {
  assert.ok(migration.includes(`$wb_book$${slug}$wb_book$`), `migration seeds book ${slug}`);
  assert.ok(migration.includes(`'${slug}'`), `migration grants book ${slug}`);
}

const chapterBlocks = [...migration.matchAll(/\$wb_book\$(\[\{[\s\S]*?\}\])\$wb_book\$::jsonb/g)];
assert.equal(chapterBlocks.length, expectedSlugs.length, 'each imported book carries a JSON chapters array');
for (const [, rawJson] of chapterBlocks) {
  const chapters = JSON.parse(rawJson);
  assert.ok(Array.isArray(chapters) && chapters.length >= 3, 'book has structured chapters');
  for (const ch of chapters) {
    assert.ok(typeof ch.id === 'string' && ch.id.length > 0, 'chapter has id');
    assert.ok(typeof ch.title === 'string' && ch.title.length > 0, 'chapter has title');
    assert.ok(typeof ch.content === 'string' && ch.content.length > 50, 'chapter has content');
  }
}

assert.ok(/'gift', 'test', 'test:library-free-seed', 'active', null/.test(migration), 'grants are gifted-lifetime (expires_at null)');
assert.ok(/where u\.email = 'momentum-hub-test@ancientcosmic\.com'/.test(migration), 'grants target the test member');

const vaultJs = read('js', 'vault.js');
assert.ok(vaultJs.includes("String(ch.content || ch.body || '')"), 'web reader supports both content and body chapter keys');

const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n');
assert.ok(!tracked.some((f) => /(^|\/)books\/|(what-to-post|content-strategy-worksheet|social-media-reply-strategy|filming-video-shorts-guide|hooks-and-cta-scripts).*\.pdf$/i.test(f)), 'no imported PDF book file is tracked in git');

console.log(`Library Book Shelf import check passed (${expectedSlugs.length} new books + idk-wtf-im-doing cover).`);
