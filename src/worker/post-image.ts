import { Api, TelegramClient } from 'telegram';
import { prisma } from '../lib/prisma';
import { withRateLimitAndRetry, withTimeout } from './fetcher';

const MAX_IMAGE_BYTES = 1_000_000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function photoSizeBytes(size: Api.TypePhotoSize): number | null {
  if (size instanceof Api.PhotoSize) return size.size;
  if (size instanceof Api.PhotoSizeProgressive) return Math.max(...size.sizes);
  return null;
}

/** Keep one bounded image per stored post, including the first usable photo in an album. */
export async function savePostImage(client: TelegramClient, message: Api.Message, postId: number): Promise<void> {
  const media = message.media;
  if (!(media instanceof Api.MessageMediaPhoto) && !(media instanceof Api.MessageMediaDocument)) return;

  const existing = await prisma.postImage.findUnique({ where: { postId }, select: { postId: true } });
  if (existing) return;

  let thumbIndex: number | undefined;
  let contentType = 'image/jpeg';
  if (media instanceof Api.MessageMediaPhoto) {
    if (!(media.photo instanceof Api.Photo)) return;
    const sizes = media.photo.sizes
      .map(size => ({ size, bytes: photoSizeBytes(size) }))
      .filter((entry): entry is { size: Api.PhotoSize | Api.PhotoSizeProgressive; bytes: number } =>
        (entry.size instanceof Api.PhotoSize || entry.size instanceof Api.PhotoSizeProgressive) &&
        entry.bytes !== null && entry.bytes > 0 && entry.bytes <= MAX_IMAGE_BYTES)
      .sort((a, b) => b.bytes - a.bytes);
    const thumb = sizes[0]?.size;
    if (!thumb) return;
    // teleproto accepts a numeric index for progressive sizes, but not their object.
    const orderedSizes = [...media.photo.sizes, ...(media.photo.videoSizes ?? [])]
      .filter(size => !(size instanceof Api.PhotoPathSize))
      .sort((a, b) => {
        const bytes = (size: Api.TypePhotoSize | Api.TypeVideoSize): number => {
          if (size instanceof Api.PhotoSizeProgressive) return Math.max(...size.sizes);
          if (size instanceof Api.PhotoSize || size instanceof Api.VideoSize) return size.size;
          if (size instanceof Api.PhotoCachedSize || size instanceof Api.PhotoStrippedSize) return size.bytes.length;
          return 0;
        };
        return bytes(a) - bytes(b);
      });
    thumbIndex = orderedSizes.indexOf(thumb);
    if (thumbIndex < 0) return;
  } else {
    const document = media.document;
    if (!(document instanceof Api.Document) || !IMAGE_TYPES.has(document.mimeType)) return;
    const documentBytes = Number(document.size.toString());
    if (!Number.isSafeInteger(documentBytes) || documentBytes <= 0 || documentBytes > MAX_IMAGE_BYTES) return;
    contentType = document.mimeType;
  }

  const result = await withRateLimitAndRetry(() =>
    withTimeout(() => client.downloadMedia(message, thumbIndex === undefined ? {} : { thumb: thumbIndex }), 'downloadMedia')
  );
  if (!Buffer.isBuffer(result) || result.length === 0 || result.length > MAX_IMAGE_BYTES) return;

  await prisma.postImage.upsert({
    where: { postId },
    create: { postId, contentType, data: Uint8Array.from(result) },
    update: {},
  });
}
