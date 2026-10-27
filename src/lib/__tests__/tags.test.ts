import { describe, expect, it } from 'vitest';
import {
  normalizeChannelTags,
  summarizeChannelTags,
  channelHasTag,
  MAX_CHANNEL_TAGS,
  MAX_CHANNEL_TAG_LENGTH,
} from '../tags';

describe('normalizeChannelTags', () => {
  it('trims whitespace, removes empty strings, and deduplicates case-insensitively', () => {
    expect(
      normalizeChannelTags(['  Конкуренты ', '', '   ', 'конкуренты', 'Реклама', 'РЕКЛАМА'])
    ).toEqual(['Конкуренты', 'Реклама']);
  });

  it('returns an empty array for an empty or whitespace-only input array', () => {
    expect(normalizeChannelTags([])).toEqual([]);
    expect(normalizeChannelTags(['', '   '])).toEqual([]);
  });

  it('rejects non-arrays and arrays with non-string items', () => {
    expect(normalizeChannelTags(null)).toBeNull();
    expect(normalizeChannelTags('Конкуренты')).toBeNull();
    expect(normalizeChannelTags([123])).toBeNull();
    expect(normalizeChannelTags(['ok', null])).toBeNull();
  });

  it('rejects tags longer than MAX_CHANNEL_TAG_LENGTH', () => {
    const valid = 'а'.repeat(MAX_CHANNEL_TAG_LENGTH);
    const tooLong = 'а'.repeat(MAX_CHANNEL_TAG_LENGTH + 1);
    expect(normalizeChannelTags([valid])).toEqual([valid]);
    expect(normalizeChannelTags([tooLong])).toBeNull();
  });

  it('rejects more than MAX_CHANNEL_TAGS unique tags', () => {
    const tenTags = Array.from({ length: MAX_CHANNEL_TAGS }, (_, i) => `Тег ${i + 1}`);
    const elevenTags = [...tenTags, 'Лишний'];
    expect(normalizeChannelTags(tenTags)).toEqual(tenTags);
    expect(normalizeChannelTags([...tenTags, 'тег 1'])).toEqual(tenTags);
    expect(normalizeChannelTags(elevenTags)).toBeNull();
  });
});

describe('summarizeChannelTags & channelHasTag', () => {
  it('aggregates unique tags across channels and sorts by count descending', () => {
    const channels = [
      { tags: ['Конкуренты', 'Крипто'] },
      { tags: ['конкуренты', 'Новости'] },
      { tags: ['Конкуренты'] },
    ];
    expect(summarizeChannelTags(channels)).toEqual([
      { tag: 'Конкуренты', count: 3 },
      { tag: 'Крипто', count: 1 },
      { tag: 'Новости', count: 1 },
    ]);
  });

  it('matches channel tags case-insensitively', () => {
    expect(channelHasTag(['Конкуренты', 'VIP'], 'конкуренты')).toBe(true);
    expect(channelHasTag(['Конкуренты', 'VIP'], 'vip')).toBe(true);
    expect(channelHasTag(['Конкуренты'], 'Новости')).toBe(false);
    expect(channelHasTag([], 'Конкуренты')).toBe(false);
  });
});
