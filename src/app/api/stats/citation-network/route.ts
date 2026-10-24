import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { buildCitationNetwork } from '@/lib/citationNetwork';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const rawChannelId = request.nextUrl.searchParams.get('channelId');
  const channelId = Number(rawChannelId);
  if (!rawChannelId || !/^[1-9]\d*$/.test(rawChannelId) || !Number.isSafeInteger(channelId)) {
    return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
  }
  const rawDays = request.nextUrl.searchParams.get('days');
  if (rawDays !== null && !/^(7|30|90)$/.test(rawDays)) {
    return NextResponse.json({ error: 'Период должен быть 7, 30 или 90 дней' }, { status: 400 });
  }
  const days = rawDays === null ? 30 : Number(rawDays);

  try {
    if (auth.userId === null) {
      const channels = await prisma.channel.findMany({
        where: { isActive: true }, select: { id: true },
      });
      if (!channels.some(channel => channel.id === channelId)) {
        return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
      }
      return NextResponse.json(await buildCitationNetwork({
        channelIds: channels.map(channel => channel.id), focalChannelId: channelId, days,
      }));
    }

    const subscriptions = await prisma.userChannel.findMany({
      where: { userId: auth.userId, isActive: true, channel: { isActive: true } },
      select: { channelId: true, niche: true },
    });
    if (!subscriptions.some(subscription => subscription.channelId === channelId)) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }
    return NextResponse.json(await buildCitationNetwork({
      channelIds: subscriptions.map(subscription => subscription.channelId),
      focalChannelId: channelId,
      days,
      nichesByChannelId: new Map(subscriptions.map(subscription => [subscription.channelId, subscription.niche])),
    }));
  } catch (error) {
    logger.error('GET /api/stats/citation-network error:', { channelId }, error);
    return NextResponse.json({ error: 'Не удалось построить карту связей' }, { status: 500 });
  }
}
