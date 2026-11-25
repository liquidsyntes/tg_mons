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
  return new NextRequest('http://localhost:4000/api/ai/super-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/super-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 11, role: 'USER' });
    mocks.postFindMany.mockResolvedValue([{ text: 'Пост 1' }, { text: 'Пост 2' }]);
    mocks.channelFindUnique.mockResolvedValue({ id: 8, title: 'Super Channel' });
    mocks.formatPosts.mockReturnValue('formatted posts');
    mocks.buildPrompt.mockReturnValue('super prompt');
    mocks.callOpenRouter.mockResolvedValue('{"summary":"Супер-отчет"}');
    mocks.saveAiReport.mockResolvedValue(undefined);
    mocks.handleAiRouteError.mockReturnValue(NextResponse.json({ error: 'ai failure' }, { status: 500 }));
  });

  it('registers super-report AI operation kind and rejects unauthorized requests', async () => {
    expect(mocks.kinds).toEqual(['super-report']);
    mocks.auth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const res = await POST(makeRequest({ channelId: 8 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 without channelId and 404 when posts are absent', async () => {
    expect((await POST(makeRequest({}))).status).toBe(400);

    mocks.postFindMany.mockResolvedValueOnce([]);
    const notFound = await POST(makeRequest({ channelId: 8 }));
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: 'Нет текстовых постов для анализа' });
  });

  it('builds prompt with maxChars 80000, saves super_report, and delegates errors', async () => {
    const res = await POST(makeRequest({ channelId: 8 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: '{"summary":"Супер-отчет"}' });
    expect(mocks.buildPrompt).toHaveBeenCalledWith({
      channelTitle: 'Super Channel',
      scopeDescription: 'последние 2 постов',
      contentToAnalyze: 'formatted posts',
      maxChars: 80000,
      charLimitLabel: '80 000',
    });
    expect(mocks.saveAiReport).toHaveBeenCalledWith(8, 'super_report', '{"summary":"Супер-отчет"}', 11);

    const err = new Error('boom');
    mocks.callOpenRouter.mockRejectedValueOnce(err);
    expect((await POST(makeRequest({ channelId: 8 }))).status).toBe(500);
    expect(mocks.handleAiRouteError).toHaveBeenCalledWith(err);
  });
});
