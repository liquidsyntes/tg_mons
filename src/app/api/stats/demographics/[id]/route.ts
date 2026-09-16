import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseBreakdown } from '@/lib/demographics';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const channelId = Number(id);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(channelId) || channelId > 2147483647) {
      return NextResponse.json({ error: 'Некорректный ID канала' }, { status: 400 });
    }
    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true } });
    if (!channel) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 });
    const latest = await prisma.audienceDemographics.findFirst({
      where: { channelId }, orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
      select: { capturedAt: true, languageBreakdown: true },
    });
    if (!latest) return NextResponse.json({ demographics: null });
    const languages = parseBreakdown(latest.languageBreakdown);
    if (!languages) {
      logger.warn('Invalid demographics snapshot', { channelId });
      return NextResponse.json({ error: 'Данные демографии повреждены' }, { status: 500 });
    }
    return NextResponse.json({ demographics: {
      capturedAt: latest.capturedAt.toISOString(), languages,
      countries: null, geographyStatus: 'unsupported',
    } });
  } catch {
    logger.error('GET demographics failed');
    return NextResponse.json({ error: 'Не удалось загрузить демографию' }, { status: 500 });
  }
}
