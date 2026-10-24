import type { ChannelMetrics, NicheBenchmarkMetric, NicheBenchmarkMetricKey, NicheBenchmarkResult } from './types';

function metricValue(channel: ChannelMetrics, key: NicheBenchmarkMetricKey): number | null {
  const value = key === 'adShare30d' ? channel.adShare30d?.percent
    : key === 'delta7dPct' ? channel.delta7d.percent
    : channel[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percentile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const weight = position - lower;
  return sorted[lower] + ((sorted[lower + 1] ?? sorted[lower]) - sorted[lower]) * weight;
}

function benchmarkMetric(
  cohort: ChannelMetrics[], target: ChannelMetrics, key: NicheBenchmarkMetricKey,
): NicheBenchmarkMetric {
  const values = cohort.map(channel => metricValue(channel, key))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const value = metricValue(target, key);
  const lowerIsBetter = key === 'adShare30d';
  if (values.length < 3 || value === null) {
    return { value, p25: null, median: null, p75: null, rank: null, sampleSize: values.length, lowerIsBetter };
  }
  const worse = values.filter(peer => lowerIsBetter ? peer > value : peer < value).length;
  const tied = values.filter(peer => peer === value).length;
  const rank = 100 * (worse + tied / 2) / values.length;
  return {
    value, p25: percentile(values, 0.25), median: percentile(values, 0.5),
    p75: percentile(values, 0.75), rank, sampleSize: values.length, lowerIsBetter,
  };
}

export function calculateNicheBenchmarks(channels: ChannelMetrics[], targetChannelId: number): NicheBenchmarkResult {
  const target = channels.find(channel => channel.id === targetChannelId);
  const targetNiche = target?.niche?.trim();
  const niche = targetNiche || 'Без ниши';
  const cohort = target && target.isActive && targetNiche
    ? channels.filter(channel => channel.isActive && channel.type === target.type && channel.niche?.trim() === targetNiche)
    : [];
  if (cohort.length < 3 || !target) {
    return { status: 'insufficient_cohort', niche, cohortSize: cohort.length };
  }
  const metrics: Record<NicheBenchmarkMetricKey, NicheBenchmarkMetric> = {
    er7d: benchmarkMetric(cohort, target, 'er7d'),
    err7d: benchmarkMetric(cohort, target, 'err7d'),
    vr7d: benchmarkMetric(cohort, target, 'vr7d'),
    posts7d: benchmarkMetric(cohort, target, 'posts7d'),
    adShare30d: benchmarkMetric(cohort, target, 'adShare30d'),
    delta7dPct: benchmarkMetric(cohort, target, 'delta7dPct'),
  };
  return { status: 'ready', niche, cohortSize: cohort.length, metrics };
}
