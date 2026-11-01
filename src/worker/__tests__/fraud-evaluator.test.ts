import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  metrics: vi.fn(),
  posts: vi.fn(),
  snapshot: vi.fn(),
  save: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    channelMetricDaily: { findMany: mocks.metrics },
    post: { findMany: mocks.posts },
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
  mocks.snapshot.mockResolvedValue(null);
  mocks.save.mockResolvedValue(undefined);
});

describe('post-collection fraud evaluation', () => {
  it('saves neutral signals when metrics and subscribers are unavailable', async () => {
    await evaluateAndSaveChannelFraudSignals(channel);

    expect(mocks.save.mock.calls.map(call => call[1])).toEqual([
      'growth_smoothness', 'uncorrelated_spikes', 'views_to_subs_ratio', 'uniform_err',
    ]);
    expect(mocks.save).toHaveBeenCalledWith(7, 'views_to_subs_ratio', { flag: false, value: 0, reason: '' });
  });

  it('isolates a failed signal write from the collection cycle', async () => {
    const failure = new Error('database unavailable');
    mocks.save.mockRejectedValueOnce(failure);

    await expect(evaluateAndSaveChannelFraudSignals(channel)).resolves.toBeUndefined();
    expect(mocks.log).toHaveBeenCalledWith('Fraud detection failed', { title: 'Тест' }, failure);
  });
});
