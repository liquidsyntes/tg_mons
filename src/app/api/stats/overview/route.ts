import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getOverviewStats } from '@/lib/metrics';
import { metricsCache } from '@/lib/cache';
import { getActiveSession } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getActiveSession();
    const cacheKey = session.userId ? `overview:${session.userId}` : 'overview';
    const cached = metricsCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const stats = session.userId ? await getOverviewStats(session.userId) : await getOverviewStats();
    metricsCache.set(cacheKey, stats);
    return NextResponse.json(stats);
  } catch (error: unknown) {
    logger.error('GET /api/stats/overview error:', undefined, error);
    const message = error instanceof Error && error.message ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
