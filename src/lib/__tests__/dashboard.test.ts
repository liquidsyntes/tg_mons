import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardStats } from '../dashboard';
import { getOverviewStats } from '../metrics';
import { channel } from './fixtures/channel-metrics';
import type { ChannelMetrics } from '../types';

vi.mock('../metrics', () => ({ getOverviewStats: vi.fn() }));
vi.mock('../prisma', () => ({ prisma: {
  post: { findMany: vi.fn().mockResolvedValue([]) },
  snapshot: { findMany: vi.fn().mockResolvedValue([]) },
} }));

function overview(channels: ChannelMetrics[], myChannel: ChannelMetrics | null = null): void {
  vi.mocked(getOverviewStats).mockResolvedValue({
    channels, myChannel, totalChannels: channels.length, activeChannels: channels.length, lastGlobalUpdate: null,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('dashboard metric semantics', () => {
  it('averages ERR, ignores groups and missing/non-finite values, and returns Content Score', async () => {
    overview([
      { ...channel, id: 1, err7d: 2, vr7d: 50, contentScore: 70 },
      { ...channel, id: 2, err7d: 4, vr7d: 80, contentScore: 90 },
      { ...channel, id: 3, type: 'group', err7d: 100 },
      { ...channel, id: 4, err7d: null },
      { ...channel, id: 5, err7d: NaN },
      { ...channel, id: 6, err7d: Infinity },
    ]);
    const result = await getDashboardStats();
    expect(result.avgErr).toBe(3);
    expect(result.avgScore).toBe(80);
  });

  it('preserves zero ERR and does not count my channel twice', async () => {
    const mine = { ...channel, isMine: true, err7d: 0 };
    overview([mine, { ...channel, id: 2, err7d: 4 }], mine);
    expect((await getDashboardStats()).avgErr).toBe(2);
  });

  it.each([
    { channels: [] },
    { channels: [{ ...channel, err7d: null }] },
    { channels: [{ ...channel, type: 'group' as const }] },
  ])(
    'returns null when no channel ERR is available', async ({ channels }) => {
      overview(channels);
      expect((await getDashboardStats()).avgErr).toBeNull();
    },
  );
});
