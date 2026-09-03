import { prisma } from '../prisma';
import { ChannelMetrics, OverviewStats, ChannelDetailStats } from '../types';
import { buildMetricsFromMaterialized, calculateChannelMetricsFromData } from './aggregate';
import { calculateContentScore } from '../scoring';

const MS_HOUR = 3600 * 1000;
const MS_24H = 24 * MS_HOUR;
const MS_7D = 7 * 24 * MS_HOUR;
const MS_30D = 30 * 24 * MS_HOUR;

export async function calculateChannelMetrics(
  channelId: number,
  now: Date = new Date()
): Promise<ChannelMetrics | null> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;

  const date30dAgo = new Date(now.getTime() - MS_30D);

  const dailyMetrics = await prisma.channelMetricDaily.findMany({
    where: { channelId, date: { gte: date30dAgo } },
    orderBy: { date: 'desc' },
  });

  if (dailyMetrics.length > 0) {
    const recentPosts = await prisma.post.findMany({
      where: { channelId },
      orderBy: { publishedAt: 'desc' },
      take: 20,
      select: { publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true },
    });
    return buildMetricsFromMaterialized(channel, dailyMetrics, recentPosts, now);
  }

  // fallback
  const allSnapshots = await prisma.snapshot.findMany({
    where: { channelId },
    orderBy: { collectedAt: 'desc' },
    select: { collectedAt: true, membersCount: true },
  });

  const allPosts = await prisma.post.findMany({
    where: { channelId, publishedAt: { gte: date30dAgo } },
    select: { publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true },
  });

  return calculateChannelMetricsFromData(channel, allSnapshots, allPosts, now);
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const now = new Date();
  const date30dAgo = new Date(now.getTime() - MS_30D);
  const date7dAgo = new Date(now.getTime() - MS_7D);

  const allChannels = await prisma.channel.findMany({
    orderBy: [{ isMine: 'desc' }, { createdAt: 'asc' }],
  });

  if (allChannels.length === 0) {
    return { myChannel: null, channels: [], totalChannels: 0, activeChannels: 0, lastGlobalUpdate: null };
  }

  const channelIds = allChannels.map((c) => c.id);

  const allDailyMetrics = await prisma.channelMetricDaily.findMany({
    where: { channelId: { in: channelIds }, date: { gte: date30dAgo } },
    orderBy: { date: 'desc' },
  });

  const recentPosts = await prisma.post.findMany({
    where: { channelId: { in: channelIds }, publishedAt: { gte: date7dAgo } },
    select: { channelId: true, publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true },
    orderBy: { publishedAt: 'desc' },
  });

  const metricsByChannel = new Map<number, any[]>();
  for (const m of allDailyMetrics) {
    if (!metricsByChannel.has(m.channelId)) metricsByChannel.set(m.channelId, []);
    metricsByChannel.get(m.channelId)!.push(m);
  }

  const postsByChannel = new Map<number, any[]>();
  for (const p of recentPosts) {
    if (!postsByChannel.has(p.channelId)) postsByChannel.set(p.channelId, []);
    postsByChannel.get(p.channelId)!.push(p);
  }

  const channelMetricsList: ChannelMetrics[] = [];
  const epSnapshots: import('../ep').ChannelSnapshot[] = [];

  for (const ch of allChannels) {
    const dailyMetrics = metricsByChannel.get(ch.id) || [];
    let metrics: ChannelMetrics;
    
    if (dailyMetrics.length > 0) {
      const posts = postsByChannel.get(ch.id) || [];
      metrics = buildMetricsFromMaterialized(ch, dailyMetrics, posts.slice(0, 20), now);
    } else {
      const snapshots = await prisma.snapshot.findMany({ where: { channelId: ch.id }, orderBy: { collectedAt: 'desc' }, select: { collectedAt: true, membersCount: true } });
      const posts = await prisma.post.findMany({ where: { channelId: ch.id, publishedAt: { gte: date30dAgo } }, select: { publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true } });
      metrics = calculateChannelMetricsFromData(ch, snapshots, posts, now);
    }
    
    channelMetricsList.push(metrics);

    const rPosts = (postsByChannel.get(ch.id) || []).slice(0, 20);
    epSnapshots.push({
      channelId: ch.id.toString(),
      niche: ch.niche || 'general',
      subscribers: metrics.currentMembers || 0,
      newSubs24h: metrics.delta24h.abs || 0,
      newSubs7d: metrics.delta7d.abs || 0,
      newSubs30d: metrics.delta30d.abs || 0,
      postViews: rPosts.map(p => p.views || 0),
      postReactions: rPosts.map(p => p.reactions || 0),
      postComments: rPosts.map(p => p.comments || 0),
      postForwards: rPosts.map(p => p.forwards || 0),
    });
  }

  const { computeNicheStats, calculateEP } = await Promise.resolve().then(() => require('../ep'));
  const nicheStats = computeNicheStats(epSnapshots);
  for (const metrics of channelMetricsList) {
    const snap = epSnapshots.find(s => s.channelId === metrics.id.toString());
    if (snap) {
      const stats = nicheStats.get(snap.niche);
      if (stats) {
        const epResult = calculateEP(snap, stats);
        metrics.ep = epResult.EP;
        metrics.epBreakdown = epResult.breakdown;
      }
    }
  }

  const myChannel = channelMetricsList.find((c) => c.isMine) || null;

  const channelsWithComparison = channelMetricsList.map((ch) => {
    if (!myChannel || ch.id === myChannel.id) return ch;
    let audienceSharePercent = null;
    if (ch.currentMembers !== null && myChannel.currentMembers !== null && myChannel.currentMembers > 0) {
      audienceSharePercent = Number(((ch.currentMembers / myChannel.currentMembers) * 100).toFixed(1));
    }
    let growthRateDiff7d = null;
    if (ch.delta7d.percent !== null && myChannel.delta7d.percent !== null) {
      growthRateDiff7d = Number((ch.delta7d.percent - myChannel.delta7d.percent).toFixed(2));
    }
    let activityDiff7d = null;
    if (myChannel.posts7d !== undefined) activityDiff7d = ch.posts7d - myChannel.posts7d;
    return { ...ch, comparison: { audienceSharePercent, growthRateDiff7d, activityDiff7d } };
  });

  let lastGlobalUpdate: string | null = null;
  for (const ch of channelMetricsList) {
    if (ch.lastCollectedAt) {
      if (!lastGlobalUpdate || ch.lastCollectedAt > lastGlobalUpdate) {
        lastGlobalUpdate = ch.lastCollectedAt;
      }
    }
  }

  return {
    myChannel,
    channels: channelsWithComparison,
    totalChannels: allChannels.length,
    activeChannels: allChannels.filter((c) => c.isActive).length,
    lastGlobalUpdate,
  };
}

