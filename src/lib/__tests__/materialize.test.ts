import { describe, it, expect, vi, beforeEach } from 'vitest';
import { materializeDailyMetrics } from '../materialize';
import { prisma } from '../prisma';

vi.mock('../prisma', () => ({
  prisma: {
    snapshot: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    post: {
      findMany: vi.fn()
    },
    channelMetricDaily: {
      upsert: vi.fn()
    }
  }
}));

describe('materializeDailyMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate daily metrics based on snapshots and posts', async () => {
    vi.mocked(prisma.snapshot.findFirst).mockResolvedValue({
      membersCount: 1000
    } as any);

    vi.mocked(prisma.snapshot.findMany).mockResolvedValue([
      { membersCount: 1100, collectedAt: new Date() } as any
    ]);

    vi.mocked(prisma.post.findMany).mockResolvedValue([
      { views: 500, reactions: 10, comments: 2, forwards: 1 } as any,
      { views: 600, reactions: 20, comments: 5, forwards: 2 } as any
    ]);

    await materializeDailyMetrics(1, 1);

    expect(prisma.channelMetricDaily.upsert).toHaveBeenCalled();
    const callArgs = vi.mocked(prisma.channelMetricDaily.upsert).mock.calls[0][0];
    
    expect(callArgs.update.avgViews).toBe(550);
    expect(callArgs.update.postsCount).toBe(2);
    expect(callArgs.update.vr).toBe(50);
    expect(callArgs.update.err).toBe(3.64);
  });
});
