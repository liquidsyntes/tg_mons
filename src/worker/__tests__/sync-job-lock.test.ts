import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  latest: vi.fn(),
  activeChannel: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: mocks.transaction,
  syncJob: { findUnique: mocks.findUnique, findFirst: mocks.latest, updateMany: mocks.updateMany, update: mocks.update },
  channel: { findFirst: mocks.activeChannel },
} }));
import { CollectAlreadyRunningError, createSyncJob, finalizeSyncJob, markInterruptedSyncJob, updateSyncJobProgress } from '../persister';
import { CollectAlreadyRunningError as SyncJobConflict, shouldRecoverSyncJobOnStartup } from '../sync-jobs';

afterEach(() => vi.unstubAllEnvs());

describe('SyncJob coordination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lock.mockResolvedValue([{ acquired: true }]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 42, status: 'RUNNING' });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.activeChannel.mockResolvedValue({ id: 1 });
    mocks.latest.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (callback: (tx: object) => Promise<unknown>) => callback({
      $queryRaw: mocks.lock,
      syncJob: { findFirst: mocks.findFirst, create: mocks.create, updateMany: mocks.updateMany },
    }));
  });

  it('claims the job under a PostgreSQL transaction lock', async () => {
    expect(await createSyncJob(3)).toMatchObject({ id: 42 });
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'RUNNING' }) }));
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ channelsTotal: 3, status: 'RUNNING' }) });
  });

  it('rejects a concurrent claim before creating another job', async () => {
    mocks.findFirst.mockResolvedValue({ id: 7 });
    await expect(createSyncJob(3)).rejects.toBeInstanceOf(CollectAlreadyRunningError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects when another process holds the claim lock', async () => {
    mocks.lock.mockResolvedValue([{ acquired: false }]);
    await expect(createSyncJob(3)).rejects.toBeInstanceOf(CollectAlreadyRunningError);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('marks stale RUNNING jobs failed before a new claim', async () => {
    await createSyncJob(1);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'RUNNING', startedAt: { lt: expect.any(Date) } },
      data: expect.objectContaining({ status: 'FAILED', endedAt: expect.any(Date) }),
    }));
  });

  it('marks an interrupted job PARTIAL after progress and FAILED without progress', async () => {
    for (const [successes, status] of [[2, 'PARTIAL'], [0, 'FAILED']] as const) {
      mocks.findUnique.mockResolvedValue({ id: 42, status: 'RUNNING', startedAt: new Date(Date.now() - 1000), channelsSucceeded: successes });
      await markInterruptedSyncJob(42);
      expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { id: 42, status: 'RUNNING' },
        data: expect.objectContaining({ status, endedAt: expect.any(Date) }),
      }));
    }
  });

  it('finalizes graceful interruption without leaving RUNNING status', async () => {
    await finalizeSyncJob(42, 1000, 1, 0, 3, 5, null, true);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42, status: 'RUNNING' },
      data: expect.objectContaining({ status: 'PARTIAL', errorSummary: 'Сбор прерван при остановке worker' }),
    }));
  });

  it('stores a bounded channel error summary for partial cycles', async () => {
    await finalizeSyncJob(42, 1000, 2, 1, 3, 5, null, false, 'Ошибки каналов (1): #4: Таймаут');
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PARTIAL', errorSummary: 'Ошибки каналов (1): #4: Таймаут' }),
    }));
  });
  it('preserves the error identity through the persistence facade', async () => {
    mocks.lock.mockResolvedValue([{ acquired: false }]);
    await expect(createSyncJob(1)).rejects.toBeInstanceOf(SyncJobConflict);
    expect(new SyncJobConflict()).toBeInstanceOf(CollectAlreadyRunningError);
  });

  it.each(['COMPLETED', 'PARTIAL', 'FAILED'])('does not interrupt an already %s job', async status => {
    mocks.findUnique.mockResolvedValue({ id: 42, status });
    await markInterruptedSyncJob(42);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('restricts progress and finalization updates to RUNNING jobs', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await updateSyncJobProgress(42, 0, undefined, 0)).toEqual({ count: 0 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: { id: 42, status: 'RUNNING' }, data: { channelsSucceeded: 0, postsAdded: 0 },
    });
    expect(await finalizeSyncJob(42, 10, 0, 0, 0, 0, null)).toEqual({ count: 0 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 42, status: 'RUNNING' } }));
  });

  it('propagates a finalization error to the caller', async () => {
    const failure = new Error('Database unavailable');
    mocks.updateMany.mockRejectedValueOnce(failure);
    await expect(finalizeSyncJob(42, 10, 1, 0, 1, 2, null)).rejects.toBe(failure);
  });

  it('recovers only when a completed job is older than the health threshold', async () => {
    const now = new Date('2026-11-05T08:00:00.000Z');
    vi.stubEnv('HEALTH_STALE_THRESHOLD_MINUTES', '720');
    const endedAt = new Date(now.getTime() - 720 * 60_000);
    mocks.latest.mockResolvedValue({ startedAt: endedAt, endedAt });
    expect(await shouldRecoverSyncJobOnStartup(now)).toBe(false);
    mocks.latest.mockResolvedValue({ startedAt: endedAt, endedAt: new Date(endedAt.getTime() - 1) });
    expect(await shouldRecoverSyncJobOnStartup(now)).toBe(true);
  });

  it('recovers a stuck RUNNING job and skips empty channel lists', async () => {
    const now = new Date('2026-11-05T08:00:00.000Z');
    vi.stubEnv('HEALTH_STUCK_THRESHOLD_MINUTES', '120');
    mocks.latest.mockResolvedValue({ startedAt: new Date(now.getTime() - 121 * 60_000), endedAt: null });
    expect(await shouldRecoverSyncJobOnStartup(now)).toBe(true);
    mocks.activeChannel.mockResolvedValue(null);
    expect(await shouldRecoverSyncJobOnStartup(now)).toBe(false);
    expect(mocks.latest).toHaveBeenCalledTimes(1);
  });

  it('does not recover when no SyncJob exists', async () => {
    expect(await shouldRecoverSyncJobOnStartup()).toBe(false);
  });

});
