import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { verifyBearerToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;
  const { id } = await params;
  const channelId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(channelId)) {
    return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
  }

  try {
    const accessible = auth.userId === null
      ? await prisma.channel.findMany({ where: { isActive: true }, select: { id: true, title: true, username: true, tgId: true } })
      : (await prisma.userChannel.findMany({
        where: { userId: auth.userId, isActive: true, channel: { isActive: true } },
        select: { channel: { select: { id: true, title: true, username: true, tgId: true } } },
      })).map(subscription => subscription.channel);
    const focal = accessible.find(channel => channel.id === channelId);
    if (!focal) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    const channelIds = accessible.map(channel => channel.id);

    const outboundRaw = await prisma.mention.groupBy({
      by: ['targetUsername', 'targetTgId', 'type'],
      where: { sourceChannelId: channelId },
      _count: { id: true },
    });
    const outbound = outboundRaw.map(item => ({
      target: item.targetUsername || (item.targetTgId ? item.targetTgId.toString() : 'unknown'),
      type: item.type,
      count: item._count.id,
    })).sort((left, right) => right.count - left.count).slice(0, 10);

    const conditions: Prisma.MentionWhereInput[] = [];
    if (focal.username) {
      const username = focal.username.replace(/^@/, '').toLowerCase();
      conditions.push({ targetUsername: { in: [username, `@${username}`] } });
    }
    if (focal.tgId) conditions.push({ targetTgId: focal.tgId });
    const inboundRaw = conditions.length === 0 ? [] : await prisma.mention.groupBy({
      by: ['sourceChannelId', 'type'],
      where: { OR: conditions, sourceChannelId: { in: channelIds, not: channelId } },
      _count: { id: true },
    });
    const byId = new Map(accessible.map(channel => [channel.id, channel]));
    const inbound = inboundRaw.map(item => {
      const channel = byId.get(item.sourceChannelId);
      return {
        source: channel?.username ? `@${channel.username}` : channel?.title ?? `Канал ${item.sourceChannelId}`,
        channelId: item.sourceChannelId,
        type: item.type,
        count: item._count.id,
      };
    }).sort((left, right) => right.count - left.count).slice(0, 10);
    return NextResponse.json({ outbound, inbound });
  } catch (error) {
    logger.error('GET /api/channels/[id]/network error:', { channelId }, error);
    return NextResponse.json({ error: 'Не удалось загрузить связи канала' }, { status: 500 });
  }
}
