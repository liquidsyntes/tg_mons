import { prisma } from '../prisma';
import type { BestTimeRecommendation } from '../types';
import { getAppTimezone, getZonedDateParts } from '../timezone';
import { listUserChannels } from '../user-channels';

export async function getBestTimeRecommendation(userId?: number | null): Promise<BestTimeRecommendation | null> {
  const MS_DAY = 24 * 60 * 60 * 1000;
  const periodStart = new Date(Date.now() - 30 * MS_DAY);

  const competitorChannels = await listUserChannels(userId, {
    onlyActive: true,
    excludeMine: true,
    withLatestSnapshot: true,
  });
  const compIds = competitorChannels.map(c => c.id);

  if (compIds.length === 0) {
    return null;
  }

  const membersByChannelId = new Map<number, number>();
  for (const ch of competitorChannels) {
    if (ch.snapshots?.length) {
      membersByChannelId.set(ch.id, ch.snapshots[0].membersCount);
    }
  }

  const posts = await prisma.post.findMany({
    where: {
      channelId: { in: compIds },
      publishedAt: { gte: periodStart }
    },
    select: {
      channelId: true,
      publishedAt: true,
      views: true
    }
  });

  const slots: Record<string, { count: number, totalViews: number, totalMembers: number }> = {};
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      slots[`${d}-${h}`] = { count: 0, totalViews: 0, totalMembers: 0 };
    }
  }

  const timeZone = getAppTimezone();
  for (const p of posts) {
    const { dayOfWeek: day, hour } = getZonedDateParts(p.publishedAt, timeZone);
    const key = `${day}-${hour}`;

    slots[key].count += 1;
    if (p.views !== null) {
      slots[key].totalViews += p.views;
      const membersCount = membersByChannelId.get(p.channelId);
      if (membersCount !== undefined) {
        slots[key].totalMembers += membersCount;
      }
    }
  }

  const heatmap = [];
  let maxCount = 0;
  let maxVr = 0;

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const s = slots[`${day}-${hour}`];
      const avgViews = s.count > 0 ? Math.round(s.totalViews / s.count) : 0;
      const avgVr = s.totalMembers > 0 ? (s.totalViews / s.totalMembers) : 0;

      if (s.count > maxCount) maxCount = s.count;
      if (avgVr > maxVr) maxVr = avgVr;

      heatmap.push({
        day,
        hour,
        postCount: s.count,
        avgViews,
        avgVr,
        score: 0
      });
    }
  }

  let bestSlot = heatmap[0];
  for (const cell of heatmap) {
    const normCount = maxCount > 0 ? cell.postCount / maxCount : 0;
    const normVr = maxVr > 0 ? cell.avgVr / maxVr : 0;

    if (cell.postCount === 0) {
      cell.score = 0;
    } else {
      cell.score = normVr - (normCount * 0.5);
    }

    if (cell.score > bestSlot.score) {
      bestSlot = cell;
    }
  }

  const validSlots = heatmap.filter(s => s.postCount > 0);
  if (validSlots.length > 0) {
    bestSlot = validSlots.reduce((prev, curr) => (curr.score > prev.score ? curr : prev));
  }

  return {
    timeZone,
    bestDay: bestSlot.day,
    bestHour: bestSlot.hour,
    score: Number((bestSlot.score * 100).toFixed(1)),
    avgViews: bestSlot.avgViews,
    avgVr: Number((bestSlot.avgVr * 100).toFixed(2)),
    postCount: bestSlot.postCount,
    heatmap: heatmap.map(c => ({
      day: c.day,
      hour: c.hour,
      postCount: c.postCount,
      avgViews: c.avgViews,
      avgVr: Number((c.avgVr * 100).toFixed(2)),
      score: Number((c.score * 100).toFixed(1)),
    }))
  };
}
