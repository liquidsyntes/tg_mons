import type { ChannelMetrics } from '@/lib/types';

export const channel: ChannelMetrics = {
  id: 1, title: 'Example channel', username: null, tgId: null, type: 'channel',
  isMine: false, isFavorite: true, isActive: true, consecutiveErrors: 0,
  lastMessageId: null, lastError: null, lastCollectedAt: null, createdAt: '2026-09-01',
  currentMembers: 1000, delta24h: { abs: 0, percent: 0 }, delta7d: { abs: 10, percent: 1 },
  delta30d: { abs: 20, percent: 2 }, posts24h: 1, posts7d: 7, posts30d: 30, avgPostsPerDay: 1,
  avgViews24h: 0, avgViews7d: 0, avgViews30d: 200, lastPostViews: 100,
  vr24h: 40, vr7d: 50, vr30d: 20, er24h: 25, er7d: 26,
  err24h: 1.25, err7d: 2.5, trueErr7d: 2.5, cr7d: 3.75,
  status: 'success', fraudScore: 0, fraudSignals: [],
};
