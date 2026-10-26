import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), service: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/metrics/advertisers', () => ({ getTopAdvertisers: mocks.service }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost:4000/api/posts/advertisers${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true, userId: 3 });
  mocks.service.mockResolvedValue({ days: 30, niche: null, advertisers: [] });
});

describe('GET /api/posts/advertisers', () => {
  it('requires authorization before loading the ranking', async () => {
    mocks.auth.mockResolvedValue({ authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it('passes the authenticated user, period and niche to the service', async () => {
    expect((await GET(request('?days=7&niche=crypto'))).status).toBe(200);
    expect(mocks.service).toHaveBeenCalledWith(3, 7, 'crypto');
  });

  it.each(['?days=14', '?days=abc', `?niche=${'x'.repeat(65)}`])
  ('rejects invalid parameters: %s', async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
