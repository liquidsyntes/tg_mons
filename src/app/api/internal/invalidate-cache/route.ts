import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { metricsCache, bestTimeCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authResult = verifyBearerToken(req);
  if (!authResult.authorized) {
    return authResult.response;
  }

  metricsCache.invalidate();
  bestTimeCache.invalidate();

  return NextResponse.json({ success: true });
}
