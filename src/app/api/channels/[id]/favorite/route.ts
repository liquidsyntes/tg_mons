import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBearerToken } from '@/lib/auth';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;
    const { id } = await params;
    const channelId = parseInt(id, 10);
    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const body = await req.json();
    const { isFavorite } = body;

    const channel = await prisma.channel.update({
      where: { id: channelId },
      data: { isFavorite }
    });

    return NextResponse.json({ success: true, isFavorite: channel.isFavorite });
  } catch (error: any) {
    logger.error('Failed to update favorite status:', undefined, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
