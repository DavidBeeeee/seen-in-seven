import {
  callModel,
  prepareLevelTwoEpiphanyMaterial,
  prepareLevelTwoVideoOneMaterial,
  prepareLevelTwoVideoFourMaterial,
  prepareLevelTwoVideoFiveMaterial
} from './generate.js';
import {
  buildSystemPrompt,
  extractSystemPrompt,
  finalizeScriptHook,
  finalizeScriptOpenLoop,
  validateBlueprintSource,
  reviewAndRepairScript
} from './_lib/prompt-engine.js';
import { authenticatedAdmin, consumeQuota, json } from './_lib/security.js';

export const config = { maxDuration: 180 };

async function measureStage(timings, name, work) {
  const started = Date.now();
  try {
    return await work();
  } finally {
    timings.push({ stage:name, durationMs:Date.now() - started });
  }
}

export default async function handler(req, res) {
  const requestStarted = Date.now();
  const timings = [];
  let status = 'failed';
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const admin = await authenticatedAdmin(req);
    if (!admin) return json(res, 403, { error: 'Administrator access required.' });
    const body = req.body || {};
    const errors = validateBlueprintSource(body.source);
    if (errors.length) return json(res, 400, { error: errors.join(' ') });
    const video = Number(body.videoNumber);
    const level = Number(body.level);
    const userMessage = typeof body.userContext === 'string' ? body.userContext.trim() : '';
    if (!Number.isInteger(video) || video < 1 || video > 7) return json(res, 400, { error: 'Video number must be between 1 and 7.' });
    if (level !== 1 && level !== 2) return json(res, 400, { error: 'Level must be 1 or 2.' });
    if (!userMessage || userMessage.length > 90000) return json(res, 400, { error: 'Test context is empty or too long.' });
    const allowed = await consumeQuota({
      subject: 'admin:' + admin.id,
      endpoint: 'prompt-test',
      limit: Number(process.env.ADMIN_LLM_HOURLY_LIMIT) || 100,
      req,
      userId: admin.id
    });
    if (!allowed) return json(res, 429, { error: 'The tester has reached its hourly generation limit. Please try again later.' });

    const prompt = extractSystemPrompt(body.source);
    if (!prompt) return json(res, 400, { error: 'The draft prompt could not be read.' });
    const systemPrompt = buildSystemPrompt(prompt, level, video);
    const temperature = body.generationMode === 'production' ? 0.8 : 0.25;
    let preparedUserMessage = userMessage;
    if (level === 2 && video === 1) {
      preparedUserMessage = await measureStage(timings, 'story-preparation', () =>
        prepareLevelTwoVideoOneMaterial(userMessage)
      );
    } else if (level === 2 && (video === 3 || video === 6)) {
      preparedUserMessage = await measureStage(timings, 'story-preparation', () =>
        prepareLevelTwoEpiphanyMaterial(userMessage, video)
      );
    } else if (level === 2 && video === 4) {
      preparedUserMessage = await measureStage(timings, 'story-preparation', () =>
        prepareLevelTwoVideoFourMaterial(userMessage)
      );
    } else if (level === 2 && video === 5) {
      preparedUserMessage = await measureStage(timings, 'story-preparation', () =>
        prepareLevelTwoVideoFiveMaterial(userMessage)
      );
    }
    let rawContent = '';
    let content = '';
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      const retryNote = attempt
        ? '\n\nA previous test draft did not pass the final story check. Write a genuinely fresh complete script that fixes every mechanical issue as well as the story architecture. Keep the OPEN LOOP under 50 words, connect the concrete CTA bridge into the follow action without a full stop, use exactly one "because," include the seven-part orientation, and avoid every banned word. Return only the five labeled sections.\n\nEXACT FEEDBACK FROM THE PREVIOUS DRAFT:\n' + String(lastError && lastError.message || '')
        : '';
      try {
        const stageSuffix = '-' + (attempt + 1);
        rawContent = await measureStage(timings, 'draft' + stageSuffix, () =>
          callModel(systemPrompt, preparedUserMessage + retryNote, attempt ? 0.45 : temperature)
        );
        const reviewedContent = await measureStage(timings, 'story-review' + stageSuffix, () => reviewAndRepairScript({
          script: rawContent,
          systemPrompt,
          userMessage: preparedUserMessage + retryNote,
          level,
          video,
          callModel,
          provisionalHook: true,
          provisionalOpenLoop: true
        }));
        const retentionContent = await measureStage(timings, 'open-loop' + stageSuffix, () => finalizeScriptOpenLoop({
          script: reviewedContent,
          systemPrompt,
          userMessage: preparedUserMessage + retryNote,
          level,
          video,
          callModel
        }));
        content = await measureStage(timings, 'hook' + stageSuffix, () => finalizeScriptHook({
          script: retentionContent,
          systemPrompt,
          userMessage: preparedUserMessage + retryNote,
          level,
          video,
          callModel
        }));
        break;
      } catch (error) {
        lastError = error;
        const canRetry = /story review found an issue|script response still needs correction/i.test(String(error && error.message || ''));
        if (!canRetry || attempt === 1) throw error;
      }
    }
    status = 'completed';
    return json(res, 200, { rawContent, content });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Test generation failed.' });
  } finally {
    console.info('[SeenInSeven test timing]', JSON.stringify({
      level:req && req.body && req.body.level,
      video:req && req.body && req.body.videoNumber,
      status,
      totalMs:Date.now() - requestStarted,
      stages:timings
    }));
  }
}
