import type { ViralClassification, ViralReason } from '../types';
import { calculatePostERR } from './engagement';

export interface ViralPostMetrics {
  views?: number | null;
  forwards?: number | null;
  reactions?: number | null;
  comments?: number | null;
}

export interface ViralBaseline {
  sampleSize: number;
  medianViews: number;
  medianForwards: number | null;
  medianErr: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function knownCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function calculateViralBaseline(posts: ViralPostMetrics[]): ViralBaseline | null {
  const valid = posts.filter(post => knownCount(post.views) && post.views > 0);
  if (valid.length < 5) return null;

  const medianViews = median(valid.flatMap(post => knownCount(post.views) ? [post.views] : []));
  if (medianViews === null || medianViews <= 0) return null;
  const medianForwards = median(valid.map(post => post.forwards).filter(knownCount));
  const medianErr = median(valid.flatMap(post => {
    if (![post.reactions, post.comments, post.forwards].some(knownCount)) return [];
    const err = calculatePostERR(post);
    return err !== null && Number.isFinite(err) ? [err] : [];
  }));

  return { sampleSize: valid.length, medianViews, medianForwards, medianErr };
}

export function classifyViralPost(post: ViralPostMetrics, baseline: ViralBaseline | null): ViralClassification {
  const multipliers: Partial<Record<ViralReason, number>> = {};
  if (baseline) {
    if (knownCount(post.views) && post.views >= 100 && post.views >= 2 * baseline.medianViews) {
      multipliers.views = post.views / baseline.medianViews;
    }
    if (knownCount(post.forwards) && post.forwards >= 10 &&
        baseline.medianForwards !== null && baseline.medianForwards > 0 &&
        post.forwards >= 3 * baseline.medianForwards) {
      multipliers.forwards = post.forwards / baseline.medianForwards;
    }
    const err = [post.reactions, post.comments, post.forwards].some(knownCount)
      ? calculatePostERR(post) : null;
    if (err !== null && Number.isFinite(err) && knownCount(post.views) &&
        post.views >= baseline.medianViews && baseline.medianErr !== null && baseline.medianErr > 0 &&
        err >= 2 * baseline.medianErr) {
      multipliers.err = err / baseline.medianErr;
    }
  }

  const viralReasons = (['views', 'forwards', 'err'] as const)
    .filter(reason => multipliers[reason] !== undefined);
  const viralPrimaryReason = viralReasons.reduce<ViralReason | null>((best, reason) =>
    best === null || (multipliers[reason] ?? 0) > (multipliers[best] ?? 0) ? reason : best, null);
  return {
    isViral: viralReasons.length > 0,
    viralReasons,
    viralPrimaryReason,
    viralMultiplier: viralPrimaryReason === null ? null : Number((multipliers[viralPrimaryReason] ?? 0).toFixed(1)),
  };
}
