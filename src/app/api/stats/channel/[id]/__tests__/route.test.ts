import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  extractRequestSession: vi.fn(),
  getChannelDetailStats: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ extractRequestSession: mocks.extractRequestSession }));
vi.mock('@/lib/metrics', () => ({
  getChannelDetailStats: mocks.getChannelDetailStats,
  parseStatsPeriod: (raw: string | null) => (raw === '24h' || raw === '30d' ? raw : '7d'),
}));
vi.mock('@/lib/cache', () => ({
  metricsCache: { get: mocks.cacheGet, set: mocks.cacheSet },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';

describe('GET /api/stats/channel/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractRequestSession.mockResolvedValue({ authorized: true, userId: 5, role: 'USER' });
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.getChannelDetailStats.mockResolvedValue({ channel: { id: 9, title: 'Demo' } });
  });

  it('returns 400 for non-numeric channel id', async () => {
    const req = new NextRequest('http://localhost:4000/api/stats/channel/abc');
    const res = await GET(req, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Некорректный ID канала' });
  });

  it('returns cached stats when available in metricsCache', async () => {
    const cached = { channel: { id: 9, title: 'Cached' } };
    mocks.cacheGet.mockReturnValue(cached);

    const req = new NextRequest('http://localhost:4000/api/stats/channel/9?period=30d');
    const res = await GET(req, { params: Promise.resolve({ id: '9' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cached);
    expect(mocks.cacheGet).toHaveBeenCalledWith('channel:5:9:30d');
    expect(mocks.getChannelDetailStats).not.toHaveBeenCalled();
  });

  it('returns 404 when getChannelDetailStats resolves to null', async () => {
    mocks.getChannelDetailStats.mockResolvedValue(null);

    const req = new NextRequest('http://localhost:4000/api/stats/channel/99?period=7d');
    const res = await GET(req, { params: Promise.resolve({ id: '99' }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Канал не найден' });
    expect(mocks.cacheSet).not.toHaveBeenCalled();
  });

  it('computes and caches detail stats on cache miss for user and global sessions', async () => {
    const req = new NextRequest('http://localhost:4000/api/stats/channel/9?period=24h');
    const res = await GET(req, { params: Promise.resolve({ id: '9' }) });
    expect(res.status).toBe(200);
    expect(mocks.getChannelDetailStats).toHaveBeenCalledWith(9, '24h', 5);
    expect(mocks.cacheSet).toHaveBeenCalledWith('channel:5:9:24h', { channel: { id: 9, title: 'Demo' } });

    vi.clearAllMocks();
    mocks.extractRequestSession.mockResolvedValue({ authorized: true, userId: null, role: 'ADMIN' });
    mocks.cacheGet.mockReturnValue(undefined);
    mocks.getChannelDetailStats.mockResolvedValue({ channel: { id: 9, title: 'Global' } });

    const resGlobal = await GET(new NextRequest('http://localhost:4000/api/stats/channel/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(resGlobal.status).toBe(200);
    expect(mocks.getChannelDetailStats).toHaveBeenCalledWith(9, '7d');
    expect(mocks.cacheSet).toHaveBeenCalledWith('channel:9:7d', { channel: { id: 9, title: 'Global' } });
  });

  it('returns 500 on unexpected errors', async () => {
    mocks.getChannelDetailStats.mockRejectedValue(new Error('detail boom'));

    const req = new NextRequest('http://localhost:4000/api/stats/channel/9');
    const res = await GET(req, { params: Promise.resolve({ id: '9' }) });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'detail boom' });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
  });
});
