import type {
  ChannelDetailStats,
  ChannelMetrics,
  CitationMatrixRow,
  CompareKpiMetricKey,
  CompareKpiRow,
  CompareMentionRecord,
  CompareParticipantChannel,
  CompareParticipantStats,
  MultiChannelComparisonResult,
  MultiPostsPoint,
  MultiSubscriberPoint,
  SharedAdvertiserItem,
  TagBenchmarkProfileResult,
  TagBenchmarkStat,
} from './types';

export type {
  CitationMatrixRow,
  CompareKpiMetricKey,
  CompareKpiRow,
  CompareMentionRecord,
  CompareParticipantChannel,
  CompareParticipantStats,
  MultiChannelComparisonResult,
  MultiPostsPoint,
  MultiSubscriberPoint,
  SharedAdvertiserItem,
  TagBenchmarkProfileResult,
  TagBenchmarkStat,
};

export type ComparePeriod = '24h' | '7d' | '30d';

export type MembersHistoryPoint = ChannelDetailStats['membersHistory'][number];
export type PostsDistributionPoint = ChannelDetailStats['postsDistribution'][number];
export type CompareChannelData = CompareParticipantStats;

export interface MergedSubscriberPoint {
  time: string;
  fullTime: string;
  membersA: number | undefined;
  membersB: number | undefined;
}

export interface MergedPostsPoint {
  date: string;
  postsA: number;
  postsB: number;
  viewsA: number;
  viewsB: number;
}

interface KpiMetricDefinition {
  key: CompareKpiMetricKey;
  label: string;
  unit: CompareKpiRow['unit'];
  neutral?: boolean;
  roundDecimals: number;
  extract: (channel: ChannelMetrics) => number | null;
}

const KPI_DEFINITIONS: ReadonlyArray<KpiMetricDefinition> = [
  {
    key: 'subscribers',
    label: 'Подписчики',
    unit: 'count',
    roundDecimals: 0,
    extract: (ch) => (typeof ch.currentMembers === 'number' && Number.isFinite(ch.currentMembers) ? ch.currentMembers : null),
  },
  {
    key: 'growth7d',
    label: 'Рост за 7д (%)',
    unit: 'percent',
    roundDecimals: 2,
    extract: (ch) => (typeof ch.delta7d?.percent === 'number' && Number.isFinite(ch.delta7d.percent) ? ch.delta7d.percent : null),
  },
  {
    key: 'growth30d',
    label: 'Рост за 30д (%)',
    unit: 'percent',
    roundDecimals: 2,
    extract: (ch) => (typeof ch.delta30d?.percent === 'number' && Number.isFinite(ch.delta30d.percent) ? ch.delta30d.percent : null),
  },
  {
    key: 'avgViews30d',
    label: 'Ср. просмотры (30д)',
    unit: 'count',
    roundDecimals: 0,
    extract: (ch) => (typeof ch.avgViews30d === 'number' && Number.isFinite(ch.avgViews30d) ? ch.avgViews30d : null),
  },
  {
    key: 'er30d',
    label: 'ER (30д)',
    unit: 'percent',
    roundDecimals: 2,
    extract: (ch) => {
      const value = ch.er30d !== undefined ? ch.er30d : ch.er7d;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    },
  },
  {
    key: 'err30d',
    label: 'ERR (30д)',
    unit: 'percent',
    roundDecimals: 2,
    extract: (ch) => {
      const value = ch.err30d !== undefined ? ch.err30d : ch.err7d;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    },
  },
  {
    key: 'postsPerDay',
    label: 'Постов в день',
    unit: 'rate',
    roundDecimals: 2,
    extract: (ch) => (typeof ch.avgPostsPerDay === 'number' && Number.isFinite(ch.avgPostsPerDay) ? ch.avgPostsPerDay : null),
  },
  {
    key: 'adSharePercent',
    label: 'Рекламная нагрузка',
    unit: 'percent',
    neutral: true,
    roundDecimals: 1,
    extract: (ch) => {
      const pct = ch.adShare30d?.percent ?? ch.adShare7d?.percent ?? null;
      return typeof pct === 'number' && Number.isFinite(pct) ? pct : null;
    },
  },
  {
    key: 'trustScore',
    label: 'Индекс доверия',
    unit: 'score',
    roundDecimals: 0,
    extract: (ch) => {
      if (ch.fraudCoverage?.status !== 'sufficient') return null;
      if (typeof ch.fraudScore === 'number' && Number.isFinite(ch.fraudScore)) {
        return Math.max(0, Math.min(100, Math.round(100 - ch.fraudScore)));
      }
      if (typeof ch.contentScore === 'number' && Number.isFinite(ch.contentScore)) {
        return Math.max(0, Math.min(100, Math.round(ch.contentScore)));
      }
      return null;
    },
  },
];

