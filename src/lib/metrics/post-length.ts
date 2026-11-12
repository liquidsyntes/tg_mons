import type {
  PostLengthAnalytics,
  PostLengthBucket,
  PostLengthLeaders,
  PostLengthPerformanceItem,
  PostStructureSignal,
  PostStructureSignalItem,
} from '../types';
import { aggregateChannelERR } from './engagement';

export const ALL_POST_LENGTH_BUCKETS: readonly PostLengthBucket[] = [
  'media_only',
  'short',
  'medium',
  'long',
] as const;

export const POST_LENGTH_BUCKET_LABELS: Record<PostLengthBucket, string> = {
  media_only: 'Без текста',
  short: 'Короткие (1-300 симв.)',
  medium: 'Средние (301-1000 симв.)',
  long: 'Лонгриды (> 1000 симв.)',
};

export const ALL_POST_STRUCTURE_SIGNALS: readonly PostStructureSignal[] = [
  'question_hook',
  'numbers_hook',
  'structured_body',
] as const;

export const POST_STRUCTURE_SIGNAL_LABELS: Record<PostStructureSignal, string> = {
  question_hook: 'Вопрос в зачине',
  numbers_hook: 'Цифры и факты в зачине',
  structured_body: 'Абзацы и списки',
};

export interface PostForLengthAnalytics {
  text?: string | null;
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
  subscribersAtPublish?: number | null;
}

export function classifyPostLengthBucket(text: string | null | undefined): {
  bucket: PostLengthBucket;
  charCount: number;
  trimmed: string;
} {
  const trimmed = (text ?? '').trim();
  const charCount = trimmed.length;

  if (charCount === 0) {
    return { bucket: 'media_only', charCount: 0, trimmed };
  }
  if (charCount <= 300) {
    return { bucket: 'short', charCount, trimmed };
  }
  if (charCount <= 1000) {
    return { bucket: 'medium', charCount, trimmed };
  }
  return { bucket: 'long', charCount, trimmed };
}

export function detectPostStructureSignals(trimmedText: string): PostStructureSignal[] {
  if (!trimmedText) return [];

  const nonEmptyLines = trimmedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const firstParagraph = nonEmptyLines[0] ?? '';
  const signals: PostStructureSignal[] = [];

  if (firstParagraph.includes('?')) {
    signals.push('question_hook');
  }
  if (/\d/.test(firstParagraph)) {
    signals.push('numbers_hook');
  }
  if (
    nonEmptyLines.length >= 3 ||
    /(?:^|\n)\s*(?:[-•*]|\d+[.)])\s+/u.test(trimmedText)
  ) {
    signals.push('structured_body');
  }

  return signals;
}

function computeGroupViews(list: PostForLengthAnalytics[]): {
  avgViews: number | null;
  medianViews: number | null;
} {
  const views = list
    .map((post) => post.views)
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0
    )
    .sort((a, b) => a - b);

  const avgViews =
    views.length > 0
      ? Math.round(views.reduce((sum, value) => sum + value, 0) / views.length)
      : null;

  const middle = Math.floor(views.length / 2);
  const medianViews =
    views.length === 0
      ? null
      : views.length % 2 === 0
      ? (views[middle - 1] + views[middle]) / 2
      : views[middle];

  return { avgViews, medianViews };
}

function computeGroupAvgEr(
  list: PostForLengthAnalytics[],
  fallbackSubscribers?: number | null
): number | null {
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

  return validCount > 0 ? Number((sumER / validCount).toFixed(2)) : null;
}

export function calculatePostLengthAnalytics(
  posts: PostForLengthAnalytics[],
  fallbackSubscribers?: number | null
): PostLengthAnalytics {
  if (posts.length === 0) {
    return {
      totalPosts: 0,
      textPostsCount: 0,
      avgTextLength: null,
      items: [],
      leaders: { byErr: null, byViews: null },
      signals: [],
    };
  }

  const grouped: Record<
    PostLengthBucket,
    Array<{ post: PostForLengthAnalytics; charCount: number }>
  > = {
    media_only: [],
    short: [],
    medium: [],
    long: [],
  };

  const signalGroups: Record<PostStructureSignal, PostForLengthAnalytics[]> = {
    question_hook: [],
    numbers_hook: [],
    structured_body: [],
  };

  let textPostsCount = 0;
  let totalTextChars = 0;

  for (const post of posts) {
    const { bucket, charCount, trimmed } = classifyPostLengthBucket(post.text);
    grouped[bucket].push({ post, charCount });

    if (charCount > 0) {
      textPostsCount++;
      totalTextChars += charCount;
      const postSignals = detectPostStructureSignals(trimmed);
      for (const sig of postSignals) {
        signalGroups[sig].push(post);
      }
    }
  }

  const items: PostLengthPerformanceItem[] = ALL_POST_LENGTH_BUCKETS.filter(
    (bucket) => grouped[bucket].length > 0
  ).map((bucket) => {
    const entries = grouped[bucket];
    const list = entries.map((entry) => entry.post);
    const { avgViews, medianViews } = computeGroupViews(list);
    const avgEr = computeGroupAvgEr(list, fallbackSubscribers);
    const rawErr = aggregateChannelERR(list);
    const avgErr = rawErr === null ? null : Number(rawErr.toFixed(2));
    const avgLength = Math.round(
      entries.reduce((sum, entry) => sum + entry.charCount, 0) / entries.length
    );
    const average = (field: 'forwards' | 'comments') =>
      Number(
        (
          list.reduce((sum, post) => sum + (post[field] ?? 0), 0) / list.length
        ).toFixed(2)
      );

    return {
      bucket,
      label: POST_LENGTH_BUCKET_LABELS[bucket],
      postsCount: list.length,
      sharePercent: Number(((list.length / posts.length) * 100).toFixed(2)),
      avgLength,
      avgViews,
      medianViews,
      avgEr,
      avgErr,
      avgForwards: average('forwards'),
      avgComments: average('comments'),
    };
  });

  const eligible = items.filter((item) => item.postsCount >= 2);
  const leader = (metric: 'avgErr' | 'avgViews'): PostLengthBucket | null => {
    const ranked = eligible
      .filter((item) => item[metric] !== null)
      .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));
    return ranked[0]?.bucket ?? null;
  };

  const leaders: PostLengthLeaders = {
    byErr: leader('avgErr'),
    byViews: leader('avgViews'),
  };

  const signals: PostStructureSignalItem[] =
    textPostsCount === 0
      ? []
      : ALL_POST_STRUCTURE_SIGNALS.filter(
          (sig) => signalGroups[sig].length > 0
        ).map((signal) => {
          const list = signalGroups[signal];
          const { avgViews } = computeGroupViews(list);
          const avgEr = computeGroupAvgEr(list, fallbackSubscribers);
          const rawErr = aggregateChannelERR(list);
          const avgErr = rawErr === null ? null : Number(rawErr.toFixed(2));
          const avgForwards = Number(
            (
              list.reduce((sum, post) => sum + (post.forwards ?? 0), 0) /
              list.length
            ).toFixed(2)
          );

          return {
            signal,
            label: POST_STRUCTURE_SIGNAL_LABELS[signal],
            postsCount: list.length,
            sharePercent: Number(
              ((list.length / textPostsCount) * 100).toFixed(2)
            ),
            avgViews,
            avgEr,
            avgErr,
            avgForwards,
          };
        });

  return {
    totalPosts: posts.length,
    textPostsCount,
    avgTextLength:
      textPostsCount > 0 ? Math.round(totalTextChars / textPostsCount) : null,
    items,
    leaders,
    signals,
  };
}
