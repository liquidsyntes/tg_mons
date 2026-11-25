import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  syncJobFindFirst: vi.fn(),
  channelFindFirst: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  $queryRaw: db.queryRaw,
  syncJob: { findFirst: db.syncJobFindFirst },
  channel: { findFirst: db.channelFindFirst },
} }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../route';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);
const defaultReq = () => new Request('http://localhost:4000/api/health');
const job = (startedAt: Date, endedAt: Date | null) => ({
  id: 1, createdAt: startedAt, startedAt, endedAt,
  status: endedAt ? 'COMPLETED' : 'RUNNING',
  channelsTotal: 5, channelsSucceeded: endedAt ? 5 : 0,
  channelsFailed: 0, postsAdded: 50, durationMs: null, errorSummary: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  db.queryRaw.mockResolvedValue([{ value: 1 }]);
  db.syncJobFindFirst.mockResolvedValue(null);
  db.channelFindFirst.mockResolvedValue({ createdAt: minutesAgo(60) });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('GET /api/health', () => {
  it('checks DB availability before reading jobs and returns 503 when it is unavailable', async () => {
    db.queryRaw.mockRejectedValue(new Error('connection failed'));

    const response = await GET(defaultReq());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'error', message: 'database unavailable' });
    expect(db.syncJobFindFirst).not.toHaveBeenCalled();
  });

  it('returns idle when there are no active channels or jobs', async () => {
    db.channelFindFirst.mockResolvedValue(null);

    const response = await GET(defaultReq());

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('idle');
    expect(db.queryRaw).toHaveBeenCalledOnce();
  });

  it('returns initializing when active channels have no job within the startup grace period', async () => {
    vi.spyOn(process, 'uptime').mockReturnValue(5 * 60);

    const response = await GET(defaultReq());

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('initializing');
    expect(db.channelFindFirst).toHaveBeenCalledWith({
      where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { createdAt: true },
    });
  });

  it('uses the creation of a newly active channel when it is later than startup', async () => {
    vi.spyOn(process, 'uptime').mockReturnValue(13 * 60 * 60);
    db.channelFindFirst.mockResolvedValue({ createdAt: minutesAgo(10) });

    const response = await GET(defaultReq());

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('initializing');
  });

  it('returns stale when active channels still have no job after the grace period', async () => {
    vi.spyOn(process, 'uptime').mockReturnValue(13 * 60 * 60);
    db.channelFindFirst.mockResolvedValue({ createdAt: minutesAgo(13 * 60) });

    const response = await GET(defaultReq());

    expect(response.status).toBe(503);
    expect((await response.json()).message).toBe('sync job stale');
  });

  it('returns 503 when a running job exceeds the stuck threshold', async () => {
    db.syncJobFindFirst.mockResolvedValue(job(minutesAgo(130), null));

    const response = await GET(defaultReq());

    expect(response.status).toBe(503);
    expect((await response.json()).message).toBe('sync job stuck');
  });

  it('returns 503 for an old completed job with active channels', async () => {
    db.syncJobFindFirst.mockResolvedValue(job(minutesAgo(13 * 60), minutesAgo(13 * 60)));

    const response = await GET(defaultReq());

    expect(response.status).toBe(503);
    expect((await response.json()).message).toBe('sync job stale');
  });

  it('returns idle for an old completed job without active channels', async () => {
    db.channelFindFirst.mockResolvedValue(null);
    db.syncJobFindFirst.mockResolvedValue(job(minutesAgo(13 * 60), minutesAgo(13 * 60)));

    const response = await GET(defaultReq());

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('idle');
  });

  it('returns recent job details with status ok', async () => {
    db.syncJobFindFirst.mockResolvedValue(job(minutesAgo(5), minutesAgo(5)));

    const response = await GET(defaultReq());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.lastSyncStatus).toBe('COMPLETED');
    expect(data.channelsSucceeded).toBe(5);
  });

  it('returns lightweight 200 for scope=web without checking sync job staleness', async () => {
    db.syncJobFindFirst.mockResolvedValue(job(minutesAgo(13 * 60), minutesAgo(13 * 60)));

    const response = await GET(new Request('http://localhost:4000/api/health?scope=web'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', scope: 'web' });
    expect(db.queryRaw).toHaveBeenCalledOnce();
    expect(db.syncJobFindFirst).not.toHaveBeenCalled();
  });

  it('returns 503 for scope=web when database ping fails', async () => {
    db.queryRaw.mockRejectedValue(new Error('db down'));

    const response = await GET(new Request('http://localhost:4000/api/health?scope=web'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'error', message: 'database unavailable' });
  });
});
