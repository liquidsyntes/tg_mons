import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), channel: vi.fn(), access: vi.fn(), snapshots: vi.fn(), previous: vi.fn(),
  posts: vi.fn(), engagement: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  channel: { findUnique: mocks.channel }, userChannel: { findUnique: mocks.access },
  snapshot: { findMany: mocks.snapshots, findFirst: mocks.previous },
  post: { findMany: mocks.posts }, postEngagementHour: { findMany: mocks.engagement },
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/timezone', () => ({ getAppTimezone: () => 'Europe/Moscow' }));

import { GET } from '../route';

const context = { params: Promise.resolve({ id: '7' }) };
const request = () => new NextRequest('http://localhost:4000/api/stats/channel/7/activity');

describe('GET /api/stats/channel/[id]/activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 3, role: 'USER' });
    mocks.access.mockResolvedValue({ channelId: 7 });
    mocks.channel.mockResolvedValue({ id: 7 });
    mocks.snapshots.mockResolvedValue([]);
    mocks.previous.mockResolvedValue(null);
    mocks.posts.mockResolvedValue([]);
    mocks.engagement.mockResolvedValue([]);
  });

  it('checks authentication and the personal channel list before querying activity', async () => {
    mocks.auth.mockResolvedValueOnce({ authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request(), context)).status).toBe(401);
    mocks.access.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.snapshots).not.toHaveBeenCalled();
  });

  it('returns 48 hourly rows with post and observed engagement', async () => {
    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    mocks.snapshots.mockResolvedValue([{ collectedAt: hour, membersCount: 101 }]);
    mocks.posts.mockResolvedValue([{ id: 5, messageId: 42n, publishedAt: hour, mentions: [{ id: 1 }] }]);
    mocks.engagement.mockResolvedValue([{ hourStart: hour, reactionsAdded: 3, forwardsAdded: 2 }]);
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const result = await response.json();
    expect(result.timeZone).toBe('Europe/Moscow');
    expect(result.rows).toHaveLength(48);
    expect(result.rows[0]).toMatchObject({ membersCount: 101, membersDelta: null,
      posts: [{ id: 5, messageId: '42', isForwarded: true }], reactionsAdded: 3, forwardsAdded: 2 });
  });

  it('accepts the master session and rejects malformed IDs', async () => {
    expect((await GET(request(), { params: Promise.resolve({ id: '7x' }) })).status).toBe(400);
    mocks.auth.mockResolvedValue({ authorized: true, userId: null, role: 'ADMIN' });
    expect((await GET(request(), context)).status).toBe(200);
    expect(mocks.channel).toHaveBeenCalledWith({ where: { id: 7 }, select: { id: true } });
  });
});
