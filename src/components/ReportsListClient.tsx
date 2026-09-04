'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Layers, Calendar, ChevronRight, FileText, Zap, Loader2, ListTodo, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Report {
  id: number;
  type: string;
  createdAt: string;
  channel: { title: string };
}

interface Props {
  reports: Report[];
}

export function ReportsListClient({ reports }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return prev; // max 2
      return [...prev, id];
    });
  };

  const handleCompare = async () => {
    if (selectedIds.length !== 2) return;
    setIsComparing(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/compare-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId1: selectedIds[0], reportId2: selectedIds[1] })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка при сравнении отчетов');
      
      if (json.reportId) {
        router.push(`/reports/${json.reportId}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsComparing(false);
    }
  };

  if (reports.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-slate-500" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Отчетов пока нет</h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          Перейдите в карточку любого канала и нажмите «Сгенерировать саммари», чтобы создать первый отчет.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {error && (
        <div className="mb-4 bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-3">
        {reports.map(report => {
          const isSelected = selectedIds.includes(report.id);
          const getReportMeta = (type: string) => {
            switch(type) {
              case 'summary': return { Icon: Sparkles, colorClass: 'text-amber-400 bg-amber-400/10', title: 'Контент-анализ' };
              case 'evolution': return { Icon: Zap, colorClass: 'text-emerald-400 bg-emerald-400/10', title: 'Динамика изменений' };
              case 'action_plan': return { Icon: ListTodo, colorClass: 'text-cyan-400 bg-cyan-400/10', title: 'Пошаговое руководство' };
              case 'audience': return { Icon: Users, colorClass: 'text-emerald-400 bg-emerald-400/10', title: 'Анализ Целевой Аудитории' };
              case 'persona': return { Icon: Sparkles, colorClass: 'text-rose-400 bg-rose-400/10', title: 'Психологический портрет' };
              default: return { Icon: Layers, colorClass: 'text-violet-400 bg-violet-400/10', title: 'Сравнение с конкурентом' };
            }
          };
          const { Icon, colorClass, title } = getReportMeta(report.type);

          return (
            <div 
              key={report.id} 
              className={`bg-surface border rounded-2xl p-4 sm:p-5 transition-all flex items-center gap-4 ${isSelected ? 'border-accent ring-1 ring-accent/30' : 'border-border hover:border-slate-700'}`}
            >
              <div 
                onClick={() => toggleSelect(report.id)}
                className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${isSelected ? 'bg-accent border-accent text-slate-900' : 'border-slate-600 hover:border-slate-400'}`}
              >
                {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>

              <div className="flex-1 flex items-center justify-between group min-w-0 relative">
                <Link href={`/reports/${report.id}`} className="absolute inset-0 z-0" />
                <div className="flex items-center gap-4 min-w-0 pointer-events-none">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white group-hover:text-accent transition-colors truncate">
                      {title}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span className="font-medium text-slate-300 truncate">{report.channel.title}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-700 shrink-0"></span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(report.createdAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4 relative z-10">
                  <a
                    href={`/api/reports/${report.id}/export`}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="w-8 h-8 rounded-full border border-slate-700 bg-slate-800/50 flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                    title="Скачать как HTML"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  </a>
                  <div className="w-8 h-8 rounded-full bg-slate-900 border border-border flex items-center justify-center text-slate-400 group-hover:text-accent group-hover:border-accent/30 transition-colors pointer-events-none">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl p-4 flex items-center gap-6 z-50 animate-in slide-in-from-bottom-10 fade-in">
          <div className="text-sm font-medium text-white">
            Выбрано отчетов: <span className="text-accent">{selectedIds.length} / 2</span>
          </div>
          <button
            onClick={handleCompare}
            disabled={selectedIds.length !== 2 || isComparing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-accent hover:bg-accent-hover text-slate-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isComparing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Сравнение...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Сравнить прогресс
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
