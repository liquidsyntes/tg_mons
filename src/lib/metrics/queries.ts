import { prisma } from '../prisma';
import { ChannelMetrics, OverviewStats, ChannelDetailStats } from '../types';
import { buildMetricsFromMaterialized, calculateChannelMetricsFromData } from './aggregate';
import { calculateContentTypePerformance } from './engagement';
import { calculateContentScore } from '../scoring';
import { getCitationIndexForChannel, getCitationIndicesForChannels } from '../citationIndex';
import { runFraudAudit } from '../fraudDetector';
import { metricsCache } from '../cache';
import { computeNicheStats, calculateEP, type ChannelSnapshot } from '../ep';
import { getAppTimezone, getZonedDateParts } from '../timezone';


const MS_HOUR = 3600 * 1000;
const MS_24H = 24 * MS_HOUR;
const MS_7D = 7 * 24 * MS_HOUR;
const MS_30D = 30 * 24 * MS_HOUR;

export async function calculateChannelMetrics(
  channelId: number,
  now: Date = new Date(),
  userId?: number | null
): Promise<ChannelMetrics | null> {
  const rawChannel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!rawChannel) return null;

  let channel = rawChannel;
  if (userId !== undefined && userId !== null && typeof prisma.userChannel?.findUnique === 'function') {
    const userSub = await prisma.userChannel.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });
    if (!userSub) return null;
    channel = {
      ...rawChannel,
      isMine: userSub.isMine,
      isFavorite: userSub.isFavorite,
      niche: userSub.niche || rawChannel.niche,
      isActive: userSub.isActive && rawChannel.isActive,
    };
  }

  const date30dAgo = new Date(now.getTime() - MS_30D);

  const dailyMetrics = await prisma.channelMetricDaily.findMany({
    where: { channelId, date: { gte: date30dAgo } },
    orderBy: { date: 'desc' },
  });

  const citationIndex = await getCitationIndexForChannel(channel, date30dAgo);

  if (dailyMetrics.length > 0) {
    const recentPosts = await prisma.post.findMany({
      where: { channelId, publishedAt: { gte: date30dAgo } },
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true, subscribersAtPublish: true, isAd: true },
    });
    const metrics = buildMetricsFromMaterialized(channel, dailyMetrics, recentPosts, now);
    metrics.citationIndex = citationIndex;
    return metrics;
  }

  // fallback
  const allSnapshots = await prisma.snapshot.findMany({
    where: { channelId },
    orderBy: { collectedAt: 'desc' },
    select: { collectedAt: true, membersCount: true },
  });

  const allPosts = await prisma.post.findMany({
    where: { channelId, publishedAt: { gte: date30dAgo } },
    select: { publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true, subscribersAtPublish: true, isAd: true },
  });

  const metrics = calculateChannelMetricsFromData(channel, allSnapshots, allPosts, now);
  metrics.citationIndex = citationIndex;
  return metrics;
}

