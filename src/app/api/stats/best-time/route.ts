import { NextRequest, NextResponse } from 'next/server';
import { getBestTimeRecommendation } from '@/lib/metrics';

export async function GET(req: NextRequest) {
  try {
    const recommendation = await getBestTimeRecommendation();
    return NextResponse.json(recommendation);
  } catch (error: any) {
    console.error('GET /api/stats/best-time error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
