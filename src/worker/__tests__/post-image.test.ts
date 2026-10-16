import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import bigInt from 'big-integer';

const imageStore = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { postImage: imageStore } }));
vi.mock('../fetcher', () => ({
  withRateLimitAndRetry: (run: () => Promise<unknown>) => run(),
  withTimeout: (run: () => Promise<unknown>) => run(),
}));

import { savePostImage } from '../post-image';

function photoMessage(size = 1000, progressive = false): Api.Message {
  return new Api.Message({
    id: 7,
    message: 'Анонс',
    date: 1,
    peerId: new Api.PeerChannel({ channelId: bigInt(1) }),
    media: new Api.MessageMediaPhoto({
      photo: new Api.Photo({
        id: bigInt(1), accessHash: bigInt(2), fileReference: Buffer.alloc(0),
        date: 1, dcId: 1,
        sizes: progressive
          ? [
              new Api.PhotoSize({ type: 's', w: 160, h: 160, size: 1000 }),
              new Api.PhotoSizeProgressive({ type: 'x', w: 640, h: 640, sizes: [size] }),
            ]
          : [new Api.PhotoSize({ type: 'x', w: 640, h: 640, size })],
      }),
    }),
  });
}

describe('savePostImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imageStore.findUnique.mockResolvedValue(null);
  });

  it('downloads a bounded Telegram photo once and stores it with the post', async () => {
    const client = new TelegramClient(new StringSession(''), 1, 'test', {});
    const image = Buffer.from([1, 2, 3]);
    const download = vi.spyOn(client, 'downloadMedia').mockResolvedValue(image);
    const message = photoMessage();

    await savePostImage(client, message, 42);

    expect(download).toHaveBeenCalledWith(message, { thumb: 0 });
    expect(imageStore.upsert).toHaveBeenCalledWith({
      where: { postId: 42 }, create: { postId: 42, contentType: 'image/jpeg', data: Uint8Array.from(image) }, update: {},
    });

    imageStore.findUnique.mockResolvedValue({ postId: 42 });
    await savePostImage(client, message, 42);
    expect(download).toHaveBeenCalledOnce();
  });

  it('skips oversized images before downloading', async () => {
    const client = new TelegramClient(new StringSession(''), 1, 'test', {});
    const download = vi.spyOn(client, 'downloadMedia');
    await savePostImage(client, photoMessage(1_000_001), 42);
    expect(download).not.toHaveBeenCalled();
    expect(imageStore.upsert).not.toHaveBeenCalled();
  });

  it('selects a progressive photo size through its teleproto index', async () => {
    const client = new TelegramClient(new StringSession(''), 1, 'test', {});
    const download = vi.spyOn(client, 'downloadMedia').mockResolvedValue(Buffer.from([1]));
    const message = photoMessage(100_000, true);
    await savePostImage(client, message, 42);
    expect(download).toHaveBeenCalledWith(message, { thumb: 1 });
  });

  it('rejects a response larger than the storage limit', async () => {
    const client = new TelegramClient(new StringSession(''), 1, 'test', {});
    vi.spyOn(client, 'downloadMedia').mockResolvedValue(Buffer.alloc(1_000_001));
    await savePostImage(client, photoMessage(), 42);
    expect(imageStore.upsert).not.toHaveBeenCalled();
  });
});