function roundTo(value: number, decimals: number): number {
  if (decimals <= 0) return Math.round(value);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeUsername(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/^@/, '').toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

function formatHistoryTimestamp(date: Date, period: ComparePeriod): string {
  return period === '24h'
    ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatPostBucketDate(rawDate: string, period: ComparePeriod): string {
  if (period === '24h') return rawDate;
  const parts = rawDate.split('-');
  if (parts.length !== 3) return rawDate;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return rawDate;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime())
    ? rawDate
    : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function mergeSubscriberHistory(
  aHistory: ReadonlyArray<MembersHistoryPoint> | undefined,
  bHistory: ReadonlyArray<MembersHistoryPoint> | undefined,
  period: ComparePeriod
): MergedSubscriberPoint[] {
  const safeA = aHistory || [];
  const safeB = bHistory || [];
  if (safeA.length === 0 && safeB.length === 0) return [];

  const allTimes = new Set<string>();
  const aMap = new Map<string, number>();
  const bMap = new Map<string, number>();

  for (const point of safeA) {
    const key = new Date(point.collectedAt).toISOString();
    allTimes.add(key);
    aMap.set(key, point.membersCount);
  }
  for (const point of safeB) {
    const key = new Date(point.collectedAt).toISOString();
    allTimes.add(key);
    bMap.set(key, point.membersCount);
  }

  const sorted = Array.from(allTimes).sort();
  let lastA: number | undefined;
  let lastB: number | undefined;

  return sorted.map((t) => {
    const d = new Date(t);
    const dateFormatted = formatHistoryTimestamp(d, period);

    if (aMap.has(t)) lastA = aMap.get(t);
    if (bMap.has(t)) lastB = bMap.get(t);

    return {
      time: dateFormatted,
      fullTime: d.toLocaleString('ru-RU'),
      membersA: lastA,
      membersB: lastB,
    };
  });
}

export function mergePostsDistribution(
  aDistribution: ReadonlyArray<PostsDistributionPoint> | undefined,
  bDistribution: ReadonlyArray<PostsDistributionPoint> | undefined,
  period: ComparePeriod
): MergedPostsPoint[] {
  const safeA = aDistribution || [];
  const safeB = bDistribution || [];
  if (safeA.length === 0 && safeB.length === 0) return [];

  const map = new Map<string, MergedPostsPoint>();

  for (const item of safeA) {
    const entry = map.get(item.date) || {
      date: item.date,
      postsA: 0,
      postsB: 0,
      viewsA: 0,
      viewsB: 0,
    };
    entry.postsA = item.postsCount;
    entry.viewsA = item.viewsAvg ?? 0;
    map.set(item.date, entry);
  }

  for (const item of safeB) {
    const entry = map.get(item.date) || {
      date: item.date,
      postsA: 0,
      postsB: 0,
      viewsA: 0,
      viewsB: 0,
    };
    entry.postsB = item.postsCount;
    entry.viewsB = item.viewsAvg ?? 0;
    map.set(item.date, entry);
  }

  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => ({ ...item, date: formatPostBucketDate(item.date, period) }));
}

function buildMultiSubscriberSeries(
  participants: ReadonlyArray<CompareChannelData>,
  period: ComparePeriod
): MultiSubscriberPoint[] {
  const allTimes = new Set<string>();
  const channelMaps = new Map<number, Map<string, number>>();
  const firstPositiveBase = new Map<number, number | null>();

  for (const participant of participants) {
    const channelId = participant.channel.id;
    const map = new Map<string, number>();
    const sortedPoints = [...(participant.membersHistory ?? [])]
      .map((point) => ({ date: new Date(point.collectedAt), membersCount: point.membersCount }))
      .filter((point) => !Number.isNaN(point.date.getTime()) && Number.isFinite(point.membersCount))
      .sort((left, right) => left.date.getTime() - right.date.getTime());

    let base: number | null = null;
    for (const point of sortedPoints) {
      const key = point.date.toISOString();
      allTimes.add(key);
      map.set(key, point.membersCount);
      if (base === null && point.membersCount > 0) {
        base = point.membersCount;
      }
    }

    channelMaps.set(channelId, map);
    firstPositiveBase.set(channelId, base);
  }

  if (allTimes.size === 0) return [];

  const sortedTimestamps = Array.from(allTimes).sort();
  const lastKnown = new Map<number, number>();

  return sortedTimestamps.map((timestamp) => {
    const date = new Date(timestamp);
    const membersByChannel: Record<number, number | null> = {};
    const growthPctByChannel: Record<number, number | null> = {};

    for (const participant of participants) {
      const channelId = participant.channel.id;
      const pointMap = channelMaps.get(channelId);
      if (pointMap?.has(timestamp)) {
        lastKnown.set(channelId, pointMap.get(timestamp)!);
      }

      const current = lastKnown.has(channelId) ? lastKnown.get(channelId)! : null;
      membersByChannel[channelId] = current;

      const base = firstPositiveBase.get(channelId) ?? null;
      if (current !== null && base !== null && base > 0) {
        growthPctByChannel[channelId] = Number((((current - base) / base) * 100).toFixed(2));
      } else {
        growthPctByChannel[channelId] = null;
      }
    }

    return {
      timestamp,
      time: formatHistoryTimestamp(date, period),
      fullTime: date.toLocaleString('ru-RU'),
      membersByChannel,
      growthPctByChannel,
    };
  });
}

function buildMultiPostsSeries(
  participants: ReadonlyArray<CompareChannelData>,
  period: ComparePeriod
): MultiPostsPoint[] {
  const buckets = new Map<string, { postsByChannel: Record<number, number>; viewsByChannel: Record<number, number> }>();

  const ensureBucket = (rawDate: string) => {
    let entry = buckets.get(rawDate);
    if (!entry) {
      entry = { postsByChannel: {}, viewsByChannel: {} };
      for (const participant of participants) {
        entry.postsByChannel[participant.channel.id] = 0;
        entry.viewsByChannel[participant.channel.id] = 0;
      }
      buckets.set(rawDate, entry);
    }
    return entry;
  };

  for (const participant of participants) {
    const channelId = participant.channel.id;
    for (const item of participant.postsDistribution ?? []) {
      const entry = ensureBucket(item.date);
      entry.postsByChannel[channelId] = item.postsCount;
      entry.viewsByChannel[channelId] = item.viewsAvg ?? 0;
    }
  }

  return Array.from(buckets.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([rawDate, entry]) => ({
      rawDate,
      date: formatPostBucketDate(rawDate, period),
      postsByChannel: entry.postsByChannel,
      viewsByChannel: entry.viewsByChannel,
    }));
}

function buildKpiRows(participants: ReadonlyArray<CompareChannelData>): CompareKpiRow[] {
  return KPI_DEFINITIONS.map((def) => {
    const values: Record<number, number | null> = {};
    const numericEntries: Array<{ channelId: number; value: number }> = [];

    for (const participant of participants) {
      const val = def.extract(participant.channel);
      values[participant.channel.id] = val;
      if (val !== null && Number.isFinite(val)) {
        numericEntries.push({ channelId: participant.channel.id, value: val });
      }
    }

    let leaderChannelId: number | null = null;
    if (!def.neutral && numericEntries.length > 0) {
      let maxVal = -Infinity;
      for (const entry of numericEntries) {
        if (entry.value > maxVal) maxVal = entry.value;
      }
      const leaders = numericEntries.filter((entry) => entry.value === maxVal);
      if (leaders.length === 1) {
        leaderChannelId = leaders[0].channelId;
      }
    }

    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      ...(def.neutral ? { neutral: true } : {}),
      values,
      leaderChannelId,
    };
  });
}

