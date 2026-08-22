import { prisma } from './prisma';
import { ChannelMetrics, ChannelStatus, OverviewStats, ChannelDetailStats } from './types';
import { serializeBigInt } from './utils';

const MS_HOUR = 3600 * 1000;
const MS_24H = 24 * MS_HOUR;
const MS_7D = 7 * 24 * MS_HOUR;
const MS_30D = 30 * 24 * MS_HOUR;

export async function calculateChannelMetrics(
  channelId: number,
  now: Date = new Date()
): Promise<ChannelMetrics | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) return null;

  const date24hAgo = new Date(now.getTime() - MS_24H);
  const date7dAgo = new Date(now.getTime() - MS_7D);
  const date30dAgo = new Date(now.getTime() - MS_30D);

  // Latest snapshot
  const latestSnapshot = await prisma.snapshot.findFirst({
    where: { channelId },
    orderBy: { collectedAt: 'desc' },
  });

  const currentMembers = latestSnapshot ? latestSnapshot.membersCount : null;

  // Snapshot at <= 24h ago
  const snapshot24h = await prisma.snapshot.findFirst({
    where: {
      channelId,
      collectedAt: { lte: date24hAgo },
    },
    orderBy: { collectedAt: 'desc' },
  });

  // Snapshot at <= 7d ago
  const snapshot7d = await prisma.snapshot.findFirst({
    where: {
      channelId,
      collectedAt: { lte: date7dAgo },
    },
    orderBy: { collectedAt: 'desc' },
  });

  // Snapshot at <= 30d ago
  const snapshot30d = await prisma.snapshot.findFirst({
    where: {
      channelId,
      collectedAt: { lte: date30dAgo },
    },
    orderBy: { collectedAt: 'desc' },
  });

  // Calculate Deltas
  const calculateDelta = (pastSnapshot: { membersCount: number } | null) => {
    if (currentMembers === null || !pastSnapshot || pastSnapshot.membersCount === 0) {
      return { abs: null, percent: null };
    }
    const abs = currentMembers - pastSnapshot.membersCount;
    const percent = Number(((abs / pastSnapshot.membersCount) * 100).toFixed(2));
    return { abs, percent };
  };

  const delta24h = calculateDelta(snapshot24h);
  const delta7d = calculateDelta(snapshot7d);
  const delta30d = calculateDelta(snapshot30d);

  // Post counts
  const posts24h = await prisma.post.count({
    where: {
      channelId,
      publishedAt: { gte: date24hAgo },
    },
  });

  const posts7d = await prisma.post.count({
    where: {
      channelId,
      publishedAt: { gte: date7dAgo },
    },
  });

  const posts30d = await prisma.post.count({
    where: {
      channelId,
      publishedAt: { gte: date30dAgo },
    },
  });

  const avgPostsPerDay = Number((posts30d / 30).toFixed(1));

  // Calculate views and ERR for last 7 days
  const postsWithViewsData = await prisma.post.findMany({
    where: {
      channelId,
      publishedAt: { gte: date7dAgo },
      views: { not: null },
    },
    select: { views: true },
  });
  let totalViews7d = 0;
  for (const p of postsWithViewsData) {
    totalViews7d += p.views || 0;
  }
  const avgViews7d = postsWithViewsData.length > 0 ? Math.round(totalViews7d / postsWithViewsData.length) : null;
  const err7d = (currentMembers && currentMembers > 0 && avgViews7d !== null) 
    ? Number(((avgViews7d / currentMembers) * 100).toFixed(2)) 
    : null;

  // Fetch sparkline data (one snapshot per day for the last 7 days roughly, or all within 7 days)
  const sparklineSnapshots = await prisma.snapshot.findMany({
    where: {
      channelId,
      collectedAt: { gte: date7dAgo },
    },
    orderBy: { collectedAt: 'asc' },
    select: { membersCount: true },
  });
  
  // To avoid sending hundreds of points (if hourly), we can downsample to ~7-14 points
  const sparkline7d = [];
  const step = Math.max(1, Math.floor(sparklineSnapshots.length / 10)); // ~10 points max
  for (let i = 0; i < sparklineSnapshots.length; i += step) {
    sparkline7d.push(sparklineSnapshots[i].membersCount);
  }
  if (sparklineSnapshots.length > 0 && sparkline7d[sparkline7d.length - 1] !== sparklineSnapshots[sparklineSnapshots.length - 1].membersCount) {
    sparkline7d.push(sparklineSnapshots[sparklineSnapshots.length - 1].membersCount); // ensure latest is included
  }

  // Determine status
  let status: ChannelStatus = 'success';
  if (channel.lastError) {
    status = 'error';
  } else if (
    !channel.lastCollectedAt ||
    now.getTime() - new Date(channel.lastCollectedAt).getTime() > 3 * MS_HOUR
  ) {
    status = 'stale';
  }

  return {
    id: channel.id,
    username: channel.username,
    tgId: channel.tgId ? channel.tgId.toString() : null,
    title: channel.title,
    type: channel.type as 'channel' | 'group',
    isMine: channel.isMine,
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
    avgViews7d,
    err7d,
    status,
    sparkline7d,
  };
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const now = new Date();
  const allChannels = await prisma.channel.findMany({
    orderBy: [{ isMine: 'desc' }, { createdAt: 'asc' }],
  });

  const channelMetricsList: ChannelMetrics[] = [];
  for (const ch of allChannels) {
    const metrics = await calculateChannelMetrics(ch.id, now);
    if (metrics) {
      channelMetricsList.push(metrics);
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

export async function getChannelDetailStats(
  channelId: number,
  period: '24h' | '7d' | '30d' = '7d'
): Promise<ChannelDetailStats | null> {
  const now = new Date();
  const channel = await calculateChannelMetrics(channelId, now);
  if (!channel) return null;

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

  return {
    channel,
    myChannel,
    period,
    membersHistory,
    postsDistribution,
    heatmapData,
  };
}
