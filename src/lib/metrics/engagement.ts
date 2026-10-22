import { ALL_CONTENT_TYPES, CONTENT_TYPE_LABELS, type ContentType } from '../contentType';
import type { ContentTypePerformanceItem } from '../types';

export type ContentTypeERResult = Record<ContentType, number | null>;

export interface PostForContentTypeER {
  contentType?: string | null;
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
  subscribersAtPublish?: number | null;
}

export function calculatePostER(post: {
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
  subscribersAtPublish?: number | null;
}): number | null {
  if (!post.subscribersAtPublish || post.subscribersAtPublish <= 0) {
    return null;
  }

  const views = post.views || 0;
  const reactions = post.reactions || 0;
  const comments = post.comments || 0;
  const forwards = post.forwards || 0;

  const totalEngagement = views + reactions + comments + forwards;

  return (totalEngagement / post.subscribersAtPublish) * 100;
}

export function aggregateChannelER(
  posts: {
    views?: number | null;
    reactions?: number | null;
    comments?: number | null;
    forwards?: number | null;
    subscribersAtPublish?: number | null;
  }[]
): number | null {
  let sumER = 0;
  let count = 0;

  for (const post of posts) {
    const er = calculatePostER(post);
    if (er !== null) {
      sumER += er;
      count++;
    }
  }

  return count > 0 ? sumER / count : null;
}

export function calculatePostERR(post: {
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
}): number | null {
  if (!post.views || post.views <= 0) {
    return null;
  }
  const total = (post.reactions || 0) + (post.comments || 0) + (post.forwards || 0);
  return (total / post.views) * 100;
}

export function aggregateChannelERR(
  posts: {
    views?: number | null;
    reactions?: number | null;
    comments?: number | null;
    forwards?: number | null;
  }[]
): number | null {
  let sumERR = 0;
  let count = 0;
  let allZero = true;

  for (const post of posts) {
    const err = calculatePostERR(post);
    if (err !== null) {
      sumERR += err;
      count++;
      const total = (post.reactions || 0) + (post.comments || 0) + (post.forwards || 0);
      if (total > 0) {
        allZero = false;
      }
    }
  }

  if (count === 0) return null;
  if (allZero) return null;

  return sumERR / count;
}

/**
 * Pure calculation: aggregates ER grouped by content type ('text', 'photo', 'video', 'poll', 'link').
 */
export function calculateERByContentType(
  posts: PostForContentTypeER[],
  fallbackSubscribers?: number | null
): ContentTypeERResult {
  const result: ContentTypeERResult = {
    text: null,
    photo: null,
    video: null,
    poll: null,
    link: null,
  };

  const grouped: Record<ContentType, PostForContentTypeER[]> = {
    text: [],
    photo: [],
    video: [],
    poll: [],
    link: [],
  };

  for (const post of posts) {
    const rawType = post.contentType || 'text';
    const type: ContentType = (ALL_CONTENT_TYPES as readonly string[]).includes(rawType)
      ? (rawType as ContentType)
      : 'text';
    grouped[type].push(post);
  }

  for (const type of ALL_CONTENT_TYPES) {
    const list = grouped[type];
    if (list.length === 0) {
      result[type] = null;
      continue;
    }

    let sumER = 0;
    let validCount = 0;

    for (const post of list) {
      const subs =
        post.subscribersAtPublish && post.subscribersAtPublish > 0
          ? post.subscribersAtPublish
          : fallbackSubscribers && fallbackSubscribers > 0
          ? fallbackSubscribers
          : null;

      if (!subs) continue;

      const views = post.views || 0;
      const reactions = post.reactions || 0;
      const comments = post.comments || 0;
      const forwards = post.forwards || 0;
      const totalEngagement = views + reactions + comments + forwards;

      const er = (totalEngagement / subs) * 100;
      if (Number.isFinite(er) && er >= 0) {
        sumER += er;
        validCount++;
      }
    }

    result[type] = validCount > 0 ? Number((sumER / validCount).toFixed(2)) : null;
  }

  return result;
}

/**
 * Full performance breakdown by content type with labels, ER, count, and average views.
 */
export function calculateContentTypePerformance(
  posts: PostForContentTypeER[],
  fallbackSubscribers?: number | null
): ContentTypePerformanceItem[] {
  const erResult = calculateERByContentType(posts, fallbackSubscribers);
  const grouped: Record<ContentType, PostForContentTypeER[]> = {
    text: [],
    photo: [],
    video: [],
    poll: [],
    link: [],
  };

  for (const post of posts) {
    const rawType = post.contentType || 'text';
    const type: ContentType = (ALL_CONTENT_TYPES as readonly string[]).includes(rawType)
      ? (rawType as ContentType)
      : 'text';
    grouped[type].push(post);
  }

  return ALL_CONTENT_TYPES.map(type => {
    const list = grouped[type];
    const postsWithViews = list.filter(p => typeof p.views === 'number' && Number.isFinite(p.views) && p.views! >= 0);
    const avgViews =
      postsWithViews.length > 0
        ? Math.round(postsWithViews.reduce((acc, p) => acc + (p.views || 0), 0) / postsWithViews.length)
        : null;

    return {
      type,
      label: CONTENT_TYPE_LABELS[type],
      er: erResult[type],
      postsCount: list.length,
      avgViews,
    };
  });
}

/**
 * Database helper: queries posts for a channel and returns { text: avgER, photo: avgER, video: avgER, poll: avgER, link: avgER }.
 */
export async function getERByContentType(
  channel: number | { id: number; currentMembers?: number | null },
  periodDays = 30
): Promise<ContentTypeERResult> {
  const channelId = typeof channel === 'number' ? channel : channel.id;
  const fallbackSubscribers = typeof channel === 'object' ? channel.currentMembers : null;
  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const { prisma } = await import('../prisma');
  const posts = await prisma.post.findMany({
    where: {
      channelId,
      publishedAt: { gte: cutoff },
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

  return calculateERByContentType(posts, fallbackSubscribers);
}
