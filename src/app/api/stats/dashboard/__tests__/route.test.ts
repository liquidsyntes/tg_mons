import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveSession: vi.fn(),
  getDashboardStats: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/users', () => ({ getActiveSession: mocks.getActiveSession }));
vi.mock('@/lib/dashboard', () => ({ getDashboardStats: mocks.getDashboardStats }));
vi.mock('@/lib/cache', () => ({
  metricsCache: { get: mocks.cacheGet, set: mocks.cacheSet },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';

describe('GET /api/stats/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveSession.mockResolvedValue({ userId: 3, role: 'USER' });
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.getDashboardStats.mockResolvedValue({ totalChannels: 4 });
  });

  it('returns cached dashboard stats on cache hit', async () => {
    mocks.cacheGet.mockReturnValue({ totalChannels: 9 });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalChannels: 9 });
    expect(mocks.cacheGet).toHaveBeenCalledWith('dashboard:3');
    expect(mocks.getDashboardStats).not.toHaveBeenCalled();
  });

  it('computes and caches dashboard stats for user and global session', async () => {
    const resUser = await GET();
    expect(resUser.status).toBe(200);
    expect(mocks.getDashboardStats).toHaveBeenCalledWith(3);
    expect(mocks.cacheSet).toHaveBeenCalledWith('dashboard:3', { totalChannels: 4 });

    vi.clearAllMocks();
    mocks.getActiveSession.mockResolvedValue({ userId: null, role: 'ADMIN' });
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.getDashboardStats.mockResolvedValue({ totalChannels: 18 });

    const resGlobal = await GET();
    expect(resGlobal.status).toBe(200);
    expect(mocks.getDashboardStats).toHaveBeenCalledWith();
    expect(mocks.cacheSet).toHaveBeenCalledWith('dashboard', { totalChannels: 18 });
  });

  it('returns 500 when getDashboardStats fails', async () => {
    mocks.getDashboardStats.mockRejectedValue(new Error('dashboard error'));

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'dashboard error' });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
  });
});
