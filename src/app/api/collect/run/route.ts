import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { runCollectCycle } from '@/worker/collector';
import { verifyBearerToken } from '@/lib/auth';
import { metricsCache, bestTimeCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;

    const result = await runCollectCycle();
    metricsCache.invalidate();
    bestTimeCache.invalidate();
    return NextResponse.json({
      success: true,
      message: 'Цикл сбора успешно завершен',
      result,
    });
  } catch (error: any) {
    logger.error('POST /api/collect/run error:', undefined, error);
    return NextResponse.json(
      { error: error.message || 'Ошибка выполнения сбора' },
      { status: 500 }
    );
  }
}
