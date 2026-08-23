import React from 'react';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Header } from '@/components/Header';
import { AISummaryReport } from '@/components/AISummaryReport';
import { AICompareReport } from '@/components/AICompareReport';
import { AIReportEvolution } from '@/components/AIReportEvolution';
import { AIActionPlan } from '@/components/AIActionPlan';
import { AITrendReport } from '@/components/AITrendReport';
import { GenerateActionPlanButton } from '@/components/GenerateActionPlanButton';
import { ArrowLeft, Calendar, Download } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);
  if (isNaN(reportId)) notFound();

  const report = await prisma.aiReport.findUnique({
    where: { id: reportId },
    include: { channel: true }
  });

  if (!report) notFound();

  let myChannel = null;
  if (report.type === 'compare') {
    myChannel = await prisma.channel.findFirst({ where: { isMine: true } });
  }

  let parsedData = null;
  try {
    parsedData = JSON.parse(report.content);
  } catch (e) {
    parsedData = null;
  }

  const titleMap: Record<string, string> = {
    summary: 'Контент-анализ',
    evolution: 'Динамика изменений',
    action_plan: 'Пошаговое руководство',
    compare: 'Сравнение каналов',
    trend: 'Радар Трендов (Рынок)'
  };

  const channelTitle = report.channel?.title || 'Глобальный отчет (Тренды)';

  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Link href="/reports" className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                  <h1 className="text-xl font-bold text-white">
                    {titleMap[report.type] || 'Отчет'}
                  </h1>
                  <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
                    <span className="font-medium text-slate-300">{channelTitle}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {format(new Date(report.createdAt), 'd MMMM yyyy, HH:mm', { locale: ru })}
                    </span>
                  </div>
                </div>
              </div>
              
              {report.channelId && (
                <div className="flex items-center gap-3">
                  <a
                    href={`/api/reports/${report.id}/export`}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Скачать HTML
                  </a>
                  <Link 
                    href={`/channel/${report.channelId}`}
                    className="px-4 py-2 bg-slate-900 border border-border rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-600 transition-colors inline-block text-center"
                  >
                    Перейти к каналу
                  </Link>
                </div>
              )}
              
              {!report.channelId && (
                <a
                  href={`/api/reports/${report.id}/export`}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Скачать HTML
                </a>
              )}
            </div>

            <div className="mt-6">
              {!parsedData ? (
                <div className="bg-surface border border-border rounded-2xl p-6 text-slate-300 whitespace-pre-wrap">
                  {report.content}
                </div>
              ) : report.type === 'summary' ? (
                <AISummaryReport data={parsedData} />
              ) : report.type === 'evolution' ? (
                <AIReportEvolution data={parsedData} />
              ) : report.type === 'action_plan' ? (
                <AIActionPlan data={parsedData} />
              ) : report.type === 'trend' ? (
                <AITrendReport data={parsedData} />
              ) : (
                <AICompareReport 
                  data={parsedData} 
                  myTitle={myChannel?.title || 'Мой канал'} 
                  targetTitle={channelTitle} 
                />
              )}
            </div>

            {report.type !== 'action_plan' && report.type !== 'trend' && parsedData && (
              <div className="flex justify-center border-t border-border/50 pt-8 mt-8">
                <GenerateActionPlanButton reportId={report.id} />
              </div>
            )}
        </div>
      </main>
    </div>
  );
}
