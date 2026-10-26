import type { FraudSignal } from './fraudDetector';

export type ChannelType = 'channel' | 'group';
export type ChannelStatus = 'success' | 'error' | 'stale';
export type ChannelSilenceStatus = 'активен' | 'замедлился' | 'молчит';

export interface ChannelMetrics {
  id: number;
  username: string | null;
  tgId: string | null;
  title: string;
  type: ChannelType;
  isMine: boolean;
  isFavorite: boolean;
  isActive: boolean;
  consecutiveErrors: number;
  lastMessageId: string | null;
  lastError: string | null;
  lastCollectedAt: string | null;
  createdAt: string;

  // Calculated metrics
  currentMembers: number | null;
  delta24h: { abs: number | null; percent: number | null; coverageDays?: number | null };
  delta7d: { abs: number | null; percent: number | null; coverageDays?: number | null };
  delta30d: { abs: number | null; percent: number | null; coverageDays?: number | null };
  posts24h: number;
  posts7d: number;
  posts30d: number;
  avgPostsPerDay: number;
  avgViews24h: number | null;
  vr24h: number | null;
  avgViews7d: number | null;
  vr7d: number | null;
  avgViews30d: number | null;
  vr30d: number | null;
  lastPostViews: number | null;
  trueErr7d: number | null;
  er24h: number | null;
  er7d: number | null;
  err24h: number | null; // null if all engagements (reactions+comments+forwards) are 0 (likely hidden)
  err7d: number | null;
  cr7d: number | null;
  adShare7d?: { percent: number; level: 'none' | 'low' | 'medium' | 'high' };
  adShare30d?: { percent: number; level: 'none' | 'low' | 'medium' | 'high' };
  status: ChannelStatus;
  sparkline7d?: number[]; // Added for 7d trend mini-chart
  contentScore?: number;
  contentGrade?: string;
  niche?: string;
  ep?: number;
  epBreakdown?: any;
  citationIndex?: number | null;
  fraudScore?: number | null;
  fraudSignals?: FraudSignal[];
  activityStatus?: ChannelSilenceStatus;
  lastPostAt?: string | null;


  // Comparison with "My Channel"
  comparison?: {
    audienceSharePercent: number | null; // e.g. 62%
    growthRateDiff7d: number | null;     // e.g. +2.4%
    activityDiff7d: number | null;       // e.g. +7 posts
  };
}

export interface OverviewStats {
  myChannel: ChannelMetrics | null;
  channels: ChannelMetrics[];
  totalChannels: number;
  activeChannels: number;
  lastGlobalUpdate: string | null;
}

export type NicheBenchmarkMetricKey = 'er7d' | 'err7d' | 'vr7d' | 'posts7d' | 'adShare30d' | 'delta7dPct';

export interface NicheBenchmarkMetric {
  value: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  rank: number | null;
  sampleSize: number;
  lowerIsBetter: boolean;
}

export type NicheBenchmarkResult =
  | { status: 'insufficient_cohort'; niche: string; cohortSize: number }
  | { status: 'ready'; niche: string; cohortSize: number; metrics: Record<NicheBenchmarkMetricKey, NicheBenchmarkMetric> };

export interface DigestChannel {
  title: string;
  currentMembers: number | null;
  delta24h: number | null;
  er7d: number | null;
  err7d: number | null;
  posts24h: number;
}

export interface DailyDigestSummary {
  activeChannels: number;
  totalAudience: number;
  channelsWithoutAudience: number;
  myChannel: DigestChannel | null;
  topGainers: DigestChannel[];
  topLosers: DigestChannel[];
  recentFraudSignals: number;
  problemChannels: number;
}

export type OpsSyncStatus = 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';

export interface OpsSyncJob {
  id: number;
  startedAt: string;
  endedAt: string | null;
  status: OpsSyncStatus;
  channelsTotal: number;
  channelsSucceeded: number;
  channelsFailed: number;
  postsAdded: number;
  durationMs: number | null;
  errorSummary: string | null;
}

export interface OpsProblemChannel {
  id: number;
  title: string;
  username: string | null;
  isActive: boolean;
  consecutiveErrors: number;
  lastError: string | null;
  lastCollectedAt: string | null;
}

export interface OpsStatusResponse {
  latestJob: OpsSyncJob | null;
  jobs: OpsSyncJob[];
  summary: {
    lastSuccessfulAt: string | null;
    successRate7dPercent: number | null;
    activeChannels: number;
    disabledWithErrors: number;
  };
  problemChannels: OpsProblemChannel[];
}

