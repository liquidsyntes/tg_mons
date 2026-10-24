import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { getChannelAdAttribution } from '@/lib/adAttribution';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const channelId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(channelId)) {
    return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
  }
  const daysValue = request.nextUrl.searchParams.get('days');
  const days = daysValue === null ? 30 : Number(daysValue);
  if (daysValue !== null && (!/^(7|30|90)$/.test(daysValue) || !Number.isInteger(days))) {
    return NextResponse.json({ error: 'Период должен быть 7, 30 или 90 дней' }, { status: 400 });
  }

  try {
    const attribution = await getChannelAdAttribution(channelId, days, auth.userId);
    if (!attribution) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    return NextResponse.json(attribution);
  } catch (error) {
    logger.error('GET /api/channels/[id]/ad-attribution error:', { channelId }, error);
    return NextResponse.json({ error: 'Не удалось рассчитать эффективность размещений' }, { status: 500 });
  }
}
