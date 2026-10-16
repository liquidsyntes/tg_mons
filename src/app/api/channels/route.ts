import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { calculateChannelMetrics, getOverviewStats } from '@/lib/metrics';
import { requestWorkerAddChannel, WorkerRequestError } from '@/lib/worker-client';
import { verifyBearerToken } from '@/lib/auth';
import { metricsCache, bestTimeCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const overview = await getOverviewStats();
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

    const channelId = await requestWorkerAddChannel(input, Boolean(isMine));

    metricsCache.invalidate();
    bestTimeCache.invalidate();
    const metrics = await calculateChannelMetrics(channelId);
    return NextResponse.json(metrics, { status: 201 });
  } catch (error) {
    logger.error('POST /api/channels error:', undefined, error);
    return NextResponse.json(
      { error: error instanceof WorkerRequestError ? error.message : 'Ошибка добавления канала' },
      { status: error instanceof WorkerRequestError ? error.status : 400 }
    );
  }
}
