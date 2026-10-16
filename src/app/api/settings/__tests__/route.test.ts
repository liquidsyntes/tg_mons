import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ verifyBearerToken: mocks.verifyAuth }));
vi.mock('@/lib/prisma', () => ({ prisma: { systemSetting: {
  findUnique: mocks.findUnique,
  create: mocks.create,
  upsert: mocks.upsert,
} } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/ai-config', () => ({
  DEFAULT_AI_MODEL: 'z-ai/glm-5.3-flash',
  invalidateAiConfigCache: mocks.invalidate,
  maskAiToken: (token: string | null) => token ? `...${token.slice(-4)}` : null,
}));

import { GET, POST } from '../route';

const url = 'http://localhost:4000/api/settings';
const saved = { id: 'global', aiProvider: 'openrouter', aiModel: 'saved-model', aiToken: 'private-secret', digestHour: 9 };
function post(body: Record<string, unknown>) {
  return POST(new NextRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}

describe('/api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAuth.mockResolvedValue({ authorized: true });
    mocks.findUnique.mockResolvedValue(saved);
    mocks.upsert.mockResolvedValue(saved);
    delete process.env.OPENROUTER_API_KEY;
  });

  it('does not read or save settings without authorization', async () => {
    mocks.verifyAuth.mockResolvedValue({ authorized: false, response: NextResponse.json({ error: 'Требуется вход' }, { status: 401 }) });
    expect((await GET(new NextRequest(url))).status).toBe(401);
    expect((await post({ aiModel: 'new-model' })).status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('never returns the stored token in GET or POST', async () => {
    const getResponse = await GET(new NextRequest(url));
    const postResponse = await post({ aiModel: 'new-model' });
    for (const response of [getResponse, postResponse]) {
      const text = await response.text();
      expect(text).not.toContain('private-secret');
      const body = JSON.parse(text);
      expect(body.settings).not.toHaveProperty('aiToken');
      expect(body.settings).toMatchObject({ hasToken: true, tokenPreview: '...cret', tokenSource: 'saved' });
    }
  });

  it('reports the environment fallback without exposing it', async () => {
    process.env.OPENROUTER_API_KEY = 'environment-secret';
    mocks.findUnique.mockResolvedValue({ ...saved, aiToken: null });
    const response = await GET(new NextRequest(url));
    const text = await response.text();
    expect(text).not.toContain('environment-secret');
    expect(JSON.parse(text).settings).toMatchObject({ hasToken: true, tokenSource: 'environment', tokenPreview: '...cret' });
  });

  it('preserves the token for model-only, empty, and masked submissions', async () => {
    for (const aiToken of [undefined, '', 'sk-or-...cret', '***']) {
      await post({ aiModel: 'new-model', ...(aiToken === undefined ? {} : { aiToken }) });
      expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: { aiModel: 'new-model' } }));
    }
    expect(mocks.invalidate).toHaveBeenCalledTimes(4);
  });

  it('explicitly clears the saved token and invalidates the cache', async () => {
    await post({ clearToken: true });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { aiToken: null } }));
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it('stores a new token without returning it', async () => {
    mocks.upsert.mockResolvedValue({ ...saved, aiToken: 'replacement-secret' });
    const response = await post({ aiToken: 'replacement-secret' });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { aiToken: 'replacement-secret' } }));
    expect(await response.text()).not.toContain('replacement-secret');
  });

  it('rejects invalid provider or conflicting clear request', async () => {
    expect((await post({ aiProvider: 'unsupported' })).status).toBe(400);
    expect((await post({ clearToken: true, aiToken: 'new-secret' })).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
