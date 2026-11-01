import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractRequestSession } from '@/lib/auth';
import { AI_REPORT_TITLES } from '@/lib/ai-reports';
import { renderAiReportErrorHtml, renderAiReportHtml } from '@/lib/ai-report-html';

function errorResponse(kind: 'format' | 'render'): NextResponse {
  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Content-Disposition', 'attachment; filename="error.html"');
  return new NextResponse(renderAiReportErrorHtml(kind), { status: 500, headers });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reportId = Number(id);
    if (isNaN(reportId)) return new NextResponse('Invalid ID', { status: 400 });

    const session = await extractRequestSession(req);
    const report = await prisma.aiReport.findUnique({
      where: { id: reportId },
      include: { channel: true },
    });

    if (
      !report ||
      (report.type === 'persona' && session.role !== 'ADMIN') ||
      (session.userId && report.userId !== null && report.userId !== session.userId)
    ) {
      return new NextResponse('Report not found', { status: 404 });
    }

    let html: string;
    try {
      html = renderAiReportHtml({
        type: report.type,
        content: report.content,
        channelTitle: report.channel?.title || 'Глобальный отчет (Тренды)',
        createdAt: report.createdAt,
        reportTitle: AI_REPORT_TITLES[report.type] || 'Отчет',
      });
    } catch (error) {
      if (error instanceof SyntaxError) return errorResponse('format');
      throw error;
    }

    const headers = new Headers();
    headers.set('Content-Type', 'text/html; charset=utf-8');
    const safeType = report.type.replace(/[^a-zA-Z0-9_-]/g, '_');
    headers.set('Content-Disposition', `attachment; filename="report_${report.id}_${safeType}.html"`);
    return new NextResponse(html, { status: 200, headers });
  } catch (error) {
    logger.error('Export HTML Error:', undefined, error);
    return errorResponse('render');
  }
}
