import { prisma } from '../prisma';
import { ChannelMetrics, OverviewStats, ChannelDetailStats } from '../types';
import { buildMetricsFromMaterialized, calculateChannelMetricsFromData } from './aggregate';
import { calculateContentFormatBreakdown } from './engagement';
import { calculateViralBaseline, classifyViralPost } from './viral';
import { calculatePopularReactions, parseReactionBreakdown } from './reactions';
import { detectSilencePeriods } from './silence';
import { calculateContentScore } from '../scoring';
import { getCitationIndexForChannel, getCitationIndicesForChannels } from '../citationIndex';
import { runFraudAudit } from '../fraudDetector';
import { metricsCache } from '../cache';
import { computeNicheStats, calculateEP, type ChannelSnapshot } from '../ep';
import { getAppTimezone } from '../timezone';
import { calculateNicheBenchmarks } from '../nicheBenchmarks';
import { findUserMyChannel, listUserChannels, resolveUserChannel } from '../user-channels';
import { buildPostsDistribution, buildHeatmapData, getVrHistory } from './history';


const MS_HOUR = 3600 * 1000;
const MS_24H = 24 * MS_HOUR;
const MS_7D = 7 * 24 * MS_HOUR;
const MS_30D = 30 * 24 * MS_HOUR;

export async function calculateChannelMetrics(
  channelId: number,
  now: Date = new Date(),
  userId?: number | null
): Promise<ChannelMetrics | null> {
  const channel = await resolveUserChannel(channelId, userId);
  if (!channel) return null;

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

  const allChannels = await listUserChannels(userId);

  if (allChannels.length === 0) {
    return { myChannel: null, channels: [], totalChannels: 0, activeChannels: 0, lastGlobalUpdate: null };
  }

  const channelIds = allChannels.map((c) => c.id);

  const allDailyMetrics = await prisma.channelMetricDaily.findMany({
    where: { channelId: { in: channelIds }, date: { gte: date30dAgo } },
    orderBy: { date: 'desc' },
  });

  const recentPosts = await prisma.post.findMany({
    where: { channelId: { in: channelIds }, publishedAt: { gte: date30dAgo } },
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

  const myChannelRecord = overview.myChannel ?? await findUserMyChannel(userId);
  const myChannel = overview.myChannel ?? (myChannelRecord
    ? await calculateChannelMetrics(myChannelRecord.id, now, userId)
    : null);

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

  const viralBaselinePosts = period === '30d' ? posts : await prisma.post.findMany({
    where: { channelId, publishedAt: { gte: new Date(now.getTime() - MS_30D) } },
    select: { views: true, reactions: true, reactionBreakdown: true, comments: true, forwards: true },
  });
  const viralBaseline = calculateViralBaseline(viralBaselinePosts);
  const popularReactions = calculatePopularReactions(viralBaselinePosts);
  const recentSourcePosts = posts.slice(-15).reverse();
  const savedMap = new Map<number, { note: string | null; createdAt: Date }>();
  if (
    userId !== undefined &&
    userId !== null &&
    recentSourcePosts.length > 0 &&
    typeof prisma.userSavedPost?.findMany === 'function'
  ) {
    const savedRows = await prisma.userSavedPost.findMany({
      where: {
        userId,
        postId: { in: recentSourcePosts.map((p) => p.id) },
      },
      select: { postId: true, note: true, createdAt: true },
    });
    for (const row of savedRows) {
      savedMap.set(row.postId, { note: row.note, createdAt: row.createdAt });
    }
  }
  const recentPosts = recentSourcePosts.map((p) => {
    const saved = savedMap.get(p.id);
    return {
      id: p.id,
      messageId: p.messageId.toString(),
      publishedAt: p.publishedAt.toISOString(),
      views: p.views,
      reactions: p.reactions,
      reactionBreakdown: parseReactionBreakdown(p.reactionBreakdown),
      comments: p.comments,
      forwards: p.forwards,
      text: p.text,
      isSaved: Boolean(saved),
      savedNote: saved?.note ?? null,
      savedAt: saved ? saved.createdAt.toISOString() : null,
      ...classifyViralPost(p, viralBaseline),
    };
  });

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

  const contentFormatBreakdown = calculateContentFormatBreakdown(
    posts,
    channel.currentMembers
  );

  const silencePosts = await prisma.post.findMany({
    where: {
      channelId,
      publishedAt: { gte: new Date(now.getTime() - 90 * 24 * 3600 * 1000) },
    },
    orderBy: { publishedAt: 'asc' },
    select: { publishedAt: true },
  });
  const silenceResult = detectSilencePeriods(silencePosts, { periodDays: 90, now });
  channel.activityStatus = silenceResult.status;
  channel.lastPostAt = silenceResult.lastPostAt;

  return {
    channel,
    nicheBenchmark: calculateNicheBenchmarks(overview.channels, channelId),
    myChannel,
    period,
    scoreBreakdown,
    membersHistory,
    postsDistribution,
    vrHistory,
    heatmapData,
    myHeatmapData: myChannelRecord ? myHeatmapData : undefined,
    recentPosts,
    popularReactions,
    contentTypePerformance: contentFormatBreakdown.items,
    contentFormatLeaders: contentFormatBreakdown.leaders,
    silencePeriods: silenceResult.periods,
  };
}

export { getVrHistory, getAdReachCurve } from './history';
export { getBestTimeRecommendation } from './best-time';
