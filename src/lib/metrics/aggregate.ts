import { ChannelMetrics, ChannelStatus } from '../types';
import { calculateDelta, calculateDeltaFromData, calculateVr } from './calculate';
import { calculateContentScore } from '../scoring';

const MS_HOUR = 3600 * 1000;
const MS_24H = 24 * MS_HOUR;
const MS_7D = 7 * 24 * MS_HOUR;
const MS_30D = 30 * 24 * MS_HOUR;

export function buildMetricsFromMaterialized(
  channel: any,
  dailyMetrics: any[],
  recentPosts: any[],
  now: Date = new Date()
): ChannelMetrics {
  const t24h = new Date(now.getTime() - MS_24H);
  const t7d = new Date(now.getTime() - MS_7D);
  const t30d = new Date(now.getTime() - MS_30D);

  const getMetricsForPeriod = (dateLimit: Date) => {
    const periodMetrics = dailyMetrics.filter(m => new Date(m.date).getTime() >= dateLimit.getTime());
    let postsCount = 0;
    let sumViews = 0;
    let sumErr = 0;
    
    for (const m of periodMetrics) {
      if (m.postsCount > 0) {
        postsCount += m.postsCount;
        sumViews += m.avgViews * m.postsCount;
        sumErr += m.err * m.postsCount;
      }
    }
    
    const avgViews = postsCount > 0 ? Math.round(sumViews / postsCount) : null;
    const trueErr = postsCount > 0 ? Number((sumErr / postsCount).toFixed(2)) : null;
    
    return { postsCount, avgViews, trueErr };
  };

  let currentMembers = null;
  if (dailyMetrics.length > 0) {
    const sorted = [...dailyMetrics].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    currentMembers = sorted[0].followers;
  }
  
  const delta24h = calculateDelta(dailyMetrics, t24h, currentMembers);
  const delta7d = calculateDelta(dailyMetrics, t7d, currentMembers);
  const delta30d = calculateDelta(dailyMetrics, t30d, currentMembers);

  const stats24h = getMetricsForPeriod(t24h);
  const stats7d = getMetricsForPeriod(t7d);
  const stats30d = getMetricsForPeriod(t30d);

  const vr24h = calculateVr(stats24h.avgViews, currentMembers);
  const vr7d = calculateVr(stats7d.avgViews, currentMembers);
  const vr30d = calculateVr(stats30d.avgViews, currentMembers);

  let lastPostViews = null;
  for (const p of recentPosts) {
    if (p.views !== null && p.views !== undefined) {
      lastPostViews = p.views;
      break;
    }
  }

  const sparkline7d = dailyMetrics
    .filter(m => new Date(m.date).getTime() >= t7d.getTime())
    .map(m => m.followers)
    .reverse();

  let status = 'success';
  if (channel.lastError) status = 'error';
  else if (!channel.lastCollectedAt || now.getTime() - new Date(channel.lastCollectedAt).getTime() > 3 * MS_HOUR) status = 'stale';

  const avgPostsPerDay = Number((stats30d.postsCount / 30).toFixed(1));
  const scoreBreakdown = calculateContentScore(stats7d.trueErr, avgPostsPerDay, delta7d.percent, recentPosts.filter(p => p.text));

  return {
    id: channel.id,
    username: channel.username,
    tgId: channel.tgId ? channel.tgId.toString() : null,
    title: channel.title,
    type: channel.type,
    niche: channel.niche,
    isMine: channel.isMine,
    isFavorite: channel.isFavorite || false,
    isActive: channel.isActive,
    consecutiveErrors: channel.consecutiveErrors,
    lastMessageId: channel.lastMessageId ? channel.lastMessageId.toString() : null,
    lastError: channel.lastError,
    lastCollectedAt: channel.lastCollectedAt ? new Date(channel.lastCollectedAt).toISOString() : null,
    createdAt: new Date(channel.createdAt).toISOString(),
    currentMembers,
    delta24h, delta7d, delta30d,
    posts24h: stats24h.postsCount, posts7d: stats7d.postsCount, posts30d: stats30d.postsCount,
    avgPostsPerDay,
    avgViews24h: stats24h.avgViews, vr24h,
    avgViews7d: stats7d.avgViews, vr7d,
    avgViews30d: stats30d.avgViews, vr30d,
    lastPostViews,
    trueErr7d: stats7d.trueErr,
    status: status as any,
    sparkline7d,
    contentScore: scoreBreakdown.total,
    contentGrade: scoreBreakdown.grade,
  };
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

  const latestSnapshot = channelSnapshots.length > 0 ? channelSnapshots[0] : null;
  const currentMembers = latestSnapshot ? latestSnapshot.membersCount : null;

  const delta24h = calculateDeltaFromData(channelSnapshots, date24hAgo, currentMembers);
  const delta7d = calculateDeltaFromData(channelSnapshots, date7dAgo, currentMembers);
  const delta30d = calculateDeltaFromData(channelSnapshots, date30dAgo, currentMembers);

  let posts24h = 0;
  let posts7d = 0;
  let posts30d = 0;
  let totalViews24h = 0;
  let viewPosts24h = 0;
  let totalViews7d = 0;
  let viewPosts7d = 0;
  let totalViews30d = 0;
  let viewPosts30d = 0;

  const t24h = date24hAgo.getTime();
  const t48h = date24hAgo.getTime() - MS_24H;
  const t7d = date7dAgo.getTime();
  const t30d = date30dAgo.getTime();

  for (const p of channelPosts) {
    const pt = p.publishedAt.getTime();
    if (pt >= t30d) {
      posts30d++;
      if (pt < t24h && p.views !== null) {
        totalViews30d += p.views;
        viewPosts30d++;
      }
      if (pt >= t7d) {
        posts7d++;
        if (pt >= t24h) {
          posts24h++;
        }
        
        if (pt < t24h) {
          if (p.views !== null) {
            totalViews7d += p.views;
            viewPosts7d++;
            
            if (pt >= t48h) {
              totalViews24h += p.views;
              viewPosts24h++;
            }
          }
        }
      }
    }
  }

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

  if (viewPosts24h === 0 && viewPosts7d > 0) {
    totalViews24h = totalViews7d;
    viewPosts24h = viewPosts7d;
  }

  const avgPostsPerDay = Number((posts30d / 30).toFixed(1));

  const avgViews24h = viewPosts24h > 0 ? Math.round(totalViews24h / viewPosts24h) : null;
  const vr24h = calculateVr(avgViews24h, currentMembers);

  const avgViews7d = viewPosts7d > 0 ? Math.round(totalViews7d / viewPosts7d) : null;
  const vr7d = calculateVr(avgViews7d, currentMembers);

  const avgViews30d = viewPosts30d > 0 ? Math.round(totalViews30d / viewPosts30d) : null;
  const vr30d = calculateVr(avgViews30d, currentMembers);

  let lastPostViews: number | null = null;
  for (const p of channelPosts) {
    if (p.views !== null && p.views !== undefined) {
      lastPostViews = p.views;
      break;
    }
  }

  const sparklineSnapshots = channelSnapshots.filter(
    (s) => s.collectedAt.getTime() >= date7dAgo.getTime()
  );
  sparklineSnapshots.reverse();

  const sparkline7d: number[] = [];
  const step = Math.max(1, Math.floor(sparklineSnapshots.length / 10));
  for (let i = 0; i < sparklineSnapshots.length; i += step) {
    sparkline7d.push(sparklineSnapshots[i].membersCount);
  }
  if (sparklineSnapshots.length > 0 && sparkline7d[sparkline7d.length - 1] !== sparklineSnapshots[sparklineSnapshots.length - 1].membersCount) {
    sparkline7d.push(sparklineSnapshots[sparklineSnapshots.length - 1].membersCount);
  }

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
    // @ts-ignore
    consecutiveErrors: channel.consecutiveErrors,
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
    avgViews30d,
    vr30d,
    lastPostViews,
    trueErr7d,
    status,
    sparkline7d,
    contentScore: scoreBreakdown.total,
    contentGrade: scoreBreakdown.grade,
  };
}
