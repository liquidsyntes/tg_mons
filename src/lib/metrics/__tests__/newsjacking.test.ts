import { describe, expect, it } from 'vitest';
import {
  buildChannelReactionSpeedSummary,
  detectNewsTopicClusters,
  type NewsjackingSourcePost,
} from '../newsjacking';

const NOW = new Date('2026-11-15T12:00:00.000Z');

function makePost(overrides: Partial<NewsjackingSourcePost> & { id: number; channelId: number; channelTitle: string; publishedAt: string; text: string | null }): NewsjackingSourcePost {
  return {
    messageId: String(1000 + overrides.id),
    channelUsername: `chan_${overrides.channelId}`,
    isMine: false,
    isAd: false,
    views: 5000,
    reactions: 50,
    comments: 10,
    forwards: 20,
    ...overrides,
  };
}

describe('detectNewsTopicClusters & Newsjacking Speed', () => {
  it('returns empty summary for empty input', () => {
    const result = detectNewsTopicClusters([], { windowHours: 48, now: NOW });

    expect(result).toEqual({
      windowHours: 48,
      analyzedPostsCount: 0,
      totalClusters: 0,
      uncoveredByMyChannelCount: 0,
      clusters: [],
      speedLeaderboard: [],
    });
    expect(buildChannelReactionSpeedSummary([])).toEqual([]);
  });

  it('groups multi-channel posts about one news event, excludes ads, boilerplate, old posts and single-channel stories', () => {
    const posts: NewsjackingSourcePost[] = [
      // Cluster 1: Central Bank key rate 21% (3 channels)
      makePost({
        id: 1,
        channelId: 10,
        channelTitle: 'Экономика Сегодня',
        publishedAt: '2026-11-15T08:00:00.000Z',
        text: 'Банк России неожиданно повысил ключевую ставку до 21 процента на внеплановом заседании',
        views: 12000,
        reactions: 180,
        comments: 60,
        forwards: 120, // total engagement = 360 -> ERR = 3.0%
      }),
      makePost({
        id: 2,
        channelId: 20,
        channelTitle: 'Рынки и Деньги',
        publishedAt: '2026-11-15T08:18:00.000Z', // +18 min
        text: 'Срочно: Центробанк поднял ключевую ставку до 21 процента, акции банков перешли к снижению',
        views: 8000,
        reactions: 120,
        comments: 40,
        forwards: 80, // total engagement = 240 -> ERR = 3.0%
      }),
      makePost({
        id: 3,
        channelId: 30,
        channelTitle: 'ФинРазбор',
        isMine: true,
        publishedAt: '2026-11-15T09:20:00.000Z', // +80 min (1h 20m)
        text: 'Разбираем последствия повышения ключевой ставки до 21 процента для вкладов и ипотеки',
        views: 10000,
        reactions: 800,
        comments: 220,
        forwards: 400, // 1420 / 10000 = 14.2% ERR (peak!)
      }),
      // Ad post mentioning same words must be excluded
      makePost({
        id: 4,
        channelId: 40,
        channelTitle: 'Рекламный Вестник',
        isAd: true,
        publishedAt: '2026-11-15T09:30:00.000Z',
        text: 'На фоне повышения ключевой ставки до 21 процента откройте вклад у партнёра @bank_promo',
        views: 9000,
      }),
      // Short boilerplate / service post must be excluded
      makePost({
        id: 5,
        channelId: 40,
        channelTitle: 'Рекламный Вестник',
        publishedAt: '2026-11-15T07:00:00.000Z',
        text: 'Доброе утро!',
      }),
      // Single-channel unique news (Apple M5 only in one channel) must not form a cross-channel cluster
      makePost({
        id: 6,
        channelId: 50,
        channelTitle: 'Железо Про',
        publishedAt: '2026-11-15T10:00:00.000Z',
        text: 'Apple представила обновлённую рабочую станцию Mac Studio на процессоре M5 Ultra для монтажа видео',
        views: 15000,
      }),
      // Out-of-window post (> 48h old) must be excluded when windowHours = 48
      makePost({
        id: 7,
        channelId: 51,
        channelTitle: 'Старый Поток',
        publishedAt: '2026-11-12T06:00:00.000Z',
        text: 'Слухи про новый Mac Studio на процессоре M5 Ultra от Apple подтвердились поставщиками',
        views: 11000,
      }),
    ];

    const result = detectNewsTopicClusters(posts, { windowHours: 48, now: NOW });

    expect(result.analyzedPostsCount).toBe(4);
    expect(result.totalClusters).toBe(1);
    expect(result.uncoveredByMyChannelCount).toBe(0);

    const cluster = result.clusters[0];
    expect(cluster.channelsCount).toBe(3);
    expect(cluster.postsCount).toBe(3);
    expect(cluster.totalViews).toBe(30000);
    expect(cluster.coveredByMyChannel).toBe(true);
    expect(cluster.myChannelDelayMinutes).toBe(80);
    expect(cluster.firstPost.channelId).toBe(10);
    expect(cluster.firstPost.delayMinutes).toBe(0);
    expect(cluster.firstPost.isFirst).toBe(true);
    expect(cluster.peakPost.channelId).toBe(30);
    expect(cluster.peakPost.err).toBe(14.2);
    expect(cluster.peakPost.isPeak).toBe(true);
    expect(cluster.timeline.map((item) => [item.channelId, item.delayMinutes])).toEqual([
      [10, 0],
      [20, 18],
      [30, 80],
    ]);
    // Ads and boilerplate excluded
    expect(cluster.timeline.some((item) => item.postId === 4 || item.postId === 5)).toBe(false);
  });

  it('tracks uncoveredByMyChannel and links direct message citations into the same topic cluster', () => {
    const posts: NewsjackingSourcePost[] = [
      makePost({
        id: 101,
        messageId: '777',
        channelId: 1,
        channelTitle: 'AI Insider',
        channelUsername: 'ai_insider',
        publishedAt: '2026-11-15T10:00:00.000Z',
        text: 'OpenAI официально представила модель GPT-5 с поддержкой автономных агентов для разработчиков',
        views: 20000,
        reactions: 400,
        comments: 50,
        forwards: 150, // 3.0% ERR
      }),
      makePost({
        id: 102,
        channelId: 2,
        channelTitle: 'НейроДайджест',
        channelUsername: 'neuro_digest',
        publishedAt: '2026-11-15T10:45:00.000Z',
        text: 'Коллеги уже разобрали релиз: подтверждаем доступность нового инструмента https://t.me/ai_insider/777',
        views: 6000,
        reactions: 180,
        comments: 30,
        forwards: 90, // 5.0% ERR
        mentions: [
          {
            type: 'mention',
            targetUsername: 'ai_insider',
            targetMessageId: '777',
          },
        ],
      }),
      makePost({
        id: 103,
        channelId: 3,
        channelTitle: 'Мой Канал',
        isMine: true,
        publishedAt: '2026-11-15T11:00:00.000Z',
        text: 'Выбираем лучшие горячие клавиши и плагины для редактора кода в осеннем обновлении',
        views: 4000,
      }),
    ];

    const result = detectNewsTopicClusters(posts, { windowHours: 24, now: NOW });

    expect(result.totalClusters).toBe(1);
    expect(result.uncoveredByMyChannelCount).toBe(1);
    const cluster = result.clusters[0];
    expect(cluster.coveredByMyChannel).toBe(false);
    expect(cluster.myChannelDelayMinutes).toBeNull();
    expect(cluster.timeline.map((t) => [t.postId, t.delayMinutes])).toEqual([
      [101, 0],
      [102, 45],
    ]);
    expect(cluster.peakPost.postId).toBe(102);
  });

  it('builds channel reaction speed leaderboard across multiple clusters without penalizing follow-up posts', () => {
    const posts: NewsjackingSourcePost[] = [
      // Topic A: Claude 4 launch (Channel 1 first at 08:00, Channel 2 +30m, Channel 1 follow-up +120m)
      makePost({
        id: 201,
        channelId: 1,
        channelTitle: 'Alpha Tech',
        publishedAt: '2026-11-15T08:00:00.000Z',
        text: 'Anthropic выпустила семейство моделей Claude-4 с расширенным контекстом для кода',
        views: 10000,
        reactions: 300,
        comments: 40,
        forwards: 60, // 4% ERR
      }),
      makePost({
        id: 202,
        channelId: 2,
        channelTitle: 'Beta Media',
        publishedAt: '2026-11-15T08:30:00.000Z', // +30m
        text: 'Анонсирована новая модель Claude-4 от Anthropic для корпоративного программирования',
        views: 15000,
        reactions: 900,
        comments: 100,
        forwards: 200, // 8% ERR (peak)
      }),
      makePost({
        id: 203,
        channelId: 1,
        channelTitle: 'Alpha Tech',
        publishedAt: '2026-11-15T10:00:00.000Z', // +120m follow-up by Ch1
        text: 'Дополнительные бенчмарки модели Claude-4 от Anthropic показывают прирост точности',
        views: 5000,
        reactions: 100,
        comments: 10,
        forwards: 15,
      }),
      // Topic B: TON Wallet update (Channel 1 first at 09:00, Channel 2 +10m)
      makePost({
        id: 204,
        channelId: 1,
        channelTitle: 'Alpha Tech',
        publishedAt: '2026-11-15T09:00:00.000Z',
        text: 'Telegram запустил мгновенные переводы стейблкоинов USDT в встроенном кошельке TON Wallet',
        views: 18000,
        reactions: 1000,
        comments: 200,
        forwards: 600, // 10% ERR (peak)
      }),
      makePost({
        id: 205,
        channelId: 2,
        channelTitle: 'Beta Media',
        publishedAt: '2026-11-15T09:10:00.000Z', // +10m
        text: 'Встроенный кошелёк TON Wallet в Telegram получил мгновенные переводы USDT без комиссий',
        views: 9000,
        reactions: 180,
        comments: 20,
        forwards: 70, // 3% ERR
      }),
    ];

    const result = detectNewsTopicClusters(posts, { windowHours: 48, now: NOW });

    expect(result.totalClusters).toBe(2);
    expect(result.speedLeaderboard).toHaveLength(2);

    const leader = result.speedLeaderboard[0];
    expect(leader.channelId).toBe(1);
    expect(leader.firstCount).toBe(2);
    expect(leader.topicsCovered).toBe(2);
    expect(leader.peakCount).toBe(1);
    // Earliest reaction on Topic A is 0m (follow-up at 120m does not dilute speed)
    expect(leader.medianDelayMinutes).toBe(0);
    expect(leader.avgDelayMinutes).toBe(0);

    const runnerUp = result.speedLeaderboard[1];
    expect(runnerUp.channelId).toBe(2);
    expect(runnerUp.firstCount).toBe(0);
    expect(runnerUp.topicsCovered).toBe(2);
    expect(runnerUp.peakCount).toBe(1);
    expect(runnerUp.medianDelayMinutes).toBe(20); // median([10, 30])
    expect(runnerUp.avgDelayMinutes).toBe(20);
  });

  it('respects minChannels option and 72h vs 24h windows', () => {
    const posts: NewsjackingSourcePost[] = [
      makePost({
        id: 301,
        channelId: 1,
        channelTitle: 'Ch 1',
        publishedAt: '2026-11-13T10:00:00.000Z', // 50h before NOW
        text: 'Комиссия SEC утвердила новые правила раскрытия отчётности криптовалютных бирж',
      }),
      makePost({
        id: 302,
        channelId: 2,
        channelTitle: 'Ch 2',
        publishedAt: '2026-11-13T10:25:00.000Z',
        text: 'Новые правила раскрытия отчётности криптовалютных бирж утверждены комиссией SEC',
      }),
    ];

    const res48 = detectNewsTopicClusters(posts, { windowHours: 48, now: NOW });
    expect(res48.totalClusters).toBe(0);

    const res72 = detectNewsTopicClusters(posts, { windowHours: 72, now: NOW });
    expect(res72.totalClusters).toBe(1);

    const resStrict3 = detectNewsTopicClusters(posts, { windowHours: 72, now: NOW, minChannels: 3 });
    expect(resStrict3.totalClusters).toBe(0);
  });

  it('does not merge unrelated stories sharing a single generic word and breaks peakPost ties by views when ERR is null', () => {
    const posts: NewsjackingSourcePost[] = [
      makePost({
        id: 401,
        channelId: 1,
        channelTitle: 'Ch 1',
        publishedAt: '2026-11-15T08:00:00.000Z',
        text: 'Компания Microsoft представила крупное обновление офисного пакета для корпоративных пользователей',
        views: 1200,
      }),
      makePost({
        id: 402,
        channelId: 2,
        channelTitle: 'Ch 2',
        publishedAt: '2026-11-15T08:15:00.000Z',
        text: 'Компания Apple представила линейку мониторов Studio Display с повышенной яркостью экрана',
        views: 1800,
      }),
      // Matching topic without views (avgErr -> null, peakPost -> highest views/earliest)
      makePost({
        id: 403,
        channelId: 3,
        channelTitle: 'Ch 3',
        publishedAt: '2026-11-15T09:00:00.000Z',
        text: 'Крупная утечка паролей сервиса CloudVault затронула три миллиона учётных записей',
        views: null,
        reactions: null,
        comments: null,
        forwards: null,
      }),
      makePost({
        id: 404,
        channelId: 4,
        channelTitle: 'Ch 4',
        publishedAt: '2026-11-15T09:20:00.000Z',
        text: 'Подтверждена утечка паролей пользователей CloudVault и сброс три миллионов сессий',
        views: 9500,
        reactions: 0,
        comments: 0,
        forwards: 0,
      }),
    ];

    const result = detectNewsTopicClusters(posts, { windowHours: 24, now: NOW });

    expect(result.totalClusters).toBe(1);
    expect(result.clusters[0].timeline.map((t) => t.postId)).toEqual([403, 404]);
    expect(result.clusters[0].peakPost.postId).toBe(404);
    expect(result.clusters[0].avgErr).toBe(0);
  });
});
