import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Invalid channel ID' }, { status: 400 });
    }

    const latest = await prisma.audienceDemographics.findFirst({
      where: { channelId },
      orderBy: { capturedAt: 'desc' },
      select: {
        capturedAt: true,
        languageBreakdown: true,
      },
    });

    if (!latest) {
      return NextResponse.json({ demographics: null });
    }

    return NextResponse.json({
      demographics: {
        capturedAt: latest.capturedAt.toISOString(),
        languages: latest.languageBreakdown,
      },
    });
  } catch (error: any) {
    logger.error('GET /api/stats/demographics/[id] error:', undefined, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
