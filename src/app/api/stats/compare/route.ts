import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getChannelDetailStats, parseStatsPeriod } from '@/lib/metrics';
import { extractRequestSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const aId = parseInt(searchParams.get('a') || '', 10);
    const bId = parseInt(searchParams.get('b') || '', 10);
    const period = parseStatsPeriod(searchParams.get('period'));

    if (isNaN(aId) || isNaN(bId)) {
      return NextResponse.json({ error: 'Необходимо указать параметры a и b (ID каналов)' }, { status: 400 });
    }

    const session = await extractRequestSession(req);
    const [statsA, statsB] = await Promise.all([
      session.userId ? getChannelDetailStats(aId, period, session.userId) : getChannelDetailStats(aId, period),
      session.userId ? getChannelDetailStats(bId, period, session.userId) : getChannelDetailStats(bId, period),
    ]);

    if (!statsA || !statsB) {
      return NextResponse.json({ error: 'Один из каналов не найден' }, { status: 404 });
    }

    return NextResponse.json({ a: statsA, b: statsB, period });
  } catch (error: unknown) {
    logger.error('GET /api/stats/compare error:', undefined, error);
    const message = error instanceof Error && error.message ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
