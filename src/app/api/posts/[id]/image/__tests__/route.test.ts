import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const findImage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { postImage: { findUnique: findImage } } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

const request = new NextRequest('http://localhost:4000/api/posts/42/image');

describe('GET /api/posts/:id/image', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serves the stored image with its content type', async () => {
    findImage.mockResolvedValue({ contentType: 'image/jpeg', data: Buffer.from([1, 2, 3]) });
    const response = await GET(request, { params: Promise.resolve({ id: '42' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(findImage).toHaveBeenCalledWith({ where: { postId: 42 } });
  });

  it('rejects invalid IDs and reports a missing image', async () => {
    expect((await GET(request, { params: Promise.resolve({ id: '0' }) })).status).toBe(400);
    expect(findImage).not.toHaveBeenCalled();
    findImage.mockResolvedValue(null);
    expect((await GET(request, { params: Promise.resolve({ id: '42' }) })).status).toBe(404);
  });
});
