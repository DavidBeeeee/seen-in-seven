// StorySculpt UX 91, Stranger 80 & 100, Developer 41 & 98 (WBR-462):
// 1. Crisis input is handled before generation and named in Help.
// 2. High-risk situations beyond crisis (medical or financial claims in UGC
//    copy, and identifiable private disclosures about someone else) are
//    flagged before quota and generation, with a Help answer, never a prompt edit.
// 3. Facts, inferences, and generated text are stored in three separate
//    categories that api/storysculpt.js storage paths treat differently.
// 4. Account-level deletion of StorySculpt data is a self-serve member action,
//    and the Help retention statement matches what the code deletes and keeps.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  default as handler,
  crisisScanText,
  partitionStoredMaterial,
  composeVersionedContext,
  checkCrossProjectRepetition,
  detectHighRiskInput,
  highRiskResponse
} from '../api/storysculpt.js';
import { detectCrisis } from '../api/_lib/storysculpt-steps.js';

process.env.RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || 'storysculpt-safety-'.padEnd(40, 'x');
process.env.GUEST_SESSION_SECRET = process.env.GUEST_SESSION_SECRET || 'storysculpt-safety-'.padEnd(40, 'y');
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'storysculpt-safety-placeholder';

const trips = input => detectCrisis(crisisScanText(input)).tripped;
const base = { messages: [{ role: 'assistant', content: 'What happened next?' }, { role: 'user', content: 'We launched the course in March.' }] };

console.log('1. crisisScanText covers every member-written field...');
assert.equal(trips(base), false, 'An ordinary answer must not trip');
assert.equal(trips({ ...base, messages: [...base.messages, { role: 'user', content: "Honestly I don't want to be here anymore" }] }), true, 'Latest answer');
assert.equal(trips({ ...base, regenerateNote: 'make it about how I want to end my life' }), true, 'Refine or regenerate note');
assert.equal(trips({ ...base, projectTitle: 'why I keep hurting myself' }), true, 'Chat title');
assert.equal(trips({ ...base, ugc: { creatorExperience: { story: 'Before this I was cutting myself every week' } } }), true, 'UGC experience note');
assert.equal(trips({ ...base, ugc: { creatorExperience: { moments: ['fine', 'everyone is better off without me'] } } }), true, 'UGC experience list');
assert.equal(trips({ ...base, ugc: { product: { description: 'Do not overdose. Keep out of reach of children.' } } }), false, 'Product label text is not the member speaking');
assert.equal(trips({ ...base, messages: [...base.messages, { role: 'user', content: 'This launch is killing me but the course is killing it' }] }), false, 'Idioms do not trip');

console.log('2. Crisis and high-risk gates run before quota, model and UGC...');
const src = readFileSync(new URL('../api/storysculpt.js', import.meta.url), 'utf8');
const handlerSrc = src.slice(src.indexOf('export default async function handler'));
const crisisGate = handlerSrc.indexOf('detectCrisis(crisisScanText(input))');
const highRiskGate = handlerSrc.indexOf('detectHighRiskInput(input)');
assert.ok(crisisGate > 0, 'Handler runs detectCrisis over crisisScanText');
assert.ok(highRiskGate > crisisGate, 'Handler runs detectHighRiskInput right after detectCrisis');
for (const later of ['consumeQuota(', 'handleUgcTurn(', 'handlePointsTurn(', 'callStorySculpt(']) {
  const at = handlerSrc.indexOf(later);
  assert.ok(at > highRiskGate, `${later} must come after both safety and high-risk gates`);
}
assert.ok(/content: crisisResponse\([^)]*\),\s*safety: true/.test(handlerSrc), 'Crisis reply is marked safety: true');
assert.ok(/content: highRiskResponse\([^)]*\),\s*safety: true/.test(handlerSrc), 'High-risk reply is marked safety: true');

console.log('3. Help names crisis, high-risk handling, retention and self-serve deletion without em dashes...');
const html = readFileSync(new URL('../api/_hub/storysculpt.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../js/storysculpt.js', import.meta.url), 'utf8');
const help = html.slice(html.indexOf('id="story-help"'));
assert.ok(help.includes('What if something hard comes up while I write?'), 'Help has the safety section');
assert.ok(help.includes('988') && help.includes('findahelpline.com'), 'Help names the crisis lines');
assert.ok(help.includes('Medical or financial claims in UGC or offer copy'), 'Help explains medical and financial claim handling');
assert.ok(help.includes('Disclosures about someone else'), 'Help explains third-party disclosure handling');
assert.ok(help.includes('How do I delete all my StorySculpt data, and what is retained?'), 'Help explains self-serve deletion and retention');
assert.ok(help.includes('storysculpt_member_context') && help.includes('storysculpt_projects') && help.includes('storysculpt_context_versions') && help.includes('public.logs'), 'Help names the exact tables deleted and retained from the code');
assert.ok(html.includes('id="mem-delete-all-data"') && html.includes('id="help-delete-all-data"'), 'Both Settings and Help provide the Delete all StorySculpt data button');
assert.ok(js.includes("action: 'delete-storysculpt-data', confirm: 'DELETE'"), 'Client invokes self-serve delete-storysculpt-data action');
assert.ok(!/—/.test(help), 'No em dashes anywhere in Help');

