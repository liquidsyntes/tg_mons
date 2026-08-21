import { NextRequest, NextResponse } from 'next/server';
import { getChannelDetailStats } from '@/lib/metrics';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get('period');
    const period: '24h' | '7d' | '30d' =
      periodParam === '24h' || periodParam === '30d' ? periodParam : '7d';

    const detailStats = await getChannelDetailStats(channelId, period);
    if (!detailStats) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    return NextResponse.json(detailStats);
  } catch (error: any) {
    console.error('GET /api/stats/channel/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
