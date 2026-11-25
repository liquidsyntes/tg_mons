import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  kinds: [] as string[],
  auth: vi.fn(),
  postFindMany: vi.fn(),
  callOpenRouter: vi.fn(),
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
  prisma: { post: { findMany: mocks.postFindMany } },
}));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.callOpenRouter }));
vi.mock('@/lib/ai-reports', () => ({
  saveAiReport: mocks.saveAiReport,
  handleAiRouteError: mocks.handleAiRouteError,
}));

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:4000/api/ai/audience', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/audience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 4, role: 'USER' });
    mocks.postFindMany.mockResolvedValue([{ text: 'Пост 1' }, { text: 'Пост 2' }]);
    mocks.callOpenRouter.mockResolvedValue('{"summary":"Целевая аудитория"}');
    mocks.saveAiReport.mockResolvedValue(undefined);
    mocks.handleAiRouteError.mockReturnValue(NextResponse.json({ error: 'ai failure' }, { status: 500 }));
  });

  it('registers audience AI operation kind and handles unauthorized requests', async () => {
    expect(mocks.kinds).toEqual(['audience']);
    mocks.auth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const res = await POST(makeRequest({ channelId: 2 }));
    expect(res.status).toBe(401);
    expect(mocks.postFindMany).not.toHaveBeenCalled();
  });

  it('returns 400 when channelId is missing or no text posts are available', async () => {
    const missingId = await POST(makeRequest({}));
    expect(missingId.status).toBe(400);
    expect(await missingId.json()).toEqual({ error: 'channelId обязателен' });

    mocks.postFindMany.mockResolvedValueOnce([]);
    const emptyPosts = await POST(makeRequest({ channelId: 2, days: 14 }));
    expect(emptyPosts.status).toBe(400);
    expect(await emptyPosts.json()).toEqual({ error: 'Нет текстовых постов для анализа' });
  });

  it('generates and saves audience report and delegates errors', async () => {
    const res = await POST(makeRequest({ channelId: 2 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ audience: '{"summary":"Целевая аудитория"}' });
    expect(mocks.saveAiReport).toHaveBeenCalledWith(2, 'audience', '{"summary":"Целевая аудитория"}', 4);

    const err = new Error('provider failed');
    mocks.callOpenRouter.mockRejectedValueOnce(err);
    const errRes = await POST(makeRequest({ channelId: 2 }));
    expect(errRes.status).toBe(500);
    expect(mocks.handleAiRouteError).toHaveBeenCalledWith(err);
  });
});
