#!/usr/bin/env node
// Static verification for Solution Vault Classroom (WBR-491).
// Checks the inventory doc, additive SQL migration, RPC contract, Classroom UI,
// safe text rendering, and zero em dashes across all touched files.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const inventory = read('docs/library/inventory-2026-11-19.md');
const migration = read('supabase_migrations/2026-11-20-solution-vault-classroom.sql');
const vaultHtml = read('api/_hub/vault.html');
const vaultCss = read('css/vault.css');
const vaultJs = read('js/vault.js');
const indexHtml = read('index.html');
const studioJs = read('js/studio.js');

// 1. Inventory covers all required sources and includes draft refresh/redesign briefs
for (const expected of [
  'coloradomastermind.onlinecoursehost.com',
  'coloradomastermind.com/tools',
  'Solution Vault',
  'Welcome Package',
  'The EZ 8 Steps to Start Your Company',
  'IDKWTF Media Kit',
  'Mastermind Action Document',
  'until David reads and approves it'
]) {
  assert(inventory.toLowerCase().includes(expected.toLowerCase()), `Inventory missing: ${expected}`);
}

// 2. Migration defines Classroom tables, RLS, RPCs, and seeds
for (const pattern of [
  /create table if not exists public\.solution_vault_courses\b/i,
  /create table if not exists public\.solution_vault_course_grants\b/i,
  /create table if not exists public\.solution_vault_course_progress\b/i,
  /alter table public\.solution_vault_courses enable row level security/i,
  /alter table public\.solution_vault_course_grants enable row level security/i,
  /alter table public\.solution_vault_course_progress enable row level security/i,
  /create or replace function public\.has_vault_access\(\)/i,
  /create or replace function public\.has_any_classroom_access\(\)/i,
  /create or replace function public\.has_classroom_access\(target_course_slug text\)/i,
  /create or replace function public\.my_classroom_courses\(\)/i,
  /create or replace function public\.save_classroom_progress\(/i,
  /create or replace function public\.admin_grant_classroom_course\(/i,
  /create or replace function public\.admin_revoke_classroom_grant\(/i,
  /create or replace function public\.admin_set_classroom_status\(/i,
  /'welcome-package'/,
  /'ez-8-steps'/,
  /'idkwtf-media-kit'/,
  /'mastermind-action-document'/,
  /'idk-wtf-im-doing'/,
  /momentum-hub-test@ancientcosmic\.com/
]) {
  assert(pattern.test(migration), `Migration missing expected pattern: ${pattern}`);
}

// 3. Every classroom RPC called in client JS exists in the migration
const calledRpcs = new Set();
for (const src of [vaultJs, studioJs]) {
  for (const match of src.matchAll(/\.rpc\('([a-z_]+classroom[a-z_]*)'/g)) {
    calledRpcs.add(match[1]);
  }
}
assert(calledRpcs.size >= 3, `Expected at least 3 classroom RPC calls, found ${calledRpcs.size}`);
for (const rpc of calledRpcs) {
  assert(
    new RegExp(`create or replace function public\\.${rpc}\\b`, 'i').test(migration),
    `Client calls RPC "${rpc}" but migration does not define it`
  );
}

// 4. HTML & sidebar navigation match WBR-491 copy and structure
assert(vaultHtml.includes('id="tab-courses"'), 'vault.html missing tab-courses');
assert(vaultHtml.includes('<span>Classroom</span>'), 'vault.html missing Classroom tab label');
assert(vaultHtml.includes('<p>Your courses, one lesson at a time</p>'), 'vault.html missing exact Classroom subtitle');
assert(vaultHtml.includes('id="vault-courses-section"'), 'vault.html missing #vault-courses-section');
assert(vaultHtml.includes('id="vault-course-player"'), 'vault.html missing #vault-course-player');
assert(vaultHtml.includes('id="course-lesson-list"'), 'vault.html missing ordered lesson rail');
assert(indexHtml.includes('id="vault-nav-courses"'), 'index.html missing #vault-nav-courses');
assert(indexHtml.includes('/vault?section=classroom'), 'index.html missing /vault?section=classroom link');

// 5. JS renders Course-labeled tiles, resumes from last_lesson_id, no storefront/locked tiles
assert(vaultJs.includes("const badge = course.admin_preview ? 'Admin preview' : 'Course';"), 'js/vault.js must label tiles Course');
assert(vaultJs.includes('course.progress && course.progress.last_lesson_id'), 'js/vault.js must resume from progress.last_lesson_id');
assert(vaultJs.includes('bodyEl.textContent = \'\';'), 'js/vault.js must clear lesson body safely with textContent');
assert(!/locked|unlock now|buy now|upgrade to/i.test(vaultHtml + vaultJs), 'Classroom must never show locked tiles or storefront prompts');

// 6. CSS includes dark/light friendly layout rules
assert(vaultCss.includes('.course-player-layout'), 'css/vault.css missing .course-player-layout');
assert(vaultCss.includes('.course-lesson-item.is-active'), 'css/vault.css missing .course-lesson-item.is-active');

// 7. Zero em dashes across all touched files
for (const [name, content] of [
  ['docs/library/inventory-2026-11-19.md', inventory],
  ['supabase_migrations/2026-11-20-solution-vault-classroom.sql', migration],
  ['api/_hub/vault.html', vaultHtml],
  ['css/vault.css', vaultCss],
  ['js/vault.js', vaultJs],
  ['index.html', indexHtml],
  ['js/studio.js', studioJs]
]) {
  assert(!content.includes('\u2014'), `Em dash found in ${name}`);
}

console.log('Solution Vault Classroom checks passed.');
