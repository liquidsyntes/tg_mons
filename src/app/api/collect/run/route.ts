import { NextRequest, NextResponse } from 'next/server';
import { runCollectCycle } from '@/worker/collector';
import { verifyBearerToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const authCheck = verifyBearerToken(req);
    if (!authCheck.authorized) return authCheck.response;

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
