import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), channels: vi.fn(), subscriptions: vi.fn(), groupBy: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  channel: { findMany: mocks.channels }, userChannel: { findMany: mocks.subscriptions },
  mention: { groupBy: mocks.groupBy },
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

const request = new NextRequest('http://localhost:4000/api/channels/1/network');
const context = { params: Promise.resolve({ id: '1' }) };
const channels = [
  { id: 1, title: 'Первый', username: 'foo', tgId: 1n },
  { id: 2, title: 'Второй', username: 'bar', tgId: 2n },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true, role: 'USER', userId: 7 });
  mocks.subscriptions.mockResolvedValue(channels.map(channel => ({ channel })));
  mocks.channels.mockResolvedValue(channels);
  mocks.groupBy.mockResolvedValueOnce([{ targetUsername: 'bar', targetTgId: null, type: 'mention', _count: { id: 2 } }])
    .mockResolvedValueOnce([{ sourceChannelId: 2, type: 'forward', _count: { id: 1 } }]);
});

describe('legacy GET /api/channels/:id/network', () => {
  it('requires authorization and returns the previous response shape for accessible channels', async () => {
    mocks.auth.mockResolvedValueOnce({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request, context)).status).toBe(401);
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outbound: [{ target: 'bar', count: 2 }], inbound: [{ source: '@bar', channelId: 2, count: 1 }],
    });
    expect(mocks.groupBy).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sourceChannelId: { in: [1, 2], not: 1 } }),
    }));
  });

  it('does not expose a channel outside the personal list', async () => {
    mocks.subscriptions.mockResolvedValue([{ channel: channels[1] }]);
    expect((await GET(request, context)).status).toBe(404);
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });
});
