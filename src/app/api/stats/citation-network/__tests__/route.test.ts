import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), subscriptions: vi.fn(), channels: vi.fn(), build: vi.fn(), propagation: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  userChannel: { findMany: mocks.subscriptions }, channel: { findMany: mocks.channels },
} }));
vi.mock('@/lib/citationNetwork', () => ({ buildCitationNetwork: mocks.build }));
vi.mock('@/lib/metrics/propagation', () => ({ getPropagationForChannel: mocks.propagation }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost:4000/api/stats/citation-network?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true, role: 'USER', userId: 7 });
  mocks.subscriptions.mockResolvedValue([{ channelId: 1, niche: 'science' }, { channelId: 2, niche: 'news' }]);
  mocks.channels.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  mocks.build.mockResolvedValue({ focalChannelId: 1, days: 30, nodes: [], edges: [], discoveredHubs: [] });
  mocks.propagation.mockResolvedValue({ periodDays: 30, role: 'isolated', originRatio: null,
    incomingCount: 0, outgoingCount: 0, averageIncomingDelayMinutes: null, topCitedPosts: [], recentChains: [] });
});

describe('GET /api/stats/citation-network', () => {
  it('requires authorization and validates channel and period', async () => {
    mocks.auth.mockResolvedValueOnce({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request('channelId=1'))).status).toBe(401);
    for (const query of ['channelId=0', 'channelId=1x', 'channelId=1&days=8']) {
      expect((await GET(request(query))).status).toBe(400);
    }
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it('uses only active UserChannel IDs and their niches', async () => {
    expect((await GET(request('channelId=1&days=7'))).status).toBe(200);
    expect(mocks.subscriptions).toHaveBeenCalledWith({
      where: { userId: 7, isActive: true, channel: { isActive: true } },
      select: { channelId: true, niche: true },
    });
    expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({
      channelIds: [1, 2], focalChannelId: 1, days: 7,
      nichesByChannelId: new Map([[1, 'science'], [2, 'news']]),
    }));
    expect(mocks.propagation).toHaveBeenCalledWith([1, 2], 1);
  });

  it('returns 404 for a focal channel outside the user list', async () => {
    expect((await GET(request('channelId=3'))).status).toBe(404);
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it('uses all active channels for the master session', async () => {
    mocks.auth.mockResolvedValue({ authorized: true, role: 'ADMIN', userId: null });
    expect((await GET(request('channelId=1'))).status).toBe(200);
    expect(mocks.channels).toHaveBeenCalledWith({ where: { isActive: true }, select: { id: true } });
    expect(mocks.build).toHaveBeenCalledWith({ channelIds: [1, 2], focalChannelId: 1, days: 30 });
    expect(mocks.propagation).toHaveBeenCalledWith([1, 2], 1);
  });
});
