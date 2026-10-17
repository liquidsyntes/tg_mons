import type { ChannelDetailStats } from './types';

export type ComparePeriod = '24h' | '7d' | '30d';

export type MembersHistoryPoint = ChannelDetailStats['membersHistory'][number];
export type PostsDistributionPoint = ChannelDetailStats['postsDistribution'][number];

export interface MergedSubscriberPoint {
  time: string;
  fullTime: string;
  membersA: number | undefined;
  membersB: number | undefined;
}

export interface MergedPostsPoint {
  date: string;
  postsA: number;
  postsB: number;
  viewsA: number;
  viewsB: number;
}

export function mergeSubscriberHistory(
  aHistory: ReadonlyArray<MembersHistoryPoint> | undefined,
  bHistory: ReadonlyArray<MembersHistoryPoint> | undefined,
  period: ComparePeriod
): MergedSubscriberPoint[] {
  const safeA = aHistory || [];
  const safeB = bHistory || [];
  if (safeA.length === 0 && safeB.length === 0) return [];

  const allTimes = new Set<string>();
  const aMap = new Map<string, number>();
  const bMap = new Map<string, number>();

  for (const point of safeA) {
    const key = new Date(point.collectedAt).toISOString();
    allTimes.add(key);
    aMap.set(key, point.membersCount);
  }
  for (const point of safeB) {
    const key = new Date(point.collectedAt).toISOString();
    allTimes.add(key);
    bMap.set(key, point.membersCount);
  }

  const sorted = Array.from(allTimes).sort();
  let lastA: number | undefined;
  let lastB: number | undefined;

  return sorted.map((t) => {
    const d = new Date(t);
    const dateFormatted =
      period === '24h'
        ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

    if (aMap.has(t)) lastA = aMap.get(t);
    if (bMap.has(t)) lastB = bMap.get(t);

    return {
      time: dateFormatted,
      fullTime: d.toLocaleString('ru-RU'),
      membersA: lastA,
      membersB: lastB,
    };
  });
}

export function mergePostsDistribution(
  aDistribution: ReadonlyArray<PostsDistributionPoint> | undefined,
  bDistribution: ReadonlyArray<PostsDistributionPoint> | undefined,
  period: ComparePeriod
): MergedPostsPoint[] {
  const safeA = aDistribution || [];
  const safeB = bDistribution || [];
  if (safeA.length === 0 && safeB.length === 0) return [];

  const map = new Map<string, MergedPostsPoint>();

  for (const item of safeA) {
    const entry = map.get(item.date) || {
      date: item.date,
      postsA: 0,
      postsB: 0,
      viewsA: 0,
      viewsB: 0,
    };
    entry.postsA = item.postsCount;
    entry.viewsA = item.viewsAvg ?? 0;
    map.set(item.date, entry);
  }

  for (const item of safeB) {
    const entry = map.get(item.date) || {
      date: item.date,
      postsA: 0,
      postsB: 0,
      viewsA: 0,
      viewsB: 0,
    };
    entry.postsB = item.postsCount;
    entry.viewsB = item.viewsAvg ?? 0;
    map.set(item.date, entry);
  }

  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => {
      let dateFormatted = item.date;
      if (period !== '24h') {
        const parts = item.date.split('-');
        if (parts.length === 3) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          dateFormatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        }
      }
      return { ...item, date: dateFormatted };
    });
}
