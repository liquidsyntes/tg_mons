import { describe, expect, it } from 'vitest';
import { calculateRunSuccessRate, formatDurationMs, formatSyncJobErrorSummary, sanitizeOperationalError } from '../ops';

describe('operations summaries', () => {
  it('excludes running jobs from the success rate denominator and handles no finished jobs', () => {
    expect(calculateRunSuccessRate(2, 4)).toBe(50);
    expect(calculateRunSuccessRate(1, 3)).toBe(33.3);
    expect(calculateRunSuccessRate(0, 0)).toBeNull();
  });

  it('formats running and completed durations', () => {
    expect(formatDurationMs(null)).toBe('Нет данных');
    expect(formatDurationMs(12_000)).toBe('12 с');
    expect(formatDurationMs(61_000)).toBe('1 мин 1 с');
  });

  it('summarizes channel errors and redacts configured secrets', () => {
    const summary = formatSyncJobErrorSummary(null, [
      { channelId: 1, message: 'Таймаут' },
      { channelId: 2, message: 'Ошибка с token-value' },
    ], ['token-value']);
    expect(summary).toContain('#1: Таймаут');
    expect(summary).toContain('#2: Ошибка с [скрыто]');
    expect(summary).not.toContain('token-value');
  });

  it('redacts named credentials and Telegram Bot URLs in stored diagnostics', () => {
    const text = sanitizeOperationalError('TG_SESSION=abc123 api.telegram.org/bot123456/sendMessage');
    expect(text).not.toContain('abc123');
    expect(text).not.toContain('bot123456');
    expect(text).toContain('[скрыто]');
  });

  it('limits long summaries and leaves successful cycles without an error', () => {
    expect(formatSyncJobErrorSummary(null, [], [])).toBeNull();
    const summary = formatSyncJobErrorSummary('Сбой соединения', Array.from({ length: 5 }, (_, index) => ({
      channelId: index + 1, message: 'Ошибка'.repeat(100),
    })), []);
    expect(summary?.length).toBeLessThanOrEqual(800);
    expect(summary).toContain('ещё 2');
  });
});
