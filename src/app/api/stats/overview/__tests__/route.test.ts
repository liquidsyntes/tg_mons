import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveSession: vi.fn(),
  getOverviewStats: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/users', () => ({ getActiveSession: mocks.getActiveSession }));
vi.mock('@/lib/metrics', () => ({ getOverviewStats: mocks.getOverviewStats }));
vi.mock('@/lib/cache', () => ({
  metricsCache: { get: mocks.cacheGet, set: mocks.cacheSet },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';

describe('GET /api/stats/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveSession.mockResolvedValue({ userId: 8, role: 'USER' });
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.getOverviewStats.mockResolvedValue({ channels: [] });
  });

  it('returns cached overview stats on hit', async () => {
    mocks.cacheGet.mockReturnValue({ channels: [{ id: 1 }] });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ channels: [{ id: 1 }] });
    expect(mocks.cacheGet).toHaveBeenCalledWith('overview:8');
    expect(mocks.getOverviewStats).not.toHaveBeenCalled();
  });

  it('fetches and caches overview stats on miss for user and global sessions', async () => {
    const resUser = await GET();
    expect(resUser.status).toBe(200);
    expect(mocks.getOverviewStats).toHaveBeenCalledWith(8);
    expect(mocks.cacheSet).toHaveBeenCalledWith('overview:8', { channels: [] });

    vi.clearAllMocks();
    mocks.getActiveSession.mockResolvedValue({ userId: null, role: 'ADMIN' });
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.getOverviewStats.mockResolvedValue({ channels: [{ id: 2 }] });

    const resGlobal = await GET();
    expect(resGlobal.status).toBe(200);
    expect(mocks.getOverviewStats).toHaveBeenCalledWith();
    expect(mocks.cacheSet).toHaveBeenCalledWith('overview', { channels: [{ id: 2 }] });
  });

  it('returns 500 when getOverviewStats throws', async () => {
    mocks.getOverviewStats.mockRejectedValue(new Error('overview failed'));

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'overview failed' });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
  });
});
