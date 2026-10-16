import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

const mocks = vi.hoisted(() => ({ collect: vi.fn(), add: vi.fn(), backfill: vi.fn(), client: vi.fn() }));
vi.mock('../collector', () => ({ runCollectCycle: mocks.collect, addChannelByInput: mocks.add, collectChannelData: mocks.backfill }));
vi.mock('../client', () => ({ getTelegramClient: mocks.client }));
vi.mock('@/lib/prisma', () => ({ prisma: { channel: { update: vi.fn() } } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { createWorkerServer } from '../server';
import { TaskCoordinator } from '../task-coordinator';

function deferred() {
  let resolve!: (value: object) => void;
  const promise = new Promise<object>(done => { resolve = done; });
  return { promise, resolve };
}

describe('worker internal API', () => {
  const originalToken = process.env.COLLECT_API_TOKEN;
  beforeEach(() => { vi.clearAllMocks(); process.env.COLLECT_API_TOKEN = 'test-token'; });
  afterEach(() => {
    if (originalToken === undefined) delete process.env.COLLECT_API_TOKEN;
    else process.env.COLLECT_API_TOKEN = originalToken;
  });

  it('requires a bearer token and returns 409 for a concurrent collection', async () => {
    const server = createWorkerServer(new TaskCoordinator());
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/internal/collect`;
    const gate = deferred();
    mocks.collect.mockReturnValue(gate.promise);
    try {
      expect((await fetch(url, { method: 'POST' })).status).toBe(401);
      const first = fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test-token' } });
      await vi.waitFor(() => expect(mocks.collect).toHaveBeenCalledOnce());
      const conflict = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test-token' } });
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toEqual({ error: 'Сбор уже выполняется' });
      gate.resolve({ totalChannels: 0, successCount: 0, errorCount: 0, totalPosts: 0, totalSnapshots: 0, durationMs: 1 });
      expect((await first).status).toBe(200);
      expect(mocks.collect).toHaveBeenCalledOnce();
    } finally {
      gate.resolve({});
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
