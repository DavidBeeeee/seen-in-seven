#!/usr/bin/env node
// Exercise actual mobile clicks and asynchronous replies, not just static screens.
import assert from 'node:assert/strict';
import { chromium, chromiumPath, openState } from './check-storysculpt-surface.mjs';

const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });
try {
  for (const width of [390, 375]) {
    const { page, context, world } = await openState(browser, 'interview');
    try {
      await page.setViewportSize({ width, height: 844 });
      const project = world.projects[0];
      project.conversation = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 ? 'user' : 'assistant',
        content: 'Earlier exchange ' + i + '. ' + 'This is an earlier part of the same pottery story. '.repeat(3)
      })).concat({ role: 'assistant', step: 'R1', content: 'Tell me about the first time you sold your pottery.' });
      project.intake.current_step = 'R1';
      await page.reload();
      await page.waitForSelector('#story-editor:not([hidden])');
      const answer = page.locator('#story-answer');
      const composer = page.locator('#story-composer');
      const custom = page.locator('#story-custom-answer');
      const thread = page.locator('#story-scroll');
      const nearBottom = () => page.waitForFunction(() => {
        const el = document.getElementById('story-scroll');
        return el.scrollHeight - el.scrollTop - el.clientHeight < 3;
      });
      const reply = (step, content, final = false) => {
        world.mode.interview = { status: 200, body: { ok: true, step, content, final } };
      };
      const waitReply = text => page.waitForFunction(text =>
        document.getElementById('story-conversation').textContent.includes(text), text);
      assert((await answer.boundingBox()).height <= 60, 'empty answer should be compact');
      await answer.fill('I sold my first pottery bowl at the Saturday market. '.repeat(25));
      assert((await answer.boundingBox()).height > 60, 'writing should grow with real text');
      await page.setViewportSize({ width, height: 400 });
      await page.waitForTimeout(100);
      const writing = await answer.boundingBox();
      assert(writing.y + writing.height <= 401, 'answer stays above the keyboard');
      await answer.fill('I sold my first pottery bowl at the Saturday market.');
      reply('R3', 'Choose how long this pottery story should be.');
      await page.click('#story-send');
      await page.setViewportSize({ width, height: 844 });
      await waitReply('Choose how long this pottery story should be.');
      await nearBottom();
      assert(await custom.isVisible(), 'choice step offers an optional custom answer');
      assert(!(await composer.isVisible()), 'choice buttons do not compete with an empty writing box');
      assert(!(await answer.evaluate(el => document.activeElement === el)), 'reply does not reopen keyboard');
      await page.dispatchEvent('#story-scroll', 'wheel');
      await thread.evaluate(el => { el.scrollTop = 0; });
      await page.waitForSelector('#story-jump-latest:not([hidden])');
      await page.click('#story-jump-latest');
      await nearBottom();

      reply('R4', 'Choose the feeling for this pottery story.');
      await page.click('[data-quick-reply="60 seconds"]');
      await waitReply('Choose the feeling for this pottery story.');
      await nearBottom();
      assert(!(await composer.isVisible()));
      await custom.click();
      assert(await composer.isVisible(), 'custom answer is available when requested');
      await answer.fill('Keep it empathetic: I was nervous asking anyone to pay for my work.');
      reply('R5', 'Here is the first pottery draft. Tell me what to change.');
      await page.click('#story-send');
      await waitReply('Here is the first pottery draft. Tell me what to change.');
      await nearBottom();
      assert(!(await composer.isVisible()), 'new choice resets the previously expanded answer');
      await page.click('[data-quick-focus]');
      assert(await composer.isVisible(), 'Revise the draft opens the writing field');
      await answer.fill('Keep the moment when the buyer picked up the bowl.');
      reply('R6', 'Three pottery hooks:\n1. The first sale.\n2. The bowl I almost hid.\n3. A stranger picked it up.');
      await page.click('#story-send');
      await waitReply('Three pottery hooks:');
      await nearBottom();
      assert(!(await composer.isVisible()));
      reply('R7', 'Choose an open loop:\n1. What happened next surprised me.\n2. I nearly put it away.\n3. Then she asked the price.');
      await page.click('[data-quick-reply="2"]');
      await waitReply('Choose an open loop:');
      await nearBottom();
      reply('R8', 'I almost hid the bowl. Then a stranger picked it up and asked the price. That was my first sale.', true);
      await page.click('[data-quick-reply="1"]');
      await page.waitForSelector('#story-output:not(.mobile-hidden):not([hidden])');
      assert(await page.locator('#story-output-copy').isVisible(), 'finished script opens automatically');
      assert(!(await page.locator('#story-refine-note').evaluate(el => document.activeElement === el)), 'finishing does not open keyboard');
      console.log(`PASS ${width}px: growing answer, keyboard, reply scroll, history jump, length, tone, custom revision, hooks, open loop, finished script.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
