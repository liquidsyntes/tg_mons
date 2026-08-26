import { prisma } from './prisma';
import { ChannelMetrics, ChannelStatus, OverviewStats, ChannelDetailStats } from './types';
import { serializeBigInt } from './utils';
import { calculateContentScore } from './scoring';

const MS_HOUR = 3600 * 1000;
const MS_24H = 24 * MS_HOUR;
const MS_7D = 7 * 24 * MS_HOUR;
const MS_30D = 30 * 24 * MS_HOUR;

// ──────────────────────────────────────────────────────────────
// Pure function: computes metrics from pre-loaded data (no DB calls)
// ──────────────────────────────────────────────────────────────

function calculateDeltaFromData(
  snapshots: { collectedAt: Date; membersCount: number }[],
  dateLimit: Date,
  currentMembers: number | null
): { abs: number | null; percent: number | null } {
  // Find snapshot at <= dateLimit (most recent before or at the limit)
  let baseline: { membersCount: number } | null = null;
  for (const s of snapshots) {
    if (s.collectedAt.getTime() <= dateLimit.getTime()) {
      baseline = s;
      break; // snapshots are sorted desc by collectedAt
    }
  }

  // Fallback: if no snapshot <= dateLimit, find earliest snapshot >= dateLimit
  if (!baseline) {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].collectedAt.getTime() >= dateLimit.getTime()) {
        baseline = snapshots[i];
        break; // snapshots sorted desc, so iterate from end for earliest
      }
    }
  }

  if (currentMembers === null || !baseline || baseline.membersCount === 0) {
    return { abs: null, percent: null };
  }

  const abs = currentMembers - baseline.membersCount;
  const percent = Number(((abs / baseline.membersCount) * 100).toFixed(2));
  return { abs, percent };
}

