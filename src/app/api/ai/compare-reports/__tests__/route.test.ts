import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  kinds: [] as string[],
  auth: vi.fn(),
  reportFindUnique: vi.fn(),
  callOpenRouter: vi.fn(),
  saveAiReport: vi.fn(),
  handleAiRouteError: vi.fn(),
}));

vi.mock('@/lib/ai-operations/route', () => ({
  withAiOperation: (kind: string, handler: unknown) => {
    mocks.kinds.push(kind);
    return handler;
  },
}));
vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: { aiReport: { findUnique: mocks.reportFindUnique } },
}));
vi.mock('@/lib/openrouter', () => ({ callOpenRouter: mocks.callOpenRouter }));
vi.mock('@/lib/ai-reports', () => ({
  saveAiReport: mocks.saveAiReport,
  handleAiRouteError: mocks.handleAiRouteError,
}));

import { POST } from '../route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:4000/api/ai/compare-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/compare-reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 9, role: 'USER' });
    mocks.callOpenRouter.mockResolvedValue('{"progressScore":"8","summary":"Прогресс"}');
    mocks.saveAiReport.mockResolvedValue(undefined);
    mocks.handleAiRouteError.mockReturnValue(NextResponse.json({ error: 'ai failure' }, { status: 500 }));
  });

  it('registers compare-reports kind and checks authentication', async () => {
    expect(mocks.kinds).toEqual(['compare-reports']);
    mocks.auth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const res = await POST(makeRequest({ reportId1: 1, reportId2: 2 }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when reportId1 or reportId2 is missing', async () => {
    const res = await POST(makeRequest({ reportId1: 1 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Необходимо указать два ID отчетов для сравнения.' });
  });

  it('returns 404 when reports do not exist or contain persona report for non-admin', async () => {
    mocks.reportFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect((await POST(makeRequest({ reportId1: 1, reportId2: 2 }))).status).toBe(404);

    mocks.reportFindUnique
      .mockResolvedValueOnce({
        id: 1,
        channelId: 5,
        type: 'persona',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        content: '{}',
        channel: { title: 'A' },
      })
      .mockResolvedValueOnce({
        id: 2,
        channelId: 5,
        type: 'summary',
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        content: '{}',
        channel: { title: 'A' },
      });
    expect((await POST(makeRequest({ reportId1: 1, reportId2: 2 }))).status).toBe(404);
  });

  it('sorts older vs newer report chronologically and saves evolution report', async () => {
    const newer = {
      id: 20,
      channelId: 14,
      type: 'summary',
      createdAt: new Date('2026-11-15T00:00:00.000Z'),
      content: '{"summary":"NEW"}',
      channel: { title: 'Newer Channel' },
    };
    const older = {
      id: 10,
      channelId: 12,
      type: 'summary',
      createdAt: new Date('2026-10-15T00:00:00.000Z'),
      content: '{"summary":"OLD"}',
      channel: { title: 'Older Channel' },
    };
    mocks.reportFindUnique.mockResolvedValueOnce(newer).mockResolvedValueOnce(older);

    const res = await POST(makeRequest({ reportId1: 20, reportId2: 10 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: '{"progressScore":"8","summary":"Прогресс"}' });
    const promptArg = mocks.callOpenRouter.mock.calls[0]?.[0] as string;
    expect(promptArg).toContain('СТАРЫЙ ОТЧЕТ (от 2026-10-15T00:00:00.000Z):\n{"summary":"OLD"}');
    expect(promptArg).toContain('НОВЫЙ ОТЧЕТ (от 2026-11-15T00:00:00.000Z):\n{"summary":"NEW"}');
    expect(mocks.saveAiReport).toHaveBeenCalledWith(12, 'evolution', '{"progressScore":"8","summary":"Прогресс"}', 9);

    const err = new Error('timeout');
    mocks.reportFindUnique.mockResolvedValueOnce(newer).mockResolvedValueOnce(older);
    mocks.callOpenRouter.mockRejectedValueOnce(err);
    expect((await POST(makeRequest({ reportId1: 20, reportId2: 10 }))).status).toBe(500);
    expect(mocks.handleAiRouteError).toHaveBeenCalledWith(err);
  });
});
