import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { requestWorkerCollection, WorkerRequestError } from '@/lib/worker-client';
import { verifyBearerToken } from '@/lib/auth';
import { metricsCache, bestTimeCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;

    const result = await requestWorkerCollection();
    metricsCache.invalidate();
    bestTimeCache.invalidate();
    return NextResponse.json({
      success: true,
      message: 'Цикл сбора успешно завершен',
      result,
    });
  } catch (error) {
    if (!(error instanceof WorkerRequestError && error.status === 409)) {
      logger.error('POST /api/collect/run error:', undefined, error);
    }
    return NextResponse.json(
      { error: error instanceof WorkerRequestError ? error.message : 'Ошибка выполнения сбора' },
      { status: error instanceof WorkerRequestError ? error.status : 500 }
    );
  }
}
