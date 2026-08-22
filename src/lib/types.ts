export type ChannelType = 'channel' | 'group';
export type ChannelStatus = 'success' | 'error' | 'stale';

export interface ChannelMetrics {
  id: number;
  username: string | null;
  tgId: string | null;
  title: string;
  type: ChannelType;
  isMine: boolean;
  isActive: boolean;
  lastMessageId: string | null;
  lastError: string | null;
  lastCollectedAt: string | null;
  createdAt: string;

  // Calculated metrics
  currentMembers: number | null;
  delta24h: { abs: number | null; percent: number | null };
  delta7d: { abs: number | null; percent: number | null };
  delta30d: { abs: number | null; percent: number | null };
  posts24h: number;
  posts7d: number;
  posts30d: number;
  avgPostsPerDay: number;
  avgViews7d: number | null;
  err7d: number | null;
  status: ChannelStatus;
  sparkline7d?: number[]; // Added for 7d trend mini-chart

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

export interface TimeSeriesPoint {
  timestamp: string; // ISO String
  dateFormatted: string; // e.g. "12 мая" or "14:00"
  membersCount?: number | null;
  myChannelMembersCount?: number | null;
  postsCount?: number;
}

export interface ChannelDetailStats {
  channel: ChannelMetrics;
  myChannel: ChannelMetrics | null;
  period: '24h' | '7d' | '30d';
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
}
