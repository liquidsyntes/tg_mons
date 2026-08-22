import { NextRequest, NextResponse } from 'next/server';
import { getChannelDetailStats } from '@/lib/metrics';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const aId = parseInt(searchParams.get('a') || '', 10);
    const bId = parseInt(searchParams.get('b') || '', 10);
    const periodParam = searchParams.get('period');
    const period: '24h' | '7d' | '30d' =
      periodParam === '24h' || periodParam === '30d' ? periodParam : '7d';

    if (isNaN(aId) || isNaN(bId)) {
      return NextResponse.json({ error: 'Необходимо указать параметры a и b (ID каналов)' }, { status: 400 });
    }

    const [statsA, statsB] = await Promise.all([
      getChannelDetailStats(aId, period),
      getChannelDetailStats(bId, period),
    ]);

    if (!statsA || !statsB) {
      return NextResponse.json({ error: 'Один из каналов не найден' }, { status: 404 });
    }

    return NextResponse.json({ a: statsA, b: statsB, period });
  } catch (error: any) {
    console.error('GET /api/stats/compare error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
