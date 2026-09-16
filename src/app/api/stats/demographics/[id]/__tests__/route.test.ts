import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
const mocks = vi.hoisted(() => ({ channel: vi.fn(), latest: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { channel: { findUnique: mocks.channel }, audienceDemographics: { findFirst: mocks.latest } } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
const request = (id: string) => GET(new NextRequest('http://localhost/api/stats/demographics/' + id), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.resetAllMocks(); mocks.channel.mockResolvedValue({ id: 1 }); });
describe('demographics API', () => {
  it.each(['0', '-1', '1abc', '1.5', '2147483648', '1e2'])('rejects invalid ID %s', async id => {
    expect((await request(id)).status).toBe(400);
    expect(mocks.channel).not.toHaveBeenCalled();
  });
  it('returns 404 for unknown channels', async () => {
    mocks.channel.mockResolvedValue(null);
    expect((await request('1')).status).toBe(404);
  });
  it('returns null for missing snapshots', async () => {
    mocks.latest.mockResolvedValue(null);
    expect(await (await request('1')).json()).toEqual({ demographics: null });
  });
  it('preserves the language contract and explicitly marks geography unsupported', async () => {
    const languages = [{ code: 'en', name: 'English', percent: 100 }];
    mocks.latest.mockResolvedValue({ capturedAt: new Date('2026-09-16T00:00:00Z'), languageBreakdown: languages });
    expect(await (await request('1')).json()).toEqual({ demographics: {
      capturedAt: '2026-09-16T00:00:00.000Z', languages, countries: null, geographyStatus: 'unsupported',
    } });
  });
  it('rejects corrupt stored data', async () => {
    mocks.latest.mockResolvedValue({ capturedAt: new Date(), languageBreakdown: { invalid: true } });
    expect((await request('1')).status).toBe(500);
  });
  it('does not expose database error details', async () => {
    mocks.latest.mockRejectedValue(new Error('private database connection'));
    const response = await request('1');
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private');
  });
});
