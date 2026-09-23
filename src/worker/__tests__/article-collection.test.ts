import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import bigInt from 'big-integer';
import { collectChannelData } from '../collector';
import { fetchChannelMessages, fetchFullChannel, resolveChannelEntity } from '../fetcher';
import { getPreviousSnapshot, saveMentions, upsertPostWithReactions } from '../persister';

vi.mock('../persister');
vi.mock('../../lib/prisma', () => ({ prisma: {} }));
vi.mock('../fetcher', async importOriginal => ({
  ...await importOriginal<typeof import('../fetcher')>(),
  resolveChannelEntity: vi.fn(), fetchFullChannel: vi.fn(), fetchChannelMessages: vi.fn(),
  withRateLimitAndRetry: (fn: () => Promise<unknown>) => fn(),
  withTimeout: (fn: () => Promise<unknown>) => fn(),
}));

const channel = { id: 1, title: 'Test', username: 'source_channel', tgId: 1n, lastMessageId: null };
const message = (id: number, text: string, richMessage?: Api.RichMessage) => {
  const result = new Api.Message({
    id, message: text, date: Math.floor(Date.now() / 1000),
    peerId: new Api.PeerChannel({ channelId: bigInt(1) }), views: 100,
  });
  result.richMessage = richMessage;
  return result;
};
const article = (part = false) => new Api.RichMessage({
  part, blocks: [new Api.PageBlockParagraph({ text: new Api.TextPlain({ text: 'Реклама @test_partner' }) })],
  photos: [], documents: [],
});

describe('article collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveChannelEntity).mockResolvedValue(new Api.PeerChannel({ channelId: bigInt(1) }));
    vi.mocked(fetchFullChannel).mockRejectedValue(new Error('Optional statistics unavailable'));
    vi.mocked(getPreviousSnapshot).mockResolvedValue(null);
  });

  it('passes article text and ad classification to storage and extracts mentions', async () => {
    const client = new TelegramClient(new StringSession(''), 1, 'test', {});
    vi.mocked(fetchChannelMessages).mockResolvedValue([message(12, '', article())]);
    // Only the post ID is consumed after persistence.
    vi.mocked(upsertPostWithReactions).mockImplementation(async input => ({
      ...input, id: 42, isAd: input.isAd ?? false,
    }));
    await collectChannelData(client, channel);
    expect(upsertPostWithReactions).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 12n, text: 'Реклама @test_partner', isAd: true,
    }));
    expect(saveMentions).toHaveBeenCalledWith(42, 1, [{ type: 'mention', targetUsername: 'test_partner' }]);
  });

  it('preserves existing content on hydration failure and continues with the next post', async () => {
    const client = new TelegramClient(new StringSession(''), 1, 'test', {});
    vi.spyOn(client, 'getRichMessage').mockRejectedValue(new Error('unavailable'));
    vi.mocked(fetchChannelMessages).mockResolvedValue([message(12, '', article(true)), message(13, 'Обычный пост')]);
    vi.mocked(upsertPostWithReactions).mockImplementation(async input => ({ ...input, id: 42, isAd: input.isAd ?? false }));
    const result = await collectChannelData(client, channel);
    expect(result.postsAdded).toBe(2);
    expect(upsertPostWithReactions).toHaveBeenNthCalledWith(1, expect.objectContaining({ text: null, isAd: undefined }));
    expect(upsertPostWithReactions).toHaveBeenNthCalledWith(2, expect.objectContaining({ text: 'Обычный пост' }));
    expect(saveMentions).toHaveBeenCalledTimes(1);
  });
});
