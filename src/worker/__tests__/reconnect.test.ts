import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramTimeoutError, runCollectCycle } from '../collector';
import { getTelegramClient } from '../client';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: object) => Promise<unknown>) => {
      const syncJob = {
        create: vi.fn().mockResolvedValue({ id: 1 }),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      };
      return callback({ $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]), syncJob });
    }),
    channel: {
      findMany: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ id: 1, title: 'Channel', isActive: true, username: 'test' }),
      update: vi.fn().mockResolvedValue({}),
    },
    snapshot: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    channelMetricDaily: {
      upsert: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    post: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    fraudSignal: {
      create: vi.fn(),
    },
    syncJob: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    }
  },
}));

vi.mock('../client', () => ({
  getTelegramClient: vi.fn(),
}));

describe('runCollectCycle Reconnection', () => {
  let mockClient1: any;
  let mockClient2: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient1 = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      invoke: vi.fn().mockResolvedValue({ fullChat: { participantsCount: 100 } }),
      getEntity: vi.fn().mockResolvedValue({ id: 1, className: 'Channel', title: 'Test' }),
      getMessages: vi.fn().mockRejectedValue(new TelegramTimeoutError('getMessages', 'test')),
    };

    mockClient2 = {
      disconnect: vi.fn(),
      invoke: vi.fn().mockResolvedValue({ fullChat: { participantsCount: 200 } }),
      getEntity: vi.fn().mockResolvedValue({ id: 2, className: 'Channel', title: 'Test 2' }),
      getMessages: vi.fn().mockResolvedValue([]),
    };
  });

  it('reconnects client on TelegramTimeoutError and continues processing', async () => {
    (prisma.channel.findMany as any).mockResolvedValue([
      { id: 1, title: 'Channel 1', isActive: true, username: 'test1' },
      { id: 2, title: 'Channel 2', isActive: true, username: 'test2' },
    ]);
    (prisma.channel.findUnique as any)
      .mockResolvedValueOnce({ id: 1, title: 'Channel 1', isActive: true, username: 'test1' })
      .mockResolvedValueOnce({ id: 2, title: 'Channel 2', isActive: true, username: 'test2' });

    (getTelegramClient as any)
      .mockResolvedValueOnce(mockClient1)
      .mockResolvedValueOnce(mockClient2);

    const result = await runCollectCycle();

    expect(getTelegramClient).toHaveBeenCalledTimes(2); 
    expect(mockClient1.disconnect).toHaveBeenCalledTimes(1);
    expect(mockClient2.getMessages).toHaveBeenCalledTimes(1);
    expect(result.errorCount).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.totalChannels).toBe(2);
  }, 15000);

  it('finishes the current channel then marks the interrupted cycle partial', async () => {
    const controller = new AbortController();
    const channel = (id: number) => ({
      id, title: `Channel ${id}`, username: `test${id}`, tgId: null, type: 'channel', niche: 'general',
      isMine: false, isFavorite: false, isActive: true, consecutiveErrors: 0, lastMessageId: null,
      lastError: null, lastCollectedAt: null, createdAt: new Date(),
    });
    vi.mocked(prisma.channel.findMany).mockResolvedValue([channel(1), channel(2)]);
    mockClient1.getMessages.mockImplementation(async () => {
      controller.abort();
      return [];
    });
    vi.mocked(getTelegramClient).mockResolvedValue(mockClient1);

    const result = await runCollectCycle(controller.signal);

    expect(result.successCount).toBe(1);
    expect(mockClient1.getEntity).toHaveBeenCalledTimes(1);
    expect(prisma.syncJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PARTIAL', channelsSucceeded: 1 }),
    }));
  });
});
