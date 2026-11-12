import { describe, expect, it } from 'vitest';
import {
  calculatePostLengthAnalytics,
  classifyPostLengthBucket,
  detectPostStructureSignals,
} from '../post-length';

describe('classifyPostLengthBucket', () => {
  it('classifies empty, short, medium and long texts accurately', () => {
    expect(classifyPostLengthBucket(null)).toEqual({
      bucket: 'media_only',
      charCount: 0,
      trimmed: '',
    });
    expect(classifyPostLengthBucket('   \n\t  ')).toEqual({
      bucket: 'media_only',
      charCount: 0,
      trimmed: '',
    });
    expect(classifyPostLengthBucket('а'.repeat(300)).bucket).toBe('short');
    expect(classifyPostLengthBucket('а'.repeat(301)).bucket).toBe('medium');
    expect(classifyPostLengthBucket('а'.repeat(1000)).bucket).toBe('medium');
    expect(classifyPostLengthBucket('а'.repeat(1001)).bucket).toBe('long');
  });
});

describe('detectPostStructureSignals', () => {
  it('detects question hook, numbers in lead, and structured paragraphs or lists', () => {
    expect(detectPostStructureSignals('')).toEqual([]);
    expect(detectPostStructureSignals('Почему растёт охват в 2026 году?')).toEqual([
      'question_hook',
      'numbers_hook',
    ]);
    expect(
      detectPostStructureSignals('Первый абзац\nВторой абзац\nТретий абзац')
    ).toEqual(['structured_body']);
    expect(
      detectPostStructureSignals('Короткий заголовок\n- Пункт первый')
    ).toEqual(['structured_body']);
  });
});

describe('calculatePostLengthAnalytics', () => {
  it('returns empty structure when no posts are provided', () => {
    expect(calculatePostLengthAnalytics([])).toEqual({
      totalPosts: 0,
      textPostsCount: 0,
      avgTextLength: null,
      items: [],
      leaders: { byErr: null, byViews: null },
      signals: [],
    });
  });

  it('aggregates metrics, leaders and structure signals across length buckets', () => {
    const shortQuestion1 = 'Как вырасти на 25% за неделю?\nРазбираем шаги.';
    const shortQuestion2 = 'Что изменилось за 7 дней?\nКраткая сводка.';
    const longArticle1 = `${'Абзац один.\nАбзац два.\nАбзац три.\n'}${'текст '.repeat(200)}`;
    const longArticle2 = `${'1. Первый тезис\n2. Второй тезис\n'}${'детали '.repeat(180)}`;

    const result = calculatePostLengthAnalytics([
      {
        text: null,
        views: 200,
        reactions: 4,
        comments: 0,
        forwards: 0,
        subscribersAtPublish: 1000,
      },
      {
        text: shortQuestion1,
        views: 400,
        reactions: 30,
        comments: 6,
        forwards: 4,
        subscribersAtPublish: 1000,
      },
      {
        text: shortQuestion2,
        views: 600,
        reactions: 45,
        comments: 9,
        forwards: 6,
        subscribersAtPublish: 1000,
      },
      {
        text: longArticle1,
        views: 800,
        reactions: 24,
        comments: 8,
        forwards: 8,
        subscribersAtPublish: 1000,
      },
      {
        text: longArticle2,
        views: 1000,
        reactions: 30,
        comments: 10,
        forwards: 10,
        subscribersAtPublish: 1000,
      },
    ]);

    expect(result.totalPosts).toBe(5);
    expect(result.textPostsCount).toBe(4);
    expect(result.avgTextLength).toBeGreaterThan(300);
    expect(result.items.map((item) => item.bucket)).toEqual([
      'media_only',
      'short',
      'long',
    ]);

    const shortBucket = result.items.find((item) => item.bucket === 'short');
    expect(shortBucket).toMatchObject({
      postsCount: 2,
      sharePercent: 40,
      avgViews: 500,
      medianViews: 500,
      avgErr: 10,
      avgEr: 55,
      avgForwards: 5,
      avgComments: 7.5,
    });

    // Both short and long have >= 2 posts; media_only has 1 post and is excluded from leaders
    expect(result.leaders).toEqual({
      byErr: 'short',
      byViews: 'long',
    });

    expect(result.signals.map((s) => s.signal)).toEqual([
      'question_hook',
      'numbers_hook',
      'structured_body',
    ]);
    const questionSignal = result.signals.find(
      (s) => s.signal === 'question_hook'
    );
    expect(questionSignal).toMatchObject({
      postsCount: 2,
      sharePercent: 50,
      avgViews: 500,
      avgErr: 10,
    });
  });

  it('preserves null views vs zero views and uses fallbackSubscribers when needed', () => {
    const result = calculatePostLengthAnalytics(
      [
        {
          text: 'Пост без известных просмотров',
          views: null,
          reactions: null,
          comments: null,
          forwards: null,
          subscribersAtPublish: null,
        },
      ],
      1000
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      bucket: 'short',
      postsCount: 1,
      avgViews: null,
      medianViews: null,
      avgErr: null,
      avgEr: 0,
    });
    expect(result.leaders).toEqual({ byErr: null, byViews: null });
  });
});
