import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), rules: vi.fn(), channels: vi.fn(), channel: vi.fn(),
  existing: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  alertRule: {
    findMany: mocks.rules, findFirst: mocks.existing, create: mocks.create,
    updateMany: mocks.updateMany, findUnique: mocks.findUnique, deleteMany: mocks.deleteMany,
  },
  channel: { findMany: mocks.channels, findUnique: mocks.channel },
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { DELETE, GET, PATCH, POST } from '../route';

const url = 'http://localhost:4000/api/alerts';
function request(method: string, body?: object) {
  return new NextRequest(url, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ authorized: true });
  mocks.rules.mockResolvedValue([]);
  mocks.channels.mockResolvedValue([]);
  mocks.channel.mockResolvedValue({ id: 3 });
  mocks.existing.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: 10, channelId: null, metric: 'followers', operator: 'gt', threshold: 100 });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockResolvedValue({ id: 10, enabled: false });
  mocks.deleteMany.mockResolvedValue({ count: 1 });
});

describe('/api/alerts', () => {
  it('requires authorization for every method', async () => {
    mocks.auth.mockResolvedValue({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(request('GET'))).status).toBe(401);
    expect((await POST(request('POST'))).status).toBe(401);
    expect((await PATCH(request('PATCH'))).status).toBe(401);
    expect((await DELETE(request('DELETE'))).status).toBe(401);
    expect(mocks.rules).not.toHaveBeenCalled();
  });

  it('lists rules, channels and supported metrics', async () => {
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.metrics).toHaveLength(11);
    expect(body.metrics).toContainEqual({
      value: 'keyword',
      label: 'Упоминание ключевого слова',
      unit: 'фраза',
    });
    expect(body.metrics).toContainEqual({
      value: 'viralPostMultiplier',
      label: 'Виральный пост (множитель к медиане охвата)',
      unit: 'x',
    });
    expect(body.rules).toEqual([]);
    expect(typeof body.deliveryConfigured).toBe('boolean');
  });

  it('creates a validated global rule', async () => {
    const response = await POST(request('POST', { channelId: null, metric: 'followers', operator: 'gt', threshold: 100 }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: {
      channelId: null, metric: 'followers', operator: 'gt', threshold: 100, enabled: true,
    } });
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('creates and normalizes a keyword rule without explicit operator or threshold', async () => {
    mocks.create.mockResolvedValueOnce({
      id: 11,
      channelId: 3,
      metric: 'keyword',
      operator: 'gt',
      threshold: 0,
      keywordQuery: 'Биткоин, тон',
      enabled: true,
    });
    const response = await POST(request('POST', {
      channelId: 3,
      metric: 'keyword',
      keywordQuery: '  Биткоин , тон , БИТКОИН ',
    }));
    expect(response.status).toBe(201);
    expect(mocks.existing).toHaveBeenCalledWith({
      where: {
        channelId: 3,
        metric: 'keyword',
        keywordQuery: 'Биткоин, тон',
      },
      select: { id: true },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        channelId: 3,
        metric: 'keyword',
        operator: 'gt',
        threshold: 0,
        keywordQuery: 'Биткоин, тон',
        enabled: true,
      },
    });
  });

  it('creates a viral post multiplier rule and rejects non-positive or lt thresholds', async () => {
    mocks.create.mockResolvedValueOnce({
      id: 12,
      channelId: null,
      metric: 'viralPostMultiplier',
      operator: 'gt',
      threshold: 2.5,
      enabled: true,
    });
    const response = await POST(request('POST', {
      channelId: null,
      metric: 'viralPostMultiplier',
      threshold: 2.5,
    }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        channelId: null,
        metric: 'viralPostMultiplier',
        operator: 'gt',
        threshold: 2.5,
        enabled: true,
      },
    });
    expect((await POST(request('POST', { metric: 'viralPostMultiplier', operator: 'lt', threshold: 2 }))).status).toBe(400);
    expect((await POST(request('POST', { metric: 'viralPostMultiplier', operator: 'gt', threshold: 0 }))).status).toBe(400);
  });

  it('rejects invalid input and unknown channels', async () => {
    expect((await POST(request('POST', { metric: 'unknown', operator: 'gt', threshold: 1 }))).status).toBe(400);
    expect((await POST(request('POST', { metric: 'followers', operator: 'eq', threshold: 1 }))).status).toBe(400);
    expect((await POST(request('POST', { metric: 'followers', operator: 'gt', threshold: '1' }))).status).toBe(400);
    expect((await POST(request('POST', { metric: 'keyword', keywordQuery: '   ,  ' }))).status).toBe(400);
    expect((await POST(request('POST', { metric: 'keyword', keywordQuery: 'x'.repeat(101) }))).status).toBe(400);
    mocks.channel.mockResolvedValue(null);
    expect((await POST(request('POST', { channelId: 999, metric: 'followers', operator: 'gt', threshold: 1 }))).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate rule', async () => {
    mocks.existing.mockResolvedValue({ id: 1 });
    expect((await POST(request('POST', { metric: 'followers', operator: 'gt', threshold: 100 }))).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('toggles and deletes a rule', async () => {
    expect((await PATCH(request('PATCH', { id: 10, enabled: false }))).status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 10 }, data: { enabled: false } });
    expect((await DELETE(request('DELETE', { id: 10 }))).status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: 10 } });
  });
});
