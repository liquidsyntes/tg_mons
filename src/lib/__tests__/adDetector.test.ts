import { describe, it, expect } from 'vitest';
import { detectAd } from '@/lib/adDetector';

describe('detectAd', () => {
  it('detects ad post with keyword "реклама"', () => {
    const result = detectAd('Это реклама нового курса! Переходи по ссылке.');
    expect(result.isAd).toBe(true);
    expect(result.label).toBe('ad');
    expect(result.confidence).toMatch(/high|medium/);
  });

  it('detects ad with hashtag #ad', () => {
    const result = detectAd('Проверьте этот сервис #ad');
    expect(result.isAd).toBe(true);
  });

  it('detects partner post with partner keywords', () => {
    const result = detectAd('Это партнёрский материал от канала XYZ.');
    expect(result.isPartner).toBe(true);
    expect(result.label).toBe('partner');
  });

  it('returns none for regular post', () => {
    const result = detectAd('Сегодня обсудим новые тренды в разработке. Rust набирает популярность.');
    expect(result.isAd).toBe(false);
    expect(result.isPartner).toBe(false);
    expect(result.label).toBe('none');
  });

  it('returns none for empty text', () => {
    const result = detectAd('');
    expect(result.label).toBe('none');
    expect(result.signals).toEqual([]);
  });

  it('returns none for null text', () => {
    const result = detectAd(null);
    expect(result.label).toBe('none');
    expect(result.isAd).toBe(false);
  });

  it('detects ad with ERID marker', () => {
    const result = detectAd('Спонсорская интеграция. erid: 12345');
    expect(result.isAd).toBe(true);
  });

  it('detects ad with UTM parameters', () => {
    const result = detectAd('Посетите https://example.com?utm_source=telegram');
    expect(result.signals).toContainEqual(expect.stringContaining('UTM'));
  });
});
