import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), jobs: vi.fn(), lastCompleted: vi.fn(), jobCount: vi.fn(),
  channelCount: vi.fn(), problems: vi.fn(), channel: vi.fn(), updateChannel: vi.fn(),
  updateSubscription: vi.fn(), transaction: vi.fn(), metricsInvalidate: vi.fn(), bestTimeInvalidate: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  syncJob: { findMany: mocks.jobs, findFirst: mocks.lastCompleted, count: mocks.jobCount },
  channel: { count: mocks.channelCount, findMany: mocks.problems },
  $transaction: mocks.transaction,
} }));
vi.mock('@/lib/cache', () => ({
  metricsCache: { invalidate: mocks.metricsInvalidate }, bestTimeCache: { invalidate: mocks.bestTimeInvalidate },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET, POST } from '../route';

const url = 'http://localhost:4000/api/ops/status';
const job = {
  id: 5, startedAt: new Date('2026-10-24T09:00:00Z'), endedAt: new Date('2026-10-24T09:01:00Z'),
  status: 'COMPLETED', channelsTotal: 3, channelsSucceeded: 3, channelsFailed: 0,
  postsAdded: 10, durationMs: 60_000, errorSummary: null,
};
const problem = {
  id: 4, title: 'Канал с ошибкой', username: 'broken', isActive: false,
  consecutiveErrors: 10, lastError: 'Таймаут', lastCollectedAt: null,
};

function post(body: unknown): Promise<NextResponse> {
  return POST(new NextRequest(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true, role: 'ADMIN', userId: 7 });
  mocks.jobs.mockResolvedValue([job]);
  mocks.lastCompleted.mockResolvedValue({ endedAt: job.endedAt });
  mocks.jobCount.mockResolvedValueOnce(2).mockResolvedValueOnce(4);
  mocks.channelCount.mockResolvedValueOnce(8).mockResolvedValueOnce(1);
  mocks.problems.mockResolvedValue([problem]);
  mocks.channel.mockResolvedValue({ id: 4, consecutiveErrors: 10, lastError: 'Таймаут' });
  mocks.updateChannel.mockResolvedValue({ ...problem, isActive: true, consecutiveErrors: 0, lastError: null });
  mocks.updateSubscription.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(async callback => callback({
    channel: { findUnique: mocks.channel, update: mocks.updateChannel },
    userChannel: { updateMany: mocks.updateSubscription },
  }));
});

describe('/api/ops/status', () => {
  it('requires authorization and ADMIN for both methods', async () => {
    mocks.auth.mockResolvedValue({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(new NextRequest(url))).status).toBe(401);
    expect((await post({ action: 'reset-channel-errors', channelId: 4 })).status).toBe(401);
    mocks.auth.mockResolvedValue({ authorized: true, role: 'USER', userId: 8 });
    expect((await GET(new NextRequest(url))).status).toBe(403);
    expect((await post({ action: 'reset-channel-errors', channelId: 4 })).status).toBe(403);
    expect(mocks.jobs).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('returns bounded history, current problems and a seven-day success rate', async () => {
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(mocks.jobs).toHaveBeenCalledWith({ orderBy: { startedAt: 'desc' }, take: 20 });
    expect(mocks.jobCount).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({
      latestJob: { id: 5, startedAt: '2026-10-24T09:00:00.000Z' },
      summary: { lastSuccessfulAt: '2026-10-24T09:01:00.000Z', successRate7dPercent: 50,
        activeChannels: 8, disabledWithErrors: 1 },
      problemChannels: [{ id: 4, lastError: 'Таймаут' }],
    });
  });

  it('returns an empty state when no sync job has completed', async () => {
    mocks.jobs.mockResolvedValue([]);
    mocks.lastCompleted.mockResolvedValue(null);
    mocks.jobCount.mockReset().mockResolvedValue(0);
    mocks.channelCount.mockReset().mockResolvedValue(0);
    mocks.problems.mockResolvedValue([]);
    const body = await (await GET(new NextRequest(url))).json();
    expect(body).toMatchObject({ latestJob: null, jobs: [],
      summary: { lastSuccessfulAt: null, successRate7dPercent: null }, problemChannels: [] });
  });

  it('validates the action and channel ID before writing', async () => {
    for (const body of [null, {}, { action: 'unknown', channelId: 4 },
      { action: 'reset-channel-errors', channelId: 0 },
      { action: 'reset-channel-errors', channelId: 1.5 },
      { action: 'reset-channel-errors', channelId: '4' }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
    const malformed = new NextRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    expect((await POST(malformed)).status).toBe(400);
  });

  it('resets errors, enables an existing admin subscription and invalidates caches', async () => {
    const response = await post({ action: 'reset-channel-errors', channelId: 4 });
    expect(response.status).toBe(200);
    expect(mocks.updateChannel).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 4 }, data: { consecutiveErrors: 0, lastError: null, isActive: true },
    }));
    expect(mocks.updateSubscription).toHaveBeenCalledWith({
      where: { userId: 7, channelId: 4 }, data: { isActive: true },
    });
    expect(mocks.metricsInvalidate).toHaveBeenCalledOnce();
    expect(mocks.bestTimeInvalidate).toHaveBeenCalledOnce();
  });

  it('supports an ADMIN master session without creating a personal subscription', async () => {
    mocks.auth.mockResolvedValue({ authorized: true, role: 'ADMIN', userId: null });
    expect((await post({ action: 'reset-channel-errors', channelId: 4 })).status).toBe(200);
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing channel and 409 for a channel without errors', async () => {
    mocks.channel.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 4, consecutiveErrors: 0, lastError: null });
    expect((await post({ action: 'reset-channel-errors', channelId: 4 })).status).toBe(404);
    expect((await post({ action: 'reset-channel-errors', channelId: 4 })).status).toBe(409);
    expect(mocks.updateChannel).not.toHaveBeenCalled();
    expect(mocks.metricsInvalidate).not.toHaveBeenCalled();
  });
});
