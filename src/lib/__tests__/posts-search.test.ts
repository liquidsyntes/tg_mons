import { describe, expect, it } from 'vitest';
import { parsePostSearchParams } from '../posts-search';

const parse = (query: string) => parsePostSearchParams(new URLSearchParams(query));

describe('parsePostSearchParams', () => {
  it('keeps global defaults and accepts boundary values', () => {
    expect(parse('')).toMatchObject({ legacy: false, days: 30, limit: 20, offset: 0, sortBy: 'publishedAt' });
    expect(parse('days=90&limit=50&offset=100000')).toMatchObject({
      legacy: false, days: 90, limit: 50, offset: 100000,
    });
  });

  it('preserves legacy detection, date filters and old sort names', () => {
    const legacy = parse('channelId=7&sortBy=date&type=ads&dateFrom=2026-10-01&dateTo=2026-10-31&minViews=0&maxViews=100');
    expect(legacy).toMatchObject({
      legacy: true, channelId: 7, days: null, limit: 15, sortBy: 'publishedAt', type: 'ads',
      minViews: 0, maxViews: 100,
    });
    expect(legacy?.dateFrom?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(legacy?.dateTo?.getHours()).toBe(23);
    expect(parse('channelId=7&sortBy=views_desc&onlyViral=true')).toMatchObject({
      legacy: true, sortBy: 'views', onlyViral: true,
    });
    expect(parse('channelId=7&sortBy=er')).toMatchObject({ legacy: false, days: 30, sortBy: 'er' });
  });

  it('normalizes the advertiser and trims search text', () => {
    expect(parse('advertiser=%40BrAnD&q=%20test%20&onlyAds=false&onlySaved=true')).toMatchObject({
      advertiser: 'brand', q: 'test', onlyAds: false, onlySaved: true,
    });
  });

  it('parses includeCreatives and creativesSortBy flags', () => {
    expect(parse('onlyAds=true&includeCreatives=true&creativesSortBy=avgErr')).toMatchObject({
      onlyAds: true, includeCreatives: true, creativesSortBy: 'avgErr',
    });
    expect(parse('onlyAds=true&includeCreatives=1&creativesSortBy=totalViews')).toMatchObject({
      onlyAds: true, includeCreatives: true, creativesSortBy: 'totalViews',
    });
  });

  it.each([
    'channelId=0', 'channelId=1.5', 'channelId=9007199254740992',
    `q=${'x'.repeat(201)}`, `niche=${'x'.repeat(65)}`, `tag=${'x'.repeat(31)}`,
    'onlyAds=yes', 'onlyViral=1', 'onlySaved=TRUE', 'advertiser=abc', 'advertiser=%40bad!',
    'includeCreatives=yes', 'creativesSortBy=invalid',
    'days=3', 'limit=0', 'limit=51', 'offset=-1', 'offset=100001',
    'channelId=7&dateFrom=2026-02-30', 'channelId=7&dateFrom=2026-11-02&dateTo=2026-11-01',
    'channelId=7&minViews=-1', 'channelId=7&minViews=10&maxViews=9',
    'channelId=7&type=unknown', 'sortBy=unknown',
    'channelId=7&onlyAds=true&type=partners',
  ])('rejects invalid or incompatible input: %s', query => {
    expect(parse(query)).toBeNull();
  });
});
