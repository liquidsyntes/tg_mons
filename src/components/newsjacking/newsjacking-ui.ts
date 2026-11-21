import type { NewsReactionItem } from '@/lib/types';

export type SeriesColorKey = 'violet' | 'cyan' | 'rose' | 'teal';

export interface AnnotatedReactionItem {
  item: NewsReactionItem;
  channelSeriesIndex: number;
  channelSeriesTotal: number;
  isRepeatedChannel: boolean;
  deltaFromPrevSameChannelMinutes: number | null;
  seriesColorKey: SeriesColorKey | null;
  delayPercent: number;
  trackPercent: number;
}

export interface AnnotatedClusterTimeline {
  items: AnnotatedReactionItem[];
  maxDelayMinutes: number;
  repeatedChannelsCount: number;
}

const SERIES_COLOR_KEYS: readonly SeriesColorKey[] = ['violet', 'cyan', 'rose', 'teal'];

function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  const mod10 = abs % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatDelayRu(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes === 0) return '0 мин';
  if (safeMinutes < 60) return `${safeMinutes} мин`;
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return rest === 0 ? `${hours}ч` : `${hours}ч ${rest}м`;
}

export function formatTimeHHMM(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatErr(value: number | null): string {
  return value === null ? 'н/д' : `${value.toFixed(1)}%`;
}

export function pluralizeChannels(count: number): string {
  return pluralizeRu(count, 'канал', 'канала', 'каналов');
}

export function pluralizePosts(count: number): string {
  return pluralizeRu(count, 'пост', 'поста', 'постов');
}

export function pluralizeTopics(count: number): string {
  return pluralizeRu(count, 'сюжет', 'сюжета', 'сюжетов');
}

export function annotateClusterTimeline(
  timeline: readonly NewsReactionItem[],
): AnnotatedClusterTimeline {
  const countsByChannel = new Map<number, number>();
  let maxDelayMinutes = 0;

  for (const item of timeline) {
    countsByChannel.set(item.channelId, (countsByChannel.get(item.channelId) ?? 0) + 1);
    const delay = Math.max(0, item.delayMinutes);
    if (delay > maxDelayMinutes) {
      maxDelayMinutes = delay;
    }
  }

  const seriesColorByChannel = new Map<number, SeriesColorKey>();
  let colorCursor = 0;
  for (const item of timeline) {
    if ((countsByChannel.get(item.channelId) ?? 0) >= 2 && !seriesColorByChannel.has(item.channelId)) {
      seriesColorByChannel.set(
        item.channelId,
        SERIES_COLOR_KEYS[colorCursor % SERIES_COLOR_KEYS.length],
      );
      colorCursor++;
    }
  }

  const seenByChannel = new Map<number, { index: number; prevDelayMinutes: number }>();
  const items: AnnotatedReactionItem[] = timeline.map((item, idx) => {
    const channelSeriesTotal = countsByChannel.get(item.channelId) ?? 1;
    const isRepeatedChannel = channelSeriesTotal >= 2;
    const safeDelay = Math.max(0, item.delayMinutes);
    const prevState = seenByChannel.get(item.channelId);

    const channelSeriesIndex = prevState ? prevState.index + 1 : 1;
    const deltaFromPrevSameChannelMinutes = prevState
      ? Math.max(0, safeDelay - prevState.prevDelayMinutes)
      : null;

    seenByChannel.set(item.channelId, {
      index: channelSeriesIndex,
      prevDelayMinutes: safeDelay,
    });

    const delayPercent =
      maxDelayMinutes === 0 ? 0 : Math.min(100, Math.round((safeDelay / maxDelayMinutes) * 100));
    const trackPercent =
      maxDelayMinutes === 0
        ? timeline.length <= 1
          ? 0
          : Math.min(20, idx * 4)
        : Math.max(0, Math.min(100, Math.round((safeDelay / maxDelayMinutes) * 100)));

    return {
      item,
      channelSeriesIndex,
      channelSeriesTotal,
      isRepeatedChannel,
      deltaFromPrevSameChannelMinutes,
      seriesColorKey: isRepeatedChannel ? (seriesColorByChannel.get(item.channelId) ?? null) : null,
      delayPercent,
      trackPercent,
    };
  });

  return {
    items,
    maxDelayMinutes,
    repeatedChannelsCount: seriesColorByChannel.size,
  };
}

function normalizeForCompare(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function shouldShowClusterExcerpt(
  title: string,
  excerpt: string | null | undefined,
): boolean {
  if (!excerpt) return false;
  const normalizedExcerpt = normalizeForCompare(excerpt);
  if (!normalizedExcerpt) return false;
  return normalizedExcerpt !== normalizeForCompare(title);
}
