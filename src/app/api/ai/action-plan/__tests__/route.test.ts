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
  return new NextRequest('http://localhost:4000/api/ai/action-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/action-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ authorized: true, userId: 7, role: 'USER' });
    mocks.reportFindUnique.mockResolvedValue({
      id: 10,
      channelId: 3,
      type: 'summary',
      content: '{"summary":"Базовый отчет"}',
      channel: { title: 'Tech News' },
    });
    mocks.callOpenRouter.mockResolvedValue('{"title":"План","steps":[]}');
    mocks.saveAiReport.mockResolvedValue(undefined);
    mocks.handleAiRouteError.mockReturnValue(NextResponse.json({ error: 'ai failure' }, { status: 500 }));
  });

  it('registers action-plan AI operation kind and rejects unauthorized requests', async () => {
    expect(mocks.kinds).toEqual(['action-plan']);
    mocks.auth.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const res = await POST(makeRequest({ reportId: 10 }));
    expect(res.status).toBe(401);
    expect(mocks.reportFindUnique).not.toHaveBeenCalled();
  });

  it('returns 400 when reportId is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Необходимо указать ID отчета.' });
  });

  it('returns 404 when report is missing or persona report is requested by non-admin', async () => {
    mocks.reportFindUnique.mockResolvedValueOnce(null);
    expect((await POST(makeRequest({ reportId: 99 }))).status).toBe(404);

    mocks.reportFindUnique.mockResolvedValueOnce({
      id: 11,
      channelId: 3,
      type: 'persona',
      content: '{}',
      channel: { title: 'Secret' },
    });
    expect((await POST(makeRequest({ reportId: 11 }))).status).toBe(404);
    expect(mocks.callOpenRouter).not.toHaveBeenCalled();
  });

  it('generates and saves action_plan report and delegates errors', async () => {
    const res = await POST(makeRequest({ reportId: 10 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: '{"title":"План","steps":[]}' });
    expect(mocks.saveAiReport).toHaveBeenCalledWith(3, 'action_plan', '{"title":"План","steps":[]}', 7);

    const err = new Error('openrouter down');
    mocks.callOpenRouter.mockRejectedValueOnce(err);
    const errRes = await POST(makeRequest({ reportId: 10 }));
    expect(errRes.status).toBe(500);
    expect(mocks.handleAiRouteError).toHaveBeenCalledWith(err);
  });
});
