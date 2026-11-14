import { describe, expect, it } from 'vitest';
import {
  ALL_CONTENT_PLAN_STATUSES,
  CONTENT_PLAN_STATUS_LABELS,
  buildContentPlanFormatGuidance,
  formatPlannedSlotDateTime,
  groupSavedPostsByStatus,
  isValidContentPlanStatus,
  suggestNextPublishSlots,
} from '../content-plan';
import type { BestTimeRecommendation } from '../../types';

describe('content-plan metrics and slot recommendations', () => {
  it('validates content plan statuses and groups posts with safe fallback to idea', () => {
    expect(ALL_CONTENT_PLAN_STATUSES).toEqual(['idea', 'in_progress', 'ready', 'published']);
    expect(CONTENT_PLAN_STATUS_LABELS.ready).toBe('Готово к публикации');

    expect(isValidContentPlanStatus('idea')).toBe(true);
    expect(isValidContentPlanStatus('in_progress')).toBe(true);
    expect(isValidContentPlanStatus('ready')).toBe(true);
    expect(isValidContentPlanStatus('published')).toBe(true);
    expect(isValidContentPlanStatus('archived')).toBe(false);
    expect(isValidContentPlanStatus(null)).toBe(false);

    const grouped = groupSavedPostsByStatus([
      { id: 1, savedStatus: 'idea' },
      { id: 2, savedStatus: 'in_progress' },
      { id: 3, savedStatus: 'ready' },
      { id: 4, savedStatus: 'published' },
      { id: 5, savedStatus: undefined },
      { id: 6, status: 'ready' },
      { id: 7, savedStatus: 'unknown_status' },
    ]);

    expect(grouped.idea.map((item) => item.id)).toEqual([1, 5, 7]);
    expect(grouped.in_progress.map((item) => item.id)).toEqual([2]);
    expect(grouped.ready.map((item) => item.id)).toEqual([3, 6]);
    expect(grouped.published.map((item) => item.id)).toEqual([4]);
  });

  it('suggests highest-scoring free slots over the next 7 days and skips occupied dates', () => {
    // 2026-11-16 is Monday; in Europe/Moscow (UTC+3): 12:00Z = 15:00 MSK
    const now = new Date('2026-11-16T12:00:00.000Z');
    const heatmap: BestTimeRecommendation['heatmap'] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmap.push({ day, hour, postCount: 0, avgViews: 0, avgVr: 0, score: 0 });
      }
    }

    const setSlot = (day: number, hour: number, score: number, avgViews: number) => {
      const target = heatmap.find((cell) => cell.day === day && cell.hour === hour)!;
      target.postCount = 4;
      target.score = score;
      target.avgViews = avgViews;
      target.avgVr = 12;
    };

    // Thu (4) 18:00 = top 1, Tue (2) 19:00 = top 2, Thu (4) 14:00 = top 3
    setSlot(4, 18, 92, 5400);
    setSlot(2, 19, 88, 5100);
    setSlot(4, 14, 76, 4600);

    // 2026-11-19 is Thursday; 15:00Z = 18:00 MSK -> already occupied
    const existingPlannedDates = [
      '2026-11-19T15:00:00.000Z',
      null,
      'not-a-date',
    ];

    const slots = suggestNextPublishSlots(heatmap, existingPlannedDates, now, 3, 'Europe/Moscow');

    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({
      dayOfWeek: 2,
      hour: 19,
      label: 'Вт, 19:00',
      dateKey: '2026-11-17',
      score: 88,
      avgViews: 5100,
    });
    expect(slots[1]).toMatchObject({
      dayOfWeek: 4,
      hour: 14,
      label: 'Чт, 14:00',
      dateKey: '2026-11-19',
      score: 76,
    });
    // Ensure occupied Thursday 18:00 is not returned
    expect(slots.some((slot) => slot.dateKey === '2026-11-19' && slot.hour === 18)).toBe(false);
  });

  it('falls back to sensible daytime slots when heatmap has no measured data', () => {
    const now = new Date('2026-11-16T08:15:00.000Z');
    const slots = suggestNextPublishSlots(null, [], now, 2, 'Europe/Moscow');

    expect(slots).toHaveLength(2);
    expect(slots[0].hour).toBe(19);
    expect(slots[1].hour).toBe(19);
    expect(slots[0].dateKey).not.toBe(slots[1].dateKey);
  });

  it('builds myChannel format guidance combining length analytics, media, links and top slots', () => {
    const now = new Date('2026-11-16T10:00:00.000Z');
    const mediumText = 'Почему клиенты читают новости утром?\n\n' + 'а'.repeat(420) + ' https://t.me/my_chan';
    const shortText = 'Короткий пост';

    const guidance = buildContentPlanFormatGuidance(
      {
        id: 10,
        title: 'Мой канал',
        subscribersCount: 5000,
        posts: [
          { text: mediumText, views: 2000, reactions: 100, comments: 20, forwards: 30, contentType: 'photo' },
          { text: mediumText, views: 2200, reactions: 110, comments: 15, forwards: 25, contentType: 'photo' },
          { text: shortText, views: 900, reactions: 10, comments: 1, forwards: 2, contentType: 'text' },
          { text: shortText, views: 950, reactions: 12, comments: 2, forwards: 3, contentType: 'text' },
        ],
      },
      [
        {
          dateTime: '2026-11-17T16:00:00.000Z',
          dateKey: '2026-11-17',
          dayOfWeek: 2,
          hour: 19,
          label: 'Вт, 19:00',
          score: 85,
          avgViews: 2100,
        },
        {
          dateTime: '2026-11-19T11:00:00.000Z',
          dateKey: '2026-11-19',
          dayOfWeek: 4,
          hour: 14,
          label: 'Чт, 14:00',
          score: 79,
          avgViews: 1900,
        },
      ],
    );

    expect(guidance.bestLengthBucket).toBe('medium');
    expect(guidance.recommendedRangeLabel).toBe('300-1000 зн.');
    expect(guidance.withMediaRecommended).toBe(true);
    expect(guidance.withLinksRecommended).toBe(true);
    expect(guidance.bestStructureSignal).toBe('question_hook');
    expect(guidance.summaryText).toContain('Оптимальный формат для вашего канала: 300-1000 зн. с медиа и ссылками');
    expect(guidance.summaryText).toContain('Лучшие окна: Вт, 19:00, Чт, 14:00');
    expect(guidance.summaryText).not.toContain('\u2014');

    const formatted = formatPlannedSlotDateTime('2026-11-19T15:00:00.000Z', 'Europe/Moscow');
    expect(formatted).toBe('19.11 (Чт, 18:00)');
    expect(formatPlannedSlotDateTime(null)).toBeNull();
    void now;
  });
});
