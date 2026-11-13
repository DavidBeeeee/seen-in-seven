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


const page = await context.newPage();
let generationRequestCount = 0;
page.on('request', request => {
  if (request.url() === origin + '/api/storysculpt' && request.method() === 'POST') generationRequestCount++;
});
const cases = [
  { answer: 'Showing the world how to enjoy every part of living', broad: true },
  { answer: 'Advice for anybody who wants to improve everything', broad: true },
  { answer: 'the day my mom handed me her car keys', broad: false }
];
const results = [];
try {
  await page.goto(origin + '/storysculpt', { waitUntil: 'domcontentloaded' });
  await page.locator('#eee-account-email').filter({ hasText: email }).waitFor({ timeout: 30000 });
  await page.waitForFunction(() => typeof activeStory !== 'undefined' && activeStory?.id, null, { timeout: 30000 });
  for (const test of cases) {
    await page.locator('#new-project-button').click();
    await page.locator('[data-mode="rant"]').click();
    await page.locator('#story-answer').waitFor();
    await page.waitForTimeout(1200);
    const before = generationRequestCount;
    const beforeStep = await page.evaluate(() => activeStory?.intake?.current_step ?? null);
    await page.locator('#story-answer').fill(test.answer);
    await page.locator('#story-send').click();
    await page.waitForFunction(() => !storySending, null, { timeout: 60000 });
    const observed = await page.evaluate(() => ({
      projectId: activeStory?.id,
      step: activeStory?.intake?.current_step ?? null,
      narrowed: !!activeStory?.conversation?.some(m => m.narrowingQuestion),
      conversation: activeStory?.conversation?.map(m => ({ role: m.role, content: m.content, narrowingQuestion: !!m.narrowingQuestion })),
      statusLine: document.getElementById('story-generation-status')?.textContent?.trim()
    }));
    const requests = generationRequestCount - before;
    const savedResponse = await fetch(base + '/rest/v1/storysculpt_projects?id=eq.' + observed.projectId + '&select=id,intake,conversation,status', {
      headers: { apikey: publicKey, Authorization: 'Bearer ' + session.access_token }, signal: AbortSignal.timeout(15000)
    });
    assert.equal(savedResponse.status, 200, 'Independent test-member saved-row read');
    const saved = (await savedResponse.json())[0];
    const persisted = { answerCount: saved?.conversation?.filter(m => m.role === 'user' && m.content === test.answer).length,
      narrowingCount: saved?.conversation?.filter(m => m.narrowingQuestion).length, step: saved?.intake?.current_step ?? null };
    const localPass = test.broad ? observed.narrowed && observed.step === beforeStep && requests === 0 : !observed.narrowed && requests > 0 && observed.step !== beforeStep;
    results.push({ answer: test.answer, expectedBroad: test.broad, beforeStep, ...observed, persisted, generationRequests: requests,
      pass: localPass && persisted.answerCount === 1 && persisted.narrowingCount === (test.broad ? 1 : 0) && persisted.step === observed.step });
  }
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), origin, servedAssetsOnly: true, success: results.every(r => r.pass), cases: results }, null, 2));
} finally {
  await browser.close();
}
