import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyServiceBearerToken: vi.fn(),
  metricsInvalidate: vi.fn(),
  bestTimeInvalidate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  verifyServiceBearerToken: mocks.verifyServiceBearerToken,
}));
vi.mock('@/lib/cache', () => ({
  metricsCache: { invalidate: mocks.metricsInvalidate },
  bestTimeCache: { invalidate: mocks.bestTimeInvalidate },
}));

import { POST } from '../route';

describe('POST /api/internal/invalidate-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyServiceBearerToken.mockResolvedValue({ authorized: true, userId: null, role: 'ADMIN' });
  });

  it('returns 401 when service bearer token is rejected', async () => {
    mocks.verifyServiceBearerToken.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const req = new NextRequest('http://localhost:4000/api/internal/invalidate-cache', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mocks.metricsInvalidate).not.toHaveBeenCalled();
    expect(mocks.bestTimeInvalidate).not.toHaveBeenCalled();
  });

  it('invalidates metricsCache and bestTimeCache on authorized request', async () => {
    const req = new NextRequest('http://localhost:4000/api/internal/invalidate-cache', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mocks.metricsInvalidate).toHaveBeenCalledTimes(1);
    expect(mocks.bestTimeInvalidate).toHaveBeenCalledTimes(1);
  });
});
