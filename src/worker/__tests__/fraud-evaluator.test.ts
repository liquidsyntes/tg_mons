import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  metrics: vi.fn(),
  posts: vi.fn(),
  mentions: vi.fn(),
  snapshot: vi.fn(),
  save: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    channelMetricDaily: { findMany: mocks.metrics },
    post: { findMany: mocks.posts },
    mention: { findMany: mocks.mentions },
  },
}));
vi.mock('../persister', () => ({
  getPreviousSnapshot: mocks.snapshot,
  saveFraudSignal: mocks.save,
}));
vi.mock('../../lib/logger', () => ({ logger: { error: mocks.log } }));

import { evaluateAndSaveChannelFraudSignals } from '../fraud-evaluator';

const channel = { id: 7, title: 'Тест', username: null, tgId: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.metrics.mockResolvedValue([]);
  mocks.posts.mockResolvedValue([]);
  mocks.mentions.mockResolvedValue([]);
  mocks.snapshot.mockResolvedValue(null);
  mocks.save.mockResolvedValue(undefined);
});

describe('post-collection fraud evaluation', () => {
  it('saves neutral signals when metrics and subscribers are unavailable', async () => {
    await evaluateAndSaveChannelFraudSignals(channel);

    expect(mocks.save.mock.calls.map(call => call[1])).toEqual([
      'growth_smoothness',
      'uncorrelated_spikes',
      'views_to_subs_ratio',
      'uniform_err',
      'unnatural_view_decay',
      'night_bot_activity',
    ]);
    expect(mocks.save).toHaveBeenCalledWith(7, 'views_to_subs_ratio', { flag: false, value: 0, reason: '' });
    expect(mocks.save).toHaveBeenCalledWith(7, 'unnatural_view_decay', { flag: false, value: 0, reason: '' });
    expect(mocks.save).toHaveBeenCalledWith(7, 'night_bot_activity', { flag: false, value: 0, reason: '' });
  });

  it('persists unnatural_view_decay and night_bot_activity signals when hourly bot anomalies exist without mentions', async () => {
    const botPosts = Array(5).fill(null).map((_, idx) => {
      const dayOffset = idx * 86400_000;
      const pub = new Date('2026-10-10T18:00:00Z').getTime() - dayOffset; // 21:00 MSK
      return {
        id: idx + 1,
        publishedAt: new Date(pub),
        views: 2500,
        reactions: 0,
        comments: 0,
        forwards: 0,
        snapshots: [
          { collectedAt: new Date(pub + 2 * 3600_000), views: 150 },
          { collectedAt: new Date(pub + 5.5 * 3600_000), views: 400 }, // 02:30 MSK
          { collectedAt: new Date(pub + 6.5 * 3600_000), views: 650 }, // 03:30 MSK
          { collectedAt: new Date(pub + 7.5 * 3600_000), views: 900 }, // 04:30 MSK
          { collectedAt: new Date(pub + 24 * 3600_000), views: 950 },
          { collectedAt: new Date(pub + 48 * 3600_000), views: 2500 },
        ],
        viewSnapshots: [],
        engagementHours: [],
      };
    });
    mocks.posts.mockResolvedValue(botPosts);

    await evaluateAndSaveChannelFraudSignals({
      id: 7,
      title: 'Тест',
      username: 'test_chan',
      tgId: null,
    });

    expect(mocks.save).toHaveBeenCalledWith(
      7,
      'unnatural_view_decay',
      expect.objectContaining({ flag: true }),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      7,
      'night_bot_activity',
      expect.objectContaining({ flag: true }),
    );
  });

  it('clears unnatural_view_decay when incoming mentions explain late views', async () => {
    const pub = new Date('2026-10-10T10:00:00Z').getTime();
    const posts = Array(5).fill(null).map((_, idx) => ({
      id: idx + 1,
      publishedAt: new Date(pub - idx * 86400_000),
      views: 2500,
      reactions: 10,
      comments: 0,
      forwards: 1,
      snapshots: [
        { collectedAt: new Date(pub - idx * 86400_000 + 2 * 3600_000), views: 200 },
        { collectedAt: new Date(pub - idx * 86400_000 + 24 * 3600_000), views: 400 },
        { collectedAt: new Date(pub - idx * 86400_000 + 48 * 3600_000), views: 2400 },
      ],
      viewSnapshots: [],
      engagementHours: [],
    }));
    mocks.posts.mockResolvedValue(posts);
    mocks.mentions.mockResolvedValue(
      posts.map((p) => ({ createdAt: new Date(p.publishedAt.getTime() + 25 * 3600_000) }))
    );

    await evaluateAndSaveChannelFraudSignals({
      id: 7,
      title: 'Тест',
      username: 'test_chan',
      tgId: null,
    });

    expect(mocks.save).toHaveBeenCalledWith(
      7,
      'unnatural_view_decay',
      expect.objectContaining({ flag: false }),
    );
  });

  it('isolates a failed signal write from the collection cycle', async () => {
    const failure = new Error('database unavailable');
    mocks.save.mockRejectedValueOnce(failure);

    await expect(evaluateAndSaveChannelFraudSignals(channel)).resolves.toBeUndefined();
    expect(mocks.log).toHaveBeenCalledWith('Fraud detection failed', { title: 'Тест' }, failure);
  });
});
