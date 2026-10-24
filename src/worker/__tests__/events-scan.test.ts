import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: mocks.info } }));
import { runEventsScan } from '../events-scan';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('COLLECT_API_TOKEN', 'test-token');
  vi.stubEnv('WEB_INTERNAL_URL', 'http://web:4000');
});

describe('runEventsScan', () => {
  it('checks availability of the shared token and then calls the protected scan route', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { hasToken: true } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, savedCount: 2 }) });
    vi.stubGlobal('fetch', fetcher);
    await runEventsScan();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'http://web:4000/api/settings', 'http://web:4000/api/events/scan',
    ]);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer test-token' } });
    expect(mocks.info).toHaveBeenCalledWith('Event scan completed', { savedCount: 2 });
  });

  it('does not request scanning without an OpenRouter token', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ settings: { hasToken: false } }) });
    vi.stubGlobal('fetch', fetcher);
    await runEventsScan();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('reports a failed scan without exposing its response body', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ settings: { hasToken: true } }) })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetcher);
    await expect(runEventsScan()).rejects.toThrow('HTTP 503');
  });
});