console.log('4. Developer 41: fact, inference, and generated line land in three stored categories and are treated differently...');
{
  const memberText = 'I run a tiny bakery in Pueblo and I wake up at 4am every day.';
  const script = 'I wake up at 4am every day. I was terrified of being judged. A warm bun can start a conversation.';
  const stored = partitionStoredMaterial(script, { source: memberText, memberText });
  assert.deepEqual(stored.facts, ['I wake up at 4am every day.'], 'Fact lands in facts category');
  assert.deepEqual(stored.inferences, ['I was terrified of being judged.'], 'Inference lands in inferences category');
  assert.deepEqual(stored.generated, ['A warm bun can start a conversation.'], 'Generated line lands in generated category');

  // Revision treatment: facts persist across revisions, while old inferences and generated lines are replaced.
  const revised = partitionStoredMaterial('Last spring my oven broke. Every crumb tells a story.', {
    source: memberText + ' Last spring my oven broke.',
    memberText: memberText + ' Last spring my oven broke.',
    previousCategories: stored
  });
  assert.deepEqual(
    revised.facts,
    ['I wake up at 4am every day.', 'Last spring my oven broke.'],
    'Verified member facts accumulate across project revisions'
  );
  assert.deepEqual(revised.inferences, [], 'Removed inferences are not carried forward');
  assert.deepEqual(revised.generated, ['Every crumb tells a story.'], 'Discarded generated lines are replaced by the new draft');

  // Context treatment: composeVersionedContext includes facts and excludes inferences and generated text.
  const now = Date.now();
  const profileVersion = {
    context: {
      facts: 'I run a tiny bakery in Pueblo.',
      confirmedMemories: [
        {
          id: '11111111-1111-4111-8111-111111111111:0',
          text: 'I baked 200 hot cross buns in my neighbor\'s kitchen.',
          sourceProjectId: '11111111-1111-4111-8111-111111111111',
          sourceMessageIndex: 0,
          confirmedAt: new Date(now - 1000).toISOString(),
          category: 'fact'
        },
        {
          id: '11111111-1111-4111-8111-111111111111:1',
          text: 'I was terrified of being judged.',
          sourceProjectId: '11111111-1111-4111-8111-111111111111',
          sourceMessageIndex: 1,
          confirmedAt: new Date(now - 1000).toISOString(),
          category: 'fact'
        }
      ]
    }
  };
  const composed = composeVersionedContext(
    { context: 'Focus on the Easter bake.' },
    profileVersion,
    { materialCategories: stored, includeStoredProjectFacts: true },
    now
  );
  assert.ok(composed.includes('I wake up at 4am every day.'), 'Stored project fact is included in context');
  assert.ok(composed.includes('200 hot cross buns'), 'Confirmed factual memory is included in context');
  assert.ok(!composed.includes('terrified of being judged'), 'Inference is excluded from factual context even if present in stored categories or memories');
  assert.ok(!composed.includes('A warm bun can start a conversation.'), 'Generated line is excluded from factual context');

  // Repetition treatment: generated lines are guarded against cross-project repetition.
  const repCheck = checkCrossProjectRepetition(
    'A warm bun can start a conversation.\n\nSecond paragraph.',
    [{ id: 'other-proj', output: 'Different hook entirely.', intake: { materialCategories: stored } }]
  );
  assert.equal(repCheck.ok, false, 'Stored generated opening is blocked from cross-project repetition');
}

