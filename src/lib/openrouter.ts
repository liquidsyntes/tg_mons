import { logger } from '@/lib/logger';
import { getAiConfig } from '@/lib/ai-config';

/**
 * Shared OpenRouter API client.
 * Used by AI route handlers to avoid duplicated fetch/timeout/error logic.
 */

interface CallOpenRouterOptions {
  systemPrompt?: string;
  model?: string;        // override saved/default model for this call
  temperature?: number; // default: 0.7
  timeoutMs?: number;   // default: 60000
}

export class OpenRouterTransportError extends Error {
  constructor(public readonly reasonCode: string | null = null) {
    super('Не удалось связаться с OpenRouter. Повторите попытку.');
    this.name = 'OpenRouterTransportError';
  }
}

function getTransportReasonCode(error: unknown): string | null {
  const cause = error instanceof Error ? error.cause : null;
  if (!cause || typeof cause !== 'object' || !('code' in cause) || typeof cause.code !== 'string') return null;
  return /^[A-Z0-9_]{1,40}$/.test(cause.code) ? cause.code : null;
}

/**
 * Calls OpenRouter chat completions API and returns the raw content string.
 * Always requests JSON response format (response_format: { type: 'json_object' }).
 *
 * @throws Error if neither saved nor environment OpenRouter key is set
 * @throws Error with status + body if API returns non-OK
 * @throws Error with 'Таймаут соединения с API.' on timeout
 */
export async function callOpenRouter(
  prompt: string,
  options?: CallOpenRouterOptions
): Promise<string> {
  const config = await getAiConfig();
  const apiKey = config.apiKey;
  if (!apiKey) {
    throw new Error('Ключ OpenRouter не настроен');
  }

  const model = options?.model ?? config.model;
  const temperature = options?.temperature ?? 0.7;
  const timeoutMs = options?.timeoutMs ?? 60000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const messages: { role: string; content: string }[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
  } catch (error) {
    if (controller.signal.aborted) throw error;
    throw new OpenRouterTransportError(getTransportReasonCode(error));
  } finally {
    clearTimeout(timeoutId);
  }

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
