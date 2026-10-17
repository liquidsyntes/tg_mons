import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getBestTimeRecommendation } from '@/lib/metrics';
import { bestTimeCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cached = bestTimeCache.get('best-time');
    if (cached) {
      return NextResponse.json(cached);
    }

    const recommendation = await getBestTimeRecommendation();
    bestTimeCache.set('best-time', recommendation);
    return NextResponse.json(recommendation);
  } catch (error: unknown) {
    logger.error('GET /api/stats/best-time error:', undefined, error);
    const message = error instanceof Error && error.message ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
