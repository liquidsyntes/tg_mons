import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { getTopAdvertisers } from '@/lib/metrics/advertisers';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const rawDays = request.nextUrl.searchParams.get('days');
  const days = rawDays === null ? 30 : Number(rawDays);
  const niche = request.nextUrl.searchParams.get('niche')?.trim() || null;
  if ((days !== 7 && days !== 30) || (rawDays !== null && !/^(7|30)$/.test(rawDays)) ||
      (niche !== null && niche.length > 64)) {
    return NextResponse.json({ error: 'Некорректные параметры рейтинга' }, { status: 400 });
  }

  try {
    return NextResponse.json(await getTopAdvertisers(auth.userId, days, niche));
  } catch (error) {
    logger.error('GET /api/posts/advertisers error:', undefined, error);
    return NextResponse.json({ error: 'Не удалось загрузить рейтинг рекламодателей' }, { status: 500 });
  }
}
