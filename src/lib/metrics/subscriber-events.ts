import type {
  SubscriberTimelineEvent,
  SubscriberTimelineEventType,
  ViralClassification,
} from '../types';

export interface ViralPostEventInput extends ViralClassification {
  id: number;
  messageId: bigint | string;
  publishedAt: Date | string;
  views?: number | null;
  text?: string | null;
}

export interface InboundMentionEventInput {
  sourcePostId: number;
  type: string;
  sourcePost: {
    id: number;
    messageId: bigint | string;
    publishedAt: Date | string;
    views: number | null;
    isAd: boolean;
  };
  sourceChannel: {
    id: number;
    title: string;
    username: string | null;
  };
}

export interface FraudSignalEventInput {
  signalType: string;
  reason: string;
  detectedAt?: Date | string | null;
}

export interface BuildSubscriberTimelineEventsInput {
  posts: readonly ViralPostEventInput[];
  inboundMentions?: readonly InboundMentionEventInput[];
  fraudSignals?: readonly FraudSignalEventInput[];
  periodStart: Date;
}

export interface EnrichedSubscriberTimelineEvent extends SubscriberTimelineEvent {
  snapshotIndex: number | null;
  membersAtSnapshot: number | null;
  membersDeltaAtSnapshot: number | null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildTextSnippet(text: string | null | undefined, maxLength = 80): string | null {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildSubscriberTimelineEvents({
  posts,
  inboundMentions = [],
  fraudSignals = [],
  periodStart,
}: BuildSubscriberTimelineEventsInput): SubscriberTimelineEvent[] {
  const startMs = periodStart.getTime();
  const events: SubscriberTimelineEvent[] = [];

  for (const post of posts) {
    if (!post.isViral) continue;
    const timestamp = toIsoString(post.publishedAt);
    if (new Date(timestamp).getTime() < startMs) continue;

    const multiplierSuffix =
      post.viralMultiplier !== null && post.viralMultiplier !== undefined
        ? ` (${post.viralMultiplier}x)`
        : '';

    events.push({
      id: `viral:${post.id}`,
      type: 'viral_post',
      timestamp,
      title: `Вирусный пост${multiplierSuffix}`,
      subtitle: buildTextSnippet(post.text),
      postId: post.id,
      messageId: String(post.messageId),
      views: post.views ?? null,
      viralMultiplier: post.viralMultiplier ?? null,
    });
  }

  const seenSourcePostIds = new Set<number>();
  for (const mention of inboundMentions) {
    const sourcePostId = mention.sourcePost?.id ?? mention.sourcePostId;
    if (seenSourcePostIds.has(sourcePostId)) continue;

    const timestamp = toIsoString(mention.sourcePost.publishedAt);
    if (new Date(timestamp).getTime() < startMs) continue;
    seenSourcePostIds.add(sourcePostId);

    const prefix = mention.sourcePost.isAd
      ? 'Рекламное упоминание'
      : mention.type === 'forward'
      ? 'Репост'
      : 'Упоминание';

    events.push({
      id: `mention:${sourcePostId}`,
      type: 'donor_mention',
      timestamp,
      title: `${prefix} в «${mention.sourceChannel.title}»`,
      subtitle: mention.sourceChannel.username
        ? `@${mention.sourceChannel.username.replace(/^@/, '')}`
        : null,
      postId: sourcePostId,
      messageId: String(mention.sourcePost.messageId),
      sourceChannelId: mention.sourceChannel.id,
      sourceChannelTitle: mention.sourceChannel.title,
      sourceChannelUsername: mention.sourceChannel.username,
      views: mention.sourcePost.views ?? null,
      isAd: mention.sourcePost.isAd,
    });
  }

  const seenFraudIds = new Set<string>();
  for (const sig of fraudSignals) {
    if (!sig.detectedAt) continue;
    const timestamp = toIsoString(sig.detectedAt);
    if (new Date(timestamp).getTime() < startMs) continue;

    const id = `fraud:${sig.signalType}:${timestamp}`;
    if (seenFraudIds.has(id)) continue;
    seenFraudIds.add(id);

    events.push({
      id,
      type: 'fraud_signal',
      timestamp,
      title: 'Сигнал антифрода',
      subtitle: sig.reason,
      signalType: sig.signalType,
    });
  }

  return events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

const EVENT_PRIORITY: Record<SubscriberTimelineEventType, number> = {
  fraud_signal: 3,
  donor_mention: 2,
  viral_post: 1,
};

export function getDominantEventType(
  events: readonly SubscriberTimelineEvent[]
): SubscriberTimelineEventType | null {
  if (events.length === 0) return null;
  let best = events[0].type;
  for (const ev of events) {
    if (EVENT_PRIORITY[ev.type] > EVENT_PRIORITY[best]) {
      best = ev.type;
    }
  }
  return best;
}

export function attachEventsToSnapshots(
  snapshots: readonly { collectedAt: string; membersCount: number }[],
  events: readonly SubscriberTimelineEvent[]
): {
  bySnapshotIndex: Map<number, SubscriberTimelineEvent[]>;
  enrichedEvents: EnrichedSubscriberTimelineEvent[];
} {
  const bySnapshotIndex = new Map<number, SubscriberTimelineEvent[]>();
  if (snapshots.length === 0 || events.length === 0) {
    return {
      bySnapshotIndex,
      enrichedEvents: events.map((ev) => ({
        ...ev,
        snapshotIndex: null,
        membersAtSnapshot: null,
        membersDeltaAtSnapshot: null,
      })),
    };
  }

  const snapTimes = snapshots.map((s) => new Date(s.collectedAt).getTime());

  const enrichedEvents: EnrichedSubscriberTimelineEvent[] = events.map((ev) => {
    const evTime = new Date(ev.timestamp).getTime();
    let targetIndex = snapTimes.findIndex((t) => t >= evTime);
    if (targetIndex === -1) {
      targetIndex = snapshots.length - 1;
    }

    const existing = bySnapshotIndex.get(targetIndex) ?? [];
    existing.push(ev);
    bySnapshotIndex.set(targetIndex, existing);

    const membersAtSnapshot = snapshots[targetIndex].membersCount;
    const membersDeltaAtSnapshot =
      targetIndex > 0
        ? snapshots[targetIndex].membersCount -
          snapshots[targetIndex - 1].membersCount
        : null;

    return {
      ...ev,
      snapshotIndex: targetIndex,
      membersAtSnapshot,
      membersDeltaAtSnapshot,
    };
  });

  return { bySnapshotIndex, enrichedEvents };
}
