export type {
  FraudSignalResult,
  GrowthSmoothnessResult,
  UncorrelatedSpikesResult,
  LowCitationGrowthResult,
  LowCitationChannelInput,
  UniformReactionRatioResult,
  HourlyViewProfileOptions,
  NightBotActivityOptions,
  HourlyViewProfileResult,
  NightBotActivityResult,
  FraudPostSnapshotInput,
  FraudEngagementHourInput,
  FraudSignal,
  FraudAuditResult,
  FraudPostInput,
  FraudMetricInput,
  FraudMentionDateInput,
  FraudSignalInput,
  SimulatedFraudFlags,
  FraudAuditChannelInput,
  UniformReactionRatioInput
} from './fraud/types';

export {
  checkViewsToSubsRatio,
  checkGrowthSmoothness,
  checkUncorrelatedSpikes,
  checkLowCitationGrowth,
  checkUniformReactionRatio,
  checkHourlyViewProfile,
  checkNightBotActivity
} from './fraud/heuristics';

export { runFraudAudit } from './fraud/audit';
