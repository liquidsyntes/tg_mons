import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  detailStats: vi.fn(),
  parsePeriod: vi.fn(),
  ai: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/metrics', () => ({
  getChannelDetailStats: mocks.detailStats,
  parseStatsPeriod: mocks.parsePeriod,
}));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.ai }));
vi.mock('@/lib/ai-reports', () => ({ saveAiReport: mocks.save, handleAiRouteError: vi.fn() }));

import { POST } from '../route';

function makeRequest(body: unknown = {}) {
  return new NextRequest('http://localhost:4000/api/ai/metrics-explainer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/metrics-explainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 7, role: 'USER' });
    mocks.parsePeriod.mockReturnValue('7d');
    mocks.ai.mockResolvedValue(
      JSON.stringify({
        overallVerdict: {
          headline: 'Канал активно читают, но почти не обсуждают в комментариях',
          plainExplanation: 'Подписчики охотно открывают посты и ставят быстрые реакции.',
          healthBadge: 'Хорошая база',
        },
        audienceBehaviorSummary: {
          whatTheyDo: ['Открывают новые посты и ставят лайки'],
          whatTheyAvoid: ['Редко пишут комментарии'],
        },
        metricsBreakdown: [
          {
            metricName: 'ERR (вовлечённость от просмотров)',
            metricValue: '4.5%',
            status: 'good',
            statusLabel: 'Выше нормы',
            whatItMeans: 'Из каждых 100 прочитавших 4–5 человек реагируют на пост.',
            whatUsersDo: 'Ставят быстрые реакции под постами.',
            whatUsersDontDo: 'Не переходят к длинным дискуссиям.',
            smmAdvice: 'Добавляйте вопрос с выбором в конце поста.',
          },
        ],
        topPriorities: [
          {
            step: 'Запускать 1 опрос в неделю',
            why: 'Подписчикам проще кликнуть на вариант, чем писать текст',
            expectedChange: 'Вырастет ER и CR',
          },
        ],
      })
    );
    mocks.save.mockResolvedValue(101);
  });

  it('rejects unauthenticated requests with 401', async () => {
    mocks.auth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });

    const response = await POST(makeRequest({ channelId: 5 }));
    expect(response.status).toBe(401);
    expect(mocks.detailStats).not.toHaveBeenCalled();
  });

  it('returns 400 when channelId is missing or invalid', async () => {
    const response = await POST(makeRequest({ channelId: 'invalid' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'channelId обязателен' });
  });

  it('returns 404 when channel detail stats are not found', async () => {
    mocks.detailStats.mockResolvedValue(null);

    const response = await POST(makeRequest({ channelId: 999, period: '7d' }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Канал не найден' });
  });

  it('builds SMM metrics prompt, saves metrics_explainer report, and returns explainer JSON', async () => {
    mocks.detailStats.mockResolvedValue({
      channel: {
        id: 12,
        title: 'AI News Channel',
        username: 'ainews',
        niche: 'tech',
        currentMembers: 15000,
        delta24h: { abs: 50, percent: 0.3 },
        delta7d: { abs: 320, percent: 2.1 },
        delta30d: { abs: 1100, percent: 7.9 },
        avgViews24h: 4200,
        vr24h: 28,
        avgViews7d: 4500,
        vr7d: 30,
        avgViews30d: 4800,
        vr30d: 32,
        lastPostViews: 4100,
        er24h: 1.3,
        er7d: 1.5,
        err24h: 4.2,
        err7d: 4.5,
        trueErr7d: 4.4,
        cr7d: 0.2,
        posts24h: 3,
        posts7d: 18,
        posts30d: 74,
        avgPostsPerDay: 2.5,
        activityStatus: 'активен',
        adShare7d: { percent: 11, level: 'low' },
        adShare30d: { percent: 14, level: 'low' },
        citationIndex: 8,
        ep: 72,
        contentScore: 81,
        contentGrade: 'A',
        fraudScore: 5,
        fraudSignals: [],
      },
      contentTypePerformance: [
        {
          type: 'photo',
          label: 'Фото',
          postsCount: 10,
          sharePercent: 55,
          avgViews: 4700,
          avgErr: 4.8,
          avgComments: 6,
          avgForwards: 18,
        },
      ],
      popularReactions: {
        totalReactions: 900,
        coveredPosts: 18,
        top: [{ emoji: '🔥', count: 500, sharePercent: 55.5 }],
      },
      nicheBenchmark: {
        status: 'insufficient_cohort',
        niche: 'tech',
        cohortSize: 1,
      },
    });

    const response = await POST(makeRequest({ channelId: 12, period: '7d' }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(typeof json.explainer).toBe('string');
    expect(JSON.parse(json.explainer).overallVerdict.healthBadge).toBe('Хорошая база');
    expect(mocks.detailStats).toHaveBeenCalledWith(12, '7d', 7);
    expect(mocks.ai).toHaveBeenCalledTimes(1);
    expect(mocks.ai.mock.calls[0][0]).toContain('AI News Channel');
    expect(mocks.ai.mock.calls[0][0]).toContain('ERR 7д');
    expect(mocks.save).toHaveBeenCalledWith(12, 'metrics_explainer', json.explainer, 7);
  });
});
