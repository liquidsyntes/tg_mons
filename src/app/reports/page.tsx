import React from 'react';
import { prisma } from '@/lib/prisma';
import { FileText } from 'lucide-react';
import { Header } from '@/components/Header';
import { ReportsListClient } from '@/components/ReportsListClient';

export const revalidate = 0;

export default async function ReportsPage() {
  const reports = await prisma.aiReport.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      channel: true
    }
  });

  // Convert dates to strings to pass to client component safely
  const plainReports = reports.map(r => ({
    id: r.id,
    type: r.type,
    createdAt: r.createdAt.toISOString(),
    channel: { title: r.channel?.title || 'Глобальный отчет (Тренды)' }
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-[6px]">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <FileText className="w-6 h-6 text-accent" />
            Архив AI-Отчетов
          </h1>
          <p className="text-sm text-slate-400">
            Все сгенерированные контент-анализы и сравнения. Выберите два отчета галочками, чтобы проанализировать динамику изменений.
          </p>
        </div>

        <ReportsListClient reports={plainReports} />
      </main>
    </div>
  );
}
