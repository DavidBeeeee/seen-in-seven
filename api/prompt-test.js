import { callModel } from './generate.js';
import {
  buildSystemPrompt,
  extractSystemPrompt,
  reviewAndRepairScript
} from './_lib/prompt-engine.js';
import { authenticatedAdmin, consumeQuota, json } from './_lib/security.js';

export const config = { maxDuration: 90 };

function validateBlueprintSource(source) {
  const errors = [];
  if (typeof source !== 'string') return ['Blueprint source is missing.'];
  if (source.length < 10000 || source.length > 200000) errors.push('Blueprint length is outside the expected range.');
  if (!/^const SYSTEM_PROMPT = `[^]*`;\s*$/.test(source)) errors.push('The file must contain only the SYSTEM_PROMPT template.');
  if ((source.match(/`/g) || []).length !== 2) errors.push('Backticks are not allowed inside the prompt text.');
  if (source.includes('${')) errors.push('JavaScript interpolation syntax is not allowed inside the prompt text.');
  return errors;
}

export default async function handler(req, res) {
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
    const rawContent = await callModel(systemPrompt, userMessage, temperature);
    const content = await reviewAndRepairScript({
      script: rawContent,
      systemPrompt,
      userMessage,
      level,
      video,
      callModel
    });
    return json(res, 200, { rawContent, content });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Test generation failed.' });
  }
}
