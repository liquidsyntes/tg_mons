import { describe, expect, it } from 'vitest';
import { isClearlyEventDigest } from '../digest';

describe('isClearlyEventDigest', () => {
  it.each([
    '#дайджест\nФестиваль 12.10\nЛекция 15.10',
    'Підбірка:\nЗустріч 12.10\nКонцерт 15.10',
    'Digest: concert 12.10, workshop 15.10',
  ])('recognizes an explicit roundup heading', text => {
    expect(isClearlyEventDigest(text)).toBe(true);
  });

  it('recognizes a link-rich roundup without a heading', () => {
    const text = '12.10 Концерт https://t.me/example_a/1\n15.10 Лекция https://t.me/example_b/2\n18.10 Встреча https://t.me/example_c/3';
    expect(isClearlyEventDigest(text)).toBe(true);
  });

  it('does not reject a single event or its multi-day program', () => {
    expect(isClearlyEventDigest('Фестиваль 12-14 октября: три дня программы, билеты по ссылке.')).toBe(false);
    expect(isClearlyEventDigest('Сегодня обсуждаем дайджест новостей на встрече 12.10.')).toBe(false);
    expect(isClearlyEventDigest('12.10 лекция, 13.10 мастер-класс, 14.10 практика в программе одного фестиваля.')).toBe(false);
  });

  it('handles missing text', () => {
    expect(isClearlyEventDigest(null)).toBe(false);
    expect(isClearlyEventDigest('')).toBe(false);
  });
});
