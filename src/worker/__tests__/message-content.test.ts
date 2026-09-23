import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { readMessageContent } from '../message-content';
import { logger } from '../../lib/logger';

vi.mock('../fetcher', () => ({
  withRateLimitAndRetry: (fn: () => Promise<unknown>) => fn(),
  withTimeout: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../../lib/logger', () => ({ logger: { warn: vi.fn() } }));

const text = (value: string) => new Api.TextPlain({ text: value });
const paragraph = (value: string) => new Api.PageBlockParagraph({ text: text(value) });
const article = (blocks: Api.TypePageBlock[], part = false) => new Api.RichMessage({
  blocks, part, photos: [], documents: [],
});
const context = { channelId: 1, messageId: 12 };

describe('Telegram message content', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps ordinary captions and does not request article content', async () => {
    const load = vi.fn();
    expect(await readMessageContent({ message: ' обычный пост ' }, load, context))
      .toEqual({ text: ' обычный пост ', available: true });
    expect(load).not.toHaveBeenCalled();
    expect(await readMessageContent({ message: '  ' }, load, context))
      .toEqual({ text: null, available: true });
  });

  it('extracts article paragraphs, nested formatting, lists, tables and media captions', async () => {
    const richMessage = article([
      new Api.PageBlockTitle({ text: text('Заголовок') }),
      new Api.PageBlockParagraph({ text: new Api.TextBold({ text: text('Абзац') }) }),
      new Api.PageBlockList({ items: [new Api.PageListItemText({ text: text('Пункт') })] }),
      new Api.PageBlockTable({ title: text('Таблица'), rows: [new Api.PageTableRow({ cells: [
        new Api.PageTableCell({ text: text('Ячейка') }),
      ] })] }),
      new Api.PageBlockDetails({ title: text('Подробнее'), blocks: [paragraph('Скрытый абзац')] }),
      new Api.PageBlockPhoto({ photoId: bigInt(1), caption: new Api.PageCaption({ text: text('Подпись'), credit: text('Автор') }) }),
    ]);
    const result = await readMessageContent({ message: '', richMessage }, vi.fn(), context);
    expect(result.available).toBe(true);
    for (const expected of ['Заголовок', 'Абзац', 'Пункт', 'Таблица', 'Ячейка', 'Подробнее', 'Скрытый абзац', 'Подпись', 'Автор']) {
      expect(result.text).toContain(expected);
    }
    expect(result.text).toContain('\n');
  });

  it('loads the full article instead of saving the partial preview', async () => {
    const load = vi.fn().mockResolvedValue({ message: '', richMessage: article([paragraph('Полный текст')]) });
    const result = await readMessageContent({ message: '', richMessage: article([paragraph('Превью')], true) }, load, context);
    expect(result).toEqual({ text: 'Полный текст', available: true });
    expect(load).toHaveBeenCalledOnce();
  });

  it.each(['missing', 'partial', 'error'])('does not overwrite stored content when full article is %s', async (mode) => {
    const load = mode === 'error'
      ? vi.fn().mockRejectedValue(new Error('sensitive payload'))
      : vi.fn().mockResolvedValue(mode === 'partial' ? { message: '', richMessage: article([], true) } : undefined);
    expect(await readMessageContent({ message: '', richMessage: article([paragraph('Превью')], true) }, load, context))
      .toEqual({ text: null, available: false });
    expect(logger.warn).toHaveBeenCalledWith('Could not read complete Telegram article', context);
  });

  it('handles malformed blocks without exposing their contents', async () => {
    const richMessage = article([]);
    Object.defineProperty(richMessage, 'blocks', { get: () => { throw new Error('private content'); } });
    expect(await readMessageContent({ message: '', richMessage }, vi.fn(), context)).toEqual({ text: null, available: false });
  });

  it('distinguishes unsupported messages from media without captions', async () => {
    expect(await readMessageContent({ message: '', media: new Api.MessageMediaUnsupported() }, vi.fn(), context))
      .toEqual({ text: null, available: false });
    expect(await readMessageContent({ message: '', richMessage: article([]) }, vi.fn(), context))
      .toEqual({ text: null, available: true });
  });
});
