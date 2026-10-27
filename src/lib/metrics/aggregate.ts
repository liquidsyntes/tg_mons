import { ChannelMetrics, ChannelStatus } from '../types';
import { calculateDelta, calculateDeltaFromData, calculateVr, computeAvgViews24h } from './calculate';
import { calculateContentScore } from '../scoring';
import { aggregateChannelER, aggregateChannelERR } from './engagement';
import { calculateAdShare } from './adShare';
import { detectSilencePeriods } from './silence';

type DeltaMetric = ChannelMetrics['delta24h'];

const MS_HOUR = 3600 * 1000;
const MS_24H = 24 * MS_HOUR;
const MS_7D = 7 * 24 * MS_HOUR;
const MS_30D = 30 * MS_HOUR * 24;

export interface ChannelRecordInput {
  id: number;
  username: string | null;
  tgId: bigint | string | number | null;
  title: string;
  type: string;
  niche?: string;
  tags?: string[];
  isMine: boolean;
  isFavorite?: boolean;
  isActive: boolean;
  consecutiveErrors?: number;
  lastMessageId: bigint | string | number | null;
  lastError: string | null;
  lastCollectedAt: Date | string | null;
  createdAt: Date | string;
  citationIndex?: number;
}

export interface DailyMetricInput {
  date: Date | string;
  followers: number | null;
  postsCount: number;
  avgViews: number;
  err: number;
}

export interface MetricPostInput {
  publishedAt: Date;
  views: number | null;
  text: string | null;
  reactions?: number | null;
  comments?: number | null;
  forwards?: number | null;
  subscribersAtPublish?: number | null;
  isAd?: boolean | null;
}

function resolveChannelStatus(
  lastError: string | null,
  lastCollectedAt: Date | string | null,
  now: Date
): ChannelStatus {
  if (lastError) return 'error';
  if (!lastCollectedAt || now.getTime() - new Date(lastCollectedAt).getTime() > 3 * MS_HOUR) {
    return 'stale';
  }
  return 'success';
}

function findLastPostViews(posts: ReadonlyArray<{ views: number | null }>): number | null {
  for (const p of posts) {
    if (p.views !== null && p.views !== undefined) {
      return p.views;
    }
  }
  return null;
}

function computeEngagementMetrics(
  posts: ReadonlyArray<MetricPostInput>,
  currentMembers: number | null,
  t24hMs: number,
  t7dMs: number
): {
  er24h: number | null;
  er7d: number | null;
  err24h: number | null;
  err7d: number | null;
  cr7d: number | null;
} {
  const posts24hList = posts.filter((p) => p.publishedAt.getTime() >= t24hMs);
  const posts7dList = posts.filter((p) => p.publishedAt.getTime() >= t7dMs);

  const rawEr24h = aggregateChannelER(posts24hList);
  const rawEr7d = aggregateChannelER(posts7dList);
  const rawErr24h = aggregateChannelERR(posts24hList);
  const rawErr7d = aggregateChannelERR(posts7dList);

  const er24h = rawEr24h !== null ? Number(rawEr24h.toFixed(2)) : null;
  const er7d = rawEr7d !== null ? Number(rawEr7d.toFixed(2)) : null;
  const err24h = rawErr24h !== null ? Number(rawErr24h.toFixed(2)) : null;
  const err7d = rawErr7d !== null ? Number(rawErr7d.toFixed(2)) : null;

  let cr7d: number | null = null;
  if (currentMembers && currentMembers > 0 && posts7dList.length > 0) {
    let totalComments = 0;
    for (const p of posts7dList) {
      totalComments += p.comments || 0;
    }
    const avgComments = totalComments / posts7dList.length;
    cr7d = Number(((avgComments / currentMembers) * 100).toFixed(2));
  }

  return { er24h, er7d, err24h, err7d, cr7d };
}

interface ComputedChannelMetricsCore {
  currentMembers: number | null;
  delta24h: DeltaMetric;
  delta7d: DeltaMetric;
  delta30d: DeltaMetric;
  posts24h: number;
  posts7d: number;
  posts30d: number;
  avgViews7d: number | null;
  avgViews30d: number | null;
  trueErr7d: number | null;
  sparkline7d: number[];
}

