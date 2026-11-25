import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveSession: vi.fn(),
  aiReportFindFirst: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/users', () => ({ getActiveSession: mocks.getActiveSession }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aiReport: { findFirst: mocks.aiReportFindFirst },
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '../route';

describe('GET /api/stats/trends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveSession.mockResolvedValue({ userId: 4, role: 'USER' });
    mocks.aiReportFindFirst.mockResolvedValue(null);
  });

  it('returns null when no saved trend report exists', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    expect(mocks.aiReportFindFirst).toHaveBeenCalledWith({
      where: { type: 'trend', userId: 4 },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns null on malformed JSON or invalid report shape', async () => {
    mocks.aiReportFindFirst.mockResolvedValueOnce({ id: 1, content: '{bad-json', createdAt: new Date() });
    const badJsonRes = await GET();
    expect(badJsonRes.status).toBe(200);
    expect(await badJsonRes.json()).toBeNull();

    mocks.aiReportFindFirst.mockResolvedValueOnce({ id: 2, content: '{"trends":"invalid"}', createdAt: new Date() });
    const badShapeRes = await GET();
    expect(badShapeRes.status).toBe(200);
    expect(await badShapeRes.json()).toBeNull();
    expect(mocks.loggerError).toHaveBeenCalledTimes(2);
  });

  it('returns parsed trend report when valid and omits userId filter for global session', async () => {
    mocks.getActiveSession.mockResolvedValue({ userId: null, role: 'ADMIN' });
    const createdAt = new Date('2026-11-20T08:00:00.000Z');
    mocks.aiReportFindFirst.mockResolvedValue({
      id: 3,
      createdAt,
      content: JSON.stringify({ trends: [{ topic: 'AI' }] }),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(mocks.aiReportFindFirst).toHaveBeenCalledWith({
      where: { type: 'trend' },
      orderBy: { createdAt: 'desc' },
    });
    expect(await res.json()).toEqual({
      createdAt: createdAt.toISOString(),
      data: { trends: [{ topic: 'AI' }] },
    });
  });

  it('returns 500 when database query fails', async () => {
    mocks.aiReportFindFirst.mockRejectedValue(new Error('db down'));

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch trends' });
  });
});
