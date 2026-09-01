import { describe, it, expect, vi } from 'vitest';

// We need to import withRateLimitAndRetry, but it's in worker/collector.ts
// which imports prisma and telegram — we'll mock those modules.
// Instead, let's test the rate limit logic by importing just the function.

// Mock the prisma and telegram modules
vi.mock('@/lib/prisma', () => ({
  prisma: {
    channel: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    snapshot: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    post: { findMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
    channelMetricDaily: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('telegram', () => ({
  Api: {
    channels: { GetFullChannel: vi.fn() },
    messages: { CheckChatInvite: vi.fn() },
  },
  TelegramClient: vi.fn(),
}));

vi.mock('telegram/sessions/index.js', () => ({
  StringSession: vi.fn(),
}));

import { withRateLimitAndRetry, sleep } from '@/worker/collector';

describe('withRateLimitAndRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRateLimitAndRetry(fn, 3);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on FLOOD_WAIT error', async () => {
    const floodError: any = new Error('FLOOD_WAIT_2');
    floodError.errorMessage = 'FLOOD_WAIT_2';
    floodError.seconds = 0; // minimal wait to avoid timeout

    const fn = vi.fn()
      .mockRejectedValueOnce(floodError)
      .mockResolvedValueOnce('success-after-retry');

    const result = await withRateLimitAndRetry(fn, 3);
    expect(result).toBe('success-after-retry');
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10000);

  it('throws after max retries exceeded', async () => {
    const floodError: any = new Error('FLOOD_WAIT_1');
    floodError.errorMessage = 'FLOOD_WAIT_1';
    floodError.seconds = 0;

    const fn = vi.fn().mockRejectedValue(floodError);

    await expect(withRateLimitAndRetry(fn, 2)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10000);

  it('throws non-FLOOD_WAIT errors immediately', async () => {
    const regularError = new Error('Some other error');
    const fn = vi.fn().mockRejectedValue(regularError);

    await expect(withRateLimitAndRetry(fn, 3)).rejects.toThrow('Some other error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('sleep', () => {
  it('resolves after specified milliseconds', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow small variance
  });
});
