import { prisma } from '../prisma';
import type { ChannelDetailStats } from '../types';
import { getZonedDateParts } from '../timezone';

const MS_HOUR = 3600 * 1000;
const MS_24H = 24 * MS_HOUR;

export async function getVrHistory(channelId: number, days: number = 30): Promise<NonNullable<ChannelDetailStats['vrHistory']>> {
  const periodStart = new Date(Date.now() - days * 24 * 3600 * 1000);

  const posts = await prisma.post.findMany({
    where: {
      channelId,
      publishedAt: { gte: periodStart },
    },
    select: { publishedAt: true, views: true, text: true },
    orderBy: { publishedAt: 'asc' },
  });

  const snapshots = await prisma.snapshot.findMany({
    where: {
      channelId,
      collectedAt: { gte: periodStart },
    },
    select: { collectedAt: true, membersCount: true },
    orderBy: { collectedAt: 'asc' },
  });

  const postsByDate = new Map<string, { totalViews: number; count: number }>();
  for (const p of posts) {
    if (p.views === null || p.views === undefined) continue;
    const date = p.publishedAt.toISOString().slice(0, 10);
    const curr = postsByDate.get(date) || { totalViews: 0, count: 0 };
    curr.totalViews += p.views;
    curr.count += 1;
    postsByDate.set(date, curr);
  }

  const baselineSnapshots = await prisma.snapshot.findMany({
    where: {
      channelId,
      collectedAt: { lt: periodStart },
    },
    orderBy: { collectedAt: 'desc' },
    take: 1,
  });

  let currentMembers = baselineSnapshots[0]?.membersCount || 0;
  let snapshotIndex = 0;

  const dates = Array.from(postsByDate.keys()).sort();
  const history = [];

  for (const date of dates) {
    const dayEnd = new Date(date + 'T23:59:59.999Z');

    let dayMembers = currentMembers;
    for (let i = snapshotIndex; i < snapshots.length; i++) {
      if (snapshots[i].collectedAt <= dayEnd) {
        dayMembers = snapshots[i].membersCount;
        snapshotIndex = i + 1;
      } else {
        break;
      }
    }
    currentMembers = dayMembers;

    const data = postsByDate.get(date)!;
    const avgViews = Math.round(data.totalViews / data.count);
    const vr = dayMembers > 0 ? Number(((avgViews / dayMembers) * 100).toFixed(2)) : 0;

    history.push({
      date,
      vr,
      avgViews,
      membersCount: dayMembers,
    });
  }

  return history;
}

export function buildPostsDistribution(
  posts: ReadonlyArray<{ publishedAt: Date; views: number | null }>,
  period: '24h' | '7d' | '30d',
  now: Date,
  timeZone: string
): Array<{ date: string; postsCount: number; viewsAvg: number | null }> {
  const postsByDateMap = new Map<string, { count: number; totalViews: number; viewPosts: number }>();
  const currentLocalDate = new Date(`${getZonedDateParts(now, timeZone).dateKey}T00:00:00.000Z`);

  const dayCount = period === '24h' ? 24 : period === '7d' ? 7 : 30;
  for (let i = dayCount; i >= 0; i--) {
    const d = new Date((period === '24h' ? now : currentLocalDate).getTime() - i * (period === '24h' ? MS_HOUR : MS_24H));
    const key = period === '24h'
      ? `${getZonedDateParts(d, timeZone).hour.toString().padStart(2, '0')}:00`
      : d.toISOString().slice(0, 10);
    postsByDateMap.set(key, { count: 0, totalViews: 0, viewPosts: 0 });
  }

  for (const p of posts) {
    const local = getZonedDateParts(p.publishedAt, timeZone);
    const key = period === '24h'
      ? `${local.hour.toString().padStart(2, '0')}:00`
      : local.dateKey;

    const curr = postsByDateMap.get(key) || { count: 0, totalViews: 0, viewPosts: 0 };
    curr.count += 1;
    if (p.views !== null && p.views !== undefined) {
      curr.totalViews += p.views;
      curr.viewPosts += 1;
    }
    postsByDateMap.set(key, curr);
  }

  return Array.from(postsByDateMap.entries()).map(([date, data]) => ({
    date,
    postsCount: data.count,
    viewsAvg: data.viewPosts > 0 ? Math.round(data.totalViews / data.viewPosts) : null,
  }));
}

export function buildHeatmapData(
  posts: ReadonlyArray<{ publishedAt: Date }>,
  timeZone: string
): Array<{ day: number; hour: number; count: number }> {
  const heatmapGrid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const p of posts) {
    const { dayOfWeek: day, hour } = getZonedDateParts(p.publishedAt, timeZone);
    heatmapGrid[day][hour] += 1;
  }

  const heatmapData: Array<{ day: number; hour: number; count: number }> = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmapData.push({ day, hour, count: heatmapGrid[day][hour] });
    }
  }
  return heatmapData;
}

export async function getAdReachCurve(postId: number): Promise<Array<{ hoursAfterPost: number; views: number }>> {
  const snapshots = await prisma.postViewSnapshot.findMany({
    where: { postId },
    orderBy: { hoursAfterPost: 'asc' },
  });
  return snapshots.map(s => ({
    hoursAfterPost: s.hoursAfterPost,
    views: s.viewsCount,
  }));
}