export async function getVrHistory(channelId: number, days: number = 30) {
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

export async function getChannelDetailStats(
  channelId: number,
  period: '24h' | '7d' | '30d' = '7d'
): Promise<ChannelDetailStats | null> {
  const now = new Date();
  const channel = await calculateChannelMetrics(channelId, now);
  if (!channel) return null;

  const overview = await getOverviewStats();
  const overviewChannel = overview.channels.find(c => c.id === channelId) || overview.myChannel;
  if (overviewChannel) {
    channel.ep = overviewChannel.ep;
    channel.epBreakdown = overviewChannel.epBreakdown;
  }

  const myChannelRecord = await prisma.channel.findFirst({
    where: { isMine: true },
  });
  const myChannel = myChannelRecord
    ? await calculateChannelMetrics(myChannelRecord.id, now)
    : null;

  let periodDuration = MS_7D;
  if (period === '24h') periodDuration = MS_24H;
  if (period === '30d') periodDuration = MS_30D;

  const periodStart = new Date(now.getTime() - periodDuration);

  const channelSnapshots = await prisma.snapshot.findMany({
    where: {
      channelId,
      collectedAt: { gte: periodStart },
    },
    orderBy: { collectedAt: 'asc' },
  });

  const mySnapshots = myChannelRecord
    ? await prisma.snapshot.findMany({
        where: {
          channelId: myChannelRecord.id,
          collectedAt: { gte: periodStart },
        },
        orderBy: { collectedAt: 'asc' },
      })
    : [];

  const membersHistory = channelSnapshots.map((snap) => {
    let closestMySnap: { membersCount: number } | null = null;
    if (mySnapshots.length > 0) {
      const snapTime = new Date(snap.collectedAt).getTime();
      let minDiff = Infinity;
      for (const ms of mySnapshots) {
        const diff = Math.abs(new Date(ms.collectedAt).getTime() - snapTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestMySnap = ms;
        }
      }
    }

    return {
      collectedAt: snap.collectedAt.toISOString(),
      membersCount: snap.membersCount,
      myMembersCount: closestMySnap?.membersCount ?? null,
    };
  });

  const posts = await prisma.post.findMany({
    where: {
      channelId,
      publishedAt: { gte: periodStart },
    },
    orderBy: { publishedAt: 'asc' },
  });

  const myPosts = myChannelRecord
    ? await prisma.post.findMany({
        where: {
          channelId: myChannelRecord.id,
          publishedAt: { gte: periodStart },
        },
        orderBy: { publishedAt: 'asc' },
      })
    : [];

  const postsByDateMap = new Map<string, { count: number; totalViews: number; viewPosts: number }>();

  const dayCount = period === '24h' ? 24 : period === '7d' ? 7 : 30;
  for (let i = dayCount; i >= 0; i--) {
    const d = new Date(now.getTime() - i * (period === '24h' ? MS_HOUR : 24 * MS_HOUR));
    const key = period === '24h'
      ? `${d.getUTCHours().toString().padStart(2, '0')}:00`
      : d.toISOString().slice(0, 10);
    postsByDateMap.set(key, { count: 0, totalViews: 0, viewPosts: 0 });
  }

  for (const p of posts) {
    const d = new Date(p.publishedAt);
    const key = period === '24h'
      ? `${d.getUTCHours().toString().padStart(2, '0')}:00`
      : d.toISOString().slice(0, 10);

    const curr = postsByDateMap.get(key) || { count: 0, totalViews: 0, viewPosts: 0 };
    curr.count += 1;
    if (p.views !== null && p.views !== undefined) {
      curr.totalViews += p.views;
      curr.viewPosts += 1;
    }
    postsByDateMap.set(key, curr);
  }

  const postsDistribution = Array.from(postsByDateMap.entries()).map(([date, data]) => ({
    date,
    postsCount: data.count,
    viewsAvg: data.viewPosts > 0 ? Math.round(data.totalViews / data.viewPosts) : null,
  }));

  const heatmapGrid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const p of posts) {
    const d = new Date(p.publishedAt);
    const day = d.getDay();
    const hour = d.getHours();
    heatmapGrid[day][hour] += 1;
  }
  
  const heatmapData = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmapData.push({ day, hour, count: heatmapGrid[day][hour] });
    }
  }

  const myHeatmapGrid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const p of myPosts) {
    const d = new Date(p.publishedAt);
    const day = d.getDay();
    const hour = d.getHours();
    myHeatmapGrid[day][hour] += 1;
  }
  
  const myHeatmapData = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      myHeatmapData.push({ day, hour, count: myHeatmapGrid[day][hour] });
    }
  }

  const recentPosts = posts.slice(-15).reverse().map((p) => ({
    id: p.id,
    messageId: p.messageId.toString(),
    publishedAt: p.publishedAt.toISOString(),
    views: p.views,
    text: p.text,
  }));

  const vrHistory = await getVrHistory(
    channelId,
    period === '24h' ? 1 : period === '30d' ? 30 : 7
  );

  const scoreBreakdown = calculateContentScore(
    channel.trueErr7d,
    channel.avgPostsPerDay,
    channel.delta7d?.percent || 0,
    recentPosts.filter(p => p.text)
  );

  return {
    channel,
    myChannel,
    period,
    scoreBreakdown,
    membersHistory,
    postsDistribution,
    vrHistory,
    heatmapData,
    myHeatmapData: myChannelRecord ? myHeatmapData : undefined,
    recentPosts,
  };
}

export async function getBestTimeRecommendation() {
  const MS_DAY = 24 * 60 * 60 * 1000;
  const periodStart = new Date(Date.now() - 30 * MS_DAY);

  const competitorChannels = await prisma.channel.findMany({
    where: { isMine: false, isActive: true },
    select: { 
      id: true, 
      snapshots: {
        orderBy: { collectedAt: 'desc' },
        take: 1,
        select: { membersCount: true }
      }
    }
  });
  const compIds = competitorChannels.map(c => c.id);

  if (compIds.length === 0) {
    return null;
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

  for (const p of posts) {
    const d = new Date(p.publishedAt);
    const day = d.getDay();
    const hour = d.getHours();
    const key = `${day}-${hour}`;
    
    slots[key].count += 1;
    if (p.views !== null) {
      slots[key].totalViews += p.views;
      const channel = competitorChannels.find(c => c.id === p.channelId);
      if (channel && channel.snapshots.length > 0) {
        slots[key].totalMembers += channel.snapshots[0].membersCount;
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
