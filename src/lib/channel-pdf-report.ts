import type { ChannelDetailStats } from './types';

export type ChannelPdfPeriod = '24h' | '7d' | '30d';

export interface ChannelPdfPeriodMetrics {
  period: ChannelPdfPeriod;
  label: string;
  days: number;
  postsCount: number;
  avgViews: number | null;
  vr: number | null;
  delta: { abs: number | null; percent: number | null; coverageDays?: number | null };
  er: { value: number | null; label: string };
  err: { value: number | null; label: string };
}

export function getChannelPdfPeriodMetrics(
  stats: ChannelDetailStats,
  requestedPeriod: string,
): ChannelPdfPeriodMetrics {
  const channel = stats.channel;
  const period: ChannelPdfPeriod = requestedPeriod === '24h' || requestedPeriod === '30d'
    ? requestedPeriod : '7d';

  if (period === '24h') {
    return {
      period, label: '24 часа', days: 1, postsCount: channel.posts24h,
      avgViews: channel.avgViews24h, vr: channel.vr24h, delta: channel.delta24h,
      er: { value: channel.er24h, label: 'ER за 24 часа' },
      err: { value: channel.err24h, label: 'ERR за 24 часа' },
    };
  }
  if (period === '30d') {
    return {
      period, label: '30 дней', days: 30, postsCount: channel.posts30d,
      avgViews: channel.avgViews30d, vr: channel.vr30d, delta: channel.delta30d,
      er: { value: channel.er7d, label: 'ER за 7 дней' },
      err: { value: channel.err7d, label: 'ERR за 7 дней' },
    };
  }
  return {
    period, label: '7 дней', days: 7, postsCount: channel.posts7d,
    avgViews: channel.avgViews7d, vr: channel.vr7d, delta: channel.delta7d,
    er: { value: channel.er7d, label: 'ER за 7 дней' },
    err: { value: channel.err7d, label: 'ERR за 7 дней' },
  };
}

export function getTopRecentPosts(stats: ChannelDetailStats, limit = 5) {
  return (stats.recentPosts ?? [])
    .filter(post => post.views !== null)
    .sort((left, right) => (right.views ?? 0) - (left.views ?? 0))
    .slice(0, limit);
}
