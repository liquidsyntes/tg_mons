import { describe, it, expect } from 'vitest';
import {
  detectSilencePeriods,
  calculateSilenceStatus,
  type SilencePostInput,
} from '../silence';

describe('detectSilencePeriods', () => {
  const now = new Date('2026-10-23T12:00:00.000Z');
  const MS_DAY = 24 * 3600 * 1000;

  // 1. Канал с регулярными постами (нет пауз)
  it('канал с регулярными постами (нет пауз): возвращает пустой список пауз и статус "активен"', () => {
    // Посты публикуются каждые 1-2 дня на протяжении 90 дней, последний пост вчера (1 день назад)
    const posts: SilencePostInput[] = [];
    for (let day = 89; day >= 1; day -= 2) {
      posts.push({
        publishedAt: new Date(now.getTime() - day * MS_DAY),
      });
    }

    const result = detectSilencePeriods({ posts }, { now, maxGapDays: 7, periodDays: 90 });

    expect(result.status).toBe('активен');
    expect(result.periods).toEqual([]);
    expect(result.daysSinceLastPost).toBe(1);
    expect(result.lastPostAt).toBe(new Date(now.getTime() - 1 * MS_DAY).toISOString());
  });

  // 2. Канал с одной длинной паузой
  it('канал с одной длинной паузой: находит паузу и определяет статус', () => {
    // Посты публиковались до 50 дней назад, затем пауза 20 дней (до 30 дней назад),
    // затем регулярные посты вплоть до 1 дня назад.
    const posts: SilencePostInput[] = [
      { publishedAt: new Date(now.getTime() - 70 * MS_DAY) },
      { publishedAt: new Date(now.getTime() - 50 * MS_DAY) }, // Пауза от -50d до -30d = 20 дней (> 7)
      { publishedAt: new Date(now.getTime() - 30 * MS_DAY) },
      { publishedAt: new Date(now.getTime() - 15 * MS_DAY) }, // 15 дней (> 7)
      { publishedAt: new Date(now.getTime() - 1 * MS_DAY) },  // 14 дней (> 7)
    ];

    // Проверяем с одной конкретной длинной паузой
    const postsWithSinglePause: SilencePostInput[] = [
      { publishedAt: new Date(now.getTime() - 60 * MS_DAY) },
      { publishedAt: new Date(now.getTime() - 40 * MS_DAY) }, // Пауза 20 дней
      { publishedAt: new Date(now.getTime() - 35 * MS_DAY) }, // 5 дней (<= 7)
      { publishedAt: new Date(now.getTime() - 30 * MS_DAY) }, // 5 дней
      { publishedAt: new Date(now.getTime() - 25 * MS_DAY) }, // 5 дней
      { publishedAt: new Date(now.getTime() - 20 * MS_DAY) }, // 5 дней
      { publishedAt: new Date(now.getTime() - 15 * MS_DAY) }, // 5 дней
      { publishedAt: new Date(now.getTime() - 10 * MS_DAY) }, // 5 дней
      { publishedAt: new Date(now.getTime() - 5 * MS_DAY) },  // 5 дней
      { publishedAt: new Date(now.getTime() - 1 * MS_DAY) },  // 4 дня (<= 7)
    ];

    const result = detectSilencePeriods(postsWithSinglePause, { now, maxGapDays: 7, periodDays: 90 });

    expect(result.status).toBe('активен');
    expect(result.periods.length).toBe(1);
    expect(result.periods[0].durationDays).toBe(20);
    expect(result.periods[0].startDate).toBe(new Date(now.getTime() - 60 * MS_DAY).toISOString());
    expect(result.periods[0].endDate).toBe(new Date(now.getTime() - 40 * MS_DAY).toISOString());
  });

  // 3. Канал без единого поста за весь период
  it('канал без единого поста за весь период: статус "молчит" и период тишины равен 90 дням', () => {
    const result = detectSilencePeriods({ posts: [] }, { now, maxGapDays: 7, periodDays: 90 });

    expect(result.status).toBe('молчит');
    expect(result.periods.length).toBe(1);
    expect(result.periods[0].durationDays).toBe(90);
    expect(result.periods[0].startDate).toBe(new Date(now.getTime() - 90 * MS_DAY).toISOString());
    expect(result.periods[0].endDate).toBe(now.toISOString());
    expect(result.daysSinceLastPost).toBeNull();
    expect(result.lastPostAt).toBeNull();
  });

  // 4. Проверка статуса "замедлился" (3-7 дней с последнего поста)
  it('канал замедлился: последний пост был 5 дней назад', () => {
    const posts: SilencePostInput[] = [
      { publishedAt: new Date(now.getTime() - 10 * MS_DAY) },
      { publishedAt: new Date(now.getTime() - 5 * MS_DAY) },
    ];

    const result = detectSilencePeriods(posts, { now });
    expect(result.status).toBe('замедлился');
    expect(result.daysSinceLastPost).toBe(5);
  });

  // 5. Проверка статуса "молчит" (> 7 дней с последнего поста)
  it('канал молчит: последний пост был 12 дней назад', () => {
    const posts: SilencePostInput[] = [
      { publishedAt: new Date(now.getTime() - 20 * MS_DAY) },
      { publishedAt: new Date(now.getTime() - 12 * MS_DAY) },
    ];

    const result = detectSilencePeriods(posts, { now });
    expect(result.status).toBe('молчит');
    expect(result.daysSinceLastPost).toBe(12);
    // Проверяем, что хвостовая пауза от последнего поста до now (> 7 дней) зафиксирована в periods
    const tailPeriod = result.periods.find((p) => p.endDate === now.toISOString());
    expect(tailPeriod).toBeDefined();
    expect(tailPeriod?.durationDays).toBe(12);
  });

  // 6. Конфигурируемый порог maxGapDays
  it('поддерживает конфигурируемый maxGapDays', () => {
    const posts: SilencePostInput[] = [
      { publishedAt: new Date(now.getTime() - 30 * MS_DAY) },
      { publishedAt: new Date(now.getTime() - 25 * MS_DAY) }, // 5 дней
      { publishedAt: new Date(now.getTime() - 1 * MS_DAY) },  // 24 дня
    ];

    // При maxGapDays = 10, промежуток в 5 дней не считается паузой, а 24 дня считается
    const res10 = detectSilencePeriods(posts, { now, maxGapDays: 10 });
    expect(res10.periods.length).toBe(1);
    expect(res10.periods[0].durationDays).toBe(24);

    // При maxGapDays = 4, промежуток в 5 дней тоже считается паузой
    const res4 = detectSilencePeriods(posts, { now, maxGapDays: 4 });
    expect(res4.periods.length).toBe(2);
  });

  // 7. Поддержка входных данных разного формата
  it('поддерживает raw array, recentPosts и null/undefined', () => {
    const posts: SilencePostInput[] = [
      { publishedAt: new Date(now.getTime() - 1 * MS_DAY) },
    ];

    const fromArray = detectSilencePeriods(posts, { now });
    expect(fromArray.status).toBe('активен');

    const fromRecent = detectSilencePeriods({ recentPosts: posts }, { now });
    expect(fromRecent.status).toBe('активен');

    const fromNull = detectSilencePeriods(null, { now });
    expect(fromNull.status).toBe('молчит');
  });
});

