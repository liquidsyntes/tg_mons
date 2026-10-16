import { NextRequest, NextResponse } from 'next/server';
import { verifyServiceBearerToken } from '@/lib/auth';
import { metricsCache, bestTimeCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authResult = await verifyServiceBearerToken(req);
  if (!authResult.authorized) {
    return authResult.response;
  }

  metricsCache.invalidate();
  bestTimeCache.invalidate();

  return NextResponse.json({ success: true });
}
