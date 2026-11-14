import { getAppTimezone, getZonedDateParts } from '../timezone';
import type {
  BestTimeRecommendation,
  ContentPlanFormatGuidance,
  ContentPlanStatus,
  PostLengthBucket,
  PostStructureSignal,
  SuggestedPublishSlot,
} from '../types';
import {
  calculatePostLengthAnalytics,
  POST_LENGTH_BUCKET_LABELS,
  POST_STRUCTURE_SIGNAL_LABELS,
  type PostForLengthAnalytics,
} from './post-length';

const HOUR_MS = 60 * 60 * 1000;
const DAYS_AHEAD_HOURS = 7 * 24;
const FALLBACK_HOURS_SCORES: Record<number, number> = {
  19: 40,
  14: 35,
  18: 30,
  11: 25,
  12: 20,
  20: 15,
};

const WEEKDAY_SHORT_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

export const ALL_CONTENT_PLAN_STATUSES: readonly ContentPlanStatus[] = [
  'idea',
  'in_progress',
  'ready',
  'published',
] as const;

export const CONTENT_PLAN_STATUS_LABELS: Record<ContentPlanStatus, string> = {
  idea: 'Идеи',
  in_progress: 'В работе',
  ready: 'Готово к публикации',
  published: 'Опубликовано',
};

const LENGTH_RANGE_RECOMMENDATIONS: Record<PostLengthBucket, string> = {
  media_only: 'медиа-пост с короткой подписью',
  short: '1-300 зн.',
  medium: '300-1000 зн.',
  long: '1000+ зн.',
};

export type BestTimeHeatmapCell = BestTimeRecommendation['heatmap'][number];

export function isValidContentPlanStatus(value: unknown): value is ContentPlanStatus {
  return (
    typeof value === 'string' &&
    (ALL_CONTENT_PLAN_STATUSES as readonly string[]).includes(value)
  );
}

export function normalizeContentPlanStatus(value: unknown): ContentPlanStatus {
  return isValidContentPlanStatus(value) ? value : 'idea';
}

export function formatSlotLabelRu(dayOfWeek: number, hour: number): string {
  const dayLabel = WEEKDAY_SHORT_RU[dayOfWeek] ?? 'Пн';
  const hourStr = String(hour).padStart(2, '0');
  return `${dayLabel}, ${hourStr}:00`;
}

export function formatPlannedSlotDateTime(
  value: string | Date | null | undefined,
  timeZone: string = getAppTimezone(),
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getZonedDateParts(date, timeZone);
  const [, month, day] = parts.dateKey.split('-');
  return `${day}.${month} (${formatSlotLabelRu(parts.dayOfWeek, parts.hour)})`;
}

export function groupSavedPostsByStatus<
  T extends { savedStatus?: unknown; status?: unknown },
>(posts: readonly T[]): Record<ContentPlanStatus, T[]> {
  const grouped: Record<ContentPlanStatus, T[]> = {
    idea: [],
    in_progress: [],
    ready: [],
    published: [],
  };

  for (const post of posts) {
    const status = normalizeContentPlanStatus(post.savedStatus ?? post.status);
    grouped[status].push(post);
  }

  return grouped;
}

/**
 * Подбирает ближайшие неконфликтующие окна публикации на 7 дней вперёд
 * по тепловой карте best-time и уже занятым слотам контент-плана.
 */
export function suggestNextPublishSlots(
  bestTimeHeatmap:
    | readonly BestTimeHeatmapCell[]
    | BestTimeRecommendation
    | null
    | undefined,
  existingPlannedDates: ReadonlyArray<Date | string | null | undefined> = [],
  now: Date = new Date(),
  count = 3,
  timeZone?: string,
): SuggestedPublishSlot[] {
  if (count <= 0) return [];

  const recommendation =
    bestTimeHeatmap &&
    !Array.isArray(bestTimeHeatmap) &&
    'heatmap' in bestTimeHeatmap
      ? (bestTimeHeatmap as BestTimeRecommendation)
      : null;

  const heatmap = Array.isArray(bestTimeHeatmap)
    ? bestTimeHeatmap
    : recommendation && Array.isArray(recommendation.heatmap)
      ? recommendation.heatmap
      : [];

  const resolvedZone =
    timeZone?.trim() ||
    recommendation?.timeZone?.trim() ||
    getAppTimezone();

  const cellByKey = new Map<string, BestTimeHeatmapCell>();
  let hasMeasuredTraffic = false;

  for (const cell of heatmap) {
    if (
      cell &&
      Number.isInteger(cell.day) &&
      Number.isInteger(cell.hour) &&
      cell.day >= 0 &&
      cell.day <= 6 &&
      cell.hour >= 0 &&
      cell.hour <= 23
    ) {
      cellByKey.set(`${cell.day}-${cell.hour}`, cell);
      if (cell.postCount > 0 || cell.score > 0 || cell.avgViews > 0) {
        hasMeasuredTraffic = true;
      }
    }
  }

  const occupiedKeys = new Set<string>();
  for (const item of existingPlannedDates) {
    if (!item) continue;
    const parsed = item instanceof Date ? item : new Date(item);
    if (Number.isNaN(parsed.getTime())) continue;
    const parts = getZonedDateParts(parsed, resolvedZone);
    occupiedKeys.add(`${parts.dateKey}|${parts.hour}`);
  }

  const firstHourMs = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS + HOUR_MS;
  interface RankedCandidate extends SuggestedPublishSlot {
    priorityScore: number;
    timestampMs: number;
  }

  const candidates: RankedCandidate[] = [];

  for (let offsetHours = 0; offsetHours < DAYS_AHEAD_HOURS; offsetHours++) {
    const candidateDate = new Date(firstHourMs + offsetHours * HOUR_MS);
    const { dateKey, dayOfWeek, hour } = getZonedDateParts(candidateDate, resolvedZone);
    if (occupiedKeys.has(`${dateKey}|${hour}`)) {
      continue;
    }

    const cell = cellByKey.get(`${dayOfWeek}-${hour}`);
    const cellScore = cell && Number.isFinite(cell.score) ? cell.score : 0;
    const avgViews = cell && Number.isFinite(cell.avgViews) ? cell.avgViews : 0;
    const hasActivity = Boolean(cell && cell.postCount > 0);
    const priorityScore = hasMeasuredTraffic
      ? (hasActivity ? cellScore + 1000 : -10_000 + (FALLBACK_HOURS_SCORES[hour] ?? 0))
      : (FALLBACK_HOURS_SCORES[hour] ?? hour * 0.01);

    candidates.push({
      dateTime: candidateDate.toISOString(),
      dateKey,
      dayOfWeek,
      hour,
      label: formatSlotLabelRu(dayOfWeek, hour),
      score: Number(cellScore.toFixed(1)),
      avgViews: Math.round(avgViews),
      priorityScore,
      timestampMs: candidateDate.getTime(),
    });
  }

  candidates.sort((left, right) => {
    if (right.priorityScore !== left.priorityScore) {
      return right.priorityScore - left.priorityScore;
    }
    if (right.avgViews !== left.avgViews) {
      return right.avgViews - left.avgViews;
    }
    return left.timestampMs - right.timestampMs;
  });

  return candidates.slice(0, count).map((candidate) => ({
    dateTime: candidate.dateTime,
    dateKey: candidate.dateKey,
    dayOfWeek: candidate.dayOfWeek,
    hour: candidate.hour,
    label: candidate.label,
    score: candidate.score,
    avgViews: candidate.avgViews,
  }));
}

