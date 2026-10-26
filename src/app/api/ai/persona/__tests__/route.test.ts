import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  posts: vi.fn(),
  ai: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: mocks.posts },
  },
}));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.ai }));
vi.mock('@/lib/ai-reports', () => ({ saveAiReport: mocks.save, handleAiRouteError: vi.fn() }));

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:4000/api/ai/persona', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/persona', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 1, role: 'ADMIN' });
    mocks.posts.mockResolvedValue([{ text: 'Пост 1' }, { text: 'Пост 2' }]);
    mocks.ai.mockResolvedValue('{"summary":"Портрет автора"}');
    mocks.save.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated requests with 401', async () => {
    mocks.auth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });

    const response = await POST(makeRequest({ channelId: 7 }));
    expect(response.status).toBe(401);
    expect(mocks.posts).not.toHaveBeenCalled();
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it('rejects non-admin users with 403', async () => {
    mocks.auth.mockResolvedValue({ authorized: true, userId: 5, role: 'USER' });

    const response = await POST(makeRequest({ channelId: 7 }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Доступно только администратору' });
    expect(mocks.posts).not.toHaveBeenCalled();
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it('generates and saves persona report for ADMIN', async () => {
    const response = await POST(makeRequest({ channelId: 7 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ persona: '{"summary":"Портрет автора"}' });
    expect(mocks.posts).toHaveBeenCalledWith({
      where: { channelId: 7, text: { not: null } },
      orderBy: { publishedAt: 'desc' },
      take: 30,
    });
    expect(mocks.save).toHaveBeenCalledWith(7, 'persona', '{"summary":"Портрет автора"}', 1);
  });
});
