import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { withTimeout, TelegramTimeoutError } from '../collector';

describe('withTimeout', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('resolves successfully before timeout', async () => {
    process.env.TELEGRAM_REQUEST_TIMEOUT_MS = '100';
    const mockPromise = () => new Promise(resolve => setTimeout(() => resolve('success'), 10));

    const result = await withTimeout(mockPromise, 'testOp');
    expect(result).toBe('success');
  });

  it('rejects successfully before timeout', async () => {
    process.env.TELEGRAM_REQUEST_TIMEOUT_MS = '100';
    const mockPromise = () => new Promise((_, reject) => setTimeout(() => reject(new Error('api error')), 10));

    await expect(withTimeout(mockPromise, 'testOp')).rejects.toThrow('api error');
  });

  it('throws TelegramTimeoutError when promise takes too long', async () => {
    process.env.TELEGRAM_REQUEST_TIMEOUT_MS = '50';
    const mockPromise = () => new Promise(resolve => setTimeout(() => resolve('late'), 100));

    await expect(withTimeout(mockPromise, 'testOp', 'testContext')).rejects.toThrow(TelegramTimeoutError);
    await expect(withTimeout(mockPromise, 'testOp', 'testContext')).rejects.toMatchObject({
      name: 'TelegramTimeoutError',
      code: 'TELEGRAM_TIMEOUT',
      message: "Telegram operation 'testOp' timed out for testContext",
    });
  });

  it('uses 30000ms as default timeout if env var is missing', async () => {
    delete process.env.TELEGRAM_REQUEST_TIMEOUT_MS;
    
    const mockPromise = () => new Promise(resolve => setTimeout(() => resolve('default-success'), 10));
    const result = await withTimeout(mockPromise, 'testOp');
    expect(result).toBe('default-success');
  });
});