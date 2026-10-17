import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/dashboard';
import { metricsCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cached = metricsCache.get('dashboard');
    if (cached) {
      return NextResponse.json(cached);
    }

    const stats = await getDashboardStats();
    metricsCache.set('dashboard', stats);
    return NextResponse.json(stats);
  } catch (error: unknown) {
    logger.error('GET /api/stats/dashboard error:', undefined, error);
    const message = error instanceof Error && error.message ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
