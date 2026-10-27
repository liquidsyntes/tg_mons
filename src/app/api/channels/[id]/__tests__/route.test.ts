import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  channelFindUnique: vi.fn(),
  userChannelFindUnique: vi.fn(),
  userChannelUpdate: vi.fn(),
  userChannelUpdateMany: vi.fn(),
  userChannelCount: vi.fn(),
  channelUpdate: vi.fn(),
  transaction: vi.fn(),
  metrics: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  verifyBearerToken: mocks.verify,
  extractRequestSession: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    channel: {
      findUnique: mocks.channelFindUnique,
      update: mocks.channelUpdate,
    },
    userChannel: {
      findUnique: mocks.userChannelFindUnique,
      update: mocks.userChannelUpdate,
      updateMany: mocks.userChannelUpdateMany,
      count: mocks.userChannelCount,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/metrics', () => ({
  calculateChannelMetrics: mocks.metrics,
}));
vi.mock('@/lib/cache', () => ({
  metricsCache: { invalidate: mocks.invalidate },
  bestTimeCache: { invalidate: mocks.invalidate },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

import { PATCH } from '../route';

function makePatchRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:4000/api/channels/7', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/channels/[id] tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ authorized: true, userId: 3, role: 'USER' });
    mocks.channelFindUnique.mockResolvedValue({ id: 7, title: 'Tech', isActive: true });
    mocks.userChannelFindUnique.mockResolvedValue({
      id: 15,
      userId: 3,
      channelId: 7,
      tags: [],
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        userChannel: {
          update: mocks.userChannelUpdate,
          updateMany: mocks.userChannelUpdateMany,
          count: mocks.userChannelCount,
        },
        channel: {
          update: mocks.channelUpdate,
        },
      })
    );
    mocks.metrics.mockResolvedValue({
      id: 7,
      title: 'Tech',
      tags: ['Конкуренты', 'AI'],
    });
  });

  it('normalizes and saves user channel tags', async () => {
    const response = await PATCH(
      makePatchRequest({ tags: ['  Конкуренты ', 'конкуренты', 'AI', ''] }),
      { params: Promise.resolve({ id: '7' }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.userChannelUpdate).toHaveBeenCalledWith({
      where: { userId_channelId: { userId: 3, channelId: 7 } },
      data: { tags: ['Конкуренты', 'AI'] },
    });
    const json = await response.json();
    expect(json.tags).toEqual(['Конкуренты', 'AI']);
  });

  it('returns 400 when tags format is invalid or exceeds limits', async () => {
    const resNonArray = await PATCH(
      makePatchRequest({ tags: 'invalid' }),
      { params: Promise.resolve({ id: '7' }) }
    );
    expect(resNonArray.status).toBe(400);

    const tooMany = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    const resTooMany = await PATCH(
      makePatchRequest({ tags: tooMany }),
      { params: Promise.resolve({ id: '7' }) }
    );
    expect(resTooMany.status).toBe(400);
    expect(mocks.userChannelUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when updating personal tags without userId (master key session)', async () => {
    mocks.verify.mockResolvedValue({ authorized: true, userId: null, role: 'ADMIN' });
    const response = await PATCH(
      makePatchRequest({ tags: ['VIP'] }),
      { params: Promise.resolve({ id: '7' }) }
    );
    expect(response.status).toBe(400);
  });
});
