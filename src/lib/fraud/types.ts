import type { CitationMention } from '../citationIndex';

/**
 * Result of the views-to-subscribers ratio anomaly check (`checkViewsToSubsRatio`).
 *
 * @property flag - Whether an anomalous views-to-subscribers ratio was detected (`true` if ratio < 0.05 or > 1.5).
 * @property ratio - Calculated ratio of average post views to total channel subscribers (`avgViews / currentMembers`).
 * @property reason - Human-readable diagnostic description of the result in Russian.
 */
export interface FraudSignalResult {
  flag: boolean;
  ratio: number;
  reason: string;
}

/**
 * Result of the subscriber growth smoothness anomaly check (`checkGrowthSmoothness`).
 *
 * @property flag - Whether unnaturally linear growth was detected (`true` if CV < 0.1 across >= 14 daily deltas).
 * @property cv - Coefficient of Variation of daily subscriber deltas (standard deviation divided by mean delta: `stdDev / avgDelta`).
 * @property reason - Human-readable diagnostic description of the result in Russian.
 */
export interface GrowthSmoothnessResult {
  flag: boolean;
  cv: number; // Coefficient of Variation
  reason: string;
}

/**
 * Result of the uncorrelated subscriber spikes check (`checkUncorrelatedSpikes`).
 *
 * @property flag - Whether unexplained subscriber spikes were detected (`true` if >= 1 spike lacks matching post/mention).
 * @property spikesCount - Total number of anomalous, uncorrelated spikes found.
 * @property dates - List of calendar dates (in `YYYY-MM-DD` format) on which anomalous spikes occurred.
 * @property reason - Human-readable diagnostic description of the result in Russian.
 */
export interface UncorrelatedSpikesResult {
  flag: boolean;
  spikesCount: number;
  dates: string[]; // dates in YYYY-MM-DD format
  reason: string;
}

/**
 * Result of the low citation index growth validation check (`checkLowCitationGrowth`).
 *
 * @property flag - Whether the channel exhibits rapid growth without external citations (`true` if growth > minGrowth and CI <= maxCitationIndex).
 * @property citationIndex - Computed logarithmic citation index of the channel.
 * @property growthRate - 30-day subscriber growth percentage (e.g. 15.5 for 15.5%).
 * @property growthPercent - Alias for `growthRate` representing subscriber growth percentage.
 * @property value - Evaluated citation index value used for metric logging.
 * @property reason - Human-readable diagnostic description of the result in Russian.
 */
export interface LowCitationGrowthResult {
  flag: boolean;
  citationIndex: number;
  growthRate: number;
  growthPercent: number;
  value: number;
  reason: string;
}

export interface LowCitationChannelInput {
  id?: number;
  channelId?: number;
  growthRate?: number | string | bigint | null;
  growth30d?: number | string | bigint | null;
  growthRate30d?: number | string | bigint | null;
  growthPercent?: number | string | bigint | null;
  delta30d?: { percent: number | null } | null;
  citationIndex?: number | string | bigint | null;
  mentions?: CitationMention[] | number | string | bigint;
  citations?: CitationMention[];
  inboundMentions?: CitationMention[];
  inbound_mentions?: CitationMention[];
  inbound?: CitationMention[];
}

/**
 * Result of the uniform reaction ratio (ERR) check across recent posts (`checkUniformReactionRatio`).
 *
 * @property flag - Whether suspiciously uniform engagement rates were detected (`true` if CV < 0.1 across >= 10 posts).
 * @property cv - Coefficient of Variation of ERR across recent posts (`stdDev / avgErr`).
 * @property reason - Human-readable diagnostic description of the result in Russian.
 * @property avgErr - Optional average Engagement Rate by Reach across analyzed posts.
 * @property postsCount - Optional count of valid posts included in the analysis window (up to 20).
 * @property signal - Optional structured `FraudSignal` record created when flagged.
 */
export interface UniformReactionRatioResult {
  flag: boolean;
  cv: number; // Coefficient of Variation
  reason: string;
  avgErr?: number;
  postsCount?: number;
  signal?: FraudSignal;
}

/**
 * Persistent or transient fraud signal record representing an identified anomaly.
 *
 * @property id - Optional database primary key identifier for persisted signals.
 * @property channelId - Optional ID of the channel associated with the detected anomaly.
 * @property signalType - Category of the signal (`views_to_subs_ratio`, `growth_smoothness`, `uncorrelated_spikes`, `uniform_err`).
 * @property value - Numerical metric value associated with the trigger (e.g. CV value, ratio, or spike count).
 * @property reason - Human-readable diagnostic explanation of why the signal was triggered.
 * @property detectedAt - Timestamp when the anomaly was detected or recorded.
 */
export interface FraudSignal {
  id?: number;
  channelId?: number;
  signalType: string;
  value: number;
  reason: string;
  detectedAt?: Date | string;
}

