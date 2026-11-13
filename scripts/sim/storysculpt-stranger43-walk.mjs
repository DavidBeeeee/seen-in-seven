import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'https://studio.coloradomastermind.com';
const base = 'https://zdtkwpzdwnzzmdwrvmka.supabase.co';
const email = 'momentum-hub-test@ancientcosmic.com';

const modules = process.env.WALK_NODE_MODULES || '/private/tmp/certainty-walk-deps/node_modules';
const require = createRequire(path.join(modules, 'noop.js'));
const { chromium } = require('playwright-core');

const publicKey = fs.readFileSync(path.join(root, 'js/eee-common.js'), 'utf8').match(/const EEE_SUPABASE_KEY = '([^']+)'/)[1];
const password = execFileSync('/usr/bin/security', ['find-generic-password', '-a', email, '-s', 'workerbee-momentum-hub-test-password', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const login = await fetch(base + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: publicKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
  signal: AbortSignal.timeout(15000)
});
if (!login.ok) throw Error('Test-member sign-in HTTP ' + login.status);
const session = await login.json();
assert.equal(session.user.email.toLowerCase(), email);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(({ session }) => {
  if (location.origin === 'https://studio.coloradomastermind.com') {
    localStorage.setItem('sb-zdtkwpzdwnzzmdwrvmka-auth-token', JSON.stringify(session));
  }
}, { session });

// Override with candidate js/storysculpt-member-states.js and js/storysculpt.js
await context.route(origin + '/js/storysculpt-member-states.js*', route => {
  route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'js/storysculpt-member-states.js'), 'utf8') });
});
await context.route(origin + '/js/storysculpt.js*', route => {
  route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'js/storysculpt.js'), 'utf8') });
});

const page = await context.newPage();
let generationRequestCount = 0;
page.on('request', request => {
  if (request.url() === origin + '/api/storysculpt' && request.method() === 'POST') {
    generationRequestCount++;
  }
});

await page.goto(origin + '/storysculpt', { waitUntil: 'domcontentloaded' });
await page.locator('#eee-account-email').filter({ hasText: email }).waitFor({ timeout: 30000 });
await page.waitForFunction(() => typeof activeStory !== 'undefined' && activeStory?.id, null, { timeout: 30000 });
await page.locator('#new-project-button').click();
await page.locator('[data-mode="rant"]').click();
await page.locator('#story-answer').waitFor();

// Enter the short broad opening: "confidence for everyone about everything"
await page.locator('#story-answer').fill('confidence for everyone about everything');
await page.locator('#story-send').click();

// Wait for the narrowing question in the conversation
await page.waitForFunction(() => {
  const bubbles = Array.from(document.querySelectorAll('.story-bubble-assistant'));
  return bubbles.some(b => /takes in everyone and everything/i.test(b.textContent));
}, null, { timeout: 15000 });

const text = await page.evaluate(() => {
  const bubbles = Array.from(document.querySelectorAll('.story-bubble-assistant'));
  return bubbles.map(b => b.textContent.trim()).join(' | ');
});
const statusLine = await page.evaluate(() => {
  const el = document.getElementById('story-generation-status');
  return el ? el.textContent.trim() : '';
});

const timestamp = new Date().toISOString();
const result = {
  success: true,
  timestamp,
  generationRequestCount,
  narrowingText: text,
  statusLine
};
console.log(JSON.stringify(result, null, 2));

// Save receipt
fs.writeFileSync(path.join(root, 'docs/storysculpt-walk/stranger43-production-walk.json'), JSON.stringify(result, null, 2), 'utf8');

await browser.close();