export interface SearchPost {
  id: number;
  messageId: string;
  publishedAt: string;
  text: string | null;
  isAd: boolean;
  views: number | null;
  reactions: number | null;
  comments: number | null;
  forwards: number | null;
  er: number | null;
  err: number | null;
  hasImage: boolean;
  mentions: string[];
  channel: { id: number; title: string; username: string | null; niche: string };
}

export interface GlobalPostSearchResponse {
  posts: SearchPost[];
  total: number;
  niches: string[];
  channels: Array<{ id: number; title: string; username: string | null; niche: string }>;
}

export interface AdAttributionPlacement {
  postId: number;
  messageId: string;
  publishedAt: string;
  sourceChannel: { id: number; title: string; username: string | null };
  targetChannel: { id: number; title: string; username: string | null };
  isAd: boolean;
  views: number | null;
  deltaSubscribers24h: number | null;
  deltaSubscribers48h: number | null;
  estimatedPricePerPost: number | null;
  estimatedCpf: number | null;
  conversionPercent: number | null;
  overlappingCampaigns: boolean;
}

export interface ChannelAdAttribution {
  periodDays: number;
  inbound: AdAttributionPlacement[];
  outbound: AdAttributionPlacement[];
}

export interface CitationNetworkNode {
  id: string;
  channelId: number | null;
  username: string | null;
  title: string;
  subscribers: number | null;
  niche: string | null;
  isTracked: boolean;
  inboundCount: number;
  outboundCount: number;
  isMutualWithFocal: boolean;
}

export interface CitationNetworkEdge {
  source: string;
  target: string;
  count: number;
  forwardsCount: number;
  mentionsCount: number;
  isBidirectional: boolean;
}

export interface DiscoveredHub {
  username: string;
  citingChannels: number;
  mentionsCount: number;
}

export interface CitationNetworkData {
  focalChannelId: number | null;
  days: number;
  nodes: CitationNetworkNode[];
  edges: CitationNetworkEdge[];
  discoveredHubs: DiscoveredHub[];
}

export interface TimeSeriesPoint {
  timestamp: string; // ISO String
  dateFormatted: string; // e.g. "12 мая" or "14:00"
  membersCount?: number | null;
  myChannelMembersCount?: number | null;
  postsCount?: number;
}

export type ContentType = 'text' | 'photo' | 'video' | 'poll' | 'link';

export interface ContentTypePerformanceItem {
  type: ContentType;
  label: string;
  er: number | null;
  avgEr: number | null;
  avgErr: number | null;
  postsCount: number;
  sharePercent: number;
  avgViews: number | null;
  medianViews: number | null;
  avgForwards: number;
  avgComments: number;
}

export interface ContentFormatLeaders {
  byErr: ContentType | null;
  byViews: ContentType | null;
}

export interface ChannelDetailStats {
  channel: ChannelMetrics;
  nicheBenchmark?: NicheBenchmarkResult;
  myChannel: ChannelMetrics | null;
  period: '24h' | '7d' | '30d';
  scoreBreakdown?: any;
  membersHistory: {
    collectedAt: string;
    membersCount: number;
    myMembersCount?: number | null;
  }[];
  postsDistribution: {
    date: string;
    postsCount: number;
    viewsAvg?: number | null;
  }[];
  vrHistory?: {
    date: string;
    vr: number;
    avgViews: number;
    membersCount: number;
  }[];
  heatmapData: {
    day: number; // 0 (Sunday) to 6 (Saturday)
    hour: number; // 0 to 23
    count: number;
  }[];
  myHeatmapData?: {
    day: number;
    hour: number;
    count: number;
  }[];
  recentPosts?: {
    id: number;
    messageId: string;
    publishedAt: string;
    views: number | null;
    reactions: number | null;
    comments: number | null;
    forwards: number | null;
    text: string | null;
  }[];
  contentTypePerformance?: ContentTypePerformanceItem[];
  contentFormatLeaders?: ContentFormatLeaders;
  silencePeriods?: {
    startDate: string;
    endDate: string;
    durationDays: number;
  }[];
}

export interface BestTimeRecommendation {
  timeZone?: string;
  bestDay: number;
  bestHour: number;
  score: number;
  avgViews: number;
  avgVr: number;
  postCount: number;
  heatmap: {
    day: number;
    hour: number;
    postCount: number;
    avgViews: number;
    avgVr: number;
    score: number;
  }[];
}

export interface LanguageBreakdownItem {
  code: string;   // "ru", "en", "de"
  name: string;   // "Russian", "English", "German"
  percent: number; // 45.2
}
