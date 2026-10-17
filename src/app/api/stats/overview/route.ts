import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getOverviewStats } from '@/lib/metrics';
import { metricsCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cached = metricsCache.get('overview');
    if (cached) {
      return NextResponse.json(cached);
    }

    const stats = await getOverviewStats();
    metricsCache.set('overview', stats);
    return NextResponse.json(stats);
  } catch (error: unknown) {
    logger.error('GET /api/stats/overview error:', undefined, error);
    const message = error instanceof Error && error.message ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
