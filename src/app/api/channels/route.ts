import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { calculateChannelMetrics, getOverviewStats } from '@/lib/metrics';
import { requestWorkerAddChannel, WorkerRequestError } from '@/lib/worker-client';
import { verifyBearerToken } from '@/lib/auth';
import { getActiveSession } from '@/lib/users';
import { metricsCache, bestTimeCache } from '@/lib/cache';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getActiveSession();
    const overview = await getOverviewStats(session.userId);
    return NextResponse.json(overview.channels);
  } catch (error: any) {
    logger.error('GET /api/channels error:', undefined, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const body = await req.json();
    const { input, isMine } = body;

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'Параметр input (username или ссылка) обязателен' },
        { status: 400 }
      );
    }

    const channelId = await requestWorkerAddChannel(input, authCheck.userId ? false : Boolean(isMine));

    if (authCheck.userId && typeof prisma.userChannel?.upsert === 'function') {
      const userId = authCheck.userId;
      await prisma.$transaction(async (tx) => {
        if (isMine) {
          await tx.userChannel.updateMany({
            where: { userId, isMine: true },
            data: { isMine: false },
          });
        }
        await tx.userChannel.upsert({
          where: { userId_channelId: { userId, channelId } },
          update: {
            isActive: true,
            ...(typeof isMine === 'boolean' ? { isMine } : {}),
          },
          create: {
            userId,
            channelId,
            isMine: Boolean(isMine),
            isActive: true,
          },
        });
      });
    }

    metricsCache.invalidate();
    bestTimeCache.invalidate();
    const metrics = authCheck.userId
      ? await calculateChannelMetrics(channelId, new Date(), authCheck.userId)
      : await calculateChannelMetrics(channelId);
    return NextResponse.json(metrics, { status: 201 });
  } catch (error) {
    logger.error('POST /api/channels error:', undefined, error);
    return NextResponse.json(
      { error: error instanceof WorkerRequestError ? error.message : 'Ошибка добавления канала' },
      { status: error instanceof WorkerRequestError ? error.status : 400 }
    );
  }
}
