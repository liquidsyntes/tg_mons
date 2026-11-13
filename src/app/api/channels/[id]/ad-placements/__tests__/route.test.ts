import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  channelCount: vi.fn(),
  userChannelCount: vi.fn(),
  postFindUnique: vi.fn(),
  adPlacementFindMany: vi.fn(),
  adPlacementFindUnique: vi.fn(),
  adPlacementFindFirst: vi.fn(),
  adPlacementCreate: vi.fn(),
  adPlacementUpdate: vi.fn(),
  adPlacementDelete: vi.fn(),
  cacheInvalidate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/cache', () => ({ metricsCache: { invalidate: mocks.cacheInvalidate } }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    channel: { count: mocks.channelCount },
    userChannel: { count: mocks.userChannelCount },
    post: { findUnique: mocks.postFindUnique },
    adPlacement: {
      findMany: mocks.adPlacementFindMany,
      findUnique: mocks.adPlacementFindUnique,
      findFirst: mocks.adPlacementFindFirst,
      create: mocks.adPlacementCreate,
      update: mocks.adPlacementUpdate,
      delete: mocks.adPlacementDelete,
    },
  },
}));

import { DELETE, GET, POST } from '../route';

function makeRequest(method: string, query = '', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:4000/api/channels/2/ad-placements${query}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const now = new Date('2026-11-12T12:00:00.000Z');

const storedDeal = {
  id: 10,
  userId: 7,
  targetChannelId: 2,
  donorChannelId: 1,
  postId: 101,
  priceAmount: 1500,
  currency: 'UAH',
  format: '2/48',
  status: 'completed',
  scheduledAt: now,
  inviteLink: 'https://t.me/+test',
  actualJoins: 30,
  notes: 'Тест',
  createdAt: now,
  updatedAt: now,
  targetChannel: { id: 2, title: 'Цель', username: 'target' },
  donorChannel: { id: 1, title: 'Донор', username: 'donor' },
  post: { views: 3000, publishedAt: now },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true, role: 'USER', userId: 7 });
  mocks.channelCount.mockResolvedValue(2);
  mocks.userChannelCount.mockResolvedValue(2);
  mocks.postFindUnique.mockResolvedValue({ id: 101, channelId: 1 });
  mocks.adPlacementFindMany.mockResolvedValue([storedDeal]);
  mocks.adPlacementFindFirst.mockResolvedValue(null);
  mocks.adPlacementFindUnique.mockResolvedValue(storedDeal);
  mocks.adPlacementCreate.mockResolvedValue(storedDeal);
  mocks.adPlacementUpdate.mockResolvedValue(storedDeal);
  mocks.adPlacementDelete.mockResolvedValue(storedDeal);
});

describe('/api/channels/:id/ad-placements', () => {
  it('requires authorization on GET', async () => {
    mocks.auth.mockResolvedValueOnce({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });
    const res = await GET(makeRequest('GET'), { params: Promise.resolve({ id: '2' }) });
    expect(res.status).toBe(401);
  });

  it('lists serialized placements for accessible channel on GET', async () => {
    mocks.userChannelCount.mockResolvedValueOnce(1);
    const res = await GET(makeRequest('GET'), { params: Promise.resolve({ id: '2' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.placements).toHaveLength(1);
    expect(data.placements[0]).toMatchObject({
      id: 10,
      priceAmount: 1500,
      format: '2/48',
      factualCpm: 500,
      factualCpf: 50,
    });
  });

  it('validates input fields and rejects invalid payloads on POST', async () => {
    expect((await POST(makeRequest('POST', '', {
      donorChannelId: 2,
      priceAmount: 1000,
    }), { params: Promise.resolve({ id: '2' }) })).status).toBe(400);

    expect((await POST(makeRequest('POST', '', {
      donorChannelId: 1,
      priceAmount: -5,
    }), { params: Promise.resolve({ id: '2' }) })).status).toBe(400);

    expect((await POST(makeRequest('POST', '', {
      donorChannelId: 1,
      priceAmount: 1000,
      format: 'invalid-format',
    }), { params: Promise.resolve({ id: '2' }) })).status).toBe(400);
  });

  it('creates a new ad placement and returns factual metrics', async () => {
    const res = await POST(makeRequest('POST', '', {
      donorChannelId: 1,
      postId: 101,
      priceAmount: 1500,
      format: '2/48',
      status: 'completed',
      actualJoins: 30,
      inviteLink: 'https://t.me/+test',
      notes: 'Тест',
    }), { params: Promise.resolve({ id: '2' }) });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.placement).toMatchObject({
      id: 10,
      factualCpm: 500,
      factualCpf: 50,
    });
    expect(mocks.cacheInvalidate).toHaveBeenCalledTimes(1);
  });

  it('updates existing placement when matched by postId', async () => {
    mocks.adPlacementFindFirst.mockResolvedValueOnce({ id: 10 });
    const res = await POST(makeRequest('POST', '', {
      donorChannelId: 1,
      postId: 101,
      priceAmount: 1200,
      format: '1/24',
      status: 'completed',
    }), { params: Promise.resolve({ id: '2' }) });

    expect(res.status).toBe(200);
    expect(mocks.adPlacementUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.adPlacementCreate).not.toHaveBeenCalled();
  });

  it('deletes owned placement and returns 404 when deal belongs to another user', async () => {
    const okRes = await DELETE(makeRequest('DELETE', '?id=10'), { params: Promise.resolve({ id: '2' }) });
    expect(okRes.status).toBe(200);
    expect(mocks.adPlacementDelete).toHaveBeenCalledWith({ where: { id: 10 } });

    mocks.adPlacementFindUnique.mockResolvedValueOnce({ ...storedDeal, userId: 99 });
    const deniedRes = await DELETE(makeRequest('DELETE', '?id=10'), { params: Promise.resolve({ id: '2' }) });
    expect(deniedRes.status).toBe(404);
  });
});
