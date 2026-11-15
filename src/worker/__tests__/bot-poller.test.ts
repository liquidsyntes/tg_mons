import { describe, expect, it, vi } from 'vitest';
import { createTelegramBotPoller, redactBotToken } from '../bot-poller';

const SECRET_TOKEN = '123456789:SECRET_BOT_TOKEN_XYZ';

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('redactBotToken', () => {
  it('masks telegram bot URL and raw token strings', () => {
    const raw = `FetchError: request to https://api.telegram.org/bot${SECRET_TOKEN}/getUpdates failed (token=${SECRET_TOKEN})`;
    const sanitized = redactBotToken(raw, SECRET_TOKEN);

    expect(sanitized).not.toContain(SECRET_TOKEN);
    expect(sanitized).toContain('api.telegram.org/bot[REDACTED]/getUpdates');
  });
});

describe('createTelegramBotPoller', () => {
  it('advances offset to update_id + 1 and dispatches parsed commands', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: [
            { update_id: 100, message: { chat: { id: 555 }, text: '/status' } },
            { update_id: 101, message: { chat: { id: 555 }, text: 'просто текст' } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: [
            { update_id: 102, message: { chat: { id: 555 }, text: '/digest' } },
          ],
        }),
      });

    const onCommand = vi.fn()
      .mockResolvedValueOnce('status reply')
      .mockResolvedValueOnce('digest reply');
    const sendReply = vi.fn().mockResolvedValue(true);
    const log = createMockLogger();

    const poller = createTelegramBotPoller({
      token: SECRET_TOKEN,
      pollTimeoutSec: 15,
      fetchImpl: fetchMock as unknown as typeof fetch,
      onCommand,
      sendReply,
      log,
    });

    const first = await poller.pollOnce();
    expect(first).toEqual({ ok: true, conflict: false, processed: 1, nextOffset: 102 });
    expect(fetchMock.mock.calls[0][0]).toContain('offset=0&timeout=15');
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(sendReply).toHaveBeenCalledWith('status reply', '555');

    const second = await poller.pollOnce();
    expect(second).toEqual({ ok: true, conflict: false, processed: 1, nextOffset: 103 });
    expect(fetchMock.mock.calls[1][0]).toContain('offset=102&timeout=15');
    expect(poller.getOffset()).toBe(103);
    expect(sendReply).toHaveBeenCalledWith('digest reply', '555');
  });

  it('handles 409 conflict without throwing and backs off with conflictDelayMs', async () => {
    let callCount = 0;
    const sleepCalls: number[] = [];
    let poller: ReturnType<typeof createTelegramBotPoller>;

    const fetchMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ ok: false, error_code: 409, description: 'Conflict' }),
          text: async () => 'Conflict',
        };
      }
      void poller.stop();
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: [] }),
      };
    });

    const log = createMockLogger();
    poller = createTelegramBotPoller({
      token: SECRET_TOKEN,
      retryDelayMs: 100,
      conflictDelayMs: 1234,
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: async (ms) => {
        sleepCalls.push(ms);
      },
      sendReply: vi.fn().mockResolvedValue(true),
      log,
    });

    const single = await poller.pollOnce();
    expect(single).toEqual({ ok: false, conflict: true, processed: 0, nextOffset: 0 });

    callCount = 0;
    poller.start();
    // Wait for async start() loop iteration to trigger conflict + stop()
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    await poller.stop();

    expect(sleepCalls).toContain(1234);
    expect(poller.isRunning()).toBe(false);
    expect(log.warn).toHaveBeenCalled();
  });

  it('never leaks bot token into logs on network errors and keeps offset safe on command failure', async () => {
    const log = createMockLogger();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error(`request to https://api.telegram.org/bot${SECRET_TOKEN}/getUpdates failed`))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: [{ update_id: 50, message: { chat: { id: 321 }, text: '/status' } }],
        }),
      });

    const onCommand = vi.fn().mockRejectedValueOnce(new Error(`boom https://api.telegram.org/bot${SECRET_TOKEN}/sendMessage`));
    const sendReply = vi.fn().mockResolvedValue(true);

    const poller = createTelegramBotPoller({
      token: SECRET_TOKEN,
      fetchImpl: fetchMock as unknown as typeof fetch,
      onCommand,
      sendReply,
      log,
    });

    const failedPoll = await poller.pollOnce();
    expect(failedPoll).toEqual({ ok: false, conflict: false, processed: 0, nextOffset: 0 });

    const serializedLogs = JSON.stringify([log.warn.mock.calls, log.error.mock.calls]);
    expect(serializedLogs).not.toContain(SECRET_TOKEN);
    expect(serializedLogs).toContain('bot[REDACTED]/getUpdates');

    const recoveredPoll = await poller.pollOnce();
    expect(recoveredPoll).toEqual({ ok: true, conflict: false, processed: 0, nextOffset: 51 });
    expect(poller.getOffset()).toBe(51);
    expect(sendReply).toHaveBeenCalledWith('⚠️ Не удалось обработать команду. Попробуйте повторить позже.', '321');
    const serializedAfterError = JSON.stringify(log.error.mock.calls);
    expect(serializedAfterError).not.toContain(SECRET_TOKEN);
  });
});
