import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  calculateERByContentType,
  calculateContentFormatBreakdown,
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

describe('calculateContentFormatBreakdown', () => {
  it('calculates shares, views, engagement and leaders for published formats', () => {
    const posts = [
      { contentType: 'photo', views: 500, reactions: 20, comments: 10, forwards: 5, subscribersAtPublish: 1000 },
      { contentType: 'photo', views: 300, reactions: 10, comments: 0, forwards: 3, subscribersAtPublish: 1000 },
      { contentType: 'text', views: 200, reactions: 30, comments: 4, forwards: 2, subscribersAtPublish: 1000 },
      { contentType: 'text', views: 100, reactions: 20, comments: 2, forwards: 0, subscribersAtPublish: 1000 },
    ];

    const result = calculateContentFormatBreakdown(posts);
    expect(result.items).toHaveLength(2);

    const photo = result.items.find(p => p.type === 'photo');
    expect(photo).toMatchObject({
      label: 'Фото', postsCount: 2, sharePercent: 50, avgViews: 400,
      medianViews: 400, avgErr: 5.67, avgEr: 42.4, avgForwards: 4, avgComments: 5,
    });
    expect(result.leaders).toEqual({ byErr: 'text', byViews: 'photo' });
  });

  it('returns empty items and no leaders without posts', () => {
    expect(calculateContentFormatBreakdown([])).toEqual({
      items: [], leaders: { byErr: null, byViews: null },
    });
  });

  it('keeps unknown views distinct from zero and excludes single-post leaders', () => {
    const result = calculateContentFormatBreakdown([
      { contentType: 'photo', views: null, reactions: null, comments: null, forwards: null, subscribersAtPublish: null },
      { contentType: 'photo', views: 0, reactions: null, comments: null, forwards: null, subscribersAtPublish: null },
      { contentType: 'video', views: 100, reactions: 10, subscribersAtPublish: 1000 },
    ]);
    expect(result.items.find(item => item.type === 'photo')).toMatchObject({
      postsCount: 2, avgViews: 0, medianViews: 0, avgErr: null,
      avgEr: null, avgForwards: 0, avgComments: 0,
    });
    expect(result.leaders).toEqual({ byErr: null, byViews: 'photo' });
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
