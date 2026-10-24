import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { channel as channelMetrics } from '@/lib/__tests__/fixtures/channel-metrics';

const mocks = vi.hoisted(() => ({
  client: vi.fn(), resolveEntity: vi.fn(), fullChannel: vi.fn(), messages: vi.fn(),
  activeChannels: vi.fn(), createJob: vi.fn(), saveSnapshot: vi.fn(), previousSnapshot: vi.fn(),
  updateState: vi.fn(), progress: vi.fn(), finalize: vi.fn(), fraudSave: vi.fn(), cleanup: vi.fn(),
  materialize: vi.fn(), calculateMetrics: vi.fn(), checkAlerts: vi.fn(),
  dailyFindMany: vi.fn(), postFindMany: vi.fn(),
}));
vi.mock('../client', () => ({ getTelegramClient: mocks.client }));
vi.mock('../fetcher', () => ({
  resolveChannelEntity: mocks.resolveEntity,
  fetchFullChannel: mocks.fullChannel,
  fetchChannelMessages: mocks.messages,
  TelegramTimeoutError: class TelegramTimeoutError extends Error {},
  parseChannelIdentifier: vi.fn(),
}));
vi.mock('../persister', () => ({
  addChannelToDb: vi.fn(),
  getActiveChannels: mocks.activeChannels,
  saveSnapshot: mocks.saveSnapshot,
  getPreviousSnapshot: mocks.previousSnapshot,
  updateChannelState: mocks.updateState,
  createSyncJob: mocks.createJob,
  updateSyncJobProgress: mocks.progress,
  finalizeSyncJob: mocks.finalize,
  getExistingGroupPost: vi.fn(),
  upsertPostWithReactions: vi.fn(),
  saveMentions: vi.fn(),
  updateChannelTitle: vi.fn(),
  saveFraudSignal: mocks.fraudSave,
  cleanupOldPostSnapshots: mocks.cleanup,
}));
vi.mock('@/lib/materialize', () => ({ materializeDailyMetrics: mocks.materialize }));
vi.mock('@/lib/metrics', () => ({ calculateChannelMetrics: mocks.calculateMetrics }));
vi.mock('@/lib/alerts', () => ({ checkChannelAlertRules: mocks.checkAlerts }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  channelMetricDaily: { findMany: mocks.dailyFindMany },
  post: { findMany: mocks.postFindMany },
} }));
vi.mock('../retry-policy', () => ({
  sendTelegramRuleAlert: vi.fn(),
  handleChannelError: vi.fn(),
}));
import { runCollectCycle } from '../collector';

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('TELEGRAM_CHAT_ID', 'test-chat');
  vi.stubEnv('WEB_INTERNAL_URL', '');
  vi.stubEnv('COLLECT_API_TOKEN', '');
  mocks.activeChannels.mockResolvedValue([{
    id: 1, title: 'Synthetic channel', username: 'synthetic', tgId: null,
    lastMessageId: null, lastCollectedAt: new Date(), consecutiveErrors: 0,
  }]);
  mocks.createJob.mockResolvedValue({ id: 1 });
  mocks.progress.mockResolvedValue({});
  mocks.finalize.mockResolvedValue({});
  mocks.client.mockResolvedValue({ connected: true });
  mocks.resolveEntity.mockResolvedValue({ className: 'Channel', title: 'Synthetic channel' });
  mocks.fullChannel.mockResolvedValue({ fullChat: { participantsCount: 100 } });
  mocks.messages.mockResolvedValue([]);
  mocks.previousSnapshot.mockResolvedValue(null);
  mocks.dailyFindMany.mockResolvedValue([]);
  mocks.postFindMany.mockResolvedValue([]);
  mocks.materialize.mockResolvedValue(undefined);
  mocks.calculateMetrics.mockResolvedValue({ ...channelMetrics, id: 1 });
  mocks.checkAlerts.mockImplementation(async (_channelId: number, loadMetrics: () => Promise<unknown>) => {
    await loadMetrics();
    return 1;
  });
  mocks.cleanup.mockResolvedValue(0);
});

describe('collection alert integration', () => {
  it('checks rules after daily metrics have been materialized', async () => {
    const result = await runCollectCycle();
    expect(result.successCount).toBe(1);
    expect(mocks.materialize).toHaveBeenCalledWith(1, 30);
    expect(mocks.calculateMetrics).toHaveBeenCalledWith(1);
    expect(mocks.checkAlerts).toHaveBeenCalledWith(1, expect.any(Function), expect.any(Function));
    expect(mocks.materialize.mock.invocationCallOrder[0]).toBeLessThan(mocks.checkAlerts.mock.invocationCallOrder[0]);
  });

  it('keeps the main cycle successful if rule evaluation fails', async () => {
    mocks.checkAlerts.mockRejectedValue(new Error('notification unavailable'));
    const result = await runCollectCycle();
    expect(result.successCount).toBe(1);
    expect(mocks.finalize).toHaveBeenCalled();
  });

  it('passes failed-channel diagnostics to SyncJob finalization', async () => {
    mocks.resolveEntity.mockRejectedValueOnce(new Error('Synthetic collection failure'));
    const result = await runCollectCycle();
    expect(result.errorCount).toBe(1);
    expect(mocks.finalize).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number), 0, 1, 1, 0, null, false,
      expect.stringContaining('#1: Synthetic collection failure'),
    );
  });
});