console.log('5. UX 91: High-risk inputs beyond crisis are detected while ordinary difficulty passes...');
{
  // Medical claim in UGC copy
  const medUgc = detectHighRiskInput({
    mode: 'ugc',
    ugc: {
      product: { userDetails: 'This serum medically cures eczema and permanently removes all wrinkles.' },
      creatorExperience: { used: 'used', observations: 'Felt light on skin.' }
    }
  });
  assert.equal(medUgc.tripped, true, 'Medical cure claim in UGC product details must trip');
  assert.equal(medUgc.category, 'medical_claim');
  assert.ok(highRiskResponse(medUgc).includes('medical or disease treatment claim'));

  // Personal comfort in UGC copy must NOT trip
  const personalComfort = detectHighRiskInput({
    mode: 'ugc',
    ugc: {
      product: { userDetails: 'Insulated 40oz stainless steel tumbler.' },
      creatorExperience: { used: 'used', observations: 'For me, my knees feel better since I started carrying water all day.' }
    }
  });
  assert.equal(personalComfort.tripped, false, 'Personal comfort observation must not trip');

  // Financial guarantee claim in UGC copy
  const finUgc = detectHighRiskInput({
    mode: 'ugc',
    ugc: {
      product: { brief: 'Tell viewers this template gives guaranteed income and will make $10,000 next month.' }
    }
  });
  assert.equal(finUgc.tripped, true, 'Guaranteed financial claim in UGC brief must trip');
  assert.equal(finUgc.category, 'financial_claim');

  // Identifiable private disclosure about someone else
  const thirdParty = detectHighRiskInput({
    mode: 'rant',
    messages: [{ role: 'user', content: 'My client Sarah Jenkins was diagnosed with bipolar disorder and is hiding $50,000 debt from her partner.' }]
  });
  assert.equal(thirdParty.tripped, true, 'Named third-party diagnosis and debt disclosure must trip');
  assert.equal(thirdParty.category, 'third_party_disclosure');

  // Ordinary difficulty or anonymized client story must NOT trip
  const ordinary = detectHighRiskInput({
    mode: 'rant',
    messages: [{ role: 'user', content: 'One of my clients struggled with pricing their offer and I had to rebuild our onboarding after a hard week.' }]
  });
  assert.equal(ordinary.tripped, false, 'Anonymized client struggle and ordinary difficulty must not trip');
}

