import { NextRequest, NextResponse } from 'next/server';
import { runCollectCycle } from '@/worker/collector';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const configuredToken = process.env.COLLECT_API_TOKEN;

    if (configuredToken) {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized: отсутствует Bearer токен' },
          { status: 401 }
        );
      }

      const token = authHeader.replace('Bearer ', '').trim();
      if (token !== configuredToken) {
        return NextResponse.json(
          { error: 'Forbidden: неверный Bearer токен' },
          { status: 403 }
        );
      }
    }

    const result = await runCollectCycle();
    return NextResponse.json({
      success: true,
      message: 'Цикл сбора успешно завершен',
      result,
    });
  } catch (error: any) {
    console.error('POST /api/collect/run error:', error);
    return NextResponse.json(
      { error: error.message || 'Ошибка выполнения сбора' },
      { status: 500 }
    );
  }
}
