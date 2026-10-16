import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await verifyBearerToken(request);
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const reportId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(reportId)) {
    return NextResponse.json({ error: 'Некорректный ID отчета' }, { status: 400 });
  }

  try {
    const result = await prisma.aiReport.deleteMany({ where: { id: reportId } });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Отчет не найден' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('DELETE /api/reports/[id] error', { reportId }, error);
    return NextResponse.json({ error: 'Не удалось удалить отчет' }, { status: 500 });
  }
}
