import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyBearerToken: vi.fn(),
  userChannelUpdate: vi.fn(),
  channelUpdate: vi.fn(),
  invalidate: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verifyBearerToken }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userChannel: { update: mocks.userChannelUpdate },
    channel: { update: mocks.channelUpdate },
  },
}));
vi.mock('@/lib/cache', () => ({
  metricsCache: { invalidate: mocks.invalidate },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import { PUT } from '../route';

function makeRequest(id: string, body: unknown = { isFavorite: true }) {
  return new NextRequest(`http://localhost:4000/api/channels/${id}/favorite`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PUT /api/channels/[id]/favorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyBearerToken.mockResolvedValue({ authorized: true, userId: 10, role: 'USER' });
    mocks.userChannelUpdate.mockResolvedValue({ isFavorite: true });
    mocks.channelUpdate.mockResolvedValue({ isFavorite: true });
  });

  it('returns 401 when unauthorized', async () => {
    mocks.verifyBearerToken.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }),
    });

    const response = await PUT(makeRequest('5'), { params: Promise.resolve({ id: '5' }) });
    expect(response.status).toBe(401);
    expect(mocks.userChannelUpdate).not.toHaveBeenCalled();
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when channel id is invalid', async () => {
    const response = await PUT(makeRequest('abc'), { params: Promise.resolve({ id: 'abc' }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid ID' });
  });

  it('updates userChannel favorite flag and invalidates metrics cache for user session', async () => {
    mocks.userChannelUpdate.mockResolvedValue({ isFavorite: false });

    const response = await PUT(makeRequest('7', { isFavorite: false }), { params: Promise.resolve({ id: '7' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, isFavorite: false });
    expect(mocks.userChannelUpdate).toHaveBeenCalledWith({
      where: { userId_channelId: { userId: 10, channelId: 7 } },
      data: { isFavorite: false },
    });
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });

  it('falls back to channel.update when userId is null', async () => {
    mocks.verifyBearerToken.mockResolvedValue({ authorized: true, userId: null, role: 'ADMIN' });
    mocks.channelUpdate.mockResolvedValue({ isFavorite: true });

    const response = await PUT(makeRequest('9', { isFavorite: true }), { params: Promise.resolve({ id: '9' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, isFavorite: true });
    expect(mocks.channelUpdate).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { isFavorite: true },
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when database update throws', async () => {
    mocks.userChannelUpdate.mockRejectedValue(new Error('DB write error'));

    const response = await PUT(makeRequest('7'), { params: Promise.resolve({ id: '7' }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'DB write error' });
    expect(mocks.loggerError).toHaveBeenCalledTimes(1);
  });
});
