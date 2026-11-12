import type { AdPriceResult, AdPriceSource, ChannelDetailStats } from './types';

export type ChannelPdfPeriod = '24h' | '7d' | '30d';
export type ChannelPdfMode = 'report' | 'mediakit';

export interface ChannelPdfPeriodMetrics {
  period: ChannelPdfPeriod;
  label: string;
  days: number;
  postsCount: number;
  avgViews: number | null;
  vr: number | null;
  delta: { abs: number | null; percent: number | null; coverageDays?: number | null };
  er: { value: number | null; label: string; isFallback7d?: boolean };
  err: { value: number | null; label: string; isFallback7d?: boolean };
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
    const hasEr30d = channel.er30d !== undefined;
    const hasErr30d = channel.err30d !== undefined;
    return {
      period, label: '30 дней', days: 30, postsCount: channel.posts30d,
      avgViews: channel.avgViews30d, vr: channel.vr30d, delta: channel.delta30d,
      er: hasEr30d
        ? { value: channel.er30d ?? null, label: 'ER за 30 дней', isFallback7d: false }
        : { value: channel.er7d, label: 'ER за 7 дней', isFallback7d: true },
      err: hasErr30d
        ? { value: channel.err30d ?? null, label: 'ERR за 30 дней', isFallback7d: false }
        : { value: channel.err7d, label: 'ERR за 7 дней', isFallback7d: true },
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

export function formatAdPriceSourceLabel(source: AdPriceSource | null | undefined): string {
  if (source === 'custom_price') return 'Фиксированный прайс канала';
  if (source === 'custom_cpm') return 'Расчёт по ставке CPM канала';
  if (source === 'niche_estimate') return 'Рыночная оценка по CPM ниши';
  return 'Не указан';
}

export interface AdReachMilestones {
  hour1: number | null;
  hour12: number | null;
  hour24: number | null;
  hour48: number | null;
}

export function extractReachCurveMilestones(
  adPrice: AdPriceResult | null | undefined
): AdReachMilestones {
  const curve = adPrice?.averageReachCurve ?? [];
  const findHour = (h: number): number | null => {
    const point = curve.find(item => item.hoursAfterPost === h);
    return point && Number.isFinite(point.views) ? point.views : null;
  };
  return {
    hour1: findHour(1),
    hour12: findHour(12),
    hour24: findHour(24),
    hour48: findHour(48),
  };
}
