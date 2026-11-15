import { describe, expect, it } from 'vitest';
import type { ChannelMetrics } from '@/lib/types';
import {
  getComparisonCoverageWarnings,
  buildMultiChannelComparison,
  buildTagBenchmarkProfile,
  mergePostsDistribution,
  mergeSubscriberHistory,
  type CompareChannelData,
} from '../compare';

function makeChannel(
  overrides: Partial<ChannelMetrics> & { id: number; title: string }
): ChannelMetrics {
  return {
    id: overrides.id,
    username: overrides.username ?? `ch_${overrides.id}`,
    tgId: overrides.tgId ?? String(1000 + overrides.id),
    title: overrides.title,
    type: 'channel',
    niche: overrides.niche ?? 'tech',
    tags: overrides.tags ?? [],
    isMine: overrides.isMine ?? false,
    isFavorite: false,
    isActive: overrides.isActive ?? true,
    consecutiveErrors: 0,
    lastMessageId: '10',
    lastError: null,
    lastCollectedAt: '2026-11-10T10:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
    currentMembers: overrides.currentMembers !== undefined ? overrides.currentMembers : 10000,
    delta24h: overrides.delta24h ?? { abs: 100, percent: 1 },
    delta7d: overrides.delta7d ?? { abs: 500, percent: 5 },
    delta30d: overrides.delta30d ?? { abs: 2000, percent: 20 },
    posts24h: 2,
    posts7d: 14,
    posts30d: 60,
    avgPostsPerDay: overrides.avgPostsPerDay ?? 2,
    avgViews24h: 3000,
    vr24h: 30,
    avgViews7d: 3200,
    vr7d: 32,
    avgViews30d: overrides.avgViews30d !== undefined ? overrides.avgViews30d : 3500,
    vr30d: 35,
    lastPostViews: 3100,
    trueErr7d: 4.5,
    er24h: 2.5,
    er7d: 2.8,
    er30d: overrides.er30d !== undefined ? overrides.er30d : 3.0,
    err24h: 6.1,
    err7d: 6.5,
    err30d: overrides.err30d !== undefined ? overrides.err30d : 7.0,
    cr7d: null,
    adShare7d: overrides.adShare7d ?? { percent: 8, level: 'low' },
    adShare30d: overrides.adShare30d ?? { percent: 10, level: 'medium' },
    status: 'success',
    sparkline7d: [],
    contentScore: overrides.contentScore ?? 75,
    fraudCoverage: { status: 'sufficient', evaluatedChecks: 6, checks: [] },
    fraudScore: overrides.fraudScore ?? 10,
  };
}

describe('compare chart helpers (legacy pair mode)', () => {
  it('merges subscriber histories in chronological order with forward-filled values', () => {
    const merged = mergeSubscriberHistory(
      [
        { collectedAt: '2026-10-17T10:00:00.000Z', membersCount: 1000 },
        { collectedAt: '2026-10-17T12:00:00.000Z', membersCount: 1050 },
      ],
      [
        { collectedAt: '2026-10-17T11:00:00.000Z', membersCount: 500 },
      ],
      '7d'
    );

    expect(merged).toHaveLength(3);
    expect(merged[0].membersA).toBe(1000);
    expect(merged[0].membersB).toBeUndefined();
    expect(merged[1].membersA).toBe(1000);
    expect(merged[1].membersB).toBe(500);
    expect(merged[2].membersA).toBe(1050);
    expect(merged[2].membersB).toBe(500);
  });

  it('merges posts distribution by date bucket', () => {
    const merged = mergePostsDistribution(
      [
        { date: '10:00', postsCount: 2, viewsAvg: 400 },
        { date: '12:00', postsCount: 1, viewsAvg: 300 },
      ],
      [
        { date: '11:00', postsCount: 3, viewsAvg: 500 },
        { date: '12:00', postsCount: 4, viewsAvg: 600 },
      ],
      '24h'
    );

    expect(merged).toEqual([
      { date: '10:00', postsA: 2, postsB: 0, viewsA: 400, viewsB: 0 },
      { date: '11:00', postsA: 0, postsB: 3, viewsA: 0, viewsB: 500 },
      { date: '12:00', postsA: 1, postsB: 4, viewsA: 300, viewsB: 600 },
    ]);
  });
});

