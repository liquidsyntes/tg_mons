import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { buildHourlyActivity, ACTIVITY_HOURS } from '@/lib/channel-activity';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { getAppTimezone } from '@/lib/timezone';

interface RouteContext { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  const { id } = await context.params;
  const channelId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(channelId) || channelId > 2147483647) {
    return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
  }

  try {
    if (auth.userId === null) {
      const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true } });
      if (!channel) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    } else {
      const access = await prisma.userChannel.findUnique({
        where: { userId_channelId: { userId: auth.userId, channelId } }, select: { channelId: true },
      });
      if (!access) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    }

    const now = new Date();
    const currentHour = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
    const firstHour = new Date(currentHour - (ACTIVITY_HOURS - 1) * 3_600_000);
    const previousHour = new Date(firstHour.getTime() - 3_600_000);
    const [snapshots, previousSnapshot, posts, engagement] = await Promise.all([
      prisma.snapshot.findMany({
        where: { channelId, collectedAt: { gte: firstHour, lte: now } },
        select: { collectedAt: true, membersCount: true }, orderBy: { collectedAt: 'asc' },
      }),
      prisma.snapshot.findFirst({
        where: { channelId, collectedAt: { gte: previousHour, lt: firstHour } },
        select: { collectedAt: true, membersCount: true }, orderBy: { collectedAt: 'desc' },
      }),
      prisma.post.findMany({
        where: { channelId, publishedAt: { gte: firstHour, lte: now } },
        select: { id: true, messageId: true, publishedAt: true,
          mentions: { where: { type: 'forward' }, select: { id: true }, take: 1 } },
        orderBy: { publishedAt: 'asc' },
      }),
      prisma.postEngagementHour.findMany({
        where: { channelId, hourStart: { gte: firstHour, lte: now } },
        select: { hourStart: true, reactionsAdded: true, forwardsAdded: true },
      }),
    ]);

    const rows = buildHourlyActivity(now, snapshots,
      posts.map(post => ({ id: post.id, messageId: post.messageId, publishedAt: post.publishedAt,
        isForwarded: post.mentions.length > 0 })), engagement, previousSnapshot);
    return NextResponse.json({ timeZone: getAppTimezone(), rows }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    logger.error('GET /api/stats/channel/[id]/activity error:', { channelId }, error);
    return NextResponse.json({ error: 'Не удалось загрузить активность канала' }, { status: 500 });
  }
}
