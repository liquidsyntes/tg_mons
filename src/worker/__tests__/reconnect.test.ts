import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramTimeoutError, runCollectCycle } from '../collector';
import { getTelegramClient } from '../client';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    channel: {
      findMany: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ id: 1, title: 'Channel', isActive: true, username: 'test' }),
      update: vi.fn().mockResolvedValue({}),
    },
    snapshot: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    post: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    syncJob: {
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({}),
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
});