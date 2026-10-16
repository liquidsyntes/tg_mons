import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { systemSetting: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { getAiConfig, invalidateAiConfigCache, maskAiToken } from '../ai-config';
import { callOpenRouter } from '../openrouter';

const originalKey = process.env.OPENROUTER_API_KEY;
const response = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });

describe('callOpenRouter configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAiConfigCache();
    process.env.OPENROUTER_API_KEY = 'environment-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(response));
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('prefers saved key and model and caches the DB lookup', async () => {
    mocks.findUnique.mockResolvedValue({ aiToken: 'saved-key', aiModel: 'saved-model' });
    await callOpenRouter('one');
    await callOpenRouter('two');
    expect(mocks.findUnique).toHaveBeenCalledOnce();
    const [, request] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(request.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer saved-key' }));
    expect(JSON.parse(String(request.body)).model).toBe('saved-model');
  });

  it('falls back per missing field and honors an explicit model override', async () => {
    mocks.findUnique.mockResolvedValue({ aiToken: null, aiModel: '' });
    await callOpenRouter('test');
    const [, first] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(first.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer environment-key' }));
    expect(JSON.parse(String(first.body)).model).toBe('z-ai/glm-5.3-flash');
    await callOpenRouter('test', { model: 'override-model' });
    const [, second] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(second.body)).model).toBe('override-model');
  });

  it('reads new settings after cache invalidation', async () => {
    mocks.findUnique.mockResolvedValueOnce({ aiToken: 'old-key', aiModel: 'old-model' })
      .mockResolvedValueOnce({ aiToken: 'new-key', aiModel: 'new-model' });
    expect((await getAiConfig()).apiKey).toBe('old-key');
    invalidateAiConfigCache();
    expect((await getAiConfig()).apiKey).toBe('new-key');
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it('uses environment fallback if the database is unavailable', async () => {
    mocks.findUnique.mockRejectedValue(new Error('db unavailable'));
    expect(await getAiConfig()).toEqual({ apiKey: 'environment-key', model: 'z-ai/glm-5.3-flash' });
  });

  it('does not send a request when no key is configured', async () => {
    delete process.env.OPENROUTER_API_KEY;
    mocks.findUnique.mockResolvedValue(null);
    await expect(callOpenRouter('test')).rejects.toThrow('Ключ OpenRouter не настроен');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not reveal short keys in the preview', () => {
    expect(maskAiToken('short')).toBe('***');
    expect(maskAiToken('sk-or-1234')).toBe('...1234');
  });
});
