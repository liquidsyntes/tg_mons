import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verifyAuth }));
vi.mock('@/lib/prisma', () => ({ prisma: { systemSetting: {
  findUnique: mocks.findUnique,
  create: mocks.create,
  upsert: mocks.upsert,
} } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET, POST } from '../route';

const url = 'http://localhost:4000/api/settings';

describe('/api/settings authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAuth.mockResolvedValue({ authorized: true });
  });

  it('does not read or save settings without authorization', async () => {
    mocks.verifyAuth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });
    expect((await GET(new NextRequest(url))).status).toBe(401);
    expect((await POST(new NextRequest(url, { method: 'POST' }))).status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('saves settings for an authorized request', async () => {
    mocks.upsert.mockResolvedValue({ id: 'global', aiProvider: 'openrouter' });
    const request = new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiProvider: 'openrouter', aiModel: 'model', aiToken: '' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });
});
