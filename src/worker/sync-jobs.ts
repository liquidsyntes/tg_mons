import type { Prisma, SyncJob } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class CollectAlreadyRunningError extends Error {
  constructor() {
    super('Сбор уже выполняется');
    this.name = 'CollectAlreadyRunningError';
  }
}

const COLLECT_LOCK_ID = 420241016;

export async function createSyncJob(totalChannels: number): Promise<SyncJob> {
  return prisma.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${COLLECT_LOCK_ID}) AS acquired
    `;
    if (!lock?.acquired) throw new CollectAlreadyRunningError();

    const minutes = Number.parseInt(process.env.HEALTH_STUCK_THRESHOLD_MINUTES || '120', 10);
    const thresholdMs = Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 120 * 60_000;
    const now = new Date();
    const staleBefore = new Date(now.getTime() - thresholdMs);
    await tx.syncJob.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: staleBefore } },
      data: { status: 'FAILED', endedAt: now, errorSummary: 'Прерванный цикл превысил срок ожидания' },
    });
    const active = await tx.syncJob.findFirst({
      where: { status: 'RUNNING', startedAt: { gte: staleBefore } },
      select: { id: true },
    });
    if (active) throw new CollectAlreadyRunningError();

    return tx.syncJob.create({
      data: { startedAt: now, status: 'RUNNING', channelsTotal: totalChannels },
    });
  });
}

export async function markInterruptedSyncJob(syncJobId: number): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: syncJobId } });
  if (!job || job.status !== 'RUNNING') return;
  await prisma.syncJob.updateMany({
    where: { id: syncJobId, status: 'RUNNING' },
    data: {
      status: job.channelsSucceeded > 0 ? 'PARTIAL' : 'FAILED',
      endedAt: new Date(),
      durationMs: Date.now() - job.startedAt.getTime(),
      errorSummary: 'Сбор прерван при остановке worker',
    },
  });
}

export async function updateSyncJobProgress(syncJobId: number, successCount?: number, errorCount?: number, postsAdded?: number): Promise<Prisma.BatchPayload> {
  return await prisma.syncJob.updateMany({
    where: { id: syncJobId, status: 'RUNNING' },
    data: {
      ...(successCount !== undefined ? { channelsSucceeded: successCount } : {}),
      ...(errorCount !== undefined ? { channelsFailed: errorCount } : {}),
      ...(postsAdded !== undefined ? { postsAdded } : {}),
    },
  });
}

export async function finalizeSyncJob(
  syncJobId: number,
  durationMs: number,
  successCount: number,
  errorCount: number,
  activeChannelsCount: number,
  totalPosts: number,
  fatalError: string | null,
  interrupted = false,
  errorSummary: string | null = null,
): Promise<Prisma.BatchPayload> {
  let finalStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' = 'COMPLETED';

  if (interrupted) {
    finalStatus = successCount > 0 ? 'PARTIAL' : 'FAILED';
  } else if (fatalError) {
    finalStatus = 'FAILED';
  } else if (errorCount > 0 && successCount > 0) {
    finalStatus = 'PARTIAL';
  } else if (errorCount > 0 && successCount === 0 && activeChannelsCount > 0) {
    finalStatus = 'FAILED';
  }

  return await prisma.syncJob.updateMany({
    where: { id: syncJobId, status: 'RUNNING' },
    data: {
      endedAt: new Date(),
      durationMs,
      status: finalStatus,
      errorSummary: interrupted ? 'Сбор прерван при остановке worker' : errorSummary,
      channelsSucceeded: successCount,
      channelsFailed: errorCount,
      postsAdded: totalPosts,
    },
  });
}
