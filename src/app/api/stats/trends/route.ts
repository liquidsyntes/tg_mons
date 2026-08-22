import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const latestTrendReport = await prisma.aiReport.findFirst({
      where: { type: 'trend' },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestTrendReport) {
      return NextResponse.json(null);
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(latestTrendReport.content);
    } catch (e) {
      console.error('Failed to parse saved trend report', e);
      return NextResponse.json(null);
    }

    return NextResponse.json({
      createdAt: latestTrendReport.createdAt,
      data: parsedContent
    });
  } catch (error: any) {
    console.error('Failed to fetch trends:', error);
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }
}
