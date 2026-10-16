import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), collect: vi.fn(), invalidateMetrics: vi.fn(), invalidateBestTime: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verify }));
vi.mock('@/lib/worker-client', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/worker-client')>();
  return { ...original, requestWorkerCollection: mocks.collect };
});
vi.mock('@/lib/cache', () => ({
  metricsCache: { invalidate: mocks.invalidateMetrics },
  bestTimeCache: { invalidate: mocks.invalidateBestTime },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { WorkerRequestError } from '@/lib/worker-client';
import { POST } from '../route';

const request = () => new NextRequest('http://localhost:4000/api/collect/run', { method: 'POST' });

describe('POST /api/collect/run', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.verify.mockResolvedValue({ authorized: true }); });

  it('returns 409 when worker already has a collection cycle', async () => {
    mocks.collect.mockRejectedValue(new WorkerRequestError(409, 'Сбор уже выполняется'));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Сбор уже выполняется' });
    expect(mocks.invalidateMetrics).not.toHaveBeenCalled();
  });

  it('does not call worker without authorization', async () => {
    mocks.verify.mockResolvedValue({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.collect).not.toHaveBeenCalled();
  });

  it('returns the worker result and invalidates web caches', async () => {
    const result = { totalChannels: 1, successCount: 1, errorCount: 0, totalPosts: 2, totalSnapshots: 1, durationMs: 100 };
    mocks.collect.mockResolvedValue(result);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).result).toEqual(result);
    expect(mocks.invalidateMetrics).toHaveBeenCalledOnce();
    expect(mocks.invalidateBestTime).toHaveBeenCalledOnce();
  });
});
