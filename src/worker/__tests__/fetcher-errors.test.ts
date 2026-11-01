import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withRateLimitAndRetry } from '../fetcher';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Telegram retry error shapes', () => {
  it.each([new Error('plain error'), 'text error', null, { message: 'plain object' }])(
    'rethrows a non-FLOOD_WAIT value without retrying: %s', async error => {
      const request = vi.fn().mockRejectedValue(error);
      const result = withRateLimitAndRetry(request);
      const assertion = expect(result).rejects.toBe(error);
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it('uses seconds before the errorMessage suffix and retries once', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce({ seconds: 2, errorMessage: 'FLOOD_WAIT_8' })
      .mockResolvedValueOnce('recovered');
    const result = withRateLimitAndRetry(request, 2);
    await vi.advanceTimersByTimeAsync(5999);
    expect(request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe('recovered');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('reads FLOOD_WAIT from errorMessage and throws the original value after the last attempt', async () => {
    const error = { errorMessage: 'FLOOD_WAIT_3', seconds: 0 };
    const request = vi.fn().mockRejectedValue(error);
    const result = withRateLimitAndRetry(request, 2);
    const assertion = expect(result).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('ignores malformed Telegram error fields', async () => {
    const error = { errorMessage: 123, seconds: '3' };
    const request = vi.fn().mockRejectedValue(error);
    const result = withRateLimitAndRetry(request);
    const assertion = expect(result).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(request).toHaveBeenCalledOnce();
  });
});