describe('buildMultiChannelComparison', () => {
  it('aligns 3-4 channels with different snapshot dates and calculates relative growth % index', () => {
    const ch1: CompareChannelData = {
      channel: makeChannel({ id: 1, title: 'Большой', currentMembers: 12000 }),
      membersHistory: [
        { collectedAt: '2026-11-01T10:00:00.000Z', membersCount: 10000 },
        { collectedAt: '2026-11-03T10:00:00.000Z', membersCount: 12000 },
      ],
      postsDistribution: [{ date: '2026-11-01', postsCount: 2, viewsAvg: 4000 }],
    };
    const ch2: CompareChannelData = {
      channel: makeChannel({ id: 2, title: 'Нишевый', currentMembers: 900 }),
      membersHistory: [
        { collectedAt: '2026-11-02T10:00:00.000Z', membersCount: 1000 },
        { collectedAt: '2026-11-03T10:00:00.000Z', membersCount: 900 },
      ],
      postsDistribution: [{ date: '2026-11-02', postsCount: 3, viewsAvg: 500 }],
    };
    const ch3: CompareChannelData = {
      channel: makeChannel({ id: 3, title: 'Нулевой старт', currentMembers: 0 }),
      membersHistory: [{ collectedAt: '2026-11-01T10:00:00.000Z', membersCount: 0 }],
      postsDistribution: [],
    };
    const ch4: CompareChannelData = {
      channel: makeChannel({ id: 4, title: 'Быстрый', currentMembers: 2500 }),
      membersHistory: [
        { collectedAt: '2026-11-01T10:00:00.000Z', membersCount: 2000 },
        { collectedAt: '2026-11-02T10:00:00.000Z', membersCount: 2500 },
      ],
      postsDistribution: [{ date: '2026-11-02', postsCount: 1, viewsAvg: 1200 }],
    };

    const result = buildMultiChannelComparison([ch1, ch2, ch3, ch4], '30d');

    expect(result.subscriberSeries).toHaveLength(3);
    // T0: 2026-11-01
    expect(result.subscriberSeries[0].membersByChannel).toEqual({ 1: 10000, 2: null, 3: 0, 4: 2000 });
    expect(result.subscriberSeries[0].growthPctByChannel).toEqual({ 1: 0, 2: null, 3: null, 4: 0 });
    // T1: 2026-11-02 (ch1 forward-filled, ch2 starts at 0%, ch4 jumps +25%)
    expect(result.subscriberSeries[1].membersByChannel).toEqual({ 1: 10000, 2: 1000, 3: 0, 4: 2500 });
    expect(result.subscriberSeries[1].growthPctByChannel).toEqual({ 1: 0, 2: 0, 3: null, 4: 25 });
    // T2: 2026-11-03 (ch1 +20%, ch2 -10%, ch4 forward-filled +25%)
    expect(result.subscriberSeries[2].membersByChannel).toEqual({ 1: 12000, 2: 900, 3: 0, 4: 2500 });
    expect(result.subscriberSeries[2].growthPctByChannel).toEqual({ 1: 20, 2: -10, 3: null, 4: 25 });

    expect(result.postsSeries).toHaveLength(2);
    expect(result.postsSeries[0].postsByChannel).toEqual({ 1: 2, 2: 0, 3: 0, 4: 0 });
    expect(result.postsSeries[1].viewsByChannel).toEqual({ 1: 0, 2: 500, 3: 0, 4: 1200 });
  });

  it('determines leaders per KPI row, handles ties and neutral adSharePercent, and extracts sharedAdvertisers + citationMatrix', () => {
    const ch1: CompareChannelData = {
      channel: makeChannel({
        id: 1,
        title: 'Альфа',
        username: 'alpha_ch',
        currentMembers: 20000,
        er30d: 4.2,
        err30d: 9.1,
        avgViews30d: 8000,
        delta30d: { abs: 1000, percent: 5 },
        adShare30d: { percent: 35, level: 'high' },
        fraudScore: 15,
      }),
      membersHistory: [],
      postsDistribution: [],
      mentions: [
        { sourceChannelId: 1, targetUsername: '@BrandOne', type: 'mention', isAd: true },
        { sourceChannelId: 1, targetUsername: 'BrandOne', type: 'mention', isAd: true },
        { sourceChannelId: 1, targetUsername: 'only_alpha', type: 'mention', isAd: true },
        { sourceChannelId: 1, targetUsername: 'organic_ref', type: 'mention', isAd: false },
        { sourceChannelId: 1, targetUsername: 'beta_ch', type: 'forward', isAd: false },
        { sourceChannelId: 1, targetUsername: 'alpha_ch', type: 'mention', isAd: true }, // self-mention ignored
      ],
    };

    const ch2: CompareChannelData = {
      channel: makeChannel({
        id: 2,
        title: 'Бета',
        username: 'beta_ch',
        currentMembers: 12000,
        er30d: 4.2, // tie on er30d with Альфа
        err30d: 11.5,
        avgViews30d: 9500,
        delta30d: { abs: 3000, percent: 25 },
        adShare30d: { percent: 5, level: 'low' },
        fraudScore: 5, // trustScore 95 wins
      }),
      membersHistory: [],
      postsDistribution: [],
      mentions: [
        { sourceChannelId: 2, targetUsername: 'brandone', type: 'mention', isAd: true },
        { sourceChannelId: 2, targetUsername: 'brandtwo', type: 'mention', isAd: true },
        { sourceChannelId: 2, targetUsername: '@gamma_ch', type: 'mention', isAd: false },
      ],
    };

    const ch3: CompareChannelData = {
      channel: makeChannel({
        id: 3,
        title: 'Гамма',
        username: 'gamma_ch',
        currentMembers: 8000,
        er30d: 2.1,
        err30d: 6.0,
        avgViews30d: 4000,
        delta30d: { abs: 400, percent: 5 },
        adShare30d: { percent: 12, level: 'medium' },
        fraudScore: 20,
      }),
      membersHistory: [],
      postsDistribution: [],
      mentions: [
        { sourceChannelId: 3, targetUsername: 'brandtwo', type: 'mention', isAd: true },
        { sourceChannelId: 3, targetUsername: 'brandone', type: 'mention', isAd: true },
      ],
    };

    const result = buildMultiChannelComparison([ch1, ch2, ch3], '7d');

    const byKey = new Map(result.kpiRows.map((r) => [r.key, r]));
    expect(byKey.get('subscribers')?.leaderChannelId).toBe(1);
    expect(byKey.get('growth30d')?.leaderChannelId).toBe(2);
    expect(byKey.get('avgViews30d')?.leaderChannelId).toBe(2);
    expect(byKey.get('er30d')?.leaderChannelId).toBeNull(); // tie between 1 and 2
    expect(byKey.get('err30d')?.leaderChannelId).toBe(2);
    expect(byKey.get('trustScore')?.values).toEqual({ 1: 85, 2: 95, 3: 80 });
    expect(byKey.get('trustScore')?.leaderChannelId).toBe(2);
    expect(byKey.get('adSharePercent')?.neutral).toBe(true);
    expect(byKey.get('adSharePercent')?.leaderChannelId).toBeNull();

    // sharedAdvertisers: brandone bought in 3 channels (4 placements), brandtwo in 2 channels (2 placements)
    expect(result.sharedAdvertisers).toEqual([
      {
        username: 'brandone',
        channelsCount: 3,
        totalPlacements: 4,
        channelIds: [1, 2, 3],
        placementsByChannel: { 1: 2, 2: 1, 3: 1 },
      },
      {
        username: 'brandtwo',
        channelsCount: 2,
        totalPlacements: 2,
        channelIds: [2, 3],
        placementsByChannel: { 2: 1, 3: 1 },
      },
    ]);

    // citationMatrix: 1 -> 2 (1), 2 -> 3 (1)
    expect(result.citationMatrix[0].countsByTargetId).toEqual({ 1: 0, 2: 1, 3: 0 });
    expect(result.citationMatrix[1].countsByTargetId).toEqual({ 1: 0, 2: 0, 3: 1 });
    expect(result.citationMatrix[2].countsByTargetId).toEqual({ 1: 0, 2: 0, 3: 0 });
  });
});

