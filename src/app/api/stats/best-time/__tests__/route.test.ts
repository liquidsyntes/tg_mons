import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveSession: vi.fn(),
  getBestTimeRecommendation: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/users', () => ({ getActiveSession: mocks.getActiveSession }));
vi.mock('@/lib/metrics', () => ({ getBestTimeRecommendation: mocks.getBestTimeRecommendation }));
vi.mock('@/lib/cache', () => ({
  bestTimeCache: { get: mocks.cacheGet, set: mocks.cacheSet },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';

describe('GET /api/stats/best-time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveSession.mockResolvedValue({ userId: 12, role: 'USER' });
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.getBestTimeRecommendation.mockResolvedValue({ bestHourUtc: 15, slots: [] });
  });

  it('returns cached recommendation on cache hit using user-scoped key', async () => {
    const cachedValue = { bestHourUtc: 10, slots: [{ hour: 10, score: 95 }] };
    mocks.cacheGet.mockReturnValue(cachedValue);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cachedValue);
    expect(mocks.cacheGet).toHaveBeenCalledWith('best-time:12');
    expect(mocks.getBestTimeRecommendation).not.toHaveBeenCalled();
  });

  it('fetches and caches recommendation on cache miss for user and global sessions', async () => {
    const resUser = await GET();
    expect(resUser.status).toBe(200);
    expect(mocks.getBestTimeRecommendation).toHaveBeenCalledWith(12);
    expect(mocks.cacheSet).toHaveBeenCalledWith('best-time:12', { bestHourUtc: 15, slots: [] });

    vi.clearAllMocks();
    mocks.getActiveSession.mockResolvedValue({ userId: null, role: 'ADMIN' });
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.getBestTimeRecommendation.mockResolvedValue({ bestHourUtc: 18, slots: [] });

    const resGlobal = await GET();
    expect(resGlobal.status).toBe(200);
    expect(mocks.getBestTimeRecommendation).toHaveBeenCalledWith();
    expect(mocks.cacheSet).toHaveBeenCalledWith('best-time', { bestHourUtc: 18, slots: [] });
  });

  it('returns 500 when recommendation calculation fails', async () => {
    mocks.getBestTimeRecommendation.mockRejectedValue(new Error('best-time failure'));

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'best-time failure' });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
  });
});
