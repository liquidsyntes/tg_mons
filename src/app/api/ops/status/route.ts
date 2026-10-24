import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { metricsCache, bestTimeCache } from '@/lib/cache';
import { calculateRunSuccessRate, sanitizeOperationalError } from '@/lib/ops';
import { logger } from '@/lib/logger';
import type { OpsProblemChannel, OpsStatusResponse, OpsSyncJob } from '@/lib/types';

export const dynamic = 'force-dynamic';

const problemFilter = {
  OR: [{ consecutiveErrors: { gt: 0 } }, { lastError: { not: null } }],
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Доступно только администратору' }, { status: 403 });
  }

  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [rawJobs, lastCompleted, completedCount, finishedCount, activeChannels, disabledWithErrors, rawProblems] = await Promise.all([
      prisma.syncJob.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
      prisma.syncJob.findFirst({
        where: { status: 'COMPLETED' }, orderBy: { endedAt: 'desc' }, select: { endedAt: true },
      }),
      prisma.syncJob.count({ where: { status: 'COMPLETED', endedAt: { gte: weekAgo } } }),
      prisma.syncJob.count({
        where: { status: { in: ['COMPLETED', 'PARTIAL', 'FAILED'] }, endedAt: { gte: weekAgo } },
      }),
      prisma.channel.count({ where: { isActive: true } }),
      prisma.channel.count({ where: { isActive: false, ...problemFilter } }),
      prisma.channel.findMany({
        where: problemFilter,
        select: { id: true, title: true, username: true, isActive: true,
          consecutiveErrors: true, lastError: true, lastCollectedAt: true },
        orderBy: [{ isActive: 'asc' }, { consecutiveErrors: 'desc' }, { id: 'asc' }],
      }),
    ]);

    const jobs: OpsSyncJob[] = rawJobs.map(job => ({
      id: job.id,
      startedAt: job.startedAt.toISOString(),
      endedAt: job.endedAt?.toISOString() ?? null,
      status: job.status,
      channelsTotal: job.channelsTotal,
      channelsSucceeded: job.channelsSucceeded,
      channelsFailed: job.channelsFailed,
      postsAdded: job.postsAdded,
      durationMs: job.durationMs,
      errorSummary: sanitizeOperationalError(job.errorSummary, [process.env.COLLECT_API_TOKEN, process.env.DATABASE_URL]),
    }));
    const problemChannels: OpsProblemChannel[] = rawProblems.map(channel => ({
      ...channel,
      lastError: sanitizeOperationalError(channel.lastError, [process.env.COLLECT_API_TOKEN, process.env.DATABASE_URL]),
      lastCollectedAt: channel.lastCollectedAt?.toISOString() ?? null,
    }));
    const response: OpsStatusResponse = {
      latestJob: jobs[0] ?? null,
      jobs,
      summary: {
        lastSuccessfulAt: lastCompleted?.endedAt?.toISOString() ?? null,
        successRate7dPercent: calculateRunSuccessRate(completedCount, finishedCount),
        activeChannels,
        disabledWithErrors,
      },
      problemChannels,
    };
    return NextResponse.json(response);
  } catch (error) {
    logger.error('GET /api/ops/status error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось загрузить состояние сбора' }, { status: 500 });
  }
}

type ResetResult =
  | { kind: 'not-found' }
  | { kind: 'no-errors' }
  | { kind: 'updated'; channel: OpsProblemChannel };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Доступно только администратору' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !('action' in body) || body.action !== 'reset-channel-errors' ||
      !('channelId' in body) || typeof body.channelId !== 'number' ||
      !Number.isSafeInteger(body.channelId) || body.channelId <= 0) {
    return NextResponse.json({ error: 'Некорректные параметры восстановления' }, { status: 400 });
  }

  const channelId = body.channelId;
  try {
    const result: ResetResult = await prisma.$transaction(async tx => {
      const channel = await tx.channel.findUnique({
        where: { id: channelId }, select: { id: true, consecutiveErrors: true, lastError: true },
      });
      if (!channel) return { kind: 'not-found' };
      if (channel.consecutiveErrors === 0 && channel.lastError === null) return { kind: 'no-errors' };

      const updated = await tx.channel.update({
        where: { id: channelId },
        data: { consecutiveErrors: 0, lastError: null, isActive: true },
        select: { id: true, title: true, username: true, isActive: true,
          consecutiveErrors: true, lastError: true, lastCollectedAt: true },
      });
      if (auth.userId !== null) {
        await tx.userChannel.updateMany({
          where: { userId: auth.userId, channelId }, data: { isActive: true },
        });
      }
      return {
        kind: 'updated',
        channel: { ...updated, lastCollectedAt: updated.lastCollectedAt?.toISOString() ?? null },
      };
    });

    if (result.kind === 'not-found') return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    if (result.kind === 'no-errors') return NextResponse.json({ error: 'У канала нет ошибок сбора' }, { status: 409 });

    metricsCache.invalidate();
    bestTimeCache.invalidate();
    return NextResponse.json({ success: true, channel: result.channel });
  } catch (error) {
    logger.error('POST /api/ops/status error:', { channelId }, error);
    return NextResponse.json({ error: 'Не удалось восстановить канал' }, { status: 500 });
  }
}
