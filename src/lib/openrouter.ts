import { logger } from '@/lib/logger';

/**
 * Shared OpenRouter API client.
 * Used by all 6 AI route handlers to avoid duplicated fetch/timeout/error logic.
 */

interface CallOpenRouterOptions {
  systemPrompt?: string;
  model?: string;        // default: 'z-ai/glm-5.3-flash'
  temperature?: number; // default: 0.7
  timeoutMs?: number;   // default: 60000
}

/**
 * Calls OpenRouter chat completions API and returns the raw content string.
 * Always requests JSON response format (response_format: { type: 'json_object' }).
 *
 * @throws Error if OPENROUTER_API_KEY is not set
 * @throws Error with status + body if API returns non-OK
 * @throws Error with 'Таймаут соединения с API.' on timeout
 */
export async function callOpenRouter(
  prompt: string,
  options?: CallOpenRouterOptions
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY не задан в .env файле');
  }

  const model = options?.model ?? 'z-ai/glm-5.3-flash';
  const temperature = options?.temperature ?? 0.7;
  const timeoutMs = options?.timeoutMs ?? 60000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const messages: { role: string; content: string }[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: 'json_object' },
    }),
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const errorData = await res.text();
    logger.error('OpenRouter Error', { status: res.status, errorData });
    throw new Error(`Ошибка API OpenRouter: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Clean up potential markdown formatting in response
  let cleaned = content;
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  }

  return cleaned;
}
