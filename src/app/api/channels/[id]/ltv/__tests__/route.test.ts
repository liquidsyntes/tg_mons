import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postFindMany: vi.fn(),
  snapshotFindMany: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: mocks.postFindMany },
    postSnapshot: { findMany: mocks.snapshotFindMany },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';

describe('GET /api/channels/[id]/ltv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postFindMany.mockResolvedValue([]);
    mocks.snapshotFindMany.mockResolvedValue([]);
  });

  it('returns 400 when channel id is invalid or zero', async () => {
    const res = await GET(new Request('http://localhost/api/channels/bad/ltv'), {
      params: Promise.resolve({ id: 'bad' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
  });

  it('returns empty ltv array when channel has no recent posts', async () => {
    const res = await GET(new Request('http://localhost/api/channels/5/ltv'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ltv: [] });
    expect(mocks.snapshotFindMany).not.toHaveBeenCalled();
  });

  it('returns empty ltv array when posts lack early snapshot or enough points', async () => {
    const publishedAt = new Date(Date.now() - 24 * 3600 * 1000);
    mocks.postFindMany.mockResolvedValue([{ id: 101, publishedAt, views: 1000 }]);
    mocks.snapshotFindMany.mockResolvedValue([
      { postId: 101, collectedAt: new Date(publishedAt.getTime() + 10 * 3600 * 1000), views: 600 },
      { postId: 101, collectedAt: new Date(publishedAt.getTime() + 24 * 3600 * 1000), views: 900 },
    ]);

    const res = await GET(new Request('http://localhost/api/channels/5/ltv'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ltv: [] });
  });

  it('computes monotonic 72-hour ltv curve from valid posts', async () => {
    const publishedAt = new Date(Date.now() - 48 * 3600 * 1000);
    mocks.postFindMany.mockResolvedValue([{ id: 201, publishedAt, views: 1000 }]);
    mocks.snapshotFindMany.mockResolvedValue([
      { postId: 201, collectedAt: new Date(publishedAt.getTime() + 1 * 3600 * 1000), views: 400 },
      { postId: 201, collectedAt: new Date(publishedAt.getTime() + 3 * 3600 * 1000), views: 700 },
      { postId: 201, collectedAt: new Date(publishedAt.getTime() + 10 * 3600 * 1000), views: 650 },
    ]);

    const res = await GET(new Request('http://localhost/api/channels/5/ltv'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ltv: Array<{ hour: number; percent: number }> };
    expect(body.ltv).toHaveLength(72);
    expect(body.ltv[0]).toEqual({ hour: 1, percent: 40 });
    expect(body.ltv[2]).toEqual({ hour: 3, percent: 70 });
    expect(body.ltv[9]).toEqual({ hour: 10, percent: 70 });
    expect(body.ltv[71]).toEqual({ hour: 72, percent: 70 });
  });

  it('returns 500 when database query fails', async () => {
    mocks.postFindMany.mockRejectedValue(new Error('ltv failure'));

    const res = await GET(new Request('http://localhost/api/channels/5/ltv'), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'ltv failure' });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
  });
});
