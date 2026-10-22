import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  calculateERByContentType,
  calculateContentTypePerformance,
  getERByContentType,
} from '../engagement';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock('../../prisma', () => ({
  prisma: {
    post: {
      findMany: mocks.findMany,
    },
  },
}));

describe('calculateERByContentType', () => {
  it('calculates average ER per content type correctly', () => {
    const posts = [
      // text post: views=100, reactions=10, comments=5, forwards=5 -> engagement=120, subs=1000 -> ER=12%
      { contentType: 'text', views: 100, reactions: 10, comments: 5, forwards: 5, subscribersAtPublish: 1000 },
      // text post 2: engagement=80, subs=1000 -> ER=8% (avg text ER = 10%)
      { contentType: 'text', views: 70, reactions: 5, comments: 3, forwards: 2, subscribersAtPublish: 1000 },
      // photo post: engagement=200, subs=1000 -> ER=20%
      { contentType: 'photo', views: 180, reactions: 10, comments: 5, forwards: 5, subscribersAtPublish: 1000 },
      // video post: engagement=300, subs=1000 -> ER=30%
      { contentType: 'video', views: 250, reactions: 30, comments: 10, forwards: 10, subscribersAtPublish: 1000 },
      // poll post: engagement=50, subs=1000 -> ER=5%
      { contentType: 'poll', views: 40, reactions: 5, comments: 3, forwards: 2, subscribersAtPublish: 1000 },
      // link post: engagement=60, subs=1000 -> ER=6%
      { contentType: 'link', views: 50, reactions: 5, comments: 3, forwards: 2, subscribersAtPublish: 1000 },
    ];

    const result = calculateERByContentType(posts);
    expect(result).toEqual({
      text: 10,
      photo: 20,
      video: 30,
      poll: 5,
      link: 6,
    });
  });

  it('uses fallback subscribers when subscribersAtPublish is missing', () => {
    const posts = [
      { contentType: 'photo', views: 150, reactions: 10, comments: 0, forwards: 0, subscribersAtPublish: null },
    ];

    const withoutFallback = calculateERByContentType(posts);
    expect(withoutFallback.photo).toBeNull();

    const withFallback = calculateERByContentType(posts, 1000);
    // (160 / 1000) * 100 = 16%
    expect(withFallback.photo).toBe(16);
  });

  it('returns null for content types with no posts', () => {
    const posts = [
      { contentType: 'text', views: 100, reactions: 10, subscribersAtPublish: 1000 },
    ];
    const result = calculateERByContentType(posts);
    expect(result.text).toBe(11);
    expect(result.photo).toBeNull();
    expect(result.video).toBeNull();
    expect(result.poll).toBeNull();
    expect(result.link).toBeNull();
  });

  it('handles empty post array safely', () => {
    const result = calculateERByContentType([]);
    expect(result).toEqual({
      text: null,
      photo: null,
      video: null,
      poll: null,
      link: null,
    });
  });
});

describe('calculateContentTypePerformance', () => {
  it('returns full array with labels, counts, ER and average views', () => {
    const posts = [
      { contentType: 'photo', views: 500, reactions: 20, subscribersAtPublish: 1000 },
      { contentType: 'photo', views: 300, reactions: 10, subscribersAtPublish: 1000 },
      { contentType: 'text', views: 200, reactions: 5, subscribersAtPublish: 1000 },
    ];

    const performance = calculateContentTypePerformance(posts);
    expect(performance).toHaveLength(5);

    const photo = performance.find(p => p.type === 'photo');
    expect(photo).toBeDefined();
    expect(photo?.label).toBe('Фото');
    expect(photo?.postsCount).toBe(2);
    expect(photo?.avgViews).toBe(400);
    expect(photo?.er).toBeGreaterThan(0);

    const video = performance.find(p => p.type === 'video');
    expect(video?.postsCount).toBe(0);
    expect(video?.avgViews).toBeNull();
    expect(video?.er).toBeNull();
  });
});

describe('getERByContentType database helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries database with channelId and period cut-off and computes ER', async () => {
    mocks.findMany.mockResolvedValue([
      { contentType: 'text', views: 100, reactions: 10, comments: 5, forwards: 5, subscribersAtPublish: 1000 },
      { contentType: 'photo', views: 200, reactions: 20, comments: 0, forwards: 0, subscribersAtPublish: 1000 },
    ]);

    const result = await getERByContentType(1, 30);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        channelId: 1,
        publishedAt: { gte: expect.any(Date) },
      },
      select: {
        contentType: true,
        views: true,
        reactions: true,
        comments: true,
        forwards: true,
        subscribersAtPublish: true,
      },
    });

    expect(result.text).toBe(12);
    expect(result.photo).toBe(22);
    expect(result.video).toBeNull();
  });

  it('accepts channel object with fallback currentMembers', async () => {
    mocks.findMany.mockResolvedValue([
      { contentType: 'video', views: 300, reactions: 30, comments: 10, forwards: 10, subscribersAtPublish: null },
    ]);

    const result = await getERByContentType({ id: 2, currentMembers: 1000 }, 7);
    expect(result.video).toBe(35);
  });
});
