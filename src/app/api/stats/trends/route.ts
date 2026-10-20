import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveSession } from '@/lib/users';

export async function GET() {
  try {
    const session = await getActiveSession();
    const latestTrendReport = await prisma.aiReport.findFirst({
      where: {
        type: 'trend',
        ...(session.userId ? { userId: session.userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestTrendReport) {
      return NextResponse.json(null);
    }

    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(latestTrendReport.content);
    } catch (e) {
      logger.error('Failed to parse saved trend report', undefined, e);
      return NextResponse.json(null);
    }

    return NextResponse.json({
      createdAt: latestTrendReport.createdAt,
      data: parsedContent
    });
  } catch (error: unknown) {
    logger.error('Failed to fetch trends:', undefined, error);
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }
}