function buildCitationMatrix(participants: ReadonlyArray<CompareChannelData>): CitationMatrixRow[] {
  const realParticipants = participants.filter((p) => !p.isBenchmark && !p.channel.isBenchmark);
  const idSet = new Set(realParticipants.map((p) => p.channel.id));
  const idByUsername = new Map<string, number>();
  const idByTgId = new Map<string, number>();

  for (const p of realParticipants) {
    const uname = normalizeUsername(p.channel.username);
    if (uname) idByUsername.set(uname, p.channel.id);
    if (p.channel.tgId) idByTgId.set(p.channel.tgId.trim(), p.channel.id);
  }

  return realParticipants.map((source) => {
    const countsByTargetId: Record<number, number> = {};
    for (const target of realParticipants) {
      countsByTargetId[target.channel.id] = 0;
    }

    let totalOutbound = 0;
    for (const mention of source.mentions ?? []) {
      if (mention.sourceChannelId !== source.channel.id) continue;

      let targetId: number | null = null;
      if (typeof mention.targetChannelId === 'number' && idSet.has(mention.targetChannelId)) {
        targetId = mention.targetChannelId;
      } else if (mention.targetTgId && idByTgId.has(mention.targetTgId.trim())) {
        targetId = idByTgId.get(mention.targetTgId.trim()) ?? null;
      } else {
        const uname = normalizeUsername(mention.targetUsername);
        if (uname && idByUsername.has(uname)) {
          targetId = idByUsername.get(uname) ?? null;
        }
      }

      if (targetId !== null && targetId !== source.channel.id) {
        countsByTargetId[targetId] = (countsByTargetId[targetId] ?? 0) + 1;
        totalOutbound += 1;
      }
    }

    return {
      sourceChannelId: source.channel.id,
      sourceTitle: source.channel.title,
      countsByTargetId,
      totalOutbound,
    };
  });
}

