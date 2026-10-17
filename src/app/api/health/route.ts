import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const [lastJob, oldestActiveChannel] = await Promise.all([
      prisma.syncJob.findFirst({ orderBy: { startedAt: 'desc' } }),
      prisma.channel.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    const now = Date.now();
    const stuckThresholdMs = parseInt(process.env.HEALTH_STUCK_THRESHOLD_MINUTES || '120', 10) * 60 * 1000;
    const staleThresholdMs = parseInt(process.env.HEALTH_STALE_THRESHOLD_MINUTES || '720', 10) * 60 * 1000;

    if (lastJob && !lastJob.endedAt && now - lastJob.startedAt.getTime() > stuckThresholdMs) {
      return NextResponse.json({ status: 'error', message: 'sync job stuck' }, { status: 503 });
    }

    if (!oldestActiveChannel) {
      return NextResponse.json({ status: 'idle' }, { status: 200 });
    }

    if (!lastJob) {
      const webStartedAt = now - process.uptime() * 1000;
      const waitingSince = Math.max(webStartedAt, oldestActiveChannel.createdAt.getTime());
      if (now - waitingSince > staleThresholdMs) {
        return NextResponse.json({ status: 'error', message: 'sync job stale' }, { status: 503 });
      }
      return NextResponse.json({ status: 'initializing' }, { status: 200 });
    }

    if (lastJob.endedAt && now - lastJob.endedAt.getTime() > staleThresholdMs) {
      return NextResponse.json({ status: 'error', message: 'sync job stale' }, { status: 503 });
    }

    return NextResponse.json({
      status: 'ok',
      lastSyncStatus: lastJob.status,
      lastSyncEndedAt: lastJob.endedAt,
      channelsSucceeded: lastJob.channelsSucceeded,
      channelsFailed: lastJob.channelsFailed,
    }, { status: 200 });
  } catch (error: unknown) {
    logger.error('Health API error:', undefined, error);
    return NextResponse.json({ status: 'error', message: 'database unavailable' }, { status: 503 });
  }
}
