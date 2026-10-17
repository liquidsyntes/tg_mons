import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { post: db } }));

import { GET } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  db.count.mockResolvedValue(1);
  db.findMany.mockResolvedValue([{
    id: 1, channelId: 7, messageId: BigInt(10), groupedId: null,
    text: 'Партнёрский канал t.me/example', isAd: true,
  }]);
});

describe('GET /api/posts/search', () => {
  it('uses persisted ad classification with other search filters', async () => {
    const response = await GET(new Request('http://localhost/api/posts/search?channelId=7&type=ads&q=канал'));

    expect(response.status).toBe(200);
    expect(db.count).toHaveBeenCalledWith({ where: {
      channelId: 7, text: { contains: 'канал', mode: 'insensitive' }, isAd: true,
    } });
    expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId: 7, text: { contains: 'канал', mode: 'insensitive' }, isAd: true },
    }));
    const body = await response.json();
    expect(body.posts[0].ad.isPartner).toBe(true);
    expect(body.posts[0].messageId).toBe('10');
  });
});
