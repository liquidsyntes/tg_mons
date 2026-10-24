import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: mocks.transaction,
  syncJob: { findUnique: mocks.findUnique, updateMany: mocks.updateMany, update: mocks.update },
} }));
import { CollectAlreadyRunningError, createSyncJob, finalizeSyncJob, markInterruptedSyncJob } from '../persister';

describe('SyncJob coordination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lock.mockResolvedValue([{ acquired: true }]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 42, status: 'RUNNING' });
    mocks.updateMany.mockResolvedValue({ count: 1 });
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
});
