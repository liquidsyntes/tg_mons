import type {
  AdRetentionBucketStat,
  AdRetentionFormat,
  AdRetentionSummary,
} from './types';

const HOUR_MS = 60 * 60 * 1000;

export const AD_RETENTION_LABELS: Record<AdRetentionFormat, string> = {
  early_delete: 'Удалён <24ч',
  '24h': 'Формат ~24ч',
  '48h': 'Формат ~48ч',
  retained: 'Без удаления (48ч+)',
  active: 'В открутке',
};

export const AD_RETENTION_PLACEMENT_LABELS: Record<AdRetentionFormat, string> = {
  early_delete: 'Внимание: удалён раньше 24ч',
  '24h': 'Удалён через ~24ч',
  '48h': 'Удалён через ~48ч',
  retained: 'В ленте 48ч+',
  active: 'В открутке',
};

export const AD_RETENTION_COMPACT_LABELS: Record<Exclude<AdRetentionFormat, 'active'>, string> = {
  early_delete: 'Удалён <24ч',
  '24h': 'Удалён ~24ч',
  '48h': 'Удалён ~48ч',
  retained: '48ч+',
};

export function isDeletedRetentionFormat(format: AdRetentionFormat | undefined | null): boolean {
  return format === 'early_delete' || format === '24h' || format === '48h';
}

export interface AdRetentionSnapshotPoint {
  hoursAfterPost: number;
  viewsCount?: number | null;
  views?: number | null;
}

export interface AdRetentionPostInput {
  publishedAt?: Date | string | null;
  deletedAt?: Date | string | null;
  deletedAfterHours?: number | null;
  views?: number | null;
  viewSnapshots?: ReadonlyArray<AdRetentionSnapshotPoint> | null;
}

function toValidDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Классифицирует фактический формат удержания рекламного поста на основе
 * времени удаления, чекпоинтов PostViewSnapshot и возраста публикации.
 */
export function classifyAdRetentionFormat(
  post: AdRetentionPostInput,
  now: Date = new Date(),
): AdRetentionFormat {
  const publishedAt = toValidDate(post.publishedAt);
  if (!publishedAt) {
    return 'retained';
  }

  const deletedAt = toValidDate(post.deletedAt);
  const deletedAfterHours =
    typeof post.deletedAfterHours === 'number' && Number.isFinite(post.deletedAfterHours)
      ? post.deletedAfterHours
      : null;

  const snapshotHours = (post.viewSnapshots ?? [])
    .map(point => point.hoursAfterPost)
    .filter(hour => typeof hour === 'number' && Number.isFinite(hour) && hour >= 0);

  if (deletedAt !== null || deletedAfterHours !== null) {
    const exactHours =
      deletedAt !== null
        ? Math.max(0, (deletedAt.getTime() - publishedAt.getTime()) / HOUR_MS)
        : null;
    const effectiveHours = exactHours ?? deletedAfterHours ?? 0;
    const has24hSnapshot = snapshotHours.some(hour => hour >= 20 && hour < 36);

    if (effectiveHours < 20) {
      return has24hSnapshot ? '48h' : 'early_delete';
    }
    if (effectiveHours < 36 || (exactHours === null && deletedAfterHours === 24)) {
      return '24h';
    }
    if (effectiveHours <= 60 || (exactHours === null && deletedAfterHours === 48)) {
      return '48h';
    }
    return 'retained';
  }

  const ageHours = (now.getTime() - publishedAt.getTime()) / HOUR_MS;
  if (ageHours >= 48 || snapshotHours.some(hour => hour >= 48)) {
    return 'retained';
  }

  return 'active';
}

/**
 * Возвращает последний (наибольший) зафиксированный охват поста по текущему
 * счётчику views и контрольным снимкам PostViewSnapshot.
 */
export function resolveLastCapturedViews(post: AdRetentionPostInput): number | null {
  const candidates: number[] = [];

  if (typeof post.views === 'number' && Number.isFinite(post.views) && post.views >= 0) {
    candidates.push(post.views);
  }

  for (const point of post.viewSnapshots ?? []) {
    const value = point.viewsCount ?? point.views;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      candidates.push(value);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
}

function toPercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

/**
 * Агрегирует распределение рекламных постов канала по форматам удержания.
 */
export function summarizeChannelAdRetention(
  posts: readonly AdRetentionPostInput[],
  now: Date = new Date(),
): AdRetentionSummary {
  let earlyDeleteCount = 0;
  let format24hCount = 0;
  let format48hCount = 0;
  let retainedCount = 0;
  let activeAds = 0;

  for (const post of posts) {
    const format = classifyAdRetentionFormat(post, now);
    if (format === 'early_delete') earlyDeleteCount += 1;
    else if (format === '24h') format24hCount += 1;
    else if (format === '48h') format48hCount += 1;
    else if (format === 'retained') retainedCount += 1;
    else activeAds += 1;
  }

  const totalAds = posts.length;
  const evaluatedAds = earlyDeleteCount + format24hCount + format48hCount + retainedCount;

  const earlyDeletePercent = toPercent(earlyDeleteCount, evaluatedAds);
  const format24hPercent = toPercent(format24hCount, evaluatedAds);
  const format48hPercent = toPercent(format48hCount, evaluatedAds);
  const retainedPercent = toPercent(retainedCount, evaluatedAds);

  const buckets: AdRetentionBucketStat[] = [
    {
      format: '24h',
      label: AD_RETENTION_LABELS['24h'],
      count: format24hCount,
      sharePercent: format24hPercent,
    },
    {
      format: '48h',
      label: AD_RETENTION_LABELS['48h'],
      count: format48hCount,
      sharePercent: format48hPercent,
    },
    {
      format: 'retained',
      label: AD_RETENTION_LABELS.retained,
      count: retainedCount,
      sharePercent: retainedPercent,
    },
    {
      format: 'early_delete',
      label: AD_RETENTION_LABELS.early_delete,
      count: earlyDeleteCount,
      sharePercent: earlyDeletePercent,
    },
  ];

  return {
    totalAds,
    evaluatedAds,
    activeAds,
    earlyDeleteCount,
    format24hCount,
    format48hCount,
    retainedCount,
    earlyDeletePercent,
    format24hPercent,
    format48hPercent,
    retainedPercent,
    hasEarlyDeletions: earlyDeleteCount > 0,
    buckets,
  };
}
