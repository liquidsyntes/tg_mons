import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), channel: vi.fn(), access: vi.fn(), daily: vi.fn(), snapshots: vi.fn(), posts: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  channel: { findUnique: mocks.channel }, userChannel: { findUnique: mocks.access },
  channelMetricDaily: { findMany: mocks.daily }, snapshot: { findMany: mocks.snapshots },
  post: { findMany: mocks.posts },
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

const context = { params: Promise.resolve({ id: '7' }) };
function request(query: string): NextRequest {
  return new NextRequest(`http://localhost:4000/api/channels/7/export?${query}`);
}

describe('GET /api/channels/[id]/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 3 });
    mocks.access.mockResolvedValue({ channelId: 7 });
    mocks.daily.mockResolvedValue([{ date: new Date('2026-10-20T00:00:00Z'), followers: 100,
      postsCount: 2, avgViews: 50, vr: 50, err: 4 }]);
    mocks.snapshots.mockResolvedValue([]);
    mocks.posts.mockResolvedValue([]);
  });

  it('rejects unauthorized and malformed requests before reading data', async () => {
    mocks.auth.mockResolvedValueOnce({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request('dataset=daily&format=csv'), context)).status).toBe(401);
    expect((await GET(request('dataset=other&format=csv'), context)).status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('does not export a channel outside the user subscription', async () => {
    mocks.access.mockResolvedValue(null);
    expect((await GET(request('dataset=daily&format=csv'), context)).status).toBe(404);
    expect(mocks.daily).not.toHaveBeenCalled();
  });

  it('downloads typed daily metrics as CSV with BOM or JSON', async () => {
    const csv = await GET(request('dataset=daily&format=csv'), context);
    expect(csv.status).toBe(200);
    expect(csv.headers.get('Content-Disposition')).toContain('tgmon-channel-7-daily.csv');
    expect([...new Uint8Array(await csv.arrayBuffer()).slice(0, 3)]).toEqual([239, 187, 191]);
    const json = await GET(request('dataset=daily&format=json'), context);
    expect(await json.json()).toEqual([{ date: '2026-10-20', followers: 100, postsCount: 2, avgViews: 50, vr: 50, err: 4 }]);
  });

  it('exports recent posts and protects their text in CSV', async () => {
    mocks.posts.mockResolvedValue([{ messageId: BigInt(123), publishedAt: new Date('2026-10-20T12:00:00Z'),
      text: '=1+1', views: 20, reactions: 2, comments: 0, forwards: 1, isAd: false, contentType: 'text' }]);
    const response = await GET(request('dataset=posts&format=csv'), context);
    expect(await response.text()).toContain("'=1+1");
    expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({ where: { channelId: 7 }, take: 100 }));
    const json = await GET(request('dataset=posts&format=json'), context);
    expect(await json.json()).toEqual([expect.objectContaining({ messageId: '123', text: '=1+1' })]);
  });
});
