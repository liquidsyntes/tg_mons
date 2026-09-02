import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCollectCycle } from '../collector';
import { getTelegramClient } from '../client';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    channel: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    snapshot: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    channelMetricDaily: {
      upsert: vi.fn(),
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

// Mock fetch for Telegram alert
global.fetch = vi.fn().mockResolvedValue({ ok: true });

describe('Auto-disable channels on consecutive errors', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      invoke: vi.fn().mockRejectedValue(new Error('Generic Error')),
      getEntity: vi.fn().mockRejectedValue(new Error('Entity not found')),
      getMessages: vi.fn().mockRejectedValue(new Error('Generic Error')),
    };

    (getTelegramClient as any).mockResolvedValue(mockClient);
    
    // Default env
    process.env.CHANNEL_MAX_CONSECUTIVE_ERRORS = '10';
    process.env.TELEGRAM_BOT_TOKEN = 'token';
    process.env.TELEGRAM_CHAT_ID = 'chat_id';
  });

  it('increments consecutiveErrors but does not disable if threshold not met', async () => {
    (prisma.channel.findMany as any).mockResolvedValue([
      { id: 1, title: 'Channel 1', isActive: true, username: 'test1', consecutiveErrors: 5 },
    ]);
    (prisma.channel.findUnique as any).mockResolvedValue({ id: 1, title: 'Channel 1', isActive: true, username: 'test1', consecutiveErrors: 5 });

    await runCollectCycle();

    expect(prisma.channel.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({
        consecutiveErrors: 6,
      }),
    }));
    
    // Should NOT include isActive: false
    const updateCall = (prisma.channel.update as any).mock.calls.find((call: any) => call[0].where.id === 1);
    expect(updateCall[0].data.isActive).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('disables channel and sends alert when threshold is met', async () => {
    (prisma.channel.findMany as any).mockResolvedValue([
      { id: 1, title: 'Channel 1', isActive: true, username: 'test1', consecutiveErrors: 9 },
    ]);
    (prisma.channel.findUnique as any).mockResolvedValue({ id: 1, title: 'Channel 1', isActive: true, username: 'test1', consecutiveErrors: 9 });

    await runCollectCycle();

    expect(prisma.channel.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({
        consecutiveErrors: 10,
        isActive: false,
      }),
    }));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.telegram.org/bottoken/sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('автоматически отключен')
      })
    );
  });

  it('resets consecutiveErrors to 0 on success', async () => {
    mockClient.invoke.mockResolvedValue({ fullChat: { participantsCount: 100 } });
    mockClient.getMessages.mockResolvedValue([]);
    mockClient.getEntity.mockResolvedValue({ id: 1, className: 'Channel', title: 'Test' });

    (prisma.channel.findMany as any).mockResolvedValue([
      { id: 1, title: 'Channel 1', isActive: true, username: 'test1', consecutiveErrors: 9 },
    ]);
    (prisma.channel.findUnique as any).mockResolvedValue({ id: 1, title: 'Channel 1', isActive: true, username: 'test1', consecutiveErrors: 9 });

    await runCollectCycle();

    expect(prisma.channel.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({
        consecutiveErrors: 0,
      }),
    }));
  });
});
