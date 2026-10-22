import { describe, expect, it } from 'vitest';
import { detectContentType } from '../contentType';

describe('detectContentType', () => {
  it('detects pure poll', () => {
    expect(detectContentType({
      media: { className: 'MessageMediaPoll', poll: { id: 1 } },
      message: 'Какой формат контента вам ближе?',
    })).toBe('poll');

    expect(detectContentType({
      media: { poll: { id: 2 } },
    })).toBe('poll');
  });

  it('detects photo with caption and links (media takes precedence)', () => {
    expect(detectContentType({
      media: { className: 'MessageMediaPhoto', photo: { id: 1 } },
      message: 'Посмотрите наше новое фото! Ссылка: https://t.me/channel',
      entities: [{ className: 'MessageEntityUrl', offset: 35, length: 20 }],
    })).toBe('photo');
  });

  it('detects uncompressed photo sent as document', () => {
    expect(detectContentType({
      media: {
        className: 'MessageMediaDocument',
        document: { mimeType: 'image/png', size: 1024 },
      },
      message: 'Логотип в высоком разрешении',
    })).toBe('photo');
  });

  it('detects video messages and animated documents', () => {
    expect(detectContentType({
      media: {
        className: 'MessageMediaDocument',
        document: { mimeType: 'video/mp4', size: 2048 },
      },
      message: 'Видео обзор новинок',
    })).toBe('video');

    expect(detectContentType({
      media: {
        className: 'MessageMediaDocument',
        document: {
          mimeType: 'application/octet-stream',
          attributes: [{ className: 'DocumentAttributeVideo' }],
        },
      },
      message: 'Кружочек / видеосообщение',
    })).toBe('video');

    expect(detectContentType({
      media: { className: 'MessageMediaVideoStream' },
    })).toBe('video');
  });

  it('detects text with link via MessageMediaWebPage', () => {
    expect(detectContentType({
      media: { className: 'MessageMediaWebPage' },
      message: 'Читайте подробнее в источнике',
    })).toBe('link');
  });

  it('detects text with link via entity', () => {
    expect(detectContentType({
      message: 'Подробнее на сайте компании',
      entities: [{ className: 'MessageEntityTextUrl', url: 'https://example.com' }],
    })).toBe('link');

    expect(detectContentType({
      message: 'Ссылка: https://example.org',
      entities: [{ type: 'url' }],
    })).toBe('link');
  });

  it('detects text with raw URL without entities', () => {
    expect(detectContentType({
      message: 'Свежий дайджест доступен по ссылке: https://tgmon.app/digest',
    })).toBe('link');

    expect(detectContentType({
      text: 'Переходите в канал t.me/mychannel',
    })).toBe('link');
  });

  it('detects plain text without media or links', () => {
    expect(detectContentType({
      message: 'Обычный текстовый пост без каких-либо ссылок или медиа.',
    })).toBe('text');

    expect(detectContentType({
      text: 'Ещё одна мысль на сегодня',
    })).toBe('text');
  });

  it('handles empty, null, or unexpected message payloads safely', () => {
    expect(detectContentType(null)).toBe('text');
    expect(detectContentType(undefined)).toBe('text');
    expect(detectContentType({})).toBe('text');
    expect(detectContentType({ message: '' })).toBe('text');
  });
});