function buildSharedAdvertisers(participants: ReadonlyArray<CompareChannelData>): SharedAdvertiserItem[] {
  const realParticipants = participants.filter((p) => !p.isBenchmark && !p.channel.isBenchmark);
  const byAdvertiser = new Map<
    string,
    { totalPlacements: number; placementsByChannel: Record<number, number>; channelIds: Set<number> }
  >();

  for (const participant of realParticipants) {
    const channelId = participant.channel.id;
    const ownUsername = normalizeUsername(participant.channel.username);

    for (const mention of participant.mentions ?? []) {
      if (mention.sourceChannelId !== channelId || !mention.isAd) continue;
      const targetUsername = normalizeUsername(mention.targetUsername);
      if (!targetUsername || targetUsername === ownUsername) continue;

      let entry = byAdvertiser.get(targetUsername);
      if (!entry) {
        entry = {
          totalPlacements: 0,
          placementsByChannel: {},
          channelIds: new Set<number>(),
        };
        byAdvertiser.set(targetUsername, entry);
      }

      entry.totalPlacements += 1;
      entry.placementsByChannel[channelId] = (entry.placementsByChannel[channelId] ?? 0) + 1;
      entry.channelIds.add(channelId);
    }
  }

  return Array.from(byAdvertiser.entries())
    .filter(([, entry]) => entry.channelIds.size >= 2)
    .map(([username, entry]) => ({
      username,
      channelsCount: entry.channelIds.size,
      totalPlacements: entry.totalPlacements,
      channelIds: Array.from(entry.channelIds).sort((a, b) => a - b),
      placementsByChannel: entry.placementsByChannel,
    }))
    .sort((left, right) => {
      if (right.channelsCount !== left.channelsCount) {
        return right.channelsCount - left.channelsCount;
      }
      if (right.totalPlacements !== left.totalPlacements) {
        return right.totalPlacements - left.totalPlacements;
      }
      return left.username.localeCompare(right.username);
    });
}

