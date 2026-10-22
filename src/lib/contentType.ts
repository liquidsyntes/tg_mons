export type ContentType = 'text' | 'photo' | 'video' | 'poll' | 'link';

export const ALL_CONTENT_TYPES: readonly ContentType[] = ['text', 'photo', 'video', 'poll', 'link'] as const;

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  text: 'Текст',
  photo: 'Фото',
  video: 'Видео',
  poll: 'Опросы',
  link: 'Ссылки',
};

interface MessageLike {
  media?: unknown;
  entities?: unknown[];
  message?: string | null;
  text?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Classifies a Telegram message into one of 5 canonical content types:
 * 'poll' | 'video' | 'photo' | 'link' | 'text'.
 *
 * Precedence:
 * 1. Poll (MessageMediaPoll)
 * 2. Video (MessageMediaVideoStream, video document / animation)
 * 3. Photo (MessageMediaPhoto, image document)
 * 4. Link (MessageMediaWebPage, URL entities, or URL in text)
 * 5. Text (fallback)
 */
export function detectContentType(msg: MessageLike | null | undefined): ContentType {
  if (!msg || typeof msg !== 'object') {
    return 'text';
  }

  const media = msg.media;

  if (isRecord(media)) {
    const className = typeof media.className === 'string' ? media.className : '';

    // 1. Poll
    if (className === 'MessageMediaPoll' || 'poll' in media) {
      return 'poll';
    }

    // 2. Video
    if (className === 'MessageMediaVideoStream') {
      return 'video';
    }

    if (className === 'MessageMediaDocument') {
      const doc = isRecord(media.document) ? media.document : null;
      const mime = typeof doc?.mimeType === 'string' ? doc.mimeType.toLowerCase() : '';
      if (mime.startsWith('video/')) {
        return 'video';
      }
      if (Array.isArray(doc?.attributes)) {
        const hasVideoAttr = doc.attributes.some((attr: unknown) => {
          if (!isRecord(attr)) return false;
          const attrClass = typeof attr.className === 'string' ? attr.className : '';
          return attrClass === 'DocumentAttributeVideo' || attrClass === 'DocumentAttributeAnimated';
        });
        if (hasVideoAttr) {
          return 'video';
        }
      }

      // If document is an image (uncompressed photo)
      if (mime.startsWith('image/')) {
        return 'photo';
      }
    }

    // 3. Photo
    if (className === 'MessageMediaPhoto' || ('photo' in media && Boolean(media.photo))) {
      return 'photo';
    }

    // 4. Web page preview (link)
    if (className === 'MessageMediaWebPage') {
      return 'link';
    }
  }

  // Check entities for URLs
  if (Array.isArray(msg.entities) && msg.entities.length > 0) {
    const hasLinkEntity = msg.entities.some((entity: unknown) => {
      if (!isRecord(entity)) return false;
      const entityClass = typeof entity.className === 'string' ? entity.className : '';
      const entityType = typeof entity.type === 'string' ? entity.type : '';
      return (
        entityClass === 'MessageEntityUrl' ||
        entityClass === 'MessageEntityTextUrl' ||
        entityType === 'url' ||
        entityType === 'text_link'
      );
    });
    if (hasLinkEntity) {
      return 'link';
    }
  }

  // Check text content for raw URLs
  const rawText = (typeof msg.message === 'string' ? msg.message : null) ??
    (typeof msg.text === 'string' ? msg.text : null) ?? '';
  if (/(https?:\/\/[^\s]+|t\.me\/[^\s]+)/i.test(rawText)) {
    return 'link';
  }

  // 5. Default text
  return 'text';
}
