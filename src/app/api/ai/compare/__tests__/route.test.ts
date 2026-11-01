import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), channel: vi.fn(), myChannel: vi.fn(), globalMyChannel: vi.fn(),
  posts: vi.fn(), ai: vi.fn(), save: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  channel: { findUnique: mocks.channel, findFirst: mocks.globalMyChannel },
  userChannel: { findFirst: mocks.myChannel },
  post: { findMany: mocks.posts },
} }));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.ai }));
vi.mock('@/lib/ai-reports', () => ({
  formatTimestampedPosts: (posts: Array<{ text: string }>) => posts.map(post => post.text).join('\n'),
  handleAiRouteError: vi.fn(), saveAiReport: mocks.save,
}));

import { POST } from '../route';

function request() {
  return new NextRequest('http://localhost:4000/api/ai/compare', {
    method: 'POST', body: JSON.stringify({ channelId: 2 }),
  });
}

describe('POST /api/ai/compare channel selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channel.mockResolvedValue({ id: 2, title: 'Конкурент' });
    mocks.myChannel.mockResolvedValue({
      channelId: 1, isMine: true, niche: 'tech', isActive: true,
      channel: { id: 1, title: 'Мой персональный канал', isActive: true },
    });
    mocks.globalMyChannel.mockResolvedValue({ id: 3, title: 'Глобальный канал', isMine: true });
    mocks.posts.mockResolvedValue([{ publishedAt: new Date(), text: 'Текст публикации' }]);
    mocks.ai.mockResolvedValue('{}');
  });

  it('uses the current user My Channel in the prompt and post query', async () => {
    mocks.auth.mockResolvedValue({ authorized: true, userId: 7 });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.myChannel).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7, isMine: true } }));
    expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ channelId: 1 }) }));
    expect(mocks.ai.mock.calls[0][0]).toContain('Мой персональный канал');
    expect(mocks.globalMyChannel).not.toHaveBeenCalled();
  });

  it('uses the global My Channel in a master session', async () => {
    mocks.auth.mockResolvedValue({ authorized: true, userId: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.globalMyChannel).toHaveBeenCalledWith({ where: { isMine: true } });
    expect(mocks.myChannel).not.toHaveBeenCalled();
    expect(mocks.ai.mock.calls[0][0]).toContain('Глобальный канал');
  });
});
