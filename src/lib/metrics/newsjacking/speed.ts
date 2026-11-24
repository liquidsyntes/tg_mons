import type {
  ChannelReactionSpeedSummary,
  NewsReactionItem,
  NewsTopicCluster,
} from '@/lib/types';
import { roundTo } from './features';

function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return roundTo(sorted[mid], 1);
  return roundTo((sorted[mid - 1] + sorted[mid]) / 2, 1);
}

export function buildChannelReactionSpeedSummary(
  clusters: readonly NewsTopicCluster[],
): ChannelReactionSpeedSummary[] {
  if (clusters.length === 0) return [];

  interface ChannelAccumulator {
    channelId: number;
    channelTitle: string;
    channelUsername: string | null;
    isMine: boolean;
    delaysByTopic: number[];
    firstCount: number;
    peakCount: number;
  }

  const byChannel = new Map<number, ChannelAccumulator>();

  for (const cluster of clusters) {
    const earliestDelayForChannel = new Map<number, NewsReactionItem>();

    for (const item of cluster.timeline) {
      const current = earliestDelayForChannel.get(item.channelId);
      if (!current || item.delayMinutes < current.delayMinutes) {
        earliestDelayForChannel.set(item.channelId, item);
      }
    }

    for (const item of earliestDelayForChannel.values()) {
      const acc = byChannel.get(item.channelId) ?? {
        channelId: item.channelId,
        channelTitle: item.channelTitle,
        channelUsername: item.channelUsername,
        isMine: item.isMine,
        delaysByTopic: [],
        firstCount: 0,
        peakCount: 0,
      };
      acc.delaysByTopic.push(item.delayMinutes);
      if (cluster.firstPost.channelId === item.channelId) {
        acc.firstCount++;
      }
      if (cluster.peakPost.channelId === item.channelId) {
        acc.peakCount++;
      }
      byChannel.set(item.channelId, acc);
    }
  }

  return [...byChannel.values()]
    .map((acc) => {
      const sumDelays = acc.delaysByTopic.reduce((sum, val) => sum + val, 0);
      const avgDelay = acc.delaysByTopic.length > 0 ? roundTo(sumDelays / acc.delaysByTopic.length, 1) : 0;
      return {
        channelId: acc.channelId,
        channelTitle: acc.channelTitle,
        channelUsername: acc.channelUsername,
        isMine: acc.isMine,
        topicsCovered: acc.delaysByTopic.length,
        firstCount: acc.firstCount,
        peakCount: acc.peakCount,
        medianDelayMinutes: computeMedian(acc.delaysByTopic),
        avgDelayMinutes: avgDelay,
      };
    })
    .sort((left, right) => (
      right.firstCount - left.firstCount ||
      left.medianDelayMinutes - right.medianDelayMinutes ||
      right.topicsCovered - left.topicsCovered ||
      right.peakCount - left.peakCount ||
      left.channelTitle.localeCompare(right.channelTitle, 'ru')
    ));
}
