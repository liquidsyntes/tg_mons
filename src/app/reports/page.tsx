import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Sparkles, Layers, Calendar, ChevronRight, FileText } from 'lucide-react';
import { Header } from '@/components/Header';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export const revalidate = 0;

export default async function ReportsPage() {
  const reports = await prisma.aiReport.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      channel: true
    }
  });

  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <FileText className="w-6 h-6 text-accent" />
            Архив AI-Отчетов
          </h1>
          <p className="text-sm text-slate-400">
            Все сгенерированные контент-анализы и сравнения с конкурентами.
          </p>
        </div>

        {reports.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Отчетов пока нет</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">
              Перейдите в карточку любого канала и нажмите «Сгенерировать саммари», чтобы создать первый отчет.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {reports.map(report => (
              <Link 
                key={report.id} 
                href={`/reports/${report.id}`}
                className="block group"
              >
                <div className="bg-surface border border-border hover:border-accent/50 rounded-2xl p-4 sm:p-5 transition-all flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${report.type === 'summary' ? 'bg-amber-400/10 text-amber-400' : 'bg-violet-400/10 text-violet-400'}`}>
                      {report.type === 'summary' ? <Sparkles className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-accent transition-colors">
                        {report.type === 'summary' ? 'Контент-анализ' : 'Сравнение с конкурентом'}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span className="font-medium text-slate-300">{report.channel.title}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(report.createdAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-900 border border-border flex items-center justify-center text-slate-400 group-hover:text-accent group-hover:border-accent/30 transition-colors shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
