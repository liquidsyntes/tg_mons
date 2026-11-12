import { describe, expect, it } from 'vitest';
import {
  attachEventsToSnapshots,
  buildSubscriberTimelineEvents,
  getDominantEventType,
} from '../subscriber-events';

describe('buildSubscriberTimelineEvents', () => {
  const periodStart = new Date('2026-11-05T00:00:00.000Z');

  it('builds sorted and deduplicated events from viral posts, donor mentions and fraud signals', () => {
    const events = buildSubscriberTimelineEvents({
      periodStart,
      posts: [
        {
          id: 101,
          messageId: '501',
          publishedAt: new Date('2026-11-06T12:00:00.000Z'),
          views: 5200,
          text: 'Главный разбор недели с неожиданными выводами',
          isViral: true,
          viralReasons: ['views'],
          viralPrimaryReason: 'views',
          viralMultiplier: 2.8,
        },
        {
          id: 102,
          messageId: '502',
          publishedAt: new Date('2026-11-06T14:00:00.000Z'),
          views: 1100,
          text: 'Обычный пост',
          isViral: false,
          viralReasons: [],
          viralPrimaryReason: null,
          viralMultiplier: null,
        },
      ],
      inboundMentions: [
        {
          sourcePostId: 201,
          type: 'mention',
          sourcePost: {
            id: 201,
            messageId: '777',
            publishedAt: new Date('2026-11-06T10:00:00.000Z'),
            views: 14000,
            isAd: true,
          },
          sourceChannel: {
            id: 9,
            title: 'Техно Донор',
            username: 'techdonor',
          },
        },
        // Duplicate mention from the same donor post should be deduplicated
        {
          sourcePostId: 201,
          type: 'forward',
          sourcePost: {
            id: 201,
            messageId: '777',
            publishedAt: new Date('2026-11-06T10:00:00.000Z'),
            views: 14000,
            isAd: true,
          },
          sourceChannel: {
            id: 9,
            title: 'Техно Донор',
            username: 'techdonor',
          },
        },
      ],
      fraudSignals: [
        {
          signalType: 'STEP_ANOMALY',
          reason: 'Резкий скачок без упоминаний',
          detectedAt: new Date('2026-11-07T08:00:00.000Z'),
        },
        // Older than periodStart -> ignored
        {
          signalType: 'LOW_ERR',
          reason: 'Старый сигнал',
          detectedAt: new Date('2026-11-01T08:00:00.000Z'),
        },
      ],
    });

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual([
      'donor_mention',
      'viral_post',
      'fraud_signal',
    ]);
    expect(events[0]).toMatchObject({
      id: 'mention:201',
      title: 'Рекламное упоминание в «Техно Донор»',
      subtitle: '@techdonor',
      sourceChannelId: 9,
      views: 14000,
      isAd: true,
    });
    expect(events[1]).toMatchObject({
      id: 'viral:101',
      title: 'Вирусный пост (2.8x)',
      views: 5200,
    });
    expect(events[2]).toMatchObject({
      type: 'fraud_signal',
      title: 'Сигнал антифрода',
      subtitle: 'Резкий скачок без упоминаний',
    });
  });
});

describe('attachEventsToSnapshots and getDominantEventType', () => {
  it('attaches each event to the first snapshot at or after event timestamp and computes subscriber delta', () => {
    const snapshots = [
      { collectedAt: '2026-11-06T09:00:00.000Z', membersCount: 1000 },
      { collectedAt: '2026-11-06T12:00:00.000Z', membersCount: 1150 },
      { collectedAt: '2026-11-06T15:00:00.000Z', membersCount: 1135 },
    ];
    const events = [
      {
        id: 'mention:1',
        type: 'donor_mention' as const,
        timestamp: '2026-11-06T10:30:00.000Z',
        title: 'Рекламное упоминание в «Донор»',
        subtitle: '@donor',
      },
      {
        id: 'fraud:1',
        type: 'fraud_signal' as const,
        timestamp: '2026-11-06T16:00:00.000Z',
        title: 'Сигнал антифрода',
        subtitle: 'Отток после накрутки',
      },
    ];

    const { bySnapshotIndex, enrichedEvents } = attachEventsToSnapshots(
      snapshots,
      events
    );

    expect(bySnapshotIndex.get(1)?.map((e) => e.id)).toEqual(['mention:1']);
    expect(bySnapshotIndex.get(2)?.map((e) => e.id)).toEqual(['fraud:1']);
    expect(enrichedEvents[0]).toMatchObject({
      snapshotIndex: 1,
      membersAtSnapshot: 1150,
      membersDeltaAtSnapshot: 150,
    });
    expect(enrichedEvents[1]).toMatchObject({
      snapshotIndex: 2,
      membersAtSnapshot: 1135,
      membersDeltaAtSnapshot: -15,
    });

    expect(getDominantEventType(events)).toBe('fraud_signal');
    expect(getDominantEventType([events[0]])).toBe('donor_mention');
    expect(getDominantEventType([])).toBeNull();
  });
});
