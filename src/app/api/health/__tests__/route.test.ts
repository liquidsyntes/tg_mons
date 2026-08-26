import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    syncJob: {
      findFirst: vi.fn(),
    }
  }
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 503 if no sync jobs are found', async () => {
    vi.mocked(prisma.syncJob.findFirst).mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.message).toBe('no sync jobs found');
  });

  it('returns 503 if sync job is stuck (running for too long)', async () => {
    const twoHoursAgo = new Date(Date.now() - 130 * 60 * 1000);
    vi.mocked(prisma.syncJob.findFirst).mockResolvedValue({
      id: 1, createdAt: new Date(),
      startedAt: twoHoursAgo,
      endedAt: null,
      status: 'RUNNING',
      channelsTotal: 0,
      channelsSucceeded: 0,
      channelsFailed: 0,
      postsAdded: 0,
      durationMs: null,
      errorSummary: null,
    });

    const response = await GET();
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.message).toBe('sync job stuck');
  });

  it('returns 503 if sync job is stale (completed too long ago)', async () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);
    vi.mocked(prisma.syncJob.findFirst).mockResolvedValue({
      id: 1, createdAt: new Date(),
      startedAt: thirteenHoursAgo,
      endedAt: thirteenHoursAgo,
      status: 'COMPLETED',
      channelsTotal: 10,
      channelsSucceeded: 10,
      channelsFailed: 0,
      postsAdded: 100,
      durationMs: 10000,
      errorSummary: null,
    });

    const response = await GET();
    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.message).toBe('sync job stale');
  });

  it('returns 200 and healthy data for a recent successful job', async () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
    vi.mocked(prisma.syncJob.findFirst).mockResolvedValue({
      id: 1, createdAt: new Date(),
      startedAt: recent,
      endedAt: recent,
      status: 'COMPLETED',
      channelsTotal: 5,
      channelsSucceeded: 5,
      channelsFailed: 0,
      postsAdded: 50,
      durationMs: 5000,
      errorSummary: null,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.lastSyncStatus).toBe('COMPLETED');
    expect(data.channelsSucceeded).toBe(5);
  });
});