export function calculateChannelMetricsFromData(
  channel: {
    id: number;
    username: string | null;
    tgId: bigint | null;
    title: string;
    type: string;
    isMine: boolean;
    isFavorite: boolean;
    isActive: boolean;
    lastMessageId: bigint | null;
    lastError: string | null;
    lastCollectedAt: Date | null;
    createdAt: Date;
    niche: string;
  },
  channelSnapshots: { collectedAt: Date; membersCount: number }[],
  channelPosts: { publishedAt: Date; views: number | null; text: string | null; reactions?: number | null; comments?: number | null; forwards?: number | null }[],
  now: Date = new Date()
): ChannelMetrics {
  const date24hAgo = new Date(now.getTime() - MS_24H);
  const date7dAgo = new Date(now.getTime() - MS_7D);
  const date30dAgo = new Date(now.getTime() - MS_30D);

  // Latest snapshot (first in desc-sorted array)
  const latestSnapshot = channelSnapshots.length > 0 ? channelSnapshots[0] : null;
  const currentMembers = latestSnapshot ? latestSnapshot.membersCount : null;

  // Deltas
  const delta24h = calculateDeltaFromData(channelSnapshots, date24hAgo, currentMembers);
  const delta7d = calculateDeltaFromData(channelSnapshots, date7dAgo, currentMembers);
  const delta30d = calculateDeltaFromData(channelSnapshots, date30dAgo, currentMembers);

  // Post counts (from pre-loaded posts within 30d window)
  let posts24h = 0;
  let posts7d = 0;
  let posts30d = 0;
  let totalViews24h = 0;
  let viewPosts24h = 0;
  let totalViews7d = 0;
  let viewPosts7d = 0;

  const t24h = date24hAgo.getTime();
  const t48h = date24hAgo.getTime() - MS_24H;
  const t7d = date7dAgo.getTime();
  const t30d = date30dAgo.getTime();

  for (const p of channelPosts) {
    const pt = p.publishedAt.getTime();
    if (pt >= t30d) {
      posts30d++;
      if (pt >= t7d) {
        posts7d++;
        if (pt >= t24h) {
          posts24h++;
        }
        
        // Исключаем посты, опубликованные менее 24 часов назад, 
        // так как они еще не набрали просмотры и сильно занижают среднее значение (ERR).
        if (pt < t24h) {
          if (p.views !== null) {
            totalViews7d += p.views;
            viewPosts7d++;
            
            // Для метрики "за 24 часа" берем посты, опубликованные от 24 до 48 часов назад
            if (pt >= t48h) {
              totalViews24h += p.views;
              viewPosts24h++;
            }
          }
        }
      }
    }
  }

  // Вычисляем истинный ERR для скоринга контента
  const trueViews7d: number[] = [];
  const trueReactions7d: number[] = [];
  const trueComments7d: number[] = [];
  const trueForwards7d: number[] = [];
  
  for (const p of channelPosts) {
    const pt = p.publishedAt.getTime();
    if (pt >= t7d && pt < t24h && p.views !== null) {
      trueViews7d.push(p.views);
      trueReactions7d.push(p.reactions || 0);
      trueComments7d.push(p.comments || 0);
      trueForwards7d.push(p.forwards || 0);
    }
  }

  let trueTotalEngagement = 0;
  for (let i = 0; i < trueViews7d.length; i++) {
    trueTotalEngagement += trueReactions7d[i] + trueComments7d[i] + trueForwards7d[i];
  }
  const trueAvgEngagement = trueViews7d.length > 0 ? trueTotalEngagement / trueViews7d.length : 0;
  const trueAvgViews = trueViews7d.length > 0 ? trueViews7d.reduce((a,b)=>a+b,0) / trueViews7d.length : 0;
  const trueErr7d = trueAvgViews > 0 ? (trueAvgEngagement / trueAvgViews) * 100 : null;

  // Если за окно 24-48ч не было постов, фоллбэк на среднее за 7 дней
  if (viewPosts24h === 0 && viewPosts7d > 0) {
    totalViews24h = totalViews7d;
    viewPosts24h = viewPosts7d;
  }

  const avgPostsPerDay = Number((posts30d / 30).toFixed(1));

  const avgViews24h = viewPosts24h > 0 ? Math.round(totalViews24h / viewPosts24h) : null;
  const vr24h = (currentMembers && currentMembers > 0 && avgViews24h !== null)
    ? Number(((avgViews24h / currentMembers) * 100).toFixed(2))
    : null;

  const avgViews7d = viewPosts7d > 0 ? Math.round(totalViews7d / viewPosts7d) : null;
  const vr7d = (currentMembers && currentMembers > 0 && avgViews7d !== null)
    ? Number(((avgViews7d / currentMembers) * 100).toFixed(2))
    : null;

  // Sparkline: filter snapshots within 7d, downsample to ~10 points
  const sparklineSnapshots = channelSnapshots.filter(
    (s) => s.collectedAt.getTime() >= date7dAgo.getTime()
  );
  // sparklineSnapshots are desc-sorted, reverse for ascending
  sparklineSnapshots.reverse();

  const sparkline7d: number[] = [];
  const step = Math.max(1, Math.floor(sparklineSnapshots.length / 10));
  for (let i = 0; i < sparklineSnapshots.length; i += step) {
    sparkline7d.push(sparklineSnapshots[i].membersCount);
  }
  if (sparklineSnapshots.length > 0 && sparkline7d[sparkline7d.length - 1] !== sparklineSnapshots[sparklineSnapshots.length - 1].membersCount) {
    sparkline7d.push(sparklineSnapshots[sparklineSnapshots.length - 1].membersCount);
  }

  // Status
  let status: ChannelStatus = 'success';
  if (channel.lastError) {
    status = 'error';
  } else if (
    !channel.lastCollectedAt ||
    now.getTime() - new Date(channel.lastCollectedAt).getTime() > 3 * MS_HOUR
  ) {
    status = 'stale';
  }

  const scoreBreakdown = calculateContentScore(
    trueErr7d,
    avgPostsPerDay,
    delta7d.percent,
    channelPosts.filter(p => p.text)
  );

  return {
    id: channel.id,
    username: channel.username,
    tgId: channel.tgId ? channel.tgId.toString() : null,
    title: channel.title,
    type: channel.type as 'channel' | 'group',
    niche: channel.niche,
    isMine: channel.isMine,
    isFavorite: channel.isFavorite || false,
    isActive: channel.isActive,
    lastMessageId: channel.lastMessageId ? channel.lastMessageId.toString() : null,
    lastError: channel.lastError,
    lastCollectedAt: channel.lastCollectedAt?.toISOString() || null,
    createdAt: channel.createdAt.toISOString(),
    currentMembers,
    delta24h,
    delta7d,
    delta30d,
    posts24h,
    posts7d,
    posts30d,
    avgPostsPerDay,
    avgViews24h,
    vr24h,
    avgViews7d,
    vr7d,
    trueErr7d,
    status,
    sparkline7d,
    contentScore: scoreBreakdown.total,
    contentGrade: scoreBreakdown.grade,
  };
}

