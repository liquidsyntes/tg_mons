import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let settings = await prisma.systemSetting.findUnique({
      where: { id: 'global' },
    });

    if (!settings) {
      settings = await prisma.systemSetting.create({
        data: {
          id: 'global',
        },
      });
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    logger.error('GET /api/settings error:', undefined, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { aiProvider, aiModel, aiToken } = body;

    const settings = await prisma.systemSetting.upsert({
      where: { id: 'global' },
      update: {
        aiProvider: aiProvider || 'openrouter',
        aiModel: aiModel || 'meta-llama/llama-3.1-8b-instruct:free',
        aiToken: aiToken !== undefined ? aiToken : null,
      },
      create: {
        id: 'global',
        aiProvider: aiProvider || 'openrouter',
        aiModel: aiModel || 'meta-llama/llama-3.1-8b-instruct:free',
        aiToken: aiToken || null,
      },
    });

    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    logger.error('POST /api/settings error:', undefined, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