describe('calculateSilenceStatus', () => {
  const now = new Date('2026-10-23T12:00:00.000Z');
  const MS_DAY = 24 * 3600 * 1000;

  it('возвращает "активен" для постов < 3 дней назад', () => {
    expect(calculateSilenceStatus(new Date(now.getTime() - 0.5 * MS_DAY), now)).toBe('активен');
    expect(calculateSilenceStatus(new Date(now.getTime() - 2.9 * MS_DAY), now)).toBe('активен');
  });

  it('возвращает "замедлился" для постов от 3 до 7 дней назад', () => {
    expect(calculateSilenceStatus(new Date(now.getTime() - 3 * MS_DAY), now)).toBe('замедлился');
    expect(calculateSilenceStatus(new Date(now.getTime() - 5 * MS_DAY), now)).toBe('замедлился');
    expect(calculateSilenceStatus(new Date(now.getTime() - 7 * MS_DAY), now)).toBe('замедлился');
  });

  it('возвращает "молчит" для постов > 7 дней назад или null', () => {
    expect(calculateSilenceStatus(new Date(now.getTime() - 7.5 * MS_DAY), now)).toBe('молчит');
    expect(calculateSilenceStatus(new Date(now.getTime() - 30 * MS_DAY), now)).toBe('молчит');
    expect(calculateSilenceStatus(null, now)).toBe('молчит');
    expect(calculateSilenceStatus(undefined, now)).toBe('молчит');
    expect(calculateSilenceStatus('invalid-date', now)).toBe('молчит');
  });
});
