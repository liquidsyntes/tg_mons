import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getBestTimeRecommendation } from '@/lib/metrics';
import { bestTimeCache } from '@/lib/cache';
import { getActiveSession } from '@/lib/users';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getActiveSession();
    const cacheKey = session.userId ? `best-time:${session.userId}` : 'best-time';
    const cached = bestTimeCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const recommendation = session.userId
      ? await getBestTimeRecommendation(session.userId)
      : await getBestTimeRecommendation();
    bestTimeCache.set(cacheKey, recommendation);
    return NextResponse.json(recommendation);
  } catch (error: unknown) {
    logger.error('GET /api/stats/best-time error:', undefined, error);
    const message = error instanceof Error && error.message ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
