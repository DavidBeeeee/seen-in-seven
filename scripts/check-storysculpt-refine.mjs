#!/usr/bin/env node

// WBR-462: Refine must replace a finished rant through the real F2 handler.
// These are behavioral fixtures: DeepSeek and Supabase are mocked, while the
// production routing, bounded repair, validation, event and persistence paths run.

import assert from 'node:assert/strict';

let n = 0;
const pass = message => { n += 1; console.log(`  PASS [${n}]: ${message}`); };

const MEMBER = 'I run a tiny bakery in Pueblo and I wake up at 4am every day. Last spring my oven broke the week before Easter and I baked 200 hot cross buns in my neighbor\'s kitchen. People think baking is relaxing but it is mostly dishes and math.';
const ORIGINAL = 'People think running a tiny bakery is relaxing. It is mostly dishes and math. I wake up at 4am every day. Last spring my oven broke the week before Easter, and I baked 200 hot cross buns in my neighbor\'s kitchen. So when you ask me for a free sample, think about the butter. Then pick up a bun. What would you do with a broken oven the week before Easter? Come by the bakery in Pueblo and tell me.';
const NATURAL_CTA = ORIGINAL.replace('Come by the bakery in Pueblo and tell me.', 'Come by the bakery in Pueblo; the buns are still warm.');
const NO_CTA = ORIGINAL.replace('Come by the bakery in Pueblo and tell me.', 'The butter is already on the counter.');
const NO_CTA_OR_QUESTION = NO_CTA.replace('What would you do with a broken oven the week before Easter?', 'That is the part behind the counter.');

process.env.RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'storysculpt-refine-'.padEnd(40, 'x');
process.env.GUEST_SESSION_SECRET = process.env.GUEST_SESSION_SECRET || 'storysculpt-refine-'.padEnd(40, 'y');
process.env.DEEPSEEK_API_KEY = 'storysculpt-refine-placeholder';
const { default: handler } = await import('../api/storysculpt.js');

const PROJECT = '44444444-4444-4444-8444-444444444444';
const originalFetch = globalThis.fetch;
let replies = [];
let modelRequests = [];
let events = [];
let patches = [];
const reply = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value, text: async () => JSON.stringify(value) });

globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.endsWith('/auth/v1/user')) return reply({ id: 'refine-member' });
  if (path.endsWith('/rest/v1/rpc/has_studio_app_access')) return reply(true);
  if (path.endsWith('/rest/v1/rpc/record_log_event')) { events.push(JSON.parse(options.body)); return reply(null); }
  if (path.includes('/rest/v1/storysculpt_projects?')) {
    if (options.method === 'PATCH') { patches.push(JSON.parse(options.body)); return reply(null); }
    return reply([{ id: PROJECT, output: ORIGINAL, content_type: 'rant', intake: { current_step: 'F2' }, conversation: [] }]);
  }
  if (path.includes('/rest/v1/storysculpt_context_versions?')) return reply([]);
  if (path.includes('quota')) return reply(true);
  if (path.includes('deepseek.com')) {
    modelRequests.push(String(options.body || ''));
    const content = replies.length > 1 ? replies.shift() : replies[0];
    assert.equal(typeof content, 'string', 'every model attempt needs a scripted reply');
    return reply({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  }
  throw new Error('Unexpected fetch in Refine eval: ' + path);
};

async function refine(scripts, note = 'Make it shorter and make the invitation sound more natural.') {
  replies = scripts.map(script => 'FINAL SCRIPT: Free samples\n' + script);
  modelRequests = [];
  events = [];
  patches = [];
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer refine-token' },
    body: {
      mode: 'rant', projectId: PROJECT, intent: 'refine', projectTitle: 'Free samples', context: '',
      messages: [{ role: 'user', content: MEMBER }, { role: 'assistant', content: ORIGINAL }, { role: 'user', content: note }]
    }
  };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res);
  return res;
}

const event = type => events.find(item => item.p_event_type === type);

try {
  console.log('--- StorySculpt Refine eval (WBR-462) ---');
  {
    const res = await refine([NATURAL_CTA]);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.equal(modelRequests.length, 1, 'a natural closing invitation needs no repair: ' + JSON.stringify(event('storysculpt_generation')?.p_detail));
    assert.equal(res.body.step, 'F2');
    assert.notEqual(res.body.content, ORIGINAL, 'the new version replaces the old output');
    assert.match(res.body.content, /Come by the bakery in Pueblo; the buns are still warm\./);
    assert.match(res.body.content, /What would you do with a broken oven/);
    assert.equal(event('storysculpt_generation').p_detail.attempts, 1);
    pass('F2 accepts a changed script with its natural closing invitation intact');
  }
  {
    const res = await refine([NO_CTA, NO_CTA, NO_CTA]);
    assert.equal(res.code, 502, JSON.stringify(res.body));
    assert.equal(res.body.rejected, 'missing-cta');
    assert.equal(modelRequests.length, 3, 'the original plus two bounded repairs ran');
    assert.equal(patches.length, 0, 'a genuinely incomplete revision never overwrites the saved script');
    assert.equal(event('storysculpt_output_rejected').p_detail.attempts, 3);
    pass('a truly missing CTA still fails after three attempts and preserves the original');
  }
  {
    const res = await refine([NO_CTA_OR_QUESTION], 'Make it shorter. Remove the CTA. Remove the audience question.');
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.equal(modelRequests.length, 1);
    assert.equal(patches.length, 1, 'an explicitly requested omission is a valid new version');
    pass('an explicit request to omit the CTA and audience question remains allowed');
  }
  {
    const res = await refine([NO_CTA, NATURAL_CTA]);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.equal(modelRequests.length, 2);
    assert.match(modelRequests[1], /missing-cta/);
    assert.match(res.body.content, /Come by the bakery/);
    assert.equal(patches.length, 1);
    pass('a repair that adds the missing invitation is accepted and saved');
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`\nALL STORYSCULPT REFINE CHECKS PASSED (${n}/${n})`);