export async function getOverviewStats(userId?: number | null): Promise<OverviewStats> {
  const now = new Date();
  const date30dAgo = new Date(now.getTime() - MS_30D);
  const date7dAgo = new Date(now.getTime() - MS_7D);

  let allChannels: Awaited<ReturnType<typeof prisma.channel.findMany>>;
  if (userId !== undefined && userId !== null && typeof prisma.userChannel?.findMany === 'function') {
    const subs = await prisma.userChannel.findMany({
      where: { userId },
      include: { channel: true },
      orderBy: [{ isMine: 'desc' }, { createdAt: 'asc' }],
    });
    allChannels = subs.map((sub) => ({
      ...sub.channel,
      isMine: sub.isMine,
      isFavorite: sub.isFavorite,
      niche: sub.niche || sub.channel.niche,
      isActive: sub.isActive && sub.channel.isActive,
    }));
  } else {
    allChannels = await prisma.channel.findMany({
      orderBy: [{ isMine: 'desc' }, { createdAt: 'asc' }],
    });
  }

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
    select: { channelId: true, publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true, subscribersAtPublish: true, isAd: true },
    orderBy: { publishedAt: 'desc' },
  });

  const metricsByChannel = new Map<number, typeof allDailyMetrics>();
  for (const m of allDailyMetrics) {
    if (!metricsByChannel.has(m.channelId)) metricsByChannel.set(m.channelId, []);
    metricsByChannel.get(m.channelId)!.push(m);
  }

  const postsByChannel = new Map<number, typeof recentPosts>();
  for (const p of recentPosts) {
    if (!postsByChannel.has(p.channelId)) postsByChannel.set(p.channelId, []);
    postsByChannel.get(p.channelId)!.push(p);
  }

  const fallbackIds = channelIds.filter(id => !metricsByChannel.has(id));
  const [fallbackSnapshots, fallbackPosts] = await Promise.all([
    fallbackIds.length > 0
      ? prisma.snapshot.findMany({
          where: { channelId: { in: fallbackIds } },
          orderBy: { collectedAt: 'desc' },
          select: { channelId: true, collectedAt: true, membersCount: true },
        })
      : Promise.resolve([]),
    fallbackIds.length > 0
      ? prisma.post.findMany({
          where: { channelId: { in: fallbackIds }, publishedAt: { gte: date30dAgo } },
          select: { channelId: true, publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true, subscribersAtPublish: true, isAd: true },
        })
      : Promise.resolve([]),
  ]);
  const fallbackSnapshotsByChannel = new Map<number, typeof fallbackSnapshots>();
  for (const snapshot of fallbackSnapshots) {
    const channelSnapshots = fallbackSnapshotsByChannel.get(snapshot.channelId) ?? [];
    channelSnapshots.push(snapshot);
    fallbackSnapshotsByChannel.set(snapshot.channelId, channelSnapshots);
  }
  const fallbackPostsByChannel = new Map<number, typeof fallbackPosts>();
  for (const post of fallbackPosts) {
    const channelPosts = fallbackPostsByChannel.get(post.channelId) ?? [];
    channelPosts.push(post);
    fallbackPostsByChannel.set(post.channelId, channelPosts);
  }

  const channelMetricsList: ChannelMetrics[] = [];
  const epSnapshots: ChannelSnapshot[] = [];

  for (const ch of allChannels) {
    const dailyMetrics = metricsByChannel.get(ch.id) || [];
    let metrics: ChannelMetrics;
    
    if (dailyMetrics.length > 0) {
      const posts = postsByChannel.get(ch.id) || [];
      metrics = buildMetricsFromMaterialized(ch, dailyMetrics, posts, now);
    } else {
      const snapshots = fallbackSnapshotsByChannel.get(ch.id) ?? [];
      const posts = fallbackPostsByChannel.get(ch.id) ?? [];
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

  const citationMap = await getCitationIndicesForChannels(allChannels, date30dAgo);
  const recentFraudSignals = await prisma.fraudSignal.findMany({
    where: {
      channelId: { in: channelIds },
      detectedAt: { gte: date30dAgo },
    },
    orderBy: { detectedAt: 'desc' },
  });

  const fraudSignalsByChannel = new Map<number, typeof recentFraudSignals>();
  for (const sig of recentFraudSignals) {
    if (!fraudSignalsByChannel.has(sig.channelId)) fraudSignalsByChannel.set(sig.channelId, []);
    fraudSignalsByChannel.get(sig.channelId)!.push(sig);
  }

  for (const metrics of channelMetricsList) {
    metrics.citationIndex = citationMap.get(metrics.id) ?? 0;
    const chPosts = postsByChannel.get(metrics.id) || [];
    const chDaily = metricsByChannel.get(metrics.id) || [];
    const chFraudSignals = fraudSignalsByChannel.get(metrics.id) || [];
    const audit = runFraudAudit({
      id: metrics.id,
      posts: chPosts,
      metrics: chDaily.map((m) => ({ date: m.date, followers: m.followers })),
      currentMembers: metrics.currentMembers,
      fraudSignals: chFraudSignals,
    });
    metrics.fraudScore = audit.fraudScore;
    metrics.fraudSignals = audit.signals;
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

function buildPostsDistribution(
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

function buildHeatmapData(
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

const overviewForDetailPromises = new Map<string, Promise<OverviewStats>>();

async function getOverviewForDetail(userId?: number | null): Promise<OverviewStats> {
  const cacheKey = userId ? `overview:${userId}` : 'overview';
  const cached = metricsCache.get(cacheKey) as OverviewStats | null;
  if (cached) return cached;
  let promise = overviewForDetailPromises.get(cacheKey);
  if (!promise) {
    promise = getOverviewStats(userId)
      .then(overview => {
        metricsCache.set(cacheKey, overview);
        return overview;
      })
      .finally(() => { overviewForDetailPromises.delete(cacheKey); });
    overviewForDetailPromises.set(cacheKey, promise);
  }
  return promise;
}

export async function getChannelDetailStats(
  channelId: number,
  period: '24h' | '7d' | '30d' = '7d',
  userId?: number | null
): Promise<ChannelDetailStats | null> {
  const now = new Date();
  const channel = await calculateChannelMetrics(channelId, now, userId);
  if (!channel) return null;

  const overview = await getOverviewForDetail(userId);
  const overviewChannel = overview.channels.find(c => c.id === channelId)
    ?? (overview.myChannel?.id === channelId ? overview.myChannel : null);
  if (overviewChannel) {
    channel.ep = overviewChannel.ep;
    channel.epBreakdown = overviewChannel.epBreakdown;
  }

  let myChannelRecord: { id: number } | null = null;
  if (userId !== undefined && userId !== null && typeof prisma.userChannel?.findFirst === 'function') {
    const mySub = await prisma.userChannel.findFirst({
      where: { userId, isMine: true },
      select: { channelId: true },
    });
    myChannelRecord = mySub ? { id: mySub.channelId } : null;
  } else {
    myChannelRecord = await prisma.channel.findFirst({
      where: { isMine: true },
    });
  }
  const myChannel = myChannelRecord
    ? await calculateChannelMetrics(myChannelRecord.id, now, userId)
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

  const timeZone = getAppTimezone();
  const postsDistribution = buildPostsDistribution(posts, period, now, timeZone);
  const heatmapData = buildHeatmapData(posts, timeZone);
  const myHeatmapData = buildHeatmapData(myPosts, timeZone);

  const recentPosts = posts.slice(-15).reverse().map((p) => ({
    id: p.id,
    messageId: p.messageId.toString(),
    publishedAt: p.publishedAt.toISOString(),
    views: p.views,
    reactions: p.reactions,
    comments: p.comments,
    forwards: p.forwards,
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

  const fraudPosts = await prisma.post.findMany({
    where: { channelId },
    orderBy: { publishedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      publishedAt: true,
      views: true,
      reactions: true,
      comments: true,
      forwards: true,
    },
  });

  const dbFraudSignals = await prisma.fraudSignal.findMany({
    where: {
      channelId,
      detectedAt: { gte: new Date(now.getTime() - MS_30D) },
    },
    orderBy: { detectedAt: 'desc' },
  });

  const detailAudit = runFraudAudit({
    id: channel.id,
    posts: fraudPosts.length >= 10 ? fraudPosts : recentPosts,
    metrics: membersHistory.map((m) => ({ date: new Date(m.collectedAt), followers: m.membersCount })),
    currentMembers: channel.currentMembers,
    fraudSignals: dbFraudSignals,
  });
  channel.fraudScore = detailAudit.fraudScore;
  channel.fraudSignals = detailAudit.signals;

  const contentTypePerformance = calculateContentTypePerformance(
    posts,
    channel.currentMembers
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
    contentTypePerformance,
  };
}

export async function getBestTimeRecommendation(userId?: number | null) {
  const MS_DAY = 24 * 60 * 60 * 1000;
  const periodStart = new Date(Date.now() - 30 * MS_DAY);

  let competitorChannels: Array<{ id: number; snapshots: Array<{ membersCount: number }> }>;
  if (userId !== undefined && userId !== null && typeof prisma.userChannel?.findMany === 'function') {
    const subs = await prisma.userChannel.findMany({
      where: { userId, isMine: false, isActive: true, channel: { isActive: true } },
      select: {
        channel: {
          select: {
            id: true,
            snapshots: {
              orderBy: { collectedAt: 'desc' },
              take: 1,
              select: { membersCount: true },
            },
          },
        },
      },
    });
    competitorChannels = subs.map((s) => s.channel);
  } else {
    competitorChannels = await prisma.channel.findMany({
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
  }
  const compIds = competitorChannels.map(c => c.id);

  if (compIds.length === 0) {
    return null;
  }

  const membersByChannelId = new Map<number, number>();
  for (const ch of competitorChannels) {
    if (ch.snapshots.length > 0) {
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

export async function getAdReachCurve(postId: number) {
  const snapshots = await prisma.postViewSnapshot.findMany({
    where: { postId },
    orderBy: { hoursAfterPost: 'asc' },
  });
  return snapshots.map(s => ({
    hoursAfterPost: s.hoursAfterPost,
    views: s.viewsCount,
  }));
}
