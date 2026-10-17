import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendTelegramRuleAlert } from '../retry-policy';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Telegram rule delivery', () => {
  it('sends plain text and reports successful delivery', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'test-chat');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendTelegramRuleAlert('Тестовое правило')).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ chat_id: 'test-chat', text: 'Тестовое правило' });
  });

  it('reports failed delivery without throwing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'test-chat');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    expect(await sendTelegramRuleAlert('Тестовое правило')).toBe(false);
  });

  it('does not send when bot configuration is incomplete', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('TELEGRAM_CHAT_ID', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendTelegramRuleAlert('Тестовое правило')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
