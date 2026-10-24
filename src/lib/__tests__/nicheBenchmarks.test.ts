import { describe, expect, it } from 'vitest';
import { channel } from './fixtures/channel-metrics';
import { calculateNicheBenchmarks } from '../nicheBenchmarks';
import type { ChannelMetrics } from '../types';

function peer(id: number, er7d: number | null, adShare: number | null): ChannelMetrics {
  return {
    ...channel, id, niche: 'Музыка', er7d,
    adShare30d: adShare === null ? undefined : { percent: adShare, level: 'medium' },
  };
}

describe('calculateNicheBenchmarks', () => {
  it('calculates interpolated quartiles and direction-aware rank in the matching cohort', () => {
    const channels = [peer(1, 10, 40), peer(2, 20, 30), peer(3, 30, 20), peer(4, 40, 10),
      { ...peer(5, 100, 0), type: 'group' as const }, { ...peer(6, 100, 0), niche: 'Новости' },
      { ...peer(7, 100, 0), isActive: false }];
    const result = calculateNicheBenchmarks(channels, 3);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.cohortSize).toBe(4);
    expect(result.metrics.er7d).toMatchObject({ p25: 17.5, median: 25, p75: 32.5, rank: 62.5, sampleSize: 4 });
    expect(result.metrics.adShare30d).toMatchObject({ p25: 17.5, median: 25, p75: 32.5, rank: 62.5, lowerIsBetter: true });
  });

  it('reports an insufficient cohort below three active matching channels', () => {
    expect(calculateNicheBenchmarks([peer(1, 10, 10), peer(2, 20, 20)], 1)).toEqual({
      status: 'insufficient_cohort', niche: 'Музыка', cohortSize: 2,
    });
  });

  it('ignores null and non-finite values without turning them into zero', () => {
    const result = calculateNicheBenchmarks([
      peer(1, 10, 10), peer(2, null, null), peer(3, Number.NaN, 30), peer(4, 40, 40),
    ], 1);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.metrics.er7d).toMatchObject({ sampleSize: 2, p25: null, rank: null });
    expect(result.metrics.adShare30d).toMatchObject({ sampleSize: 3, p25: 20, median: 30, p75: 35 });
  });

  it('gives tied values a midrank', () => {
    const result = calculateNicheBenchmarks([peer(1, 10, 10), peer(2, 10, 10), peer(3, 10, 10)], 1);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.metrics.er7d.rank).toBe(50);
  });
});
