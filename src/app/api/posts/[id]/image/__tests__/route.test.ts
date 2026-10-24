import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findPost: vi.fn(), findImage: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  post: { findUnique: mocks.findPost }, postImage: { findUnique: mocks.findImage },
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

const request = new NextRequest('http://localhost:4000/api/posts/42/image');
const context = { params: Promise.resolve({ id: '42' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true, role: 'USER', userId: 3 });
  mocks.findPost.mockResolvedValue({ channel: { isActive: true, userChannels: [{ id: 1 }] } });
  mocks.findImage.mockResolvedValue({ contentType: 'image/jpeg', data: Buffer.from([1, 2, 3]) });
});

describe('GET /api/posts/:id/image', () => {
  it('serves only an accessible stored image without public caching', async () => {
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(mocks.findPost).toHaveBeenCalledWith({ where: { id: 42 }, select: { channel: { select: {
      isActive: true, userChannels: { where: { userId: 3, isActive: true }, select: { id: true } },
    } } } });
  });

  it('does not read image bytes without authorization or channel access', async () => {
    mocks.auth.mockResolvedValueOnce({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request, context)).status).toBe(401);
    mocks.findPost.mockResolvedValue({ channel: { isActive: true, userChannels: [] } });
    expect((await GET(request, context)).status).toBe(404);
    expect(mocks.findImage).not.toHaveBeenCalled();
  });

  it('allows a master session only for an active channel', async () => {
    mocks.auth.mockResolvedValue({ authorized: true, role: 'ADMIN', userId: null });
    expect((await GET(request, context)).status).toBe(200);
    mocks.findPost.mockResolvedValue({ channel: { isActive: false, userChannels: [] } });
    expect((await GET(request, context)).status).toBe(404);
  });

  it('rejects invalid IDs and a missing image', async () => {
    expect((await GET(request, { params: Promise.resolve({ id: '0' }) })).status).toBe(400);
    expect(mocks.findPost).not.toHaveBeenCalled();
    mocks.findImage.mockResolvedValue(null);
    expect((await GET(request, context)).status).toBe(404);
  });
});