console.log('6. End-to-end handler verification (storage categories, high-risk pre-check, and self-serve data deletion)...');
{
  const PROJECT = '44444444-4444-4444-8444-444444444444';
  const MEMBER_TEXT = 'I run a tiny bakery in Pueblo and I wake up at 4am every day. Last spring my oven broke the week before Easter and I baked 200 hot cross buns in my neighbor\'s kitchen. People think baking is relaxing but it is mostly dishes and math. I want people to stop asking me for free samples.';
  const SCRIPT = 'Everybody thinks running a tiny bakery is relaxing. It is mostly dishes and math. I wake up at 4am every day. I was terrified of being judged. Last spring my oven broke the week before Easter, and I baked 200 hot cross buns in my neighbor\'s kitchen. So when you ask me for a free sample, think about the butter. A warm bun can start a conversation. What would you do with a broken oven the week before Easter? Come by the bakery in Pueblo and tell me.';

  const originalFetch = globalThis.fetch;
  let patchedIntakes = [];
  let deletedTables = [];
  let clearedProfiles = [];
  let modelCalled = 0;
  let quotaCalled = 0;

  let storedConversation = [
    { role: 'user', content: 'I wake up at 4am every day.' },
    { role: 'user', content: 'I was terrified of being judged.' },
    { role: 'user', content: 'A warm bun can start a conversation.' }
  ];
  let currentMaterialCategories = null;

  const reply = (value, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
    text: async () => JSON.stringify(value)
  });

  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/auth/v1/user')) return reply({ id: 'safety-member', name: 'Alex' });
    if (path.endsWith('/rest/v1/rpc/has_studio_app_access')) return reply(true);
    if (path.endsWith('/rest/v1/rpc/record_log_event')) return reply(null);
    if (path.includes('quota')) { quotaCalled += 1; return reply(true); }
    if (path.includes('/rest/v1/storysculpt_context_versions?')) return reply([]);
    if (path.includes('/rest/v1/storysculpt_member_context')) {
      if (options.method === 'PATCH') {
        clearedProfiles.push(JSON.parse(options.body));
        return reply(null, 204);
      }
      if (options.method === 'DELETE') {
        deletedTables.push('storysculpt_member_context');
        return reply(null, 204);
      }
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        return reply([{ user_id: body.user_id, profile: body.profile }]);
      }
      return reply([{ user_id: 'internal-member-1', profile: { name: 'Alex', facts: 'Bakery owner' } }]);
    }
    if (path.includes('/rest/v1/storysculpt_projects')) {
      if (options.method === 'PATCH') {
        const parsed = JSON.parse(options.body);
        patchedIntakes.push(parsed.intake);
        if (parsed.intake && parsed.intake.materialCategories) {
          currentMaterialCategories = parsed.intake.materialCategories;
        }
        return reply(null, 204);
      }
      if (options.method === 'DELETE') {
        deletedTables.push('storysculpt_projects');
        return reply([{ id: PROJECT }, { id: '55555555-5555-4555-8555-555555555555' }]);
      }
      return reply([{
        id: PROJECT,
        user_id: 'internal-member-1',
        output: SCRIPT,
        status: 'finished',
        content_type: currentProjectMode,
        intake: { current_step: 'F1', ...(currentMaterialCategories ? { materialCategories: currentMaterialCategories } : {}) },
        conversation: storedConversation
      }]);
    }
    if (path.includes('deepseek.com')) {
      modelCalled += 1;
      return reply({
        choices: [{ message: { content: 'FINAL SCRIPT: Free samples\n' + SCRIPT } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
    }
    throw new Error('Unexpected fetch in safety check: ' + path);
  };

  let currentProjectMode = 'bold';
  const callHandler = async (body) => {
    if (body && body.mode) currentProjectMode = body.mode;
    const req = { method: 'POST', headers: { authorization: 'Bearer safety-token' }, body };
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(payload) { this.body = payload; return this; } };
    await handler(req, res);
    return res;
  };

  try {
    // 6a. High-risk UGC medical claim pauses before quota or model call
    modelCalled = 0;
    quotaCalled = 0;
    const ugcRes = await callHandler({
      mode: 'ugc',
      projectId: PROJECT,
      intent: 'refine',
      projectTitle: 'Serum video',
      ugc: {
        product: { name: 'GlowSerum', userDetails: 'This serum medically cures eczema in 3 days.' },
        creatorExperience: { used: 'used', observations: 'Smooth texture.' }
      },
      messages: []
    });
    assert.equal(ugcRes.code, 200);
    assert.equal(ugcRes.body.safety, true);
    assert.equal(ugcRes.body.final, false);
    assert.equal(ugcRes.body.highRisk.category, 'medical_claim');
    assert.equal(quotaCalled, 0, 'High-risk UGC claim must not consume quota');
    assert.equal(modelCalled, 0, 'High-risk UGC claim must not call the AI model');

    // 6b. Finished script stores facts, inferences, and generated lines apart in intake.materialCategories
    patchedIntakes = [];
    const genRes = await callHandler({
      mode: 'bold',
      projectId: PROJECT,
      intent: 'refine',
      projectTitle: 'Free samples',
      messages: [
        { role: 'user', content: MEMBER_TEXT + ' I was terrified of being judged.' },
        { role: 'assistant', content: SCRIPT },
        { role: 'user', content: 'Keep it direct.' }
      ]
    });
    assert.equal(genRes.code, 200);
    assert.equal(patchedIntakes.length, 1);
    const cats = patchedIntakes[0].materialCategories;
    assert.ok(cats, 'updateProjectIntake saved materialCategories');
    assert.ok(cats.facts.includes('I wake up at 4am every day.'), 'Fact stored in materialCategories.facts');
    assert.ok(cats.inferences.includes('I was terrified of being judged.'), 'Inference stored in materialCategories.inferences');
    assert.ok(cats.generated.includes('A warm bun can start a conversation.'), 'Generated line stored in materialCategories.generated');

    // 6c. confirmMemory allows the stored fact, refuses the inference as a fact, and refuses the generated line
    const factConfirm = await callHandler({ action: 'confirm-memory', projectId: PROJECT, messageIndex: 0, category: 'fact' });
    assert.equal(factConfirm.code, 200, 'Confirming a verified fact succeeds');

    const infConfirm = await callHandler({ action: 'confirm-memory', projectId: PROJECT, messageIndex: 1, category: 'fact' });
    assert.equal(infConfirm.code, 400, 'Confirming an inference as a standing fact is refused');
    assert.match(infConfirm.body.error, /inferences cannot be saved as standing facts/i);

    const genConfirm = await callHandler({ action: 'confirm-memory', projectId: PROJECT, messageIndex: 2, category: 'fact' });
    assert.equal(genConfirm.code, 400, 'Confirming a generated line as a standing fact is refused');
    assert.match(genConfirm.body.error, /Generated script phrasing cannot be saved/i);

    // 6d. Self-serve deletion of all StorySculpt data
    const unconfirmedDel = await callHandler({ action: 'delete-storysculpt-data' });
    assert.equal(unconfirmedDel.code, 400, 'Delete without confirmation is refused');

    const delRes = await callHandler({ action: 'delete-storysculpt-data', confirm: 'DELETE' });
    assert.equal(delRes.code, 200);
    assert.equal(delRes.body.deleted, true);
    assert.equal(delRes.body.deletedProjects, 2);
    assert.equal(delRes.body.profileDeleted, true);
    assert.equal(clearedProfiles.length, 1, 'Profile snapshot cleared to {} before delete');
    assert.deepEqual(clearedProfiles[0].profile, {});
    assert.deepEqual(deletedTables, ['storysculpt_member_context', 'storysculpt_projects']);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log('StorySculpt safety, storage-category, and self-serve deletion checks passed.');
