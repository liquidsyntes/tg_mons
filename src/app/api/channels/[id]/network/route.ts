import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const channelId = parseInt(id, 10);
    if (!channelId) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Outbound mentions (Who this channel mentions)
    const outboundRaw = await prisma.mention.groupBy({
      by: ['targetUsername', 'targetTgId', 'type'],
      where: { sourceChannelId: channelId },
      _count: { id: true },
    });

    const outbound = outboundRaw
      .map(o => ({
        target: o.targetUsername || (o.targetTgId ? o.targetTgId.toString() : 'unknown'),
        type: o.type,
        count: o._count.id,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Inbound mentions (Who mentions this channel)
    const orConditions = [];
    if (channel.username) orConditions.push({ targetUsername: channel.username.toLowerCase() });
    if (channel.tgId) orConditions.push({ targetTgId: channel.tgId });

    let inbound: any[] = [];
    if (orConditions.length > 0) {
      const inboundRaw = await prisma.mention.groupBy({
        by: ['sourceChannelId', 'type'],
        where: { OR: orConditions },
        _count: { id: true },
      });

      const sourceChannelIds = Array.from(new Set(inboundRaw.map(i => i.sourceChannelId)));
      const sourceChannels = await prisma.channel.findMany({
        where: { id: { in: sourceChannelIds } },
        select: { id: true, title: true, username: true },
      });

      inbound = inboundRaw
        .map(i => {
          const ch = sourceChannels.find(c => c.id === i.sourceChannelId);
          return {
            source: ch ? (ch.username ? `@${ch.username}` : ch.title) : `Channel ${i.sourceChannelId}`,
            channelId: i.sourceChannelId,
            type: i.type,
            count: i._count.id,
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }

    return NextResponse.json({ outbound, inbound });
  } catch (error: any) {
    logger.error('Network API error:', undefined, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
