import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  kinds: [] as string[],
  auth: vi.fn(),
  postFindMany: vi.fn(),
  channelFindUnique: vi.fn(),
  callOpenRouter: vi.fn(),
  buildPrompt: vi.fn(),
  formatPosts: vi.fn(),
  saveAiReport: vi.fn(),
  handleAiRouteError: vi.fn(),
}));

vi.mock('@/lib/ai-operations/route', () => ({
  withAiOperation: (kind: string, handler: unknown) => {
    mocks.kinds.push(kind);
    return handler;
  },
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: mocks.postFindMany },
    channel: { findUnique: mocks.channelFindUnique },
  },
}));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.callOpenRouter }));
vi.mock('@/lib/ai-reports', () => ({
  buildChannelContentSummaryPrompt: mocks.buildPrompt,
  formatTimestampedPosts: mocks.formatPosts,
  saveAiReport: mocks.saveAiReport,
  handleAiRouteError: mocks.handleAiRouteError,
}));

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:4000/api/ai/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 3, role: 'USER' });
    mocks.postFindMany.mockResolvedValue([{ text: 'Пост за период', publishedAt: new Date() }]);
    mocks.channelFindUnique.mockResolvedValue({ id: 5, title: 'Summary Channel' });
    mocks.formatPosts.mockReturnValue('formatted posts');
    mocks.buildPrompt.mockReturnValue('summary prompt');
    mocks.callOpenRouter.mockResolvedValue('{"summary":"Готово"}');
    mocks.saveAiReport.mockResolvedValue(undefined);
    mocks.handleAiRouteError.mockReturnValue(NextResponse.json({ error: 'ai failure' }, { status: 500 }));
  });

  it('registers summary AI operation kind and rejects unauthorized callers', async () => {
    expect(mocks.kinds).toEqual(['summary']);
    mocks.auth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const res = await POST(makeRequest({ channelId: 5 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when channelId is missing and 404 when no posts found', async () => {
    expect((await POST(makeRequest({}))).status).toBe(400);

    mocks.postFindMany.mockResolvedValueOnce([]);
    const notFound = await POST(makeRequest({ channelId: 5, days: 7 }));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: 'Нет текстовых постов за выбранный период для анализа' });
  });

  it('builds prompt with maxChars 30000, saves summary report, and delegates errors', async () => {
    const res = await POST(makeRequest({ channelId: 5, days: 14 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: '{"summary":"Готово"}' });
    expect(mocks.buildPrompt).toHaveBeenCalledWith({
      channelTitle: 'Summary Channel',
      scopeDescription: 'посты за последние 14 дней',
      contentToAnalyze: 'formatted posts',
      maxChars: 30000,
      charLimitLabel: '30 000',
    });
    expect(mocks.saveAiReport).toHaveBeenCalledWith(5, 'summary', '{"summary":"Готово"}', 3);

    const err = new Error('boom');
    mocks.callOpenRouter.mockRejectedValueOnce(err);
    expect((await POST(makeRequest({ channelId: 5 }))).status).toBe(500);
    expect(mocks.handleAiRouteError).toHaveBeenCalledWith(err);
  });
});