// ──────────────────────────────────────────────────────────────
// Single-channel version (still uses DB — kept for getChannelDetailStats
// and API routes that query one channel at a time)
// ──────────────────────────────────────────────────────────────

export async function calculateChannelMetrics(
  channelId: number,
  now: Date = new Date()
): Promise<ChannelMetrics | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) return null;

  const date30dAgo = new Date(now.getTime() - MS_30D);

  // Load all snapshots for this channel (sorted desc)
  const allSnapshots = await prisma.snapshot.findMany({
    where: { channelId },
    orderBy: { collectedAt: 'desc' },
    select: { collectedAt: true, membersCount: true },
  });

  // Load all posts for this channel in the last 30 days
  const allPosts = await prisma.post.findMany({
    where: {
      channelId,
      publishedAt: { gte: date30dAgo },
    },
    select: { publishedAt: true, views: true, text: true },
  });

  return calculateChannelMetricsFromData(channel, allSnapshots, allPosts, now);
}

// ──────────────────────────────────────────────────────────────
// Batch-optimized: getOverviewStats — 3 queries total
// ──────────────────────────────────────────────────────────────

export async function getOverviewStats(): Promise<OverviewStats> {
  const now = new Date();
  const date30dAgo = new Date(now.getTime() - MS_30D);

  // Query 1: all channels
  const allChannels = await prisma.channel.findMany({
    orderBy: [{ isMine: 'desc' }, { createdAt: 'asc' }],
  });

  if (allChannels.length === 0) {
    return {
      myChannel: null,
      channels: [],
      totalChannels: 0,
      activeChannels: 0,
      lastGlobalUpdate: null,
    };
  }

  const channelIds = allChannels.map((c) => c.id);

  // Query 2: all snapshots for all channels (sorted desc by collectedAt)
  const allSnapshots = await prisma.snapshot.findMany({
    where: { channelId: { in: channelIds } },
    orderBy: { collectedAt: 'desc' },
    select: { channelId: true, collectedAt: true, membersCount: true },
  });

  // Query 3: all posts for all channels in the last 30 days
  const allPosts = await prisma.post.findMany({
    where: {
      channelId: { in: channelIds },
      publishedAt: { gte: date30dAgo },
    },
    select: { channelId: true, publishedAt: true, views: true, text: true, reactions: true, comments: true, forwards: true },
  });

  // Group snapshots by channelId (preserving desc order)
  const snapshotsByChannel = new Map<number, { collectedAt: Date; membersCount: number }[]>();
  for (const s of allSnapshots) {
    if (!snapshotsByChannel.has(s.channelId)) {
      snapshotsByChannel.set(s.channelId, []);
    }
    snapshotsByChannel.get(s.channelId)!.push({
      collectedAt: s.collectedAt,
      membersCount: s.membersCount,
    });
  }

  // Group posts by channelId
  const postsByChannel = new Map<number, { publishedAt: Date; views: number | null; text: string | null; reactions: number | null; comments: number | null; forwards: number | null }[]>();
  for (const p of allPosts) {
    if (!postsByChannel.has(p.channelId)) {
      postsByChannel.set(p.channelId, []);
    }
    postsByChannel.get(p.channelId)!.push({
      publishedAt: p.publishedAt,
      views: p.views,
      text: p.text,
      reactions: p.reactions,
      comments: p.comments,
      forwards: p.forwards,
    });
  }

  // Compute metrics for each channel — pure in-memory, no DB calls
  const channelMetricsList: ChannelMetrics[] = [];
  const epSnapshots: import('./ep').ChannelSnapshot[] = [];

  for (const ch of allChannels) {
    const snapshots = snapshotsByChannel.get(ch.id) || [];
    const posts = postsByChannel.get(ch.id) || [];
    const metrics = calculateChannelMetricsFromData(ch, snapshots, posts, now);
    channelMetricsList.push(metrics);

    // Build EP snapshot for calculation
    const recentPosts = posts.slice(-20); // last 20 posts
    epSnapshots.push({
      channelId: ch.id.toString(),
      niche: ch.niche || 'general',
      subscribers: metrics.currentMembers || 0,
      newSubs24h: metrics.delta24h.abs || 0,
      newSubs7d: metrics.delta7d.abs || 0,
      newSubs30d: metrics.delta30d.abs || 0,
      postViews: recentPosts.map(p => p.views || 0),
      postReactions: recentPosts.map(p => p.reactions || 0),
      postComments: recentPosts.map(p => p.comments || 0),
      postForwards: recentPosts.map(p => p.forwards || 0),
    });
  }

  // Calculate EP
  const { computeNicheStats, calculateEP } = await import('./ep');
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

  // Find My Channel
  const myChannel = channelMetricsList.find((c) => c.isMine) || null;

  // Enrich with comparisons against My Channel
  const channelsWithComparison = channelMetricsList.map((ch) => {
    if (!myChannel || ch.id === myChannel.id) {
      return ch;
    }

    let audienceSharePercent: number | null = null;
    if (
      ch.currentMembers !== null &&
      myChannel.currentMembers !== null &&
      myChannel.currentMembers > 0
    ) {
      audienceSharePercent = Number(
        ((ch.currentMembers / myChannel.currentMembers) * 100).toFixed(1)
      );
    }

    let growthRateDiff7d: number | null = null;
    if (
      ch.delta7d.percent !== null &&
      myChannel.delta7d.percent !== null
    ) {
      growthRateDiff7d = Number(
        (ch.delta7d.percent - myChannel.delta7d.percent).toFixed(2)
      );
    }

    let activityDiff7d: number | null = null;
    if (myChannel.posts7d !== undefined) {
      activityDiff7d = ch.posts7d - myChannel.posts7d;
    }

    return {
      ...ch,
      comparison: {
        audienceSharePercent,
        growthRateDiff7d,
        activityDiff7d,
      },
    };
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

  // To match a day to its members count, we can find the closest snapshot 
  // on or before that day.
  // Pre-calculate the latest snapshot before each day.
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
    // Advance snapshot index until it matches or passes the date
    const dayStart = new Date(date + 'T00:00:00.000Z');
    const dayEnd = new Date(date + 'T23:59:59.999Z');
    
    // Find the latest snapshot up to dayEnd
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

  // Fetch EP from overview (since EP requires all channels data)
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

  // Snapshots for this channel in period
  const channelSnapshots = await prisma.snapshot.findMany({
    where: {
      channelId,
      collectedAt: { gte: periodStart },
    },
    orderBy: { collectedAt: 'asc' },
  });

  // If comparing with My Channel, load my snapshots
  const mySnapshots = myChannelRecord
    ? await prisma.snapshot.findMany({
        where: {
          channelId: myChannelRecord.id,
          collectedAt: { gte: periodStart },
        },
        orderBy: { collectedAt: 'asc' },
      })
    : [];

  // Match snapshots timeline
  const membersHistory = channelSnapshots.map((snap) => {
    // Find closest snapshot of my channel around the same time
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

  // Posts distribution by day / hour
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

  // Group posts by day/bucket
  const postsByDateMap = new Map<string, { count: number; totalViews: number; viewPosts: number }>();

  // Pre-populate days in period so empty days appear with 0 posts
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
  const periodStart = new Date(Date.now() - 30 * MS_DAY); // last 30 days

  // Get all competitor channels with their latest snapshot
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

  // Get all competitor posts in last 30 days
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

  // Calculate stats per slot
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

  // Calculate scores
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

  // Calculate final score: high ERR, low postCount is better
  let bestSlot = heatmap[0];
  for (const cell of heatmap) {
    // Normalize to 0-1
    const normCount = maxCount > 0 ? cell.postCount / maxCount : 0;
    const normVr = maxVr > 0 ? cell.avgVr / maxVr : 0;
    
    // Score formula: Audience engagement (VR) - Competition noise
    // But if count is 0, we have no data on VR, so we give it a neutral score, or penalize it slightly
    if (cell.postCount === 0) {
      cell.score = 0;
    } else {
      cell.score = normVr - (normCount * 0.5); // Penalty for high competition is 0.5 weight
    }

    if (cell.score > bestSlot.score) {
      bestSlot = cell;
    }
  }

  // Filter out zero-data slots for best slot selection if we have any data
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
