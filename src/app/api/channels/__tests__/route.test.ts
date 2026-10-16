import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), add: vi.fn(), metrics: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verify }));
vi.mock('@/lib/worker-client', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/worker-client')>();
  return { ...original, requestWorkerAddChannel: mocks.add };
});
vi.mock('@/lib/metrics', () => ({ calculateChannelMetrics: mocks.metrics, getOverviewStats: vi.fn() }));
vi.mock('@/lib/cache', () => ({ metricsCache: { invalidate: mocks.invalidate }, bestTimeCache: { invalidate: mocks.invalidate } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { WorkerRequestError } from '@/lib/worker-client';
import { POST } from '../route';

function request(input = '@example_channel') {
  return new NextRequest('http://localhost:4000/api/channels', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, isMine: false }),
  });
}

describe('POST /api/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ authorized: true });
    mocks.add.mockResolvedValue(12);
    mocks.metrics.mockResolvedValue({ id: 12, title: 'Example' });
  });

  it('delegates Telegram work to worker and returns channel metrics', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mocks.add).toHaveBeenCalledWith('@example_channel', false);
    expect(mocks.metrics).toHaveBeenCalledWith(12);
    expect(await response.json()).toEqual({ id: 12, title: 'Example' });
  });

  it('returns 503 when worker is unavailable', async () => {
    mocks.add.mockRejectedValue(new WorkerRequestError(503, 'Worker недоступен'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Worker недоступен' });
    expect(mocks.metrics).not.toHaveBeenCalled();
  });
});