function assembleChannelMetrics(
  channel: ChannelRecordInput,
  posts: ReadonlyArray<MetricPostInput>,
  core: ComputedChannelMetricsCore,
  now: Date
): ChannelMetrics {
  const t24hMs = now.getTime() - MS_24H;
  const t7dMs = now.getTime() - MS_7D;

  const avgPostsPerDay = Number((core.posts30d / 30).toFixed(1));
  const avgViews24h = computeAvgViews24h([...posts], now);
  const vr24h = calculateVr(avgViews24h, core.currentMembers);
  const vr7d = calculateVr(core.avgViews7d, core.currentMembers);
  const vr30d = calculateVr(core.avgViews30d, core.currentMembers);
  const lastPostViews = findLastPostViews(posts);
  const status = resolveChannelStatus(channel.lastError, channel.lastCollectedAt, now);

  const scoreBreakdown = calculateContentScore(
    core.trueErr7d,
    avgPostsPerDay,
    core.delta7d.percent,
    posts.filter((p) => p.text)
  );

  const { er24h, er7d, err24h, err7d, cr7d } = computeEngagementMetrics(
    posts,
    core.currentMembers,
    t24hMs,
    t7dMs
  );

  const adShare7d = calculateAdShare([...posts], 7, now);
  const adShare30d = calculateAdShare([...posts], 30, now);
  const silence = detectSilencePeriods([...posts], { now });

  return {
    id: channel.id,
    username: channel.username,
    tgId: channel.tgId ? channel.tgId.toString() : null,
    title: channel.title,
    type: channel.type === 'group' ? 'group' : 'channel',
    niche: channel.niche,
    tags: channel.tags ?? [],
    isMine: channel.isMine,
    isFavorite: channel.isFavorite || false,
    isActive: channel.isActive,
    consecutiveErrors: channel.consecutiveErrors ?? 0,
    lastMessageId: channel.lastMessageId ? channel.lastMessageId.toString() : null,
    lastError: channel.lastError,
    lastCollectedAt: channel.lastCollectedAt ? new Date(channel.lastCollectedAt).toISOString() : null,
    createdAt: new Date(channel.createdAt).toISOString(),
    currentMembers: core.currentMembers,
    delta24h: core.delta24h,
    delta7d: core.delta7d,
    delta30d: core.delta30d,
    posts24h: core.posts24h,
    posts7d: core.posts7d,
    posts30d: core.posts30d,
    avgPostsPerDay,
    avgViews24h,
    vr24h,
    avgViews7d: core.avgViews7d,
    vr7d,
    avgViews30d: core.avgViews30d,
    vr30d,
    lastPostViews,
    trueErr7d: core.trueErr7d,
    er24h,
    er7d,
    err24h,
    err7d,
    cr7d,
    adShare7d,
    adShare30d,
    status,
    sparkline7d: core.sparkline7d,
    contentScore: scoreBreakdown.total,
    contentGrade: scoreBreakdown.grade,
    citationIndex: channel.citationIndex ?? 0,
    activityStatus: silence.status,
    lastPostAt: silence.lastPostAt,
  };
}

