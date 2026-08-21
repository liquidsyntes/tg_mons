import { NextResponse } from 'next/server';
import { getOverviewStats } from '@/lib/metrics';

export async function GET() {
  try {
    const stats = await getOverviewStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('GET /api/stats/overview error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
