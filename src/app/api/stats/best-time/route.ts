import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getBestTimeRecommendation } from '@/lib/metrics';
import { bestTimeCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const cached = bestTimeCache.get('best-time');
    if (cached) {
      return NextResponse.json(cached);
    }

    const recommendation = await getBestTimeRecommendation();
    bestTimeCache.set('best-time', recommendation);
    return NextResponse.json(recommendation);
  } catch (error: any) {
    logger.error('GET /api/stats/best-time error:', undefined, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