export interface ContentPlanChannelPostInput extends PostForLengthAnalytics {
  contentType?: string | null;
}

export interface ContentPlanChannelInput {
  id: number;
  title: string;
  posts: readonly ContentPlanChannelPostInput[];
  subscribersCount?: number | null;
}

/**
 * Формирует ориентир по оптимальной длине и структуре поста для «Моего канала»
 * на базе аналитики post-length.ts и рекомендованных окон публикации.
 */
export function buildContentPlanFormatGuidance(
  channel: ContentPlanChannelInput,
  slots: readonly SuggestedPublishSlot[] = [],
): ContentPlanFormatGuidance {
  const analytics = calculatePostLengthAnalytics(
    [...channel.posts],
    channel.subscribersCount,
  );

  let bestLengthBucket: PostLengthBucket | null =
    analytics.leaders.byErr ?? analytics.leaders.byViews;

  if (!bestLengthBucket && analytics.items.length > 0) {
    const textual = analytics.items.filter((item) => item.bucket !== 'media_only');
    const pool = textual.length > 0 ? textual : analytics.items;
    const mostFrequent = [...pool].sort((a, b) => b.postsCount - a.postsCount)[0];
    bestLengthBucket = mostFrequent?.bucket ?? null;
  }

  const bestLengthLabel = bestLengthBucket
    ? POST_LENGTH_BUCKET_LABELS[bestLengthBucket]
    : null;
  const recommendedRangeLabel = bestLengthBucket
    ? LENGTH_RANGE_RECOMMENDATIONS[bestLengthBucket]
    : '300-1000 зн.';

  const mediaPostsCount = channel.posts.filter(
    (post) => post.contentType === 'photo' || post.contentType === 'video',
  ).length;
  const linkPostsCount = channel.posts.filter(
    (post) =>
      post.contentType === 'link' ||
      (typeof post.text === 'string' && /(?:https?:\/\/|t\.me\/)/i.test(post.text)),
  ).length;
  const withMediaRecommended =
    bestLengthBucket === 'media_only' ||
    (channel.posts.length > 0 && mediaPostsCount / channel.posts.length >= 0.3);
  const withLinksRecommended =
    channel.posts.length > 0 && linkPostsCount / channel.posts.length >= 0.3;

  let bestStructureSignal: PostStructureSignal | null = null;
  if (analytics.signals.length > 0) {
    const sortedSignals = [...analytics.signals].sort((a, b) => {
      const errDiff = (b.avgErr ?? -1) - (a.avgErr ?? -1);
      if (errDiff !== 0) return errDiff;
      return (b.avgViews ?? -1) - (a.avgViews ?? -1);
    });
    bestStructureSignal = sortedSignals[0]?.signal ?? null;
  }

  const bestStructureLabel = bestStructureSignal
    ? POST_STRUCTURE_SIGNAL_LABELS[bestStructureSignal]
    : null;

  const topSlotsText = slots
    .slice(0, 2)
    .map((slot) => slot.label)
    .join(', ');

  const addons: string[] = [];
  if (withMediaRecommended) addons.push('медиа');
  if (withLinksRecommended) addons.push('ссылками');
  const addonsSuffix = addons.length > 0 ? ` с ${addons.join(' и ')}` : '';

  const formatPart = `Оптимальный формат для вашего канала: ${recommendedRangeLabel}${addonsSuffix}`;
  const windowsPart = topSlotsText ? ` · Лучшие окна: ${topSlotsText}` : '';

  return {
    channelId: channel.id,
    channelTitle: channel.title,
    bestLengthBucket,
    bestLengthLabel,
    recommendedRangeLabel,
    bestStructureSignal,
    bestStructureLabel,
    withMediaRecommended,
    withLinksRecommended,
    summaryText: `${formatPart}${windowsPart}`,
  };
}

export { calculatePostLengthAnalytics as analyzePostLengthPerformance };
