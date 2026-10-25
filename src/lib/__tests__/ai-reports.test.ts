import { describe, expect, it, vi } from 'vitest';

vi.mock('../prisma', () => ({
  prisma: {
    aiReport: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

import {
  buildChannelContentSummaryPrompt,
  formatTimestampedPosts,
  handleAiRouteError,
} from '../ai-reports';
import { parseStatsPeriod } from '../metrics/format';
import { OpenRouterTransportError } from '../openrouter';

describe('ai-reports helpers', () => {
  it('formats timestamped posts with separator', () => {
    const formatted = formatTimestampedPosts([
      { publishedAt: new Date('2026-10-17T10:00:00.000Z'), text: 'First post' },
      { publishedAt: new Date('2026-10-17T12:00:00.000Z'), text: 'Second post' },
    ]);

    expect(formatted).toBe(
      '[2026-10-17T10:00:00.000Z] First post\n\n---\n\n[2026-10-17T12:00:00.000Z] Second post'
    );
  });

  it('builds channel content summary prompt and respects character limit', () => {
    const prompt = buildChannelContentSummaryPrompt({
      channelTitle: 'Tech News',
      scopeDescription: 'посты за последние 7 дней',
      contentToAnalyze: 'ABCDEFGHIJ',
      maxChars: 5,
      charLimitLabel: '30 000',
    });

    expect(prompt).toContain('Проанализируй посты за последние 7 дней канала "Tech News"');
    expect(prompt).toContain('ограничено 30 000 символов');
    expect(prompt).toContain('ABCDE');
    expect(prompt).not.toContain('FGHIJ');
  });

  it('returns 504 on AbortError and 500 on general errors in handleAiRouteError', async () => {
    const abortErr = new Error('Timed out');
    abortErr.name = 'AbortError';
    const res504 = handleAiRouteError(abortErr);
    expect(res504.status).toBe(504);
    expect(await res504.json()).toEqual({ error: 'Таймаут соединения с API.' });

    const res500 = handleAiRouteError(new Error('OpenRouter failed'));
    expect(res500.status).toBe(500);
    expect(await res500.json()).toEqual({ error: 'OpenRouter failed' });

    const res503 = handleAiRouteError(new OpenRouterTransportError('ECONNRESET'));
    expect(res503.status).toBe(503);
    expect(await res503.json()).toEqual({ error: 'Не удалось связаться с OpenRouter. Повторите попытку.' });

    const resUnknown = handleAiRouteError('unexpected');
    expect(resUnknown.status).toBe(500);
    expect(await resUnknown.json()).toEqual({ error: 'Внутренняя ошибка сервера' });
  });
});

describe('parseStatsPeriod', () => {
  it('parses 24h and 30d and defaults everything else to 7d', () => {
    expect(parseStatsPeriod('24h')).toBe('24h');
    expect(parseStatsPeriod('30d')).toBe('30d');
    expect(parseStatsPeriod('7d')).toBe('7d');
    expect(parseStatsPeriod(null)).toBe('7d');
    expect(parseStatsPeriod('invalid')).toBe('7d');
  });
});
