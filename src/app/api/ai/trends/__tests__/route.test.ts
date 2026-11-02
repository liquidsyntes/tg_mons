import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), subscriptions: vi.fn(), channels: vi.fn(), posts: vi.fn(), ai: vi.fn(), save: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  userChannel: { findMany: mocks.subscriptions },
  channel: { findMany: mocks.channels },
  post: { findMany: mocks.posts },
} }));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.ai }));
vi.mock('@/lib/ai-reports', () => ({ saveAiReport: mocks.save, handleAiRouteError: vi.fn() }));
import { POST } from '../route';

const request = () => new NextRequest('http://localhost:4000/api/ai/trends', { method: 'POST' });
const validTrend = { topic: 'Тема', description: 'Описание', channels: ['Первый', 'Второй'], quote: 'Цитата' };

describe('POST /api/ai/trends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 1 });
    mocks.subscriptions.mockResolvedValue([{ channel: { id: 1, title: 'Первый', username: null } }]);
    mocks.posts.mockResolvedValue([{ publishedAt: new Date(), text: 'Текст публикации' }]);
    mocks.ai.mockResolvedValue(JSON.stringify({ trends: [validTrend], summary: 'Сводка' }));
    mocks.save.mockResolvedValue(undefined);
  });

  it('includes every active user channel and balances post excerpts', async () => {
    mocks.subscriptions.mockResolvedValue([
      { channel: { id: 1, title: 'Первый', username: null } },
      { channel: { id: 2, title: 'Второй', username: null } },
    ]);
    mocks.posts.mockImplementation(async ({ where }: { where: { channelId: number } }) =>
      where.channelId === 1
        ? Array.from({ length: 10 }, () => ({ publishedAt: new Date(), text: 'А'.repeat(1500) }))
        : [{ publishedAt: new Date(), text: 'Новость второго канала' }]);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.subscriptions).toHaveBeenCalledWith(expect.objectContaining({ where: {
      userId: 1, isActive: true, channel: { isActive: true },
    } }));
    expect(mocks.posts).toHaveBeenCalledTimes(2);
    expect(mocks.ai.mock.calls[0][0]).toContain('Новость второго канала');
    expect(mocks.save).toHaveBeenCalledWith(null, 'trend', JSON.stringify({ trends: [validTrend], summary: 'Сводка' }), 1);
  });

  it.each([
    ['невалидный синтаксис', '{'],
    ['пустой список', JSON.stringify({ trends: [], summary: 'Сводка' })],
    ['пустые ключи', JSON.stringify({ '': { '': [''], summary: 'Сводка' } })],
    ['неверные каналы', JSON.stringify({ trends: [{ ...validTrend, channels: 'Первый' }], summary: 'Сводка' })],
    ['нестроковый канал', JSON.stringify({ trends: [{ ...validTrend, channels: [42] }], summary: 'Сводка' })],
    ['отсутствующая цитата', JSON.stringify({ trends: [{ topic: 'Тема', description: 'Описание', channels: [] }], summary: 'Сводка' })],
    ['отсутствующая сводка', JSON.stringify({ trends: [validTrend] })],
  ])('rejects %s without saving a report', async (_case, result) => {
    mocks.ai.mockResolvedValue(result);

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'ИИ вернул невалидный JSON' });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not generate a report when there are no recent text posts', async () => {
    mocks.subscriptions.mockResolvedValue([{ channel: { id: 1, title: 'Первый', username: null } }]);
    mocks.posts.mockResolvedValue([]);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.ai).not.toHaveBeenCalled();
  });
});
