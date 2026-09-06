import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChannelError } from '../retry-policy';
import { updateChannelErrorState } from '../persister';
import { logger } from '../../lib/logger';

vi.mock('../persister', () => ({
  updateChannelErrorState: vi.fn(),
}));

vi.mock('../../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock global fetch for Telegram alerts
const globalFetch = vi.fn();
global.fetch = globalFetch;

describe('retry-policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat';
    process.env.CHANNEL_MAX_CONSECUTIVE_ERRORS = '10';
  });

  it('increments consecutiveErrors and does NOT disable channel if under threshold', async () => {
    const channel = { id: 1, title: 'Test', username: 'test', tgId: null, consecutiveErrors: 5 };
    const error = new Error('Some API error');
    
    const shouldDisable = await handleChannelError(channel, error);
    
    expect(shouldDisable).toBe(false);
    expect(updateChannelErrorState).toHaveBeenCalledWith(1, 'Some API error', 6, false);
    expect(logger.error).toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled(); // No alert sent since it's not disabled
  });

  it('disables channel and sends alert when threshold is reached', async () => {
    const channel = { id: 2, title: 'Test 2', username: 'test2', tgId: null, consecutiveErrors: 9 };
    const error = new Error('Fatal error');
    
    globalFetch.mockResolvedValueOnce({ ok: true });

    const shouldDisable = await handleChannelError(channel, error);
    
    expect(shouldDisable).toBe(true);
    expect(updateChannelErrorState).toHaveBeenCalledWith(2, 'Fatal error', 10, true);
    expect(logger.warn).toHaveBeenCalledWith(
      'Channel error threshold reached',
      expect.objectContaining({ channelId: 2, consecutiveErrors: 10 })
    );
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
