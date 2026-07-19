import { createHash } from 'node:crypto';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { systemMsg, userMsg } = req.body;
  const requestedTemperature = Number(req.body && req.body.temperature);
  const temperature = Number.isFinite(requestedTemperature)
    ? Math.min(1.2, Math.max(0, requestedTemperature))
    : 0.8;

  if (!systemMsg || !userMsg) {
    return res.status(400).json({ error: 'Missing systemMsg or userMsg' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg }
        ],
        max_tokens: 1200,
        temperature
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: err.error && err.error.message ? err.error.message : 'API error ' + response.status
      });
    }

    const data = await response.json();
    data.prompt_version = createHash('sha256').update(systemMsg).digest('hex').slice(0, 12);
    data.temperature = temperature;
    return res.status(200).json(data);

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'DeepSeek did not respond in time. Please try again.' });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    clearTimeout(timeoutId);
  }
}