export function buildMetricsFromMaterialized(
  channel: ChannelRecordInput,
  dailyMetrics: ReadonlyArray<DailyMetricInput>,
  recentPosts: ReadonlyArray<MetricPostInput>,
  now: Date = new Date()
): ChannelMetrics {
  const t24h = new Date(now.getTime() - MS_24H);
  const t7d = new Date(now.getTime() - MS_7D);
  const t30d = new Date(now.getTime() - MS_30D);

  const getMetricsForPeriod = (dateLimit: Date) => {
    const periodMetrics = dailyMetrics.filter((m) => new Date(m.date).getTime() >= dateLimit.getTime());
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

  let currentMembers: number | null = null;
  if (dailyMetrics.length > 0) {
    const sorted = [...dailyMetrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    currentMembers = sorted[0].followers;
  }

  const delta24h = calculateDelta(dailyMetrics, t24h, currentMembers, now);
  const delta7d = calculateDelta(dailyMetrics, t7d, currentMembers, now);
  const delta30d = calculateDelta(dailyMetrics, t30d, currentMembers, now);

  const stats24h = getMetricsForPeriod(t24h);
  const stats7d = getMetricsForPeriod(t7d);
  const stats30d = getMetricsForPeriod(t30d);

  const sparkline7d = dailyMetrics
    .filter((m) => new Date(m.date).getTime() >= t7d.getTime())
    .map((m) => m.followers ?? 0)
    .reverse();

  return assembleChannelMetrics(
    channel,
    recentPosts,
    {
      currentMembers,
      delta24h,
      delta7d,
      delta30d,
      posts24h: stats24h.postsCount,
      posts7d: stats7d.postsCount,
      posts30d: stats30d.postsCount,
      avgViews7d: stats7d.avgViews,
      avgViews30d: stats30d.avgViews,
      trueErr7d: stats7d.trueErr,
      sparkline7d,
    },
    now
  );
}

export function calculateChannelMetricsFromData(
  channel: ChannelRecordInput,
  channelSnapshots: { collectedAt: Date; membersCount: number }[],
  channelPosts: ReadonlyArray<MetricPostInput>,
  now: Date = new Date()
): ChannelMetrics {
  const date24hAgo = new Date(now.getTime() - MS_24H);
  const date7dAgo = new Date(now.getTime() - MS_7D);
  const date30dAgo = new Date(now.getTime() - MS_30D);

  const latestSnapshot = channelSnapshots.length > 0 ? channelSnapshots[0] : null;
  const currentMembers = latestSnapshot ? latestSnapshot.membersCount : null;

  const delta24h = calculateDeltaFromData(channelSnapshots, date24hAgo, currentMembers, now);
  const delta7d = calculateDeltaFromData(channelSnapshots, date7dAgo, currentMembers, now);
  const delta30d = calculateDeltaFromData(channelSnapshots, date30dAgo, currentMembers, now);

  let posts24h = 0;
  let posts7d = 0;
  let posts30d = 0;
  let totalViews7d = 0;
  let viewPosts7d = 0;
  let totalViews30d = 0;
  let viewPosts30d = 0;
  let trueTotalEngagement = 0;

  const t24h = date24hAgo.getTime();
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
        } else if (p.views !== null) {
          totalViews7d += p.views;
          viewPosts7d++;
          trueTotalEngagement += (p.reactions || 0) + (p.comments || 0) + (p.forwards || 0);
        }
      }
    }
  }

  const trueAvgEngagement = viewPosts7d > 0 ? trueTotalEngagement / viewPosts7d : 0;
  const trueAvgViews = viewPosts7d > 0 ? totalViews7d / viewPosts7d : 0;
  const trueErr7d = trueAvgViews > 0 ? (trueAvgEngagement / trueAvgViews) * 100 : null;

  const avgViews7d = viewPosts7d > 0 ? Math.round(totalViews7d / viewPosts7d) : null;
  const avgViews30d = viewPosts30d > 0 ? Math.round(totalViews30d / viewPosts30d) : null;

  const sparklineSnapshots = channelSnapshots.filter(
    (s) => s.collectedAt.getTime() >= date7dAgo.getTime()
  );
  sparklineSnapshots.reverse();

  const sparkline7d: number[] = [];
  const step = Math.max(1, Math.floor(sparklineSnapshots.length / 10));
  for (let i = 0; i < sparklineSnapshots.length; i += step) {
    sparkline7d.push(sparklineSnapshots[i].membersCount);
  }
  if (
    sparklineSnapshots.length > 0 &&
    sparkline7d[sparkline7d.length - 1] !== sparklineSnapshots[sparklineSnapshots.length - 1].membersCount
  ) {
    sparkline7d.push(sparklineSnapshots[sparklineSnapshots.length - 1].membersCount);
  }

  return assembleChannelMetrics(
    channel,
    channelPosts,
    {
      currentMembers,
      delta24h,
      delta7d,
      delta30d,
      posts24h,
      posts7d,
      posts30d,
      avgViews7d,
      avgViews30d,
      trueErr7d,
      sparkline7d,
    },
    now
  );
}