describe('buildTagBenchmarkProfile', () => {
  it('computes average and median metrics and aggregated history for a folder tag', () => {
    const ch1: CompareChannelData = {
      channel: makeChannel({
        id: 1,
        title: 'Крипто 1',
        tags: ['crypto', 'alpha'],
        currentMembers: 10000,
        delta30d: { abs: 1000, percent: 10 },
        err30d: 8,
        er30d: 2,
        avgViews30d: 3000,
        fraudScore: 10,
      }),
      membersHistory: [{ collectedAt: '2026-11-10T10:00:00.000Z', membersCount: 10000 }],
      postsDistribution: [{ date: '2026-11-10', postsCount: 4, viewsAvg: 3000 }],
    };
    const ch2: CompareChannelData = {
      channel: makeChannel({
        id: 2,
        title: 'Крипто 2',
        tags: ['crypto'],
        currentMembers: 20000,
        delta30d: { abs: 4000, percent: 20 },
        err30d: 10,
        er30d: 4,
        avgViews30d: 6000,
        fraudScore: 20,
      }),
      membersHistory: [{ collectedAt: '2026-11-10T10:00:00.000Z', membersCount: 20000 }],
      postsDistribution: [{ date: '2026-11-10', postsCount: 2, viewsAvg: 6000 }],
    };
    const ch3: CompareChannelData = {
      channel: makeChannel({
        id: 3,
        title: 'Крипто 3',
        tags: ['crypto'],
        currentMembers: 60000, // skewed upper value -> median 20000 vs average 30000
        delta30d: { abs: 18000, percent: 60 },
        err30d: 12,
        er30d: 6,
        avgViews30d: 12000,
        fraudScore: 0,
      }),
      membersHistory: [{ collectedAt: '2026-11-10T10:00:00.000Z', membersCount: 60000 }],
      postsDistribution: [{ date: '2026-11-10', postsCount: 0, viewsAvg: null }],
    };
    const otherTagChannel: CompareChannelData = {
      channel: makeChannel({ id: 4, title: 'Новости', tags: ['news'], currentMembers: 500000 }),
      membersHistory: [],
      postsDistribution: [],
    };
    const inactiveTaggedChannel: CompareChannelData = {
      channel: makeChannel({ id: 5, title: 'Архив', tags: ['crypto'], isActive: false, currentMembers: 999999 }),
      membersHistory: [],
      postsDistribution: [],
    };

    const profile = buildTagBenchmarkProfile(
      'crypto',
      [ch1, ch2, ch3, otherTagChannel, inactiveTaggedChannel],
      '30d'
    );

    expect(profile).not.toBeNull();
    expect(profile!.tag).toBe('crypto');
    expect(profile!.cohortSize).toBe(3);
    expect(profile!.participant.channel.title).toBe('Среднее по папке: crypto');
    expect(profile!.participant.channel.isBenchmark).toBe(true);
    expect(profile!.metrics.subscribers).toEqual({ median: 20000, average: 30000, sampleSize: 3 });
    expect(profile!.metrics.growth30d).toEqual({ median: 20, average: 30, sampleSize: 3 });
    expect(profile!.metrics.err30d).toEqual({ median: 10, average: 10, sampleSize: 3 });
    expect(profile!.metrics.trustScore).toEqual({ median: 90, average: 90, sampleSize: 3 });
    expect(profile!.participant.membersHistory).toEqual([
      { collectedAt: '2026-11-10T10:00:00.000Z', membersCount: 30000, myMembersCount: null },
    ]);
    expect(profile!.participant.postsDistribution).toEqual([
      { date: '2026-11-10', postsCount: 2, viewsAvg: 4500 },
    ]);
  });

  it('returns null for empty folder and handles channels without posts safely', () => {
    const emptyRes = buildTagBenchmarkProfile('missing', [
      {
        channel: makeChannel({ id: 1, title: 'Only News', tags: ['news'] }),
        membersHistory: [],
        postsDistribution: [],
      },
    ]);
    expect(emptyRes).toBeNull();

    const noPostsChannel: CompareChannelData = {
      channel: makeChannel({
        id: 7,
        title: 'Пустой канал',
        tags: ['empty_posts'],
        currentMembers: null,
        avgViews30d: null,
        er30d: null,
        err30d: null,
        avgPostsPerDay: 0,
        delta30d: { abs: null, percent: null },
      }),
      membersHistory: [],
      postsDistribution: [],
    };
    const res = buildTagBenchmarkProfile('empty_posts', [noPostsChannel], '7d');
    expect(res).not.toBeNull();
    expect(res!.cohortSize).toBe(1);
    expect(res!.metrics.subscribers).toEqual({ median: null, average: null, sampleSize: 0 });
    expect(res!.metrics.err30d).toEqual({ median: null, average: null, sampleSize: 0 });
    expect(res!.metrics.postsPerDay).toEqual({ median: 0, average: 0, sampleSize: 1 });
  });
});

it('warns about unknown and unequal comparison coverage without hiding values', () => {
  const a = makeChannel({id: 1, title: 'A', delta7d: {abs: 0, percent: 0, coverageDays: 7}});
  const b = makeChannel({id: 2, title: 'B', delta7d: {abs: null, percent: null, coverageDays: 2}});
  const participants = [a, b].map(channel => ({channel, membersHistory: [], postsDistribution: []}));
  const warnings = getComparisonCoverageWarnings(participants);
  expect(warnings.some(w => w.includes('более чем на сутки'))).toBe(true);
  expect(warnings.some(w => w.includes('неизвестно'))).toBe(true);
});

it('does not convert an incomplete audit into a trust score', () => {
  const channel = makeChannel({id: 1, title: 'A'});
  channel.fraudCoverage = {status: 'partial', evaluatedChecks: 1, checks: []};
  const result = buildMultiChannelComparison([{channel, membersHistory: [], postsDistribution: []}]);
  expect(result.kpiRows.find(r => r.key === 'trustScore')?.values[1]).toBeNull();
});
