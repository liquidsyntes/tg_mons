import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  discovery: vi.fn(),
  authorizationCodeGrant: vi.fn(),
  enableNonRepudiationChecks: vi.fn(),
  ClientSecretBasic: vi.fn(),
}));
vi.mock('openid-client', () => mocks);

import { exchangeTelegramCode, type TelegramFlow } from '../telegram-login';

afterEach(() => vi.unstubAllEnvs());

it('includes the client ID in the Telegram token request and uses the registered callback', async () => {
  vi.stubEnv('TELEGRAM_LOGIN_CLIENT_ID', 'bot-client-id');
  vi.stubEnv('TELEGRAM_LOGIN_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('TELEGRAM_LOGIN_REDIRECT_URI', 'https://tgmons.online/api/auth/telegram/callback');
  mocks.discovery.mockResolvedValue({});
  mocks.authorizationCodeGrant.mockResolvedValue({ claims: () => ({ sub: 'telegram-123', name: 'Тест' }) });

  const flow: TelegramFlow = { state: 'state-1', nonce: 'nonce-1', verifier: 'verifier-1',
    mode: 'login', userId: null, expiresAt: Date.now() + 60_000 };
  const profile = await exchangeTelegramCode(
    new URL('https://localhost:4000/api/auth/telegram/callback?code=one-use-code&state=state-1'), flow,
  );

  expect(profile).toEqual({ sub: 'telegram-123', name: 'Тест', username: null, photoUrl: null });
  expect(mocks.authorizationCodeGrant).toHaveBeenCalledWith(expect.anything(),
    new URL('https://tgmons.online/api/auth/telegram/callback?code=one-use-code&state=state-1'),
    { pkceCodeVerifier: 'verifier-1', expectedState: 'state-1', expectedNonce: 'nonce-1', idTokenExpected: true },
    { client_id: 'bot-client-id' });
});
