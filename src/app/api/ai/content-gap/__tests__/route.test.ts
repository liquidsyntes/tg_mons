import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  subscriptions: vi.fn(),
  channels: vi.fn(),
  posts: vi.fn(),
  ai: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userChannel: { findMany: mocks.subscriptions },
    channel: { findMany: mocks.channels },
    post: { findMany: mocks.posts },
  },
}));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.ai }));
vi.mock('@/lib/ai-reports', () => ({ saveAiReport: mocks.save, handleAiRouteError: vi.fn() }));

import { POST } from '../route';

function makeRequest(body: unknown = {}) {
  return new NextRequest('http://localhost:4000/api/ai/content-gap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/content-gap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 7, role: 'USER' });
    mocks.ai.mockResolvedValue(
      JSON.stringify({
        summary: 'Конкуренты активно разбирают ИИ-агентов',
        missingTopics: [
          {
            topic: 'Автономные ИИ-агенты',
            whyItWorked: 'Практические кейсы дали 3.2x к медиане охвата',
            competitorChannels: ['AI Insider'],
            engagementPotential: 'Высокий (3.2x)',
            suggestedAngle: 'Сделать разбор инструментов для разработчиков',
            quote: 'Агенты уже закрывают 40% рутины',
          },
        ],
        coveredTopicsComparison: [],
        quickWins: [
          {
            headline: 'Топ-5 ИИ-агентов недели',
            format: 'Карточки',
            hook: 'Проверили на практике 5 агентских сборок...',
          },
        ],
      }),
    );
    mocks.save.mockResolvedValue(99);
  });

  it('rejects unauthenticated requests with 401', async () => {
    mocks.auth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });

    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    expect(mocks.subscriptions).not.toHaveBeenCalled();
  });

  it('returns 400 when user has no "My Channel" assigned', async () => {
    mocks.subscriptions.mockResolvedValue([
      { isMine: false, channel: { id: 2, title: 'Конкурент 1', username: 'comp1', niche: 'tech' } },
    ]);

    const response = await POST(makeRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Сначала назначьте один из каналов "Вашим каналом" на главной странице',
    });
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it('returns 400 when there are no competitor posts in the period', async () => {
    mocks.subscriptions.mockResolvedValue([
      { isMine: true, channel: { id: 1, title: 'Мой Техно Канал', username: 'mytech', niche: 'tech' } },
      { isMine: false, channel: { id: 2, title: 'Конкурент 1', username: 'comp1', niche: 'tech' } },
    ]);
    mocks.posts.mockResolvedValue([]);

    const response = await POST(makeRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Недостаточно текстовых постов у конкурентов за выбранный период',
    });
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it('scopes channels to active user subscriptions, ranks top competitor posts, and saves content-gap report', async () => {
    mocks.subscriptions.mockResolvedValue([
      { isMine: true, channel: { id: 1, title: 'Мой Техно Канал', username: 'mytech', niche: 'tech' } },
      { isMine: false, channel: { id: 2, title: 'AI Insider', username: 'ai_insider', niche: 'tech' } },
      { isMine: false, channel: { id: 3, title: 'Dev Weekly', username: 'dev_weekly', niche: 'tech' } },
    ]);

    mocks.posts.mockImplementation(async ({ where }: { where: { channelId: number | { in: number[] } } }) => {
      if (where.channelId === 1) {
        return [
          {
            id: 10,
            channelId: 1,
            publishedAt: new Date('2026-10-25T10:00:00.000Z'),
            text: 'Обзор релиза TypeScript',
            views: 1200,
            reactions: 30,
            comments: 5,
            forwards: 10,
          },
        ];
      }
      return [
        {
          id: 20,
          channelId: 2,
          publishedAt: new Date('2026-10-25T12:00:00.000Z'),
          text: 'Обычная новость',
          views: 1000,
          reactions: 10,
          comments: 2,
          forwards: 3,
        },
        {
          id: 21,
          channelId: 2,
          publishedAt: new Date('2026-10-26T12:00:00.000Z'),
          text: 'Агенты уже закрывают 40% рутины',
          views: 5000,
          reactions: 250,
          comments: 40,
          forwards: 110,
        },
      ];
    });

    const response = await POST(makeRequest({ days: 14 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reportId).toBe(99);
    expect(JSON.parse(body.contentGap).missingTopics[0].topic).toBe('Автономные ИИ-агенты');

    expect(mocks.subscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 7,
          isActive: true,
          channel: { isActive: true },
        },
      }),
    );
    expect(mocks.ai).toHaveBeenCalledTimes(1);
    expect(mocks.ai.mock.calls[0][0]).toContain('Мой Техно Канал');
    expect(mocks.ai.mock.calls[0][0]).toContain('Агенты уже закрывают 40% рутины');
    expect(mocks.save).toHaveBeenCalledWith(1, 'content-gap', expect.any(String), 7);
  });
});
