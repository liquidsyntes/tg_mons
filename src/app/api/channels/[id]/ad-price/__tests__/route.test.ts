import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), update: vi.fn(), estimate: vi.fn(), source: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { userChannel: { findUnique: mocks.findUnique, update: mocks.update } } }));
vi.mock('@/lib/pricing', () => ({ estimateAdPrice: mocks.estimate, priceSource: mocks.source }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET, PATCH } from '../route';

const context = { params: Promise.resolve({ id: '7' }) };
function request(method: 'GET' | 'PATCH', body?: unknown): NextRequest {
  return new NextRequest('http://localhost:4000/api/channels/7/ad-price', {
    method, ...(method === 'PATCH' ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true, userId: 3 });
  mocks.findUnique.mockResolvedValue({ id: 12 });
  mocks.update.mockResolvedValue({ customAdPriceUah: 800, customCpmUah: 300 });
  mocks.estimate.mockResolvedValue({ estimatedPricePerPost: 800, priceSource: 'custom_price' });
  mocks.source.mockReturnValue('custom_price');
});

describe('/api/channels/:id/ad-price', () => {
  it('requires authorization for reading and updating', async () => {
    mocks.auth.mockResolvedValue({ authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request('GET'), context)).status).toBe(401);
    expect((await PATCH(request('PATCH', { customAdPriceUah: 800 }), context)).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reads the price only in the requesting users context', async () => {
    const response = await GET(request('GET'), context);
    expect(response.status).toBe(200);
    expect(mocks.estimate).toHaveBeenCalledWith(7, 3);
    expect(await response.json()).toMatchObject({ priceSource: 'custom_price', canEdit: true });
    mocks.estimate.mockResolvedValueOnce(null);
    expect((await GET(request('GET'), context)).status).toBe(404);
  });

  it('allows the owner to set and reset both settings', async () => {
    const response = await PATCH(request('PATCH', { customAdPriceUah: 800, customCpmUah: 300 }), context);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { userId_channelId: { userId: 3, channelId: 7 } },
      data: { customAdPriceUah: 800, customCpmUah: 300 },
      select: { customAdPriceUah: true, customCpmUah: true },
    });
    mocks.update.mockResolvedValue({ customAdPriceUah: null, customCpmUah: null });
    mocks.source.mockReturnValue('niche_estimate');
    expect(await (await PATCH(request('PATCH', { customAdPriceUah: null, customCpmUah: null }), context)).json())
      .toMatchObject({ customAdPriceUah: null, customCpmUah: null, priceSource: 'niche_estimate' });
  });

  it('rejects invalid values and unknown fields before touching the database', async () => {
    for (const body of [{ customCpmUah: -1 }, { customAdPriceUah: 1.5 },
      { customCpmUah: '300' }, { customCpmUah: 2_147_483_648 }, { other: 1 }, {}]) {
      expect((await PATCH(request('PATCH', body), context)).status).toBe(400);
    }
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('prevents cross-user edits and master-session writes', async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await PATCH(request('PATCH', { customAdPriceUah: 800 }), context)).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ authorized: true, userId: null });
    expect((await PATCH(request('PATCH', { customAdPriceUah: 800 }), context)).status).toBe(403);
  });
});