/**
 * Consolidated audit result aggregating all four primary anti-fraud checks into a unified score (`runFraudAudit`).
 *
 * @property fraudScore - Aggregated risk score from 0 to 100, where each triggered heuristic contributes 25 points.
 * @property signals - List of triggered `FraudSignal` objects representing identified anomalies.
 * @property details - Detailed breakdown of constituent check results:
 *   - `viewsToSubsRatio`: Result from `checkViewsToSubsRatio`.
 *   - `growthSmoothness`: Result from `checkGrowthSmoothness`.
 *   - `uncorrelatedSpikes`: Result from `checkUncorrelatedSpikes`.
 *   - `uniformReactionRatio`: Result from `checkUniformReactionRatio`.
 */
export interface FraudAuditResult {
  fraudScore: number; // 0 to 100 (each flag contributes 25 points)
  signals: FraudSignal[];
  details: {
    viewsToSubsRatio: FraudSignalResult;
    growthSmoothness: GrowthSmoothnessResult;
    uncorrelatedSpikes: UncorrelatedSpikesResult;
    uniformReactionRatio: UniformReactionRatioResult;
  };
}

export interface FraudPostInput {
  id?: number;
  views?: number | string | bigint | null;
  reactions?: number | string | bigint | null;
  comments?: number | string | bigint | null;
  forwards?: number | string | bigint | null;
  err?: number | string | bigint | null;
  ERR?: number | string | bigint | null;
  errRate?: number | string | bigint | null;
  publishedAt?: Date | string | number | null;
  date?: Date | string | number | null;
  createdAt?: Date | string | number | null;
}

export interface FraudMetricInput {
  date?: Date | string | number | null;
  collectedAt?: Date | string | number | null;
  followers?: number | null;
  membersCount?: number | null;
}

export interface FraudMentionDateInput {
  createdAt?: Date | string | number | null;
  date?: Date | string | number | null;
}

export interface FraudSignalInput {
  id?: number;
  channelId?: number;
  signalType?: string;
  flag?: boolean;
  value?: number;
  reason?: string;
  dates?: string[];
  detectedAt?: Date | string;
}

export interface SimulatedFraudFlags {
  viewsToSubsRatio?: boolean | Partial<FraudSignalResult>;
  views_to_subs_ratio?: boolean | Partial<FraudSignalResult>;
  viewsToSubs?: boolean | Partial<FraudSignalResult>;
  views_to_subs?: boolean | Partial<FraudSignalResult>;
  growthSmoothness?: boolean | Partial<GrowthSmoothnessResult>;
  growth_smoothness?: boolean | Partial<GrowthSmoothnessResult>;
  smoothGrowth?: boolean | Partial<GrowthSmoothnessResult>;
  smooth_growth?: boolean | Partial<GrowthSmoothnessResult>;
  uncorrelatedSpikes?: boolean | Partial<UncorrelatedSpikesResult>;
  uncorrelated_spikes?: boolean | Partial<UncorrelatedSpikesResult>;
  spikes?: boolean | Partial<UncorrelatedSpikesResult>;
  uniformReactionRatio?: boolean | Partial<UniformReactionRatioResult>;
  uniform_reaction_ratio?: boolean | Partial<UniformReactionRatioResult>;
  uniformErr?: boolean | Partial<UniformReactionRatioResult>;
  uniform_err?: boolean | Partial<UniformReactionRatioResult>;
}

export interface FraudAuditChannelInput extends SimulatedFraudFlags {
  id?: number;
  channelId?: number;
  currentMembers?: number | null;
  membersCount?: number | null;
  subscribers?: number | null;
  followers?: number | null;
  posts?: ReadonlyArray<FraudPostInput | number | string | null | undefined> | { data?: ReadonlyArray<FraudPostInput | number | string | null | undefined> };
  recentPosts?: ReadonlyArray<FraudPostInput | number | string | null | undefined>;
  items?: ReadonlyArray<FraudPostInput | number | string | null | undefined>;
  metrics?: ReadonlyArray<FraudMetricInput | null | undefined>;
  channelMetricDailies?: ReadonlyArray<FraudMetricInput | null | undefined>;
  membersHistory?: ReadonlyArray<FraudMetricInput | null | undefined>;
  postsDates?: Date[];
  mentionsDates?: Date[];
  mentions?: ReadonlyArray<FraudMentionDateInput | CitationMention | null | undefined>;
  fraudSignals?: ReadonlyArray<FraudSignalInput | null | undefined>;
  simulatedFlags?: SimulatedFraudFlags;
  triggers?: ReadonlyArray<string> | Set<string> | string;
  viewsToSubsRatioResult?: FraudSignalResult;
  growthSmoothnessResult?: GrowthSmoothnessResult;
  uncorrelatedSpikesResult?: UncorrelatedSpikesResult;
  uniformReactionRatioResult?: UniformReactionRatioResult;
}

export type UniformReactionRatioInput =
  | FraudAuditChannelInput
  | ReadonlyArray<FraudPostInput | number | string | null | undefined>
  | Record<string, unknown>
  | null
  | undefined;