/** Builds aligned time-series, KPI leader matrix, cross-citations and shared advertisers for 2..4 channels. */
export function buildMultiChannelComparison(
  channelsData: ReadonlyArray<CompareChannelData>,
  period: ComparePeriod = '7d'
): MultiChannelComparisonResult {
  if (channelsData.length === 0) {
    return {
      subscriberSeries: [],
      postsSeries: [],
      kpiRows: [],
      sharedAdvertisers: [],
      citationMatrix: [],
    };
  }

  return {
    coverageWarnings: getComparisonCoverageWarnings(channelsData),
    subscriberSeries: buildMultiSubscriberSeries(channelsData, period),
    postsSeries: buildMultiPostsSeries(channelsData, period),
    kpiRows: buildKpiRows(channelsData),
    sharedAdvertisers: buildSharedAdvertisers(channelsData),
    citationMatrix: buildCitationMatrix(channelsData),
  };
}

function computeStat(values: ReadonlyArray<number>, decimals: number): TagBenchmarkStat {
  if (values.length === 0) {
    return { median: null, average: null, sampleSize: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const average = roundTo(sum / sorted.length, decimals);
  const mid = Math.floor(sorted.length / 2);
  const rawMedian =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const median = roundTo(rawMedian, decimals);

  return { median, average, sampleSize: sorted.length };
}

function resolveAdShareLevel(percent: number): 'none' | 'low' | 'medium' | 'high' {
  if (percent <= 0) return 'none';
  if (percent < 10) return 'low';
  if (percent < 25) return 'medium';
  return 'high';
}

/** Aggregates active channels in a user folder/tag into a virtual benchmark profile (average + median). */
export function buildTagBenchmarkProfile(
  tag: string,
  channelsData: ReadonlyArray<CompareChannelData>,
  period: ComparePeriod = '7d'
): TagBenchmarkProfileResult | null {
  const normalizedTag = tag.trim();
  if (!normalizedTag || channelsData.length === 0) return null;

  const activeChannels = channelsData.filter(
    (item) => !item.isBenchmark && !item.channel.isBenchmark && item.channel.isActive !== false
  );
  if (activeChannels.length === 0) return null;

  const hasExplicitTagArrays = activeChannels.some((item) => Array.isArray(item.channel.tags));
  const cohort = hasExplicitTagArrays
    ? activeChannels.filter((item) => item.channel.tags?.includes(normalizedTag))
    : activeChannels;

  if (cohort.length === 0) return null;

  const metrics = {} as Record<CompareKpiMetricKey, TagBenchmarkStat>;
  for (const def of KPI_DEFINITIONS) {
    const rawValues: number[] = [];
    for (const item of cohort) {
      const value = def.extract(item.channel);
      if (value !== null && Number.isFinite(value)) {
        rawValues.push(value);
      }
    }
    metrics[def.key] = computeStat(rawValues, def.roundDecimals);
  }

  const alignedSubs = buildMultiSubscriberSeries(cohort, period);
  const membersHistory: MembersHistoryPoint[] = [];
  for (const point of alignedSubs) {
    const values = cohort
      .map((item) => point.membersByChannel[item.channel.id])
      .filter((val): val is number => typeof val === 'number' && Number.isFinite(val));
    if (values.length > 0) {
      const avg = Math.round(values.reduce((acc, v) => acc + v, 0) / values.length);
      membersHistory.push({
        collectedAt: point.timestamp,
        membersCount: avg,
        myMembersCount: null,
      });
    }
  }

  const alignedPosts = buildMultiPostsSeries(cohort, period);
  const postsDistribution: PostsDistributionPoint[] = alignedPosts.map((point) => {
    let postsSum = 0;
    let viewsSum = 0;
    let viewsCount = 0;

    for (const item of cohort) {
      const pCount = point.postsByChannel[item.channel.id] ?? 0;
      const vAvg = point.viewsByChannel[item.channel.id] ?? 0;
      postsSum += pCount;
      if (vAvg > 0) {
        viewsSum += vAvg;
        viewsCount += 1;
      }
    }

    return {
      date: point.rawDate,
      postsCount: roundTo(postsSum / cohort.length, 1),
      viewsAvg: viewsCount > 0 ? Math.round(viewsSum / viewsCount) : null,
    };
  });

  const avgAdShare = metrics.adSharePercent.average ?? 0;
  const avgTrust = metrics.trustScore.average;
  const avgPosts = metrics.postsPerDay.average ?? 0;

  const virtualChannel: CompareParticipantChannel = {
    id: -1,
    username: null,
    tgId: null,
    title: `Среднее по папке: ${normalizedTag}`,
    type: 'channel',
    niche: normalizedTag,
    tags: [normalizedTag],
    isMine: false,
    isFavorite: false,
    isActive: true,
    consecutiveErrors: 0,
    lastMessageId: null,
    lastError: null,
    lastCollectedAt: null,
    createdAt: new Date(0).toISOString(),
    currentMembers: metrics.subscribers.average,
    delta24h: { abs: null, percent: null },
    delta7d: { abs: null, percent: metrics.growth7d.average },
    delta30d: { abs: null, percent: metrics.growth30d.average },
    posts24h: 0,
    posts7d: Math.round(avgPosts * 7),
    posts30d: Math.round(avgPosts * 30),
    avgPostsPerDay: avgPosts,
    avgViews24h: null,
    vr24h: null,
    avgViews7d: metrics.avgViews30d.average,
    vr7d: null,
    avgViews30d: metrics.avgViews30d.average,
    vr30d: null,
    lastPostViews: null,
    trueErr7d: metrics.err30d.average,
    er24h: null,
    er7d: metrics.er30d.average,
    er30d: metrics.er30d.average,
    err24h: null,
    err7d: metrics.err30d.average,
    err30d: metrics.err30d.average,
    cr7d: null,
    adShare7d: { percent: avgAdShare, level: resolveAdShareLevel(avgAdShare) },
    adShare30d: { percent: avgAdShare, level: resolveAdShareLevel(avgAdShare) },
    status: 'success',
    sparkline7d: [],
    contentScore: avgTrust !== null ? Math.round(avgTrust) : undefined,
    fraudScore: avgTrust !== null ? Math.max(0, Math.round(100 - avgTrust)) : null,
    isBenchmark: true,
    benchmarkTag: normalizedTag,
    cohortSize: cohort.length,
  };

  return {
    tag: normalizedTag,
    cohortSize: cohort.length,
    participant: {
      channel: virtualChannel,
      membersHistory,
      postsDistribution,
      mentions: [],
      isBenchmark: true,
      benchmarkTag: normalizedTag,
      cohortSize: cohort.length,
    },
    metrics,
  };
}

/** Compare like-for-like growth windows; unknown coverage is never assumed complete. */
export function getComparisonCoverageWarnings(participants: ReadonlyArray<CompareChannelData>): string[] {
  const warnings: string[] = [];
  for (const [key, days] of [['delta7d', 7], ['delta30d', 30]] as const) {
    const coverages = participants.filter(p => !p.isBenchmark).map(p => p.channel[key]?.coverageDays ?? null);
    if (coverages.some(c => c === null)) warnings.push(`Рост за ${days} дней: покрытие части каналов неизвестно`);
    const known = coverages.filter((c): c is number => c !== null);
    if (known.length > 1 && Math.max(...known) - Math.min(...known) > 1) warnings.push(`Рост за ${days} дней: покрытие отличается более чем на сутки; значения могут быть несопоставимы`);
  }
  if (participants.some(p => p.isBenchmark || p.channel.isBenchmark)) warnings.push('Бенчмарк папки объединяет каналы с разным покрытием; полнота общей истории не подтверждена');
  for (const p of participants.filter(p => !p.isBenchmark && !p.channel.isBenchmark)) {
    if (p.channel.status !== 'success') warnings.push(`${p.channel.title}: проверьте свежесть сбора (${p.channel.lastCollectedAt ?? 'время неизвестно'})`);
  }
  return warnings;
}
