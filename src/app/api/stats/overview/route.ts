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
  } catch (error: any) {
    console.error('GET /api/stats/overview error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
