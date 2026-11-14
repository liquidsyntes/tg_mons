import { describe, expect, it } from 'vitest';
import {
  calculateTextSimilarity,
  clusterAdCreatives,
  extractCreativeAdvertisers,
  normalizeCreativeText,
} from '../ad-creatives';
import type { AdCreativePostItem } from '@/lib/types';

function makePost(overrides: Partial<AdCreativePostItem> = {}): AdCreativePostItem {
  return {
    id: 1,
    channel: {
      id: 10,
      title: 'Tech Channel',
      username: 'techchannel',
      niche: 'tech',
    },
    publishedAt: '2026-11-10T10:00:00.000Z',
    text: 'Новый курс по аналитике данных для продакт-менеджеров! Скидка 30% по ссылке https://school.example.com/data?utm_source=tgmon&utm_campaign=ch1 @edu_promo #реклама',
    views: 2000,
    er: 12.5,
    err: 3.5,
    reactions: 40,
    comments: 10,
    forwards: 20,
    mentions: ['edu_promo'],
    ...overrides,
  };
}

describe('ad-creatives metrics', () => {
  it('normalizes URLs, UTM tags, mentions, hashtags, emojis, and punctuation', () => {
    const raw =
      '🚀 Супер-скидка на облачный сервер! Переходи 👉 https://cloud.example.org/offer?utm_source=tg&utm_medium=cpm или t.me/cloud_bot @cloud_promo #ads #ёлка';
    expect(normalizeCreativeText(raw)).toBe(
      'супер скидка на облачный сервер переходи или',
    );
    expect(normalizeCreativeText(null)).toBe('');
    expect(normalizeCreativeText('   ')).toBe('');
  });

  it('computes high similarity for identical copy with different tracking links and low similarity for unrelated copy', () => {
    const variantA =
      '🔥 Автоматизация маркетинга в Telegram: экономьте 10 часов в неделю. Подробности: https://tool.example.com/?utm_source=chan_a&utm_content=1 @martech_bot';
    const variantB =
      'Автоматизация маркетинга в Telegram - экономьте 10 часов в неделю! Подробности тут t.me/martech_bot?start=chan_b';
    const unrelated =
      'Свежая фермерская клубника с доставкой за 2 часа по Киеву, заказ через приложение @berry_delivery';

    expect(calculateTextSimilarity(variantA, variantB)).toBe(1);
    expect(
      calculateTextSimilarity(
        variantA,
        'Автоматизация маркетинга в Telegram: экономьте 10 часов в неделю. Получите демо сегодня https://tool.example.com/?utm_source=c3',
      ),
    ).toBeGreaterThanOrEqual(0.5);
    expect(calculateTextSimilarity(variantA, unrelated)).toBeLessThan(0.25);
    expect(calculateTextSimilarity(null, variantA)).toBe(0);
  });

  it('extracts advertiser handles and external domains while ignoring Telegram hosts', () => {
    const text =
      'Читайте подробнее на https://www.finance.example.com/promo?utm_source=tg и в нашем канале t.me/fin_hub или @fin_bot https://telegra.ph/Guide-11-10';
    expect(extractCreativeAdvertisers(text, ['Fin_Hub'])).toEqual([
      '@fin_hub',
      '@fin_bot',
      'finance.example.com',
    ]);
  });

  it('clusters repeated ad creatives across channels and aggregates performance metrics', () => {
    const posts: AdCreativePostItem[] = [
      makePost({
        id: 1,
        channel: { id: 10, title: 'Канал Альфа', username: 'alpha', niche: 'tech' },
        publishedAt: '2026-11-08T09:00:00.000Z',
        views: 1500,
        er: 10.0,
        err: 2.0,
        text: 'Откройте ИИ-ассистент для аналитики Telegram-каналов уже сегодня. Пробный доступ по ссылке https://ai-tg.example.com/start?utm_source=alpha @aitg_app',
        mentions: ['aitg_app'],
      }),
      makePost({
        id: 2,
        channel: { id: 11, title: 'Канал Бета', username: 'beta', niche: 'marketing' },
        publishedAt: '2026-11-10T14:00:00.000Z',
        views: 3500,
        er: 14.0,
        err: 6.0,
        text: 'Откройте ИИ-ассистент для аналитики Telegram-каналов уже сегодня! Пробный доступ: https://ai-tg.example.com/start?utm_source=beta @aitg_app',
        mentions: ['aitg_app'],
      }),
      makePost({
        id: 3,
        channel: { id: 10, title: 'Канал Альфа', username: 'alpha', niche: 'tech' },
        publishedAt: '2026-11-12T11:00:00.000Z',
        views: 1000,
        er: 8.0,
        err: 4.0,
        text: 'Откройте ИИ-ассистент для аналитики Telegram-каналов уже сегодня. Пробный доступ по ссылке https://ai-tg.example.com/start?utm_source=alpha_repost @aitg_app',
        mentions: ['aitg_app'],
      }),
      makePost({
        id: 4,
        channel: { id: 12, title: 'Канал Гамма', username: 'gamma', niche: 'finance' },
        publishedAt: '2026-11-11T16:00:00.000Z',
        views: 9000,
        er: 18.0,
        err: 5.5,
        text: 'Инвестиционный портфель без комиссий для начинающих инвесторов на весь ноябрь https://broker.example.net/bonus @invest_broker',
        mentions: ['invest_broker'],
      }),
    ];

    const byPlacements = clusterAdCreatives(posts, { sortBy: 'placementsCount' });
    expect(byPlacements).toHaveLength(2);

    const repeated = byPlacements[0];
    expect(repeated.placementsCount).toBe(3);
    expect(repeated.uniqueChannelsCount).toBe(2);
    expect(repeated.totalViews).toBe(6000);
    expect(repeated.avgViews).toBe(2000);
    expect(repeated.avgEr).toBe(10.67);
    expect(repeated.avgErr).toBe(4);
    expect(repeated.maxErr).toBe(6);
    expect(repeated.firstSeenAt).toBe('2026-11-08T09:00:00.000Z');
    expect(repeated.lastSeenAt).toBe('2026-11-12T11:00:00.000Z');
    expect(repeated.bestPlacement?.id).toBe(2);
    expect(repeated.bestPlacement?.channel.title).toBe('Канал Бета');
    expect(repeated.advertisers).toContain('@aitg_app');
    expect(repeated.advertisers).toContain('ai-tg.example.com');
    expect(repeated.clusterId).toMatch(/^cr_/);

    const byTotalViews = clusterAdCreatives(posts, { sortBy: 'totalViews' });
    expect(byTotalViews[0].placementsCount).toBe(1);
    expect(byTotalViews[0].totalViews).toBe(9000);

    const byAvgErr = clusterAdCreatives(posts, { sortBy: 'avgErr' });
    expect(byAvgErr[0].avgErr).toBe(5.5);
  });

  it('handles null metric values safely without NaN', () => {
    const clusters = clusterAdCreatives([
      makePost({
        id: 99,
        views: null,
        er: null,
        err: null,
        reactions: null,
        comments: null,
        forwards: null,
        text: null,
        mentions: ['solo_brand'],
      }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].totalViews).toBe(0);
    expect(clusters[0].avgViews).toBe(0);
    expect(clusters[0].avgEr).toBe(0);
    expect(clusters[0].avgErr).toBe(0);
    expect(clusters[0].maxErr).toBe(0);
    expect(clusters[0].advertisers).toEqual(['@solo_brand']);
  });
});
