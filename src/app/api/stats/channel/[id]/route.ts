import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getChannelDetailStats, parseStatsPeriod } from '@/lib/metrics';
import { metricsCache } from '@/lib/cache';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const period = parseStatsPeriod(searchParams.get('period'));

    const cacheKey = `channel:${channelId}:${period}`;
    const cached = metricsCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const detailStats = await getChannelDetailStats(channelId, period);
    if (!detailStats) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    metricsCache.set(cacheKey, detailStats);
    return NextResponse.json(detailStats);
  } catch (error: unknown) {
    logger.error('GET /api/stats/channel/[id] error:', undefined, error);
    const message = error instanceof Error && error.message ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
