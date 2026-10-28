import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeTelegramCookie, encodeTelegramCookie, isTelegramFlow, isTelegramLinkProof } from '../telegram-login';

describe('Telegram Login flow state', () => {
  beforeEach(() => vi.stubEnv('COLLECT_API_TOKEN', 'test-session-key'));
  afterEach(() => vi.unstubAllEnvs());

  it('accepts a fresh signed flow and rejects changes or expiration', () => {
    const flow = { state: 'random', nonce: 'nonce', verifier: 'verifier', mode: 'login', userId: null,
      expiresAt: Date.now() + 60_000 };
    const cookie = encodeTelegramCookie(flow, 'flow');
    expect(decodeTelegramCookie(cookie, 'flow', isTelegramFlow)).toEqual(flow);
    expect(decodeTelegramCookie(cookie + 'x', 'flow', isTelegramFlow)).toBeNull();
    expect(decodeTelegramCookie(cookie, 'link', isTelegramLinkProof)).toBeNull();
    expect(decodeTelegramCookie(encodeTelegramCookie({ ...flow, expiresAt: Date.now() - 1 }, 'flow'), 'flow', isTelegramFlow)).toBeNull();
    expect(decodeTelegramCookie(encodeTelegramCookie({ ...flow, state: '' }, 'flow'), 'flow', isTelegramFlow)).toBeNull();
  });
});
