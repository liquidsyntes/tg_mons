import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), attribution: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/adAttribution', () => ({ getChannelAdAttribution: mocks.attribution }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost:4000/api/channels/2/ad-attribution${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true, role: 'USER', userId: 7 });
  mocks.attribution.mockResolvedValue({ periodDays: 30, inbound: [], outbound: [] });
});

describe('GET /api/channels/:id/ad-attribution', () => {
  it('requires authorization and scopes the calculation to the session user', async () => {
    mocks.auth.mockResolvedValueOnce({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request(), { params: Promise.resolve({ id: '2' }) })).status).toBe(401);
    expect(mocks.attribution).not.toHaveBeenCalled();
    expect((await GET(request('?days=90'), { params: Promise.resolve({ id: '2' }) })).status).toBe(200);
    expect(mocks.attribution).toHaveBeenCalledWith(2, 90, 7);
  });

  it('rejects malformed channel IDs and periods', async () => {
    expect((await GET(request(), { params: Promise.resolve({ id: '2x' }) })).status).toBe(400);
    expect((await GET(request('?days=10'), { params: Promise.resolve({ id: '2' }) })).status).toBe(400);
    expect(mocks.attribution).not.toHaveBeenCalled();
  });

  it('returns 404 for a channel outside the accessible list', async () => {
    mocks.attribution.mockResolvedValue(null);
    expect((await GET(request(), { params: Promise.resolve({ id: '2' }) })).status).toBe(404);
  });
});
