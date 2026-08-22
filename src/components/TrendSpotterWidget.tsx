'use client';

import React, { useEffect, useState } from 'react';
import { Radar, RefreshCw, TrendingUp, AlertCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

interface TrendItem {
  topic: string;
  description: string;
  channels: string[];
  quote: string;
}

interface TrendData {
  trends: TrendItem[];
  summary: string;
}

interface TrendReport {
  createdAt: string;
  data: TrendData;
}

export function TrendSpotterWidget() {
  const [report, setReport] = useState<TrendReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrends = async () => {
    try {
      const res = await fetch('/api/stats/trends');
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, []);

  const generateTrends = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/trends', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Ошибка при генерации трендов');
      }
      const data: TrendData = await res.json();
      setReport({
        createdAt: new Date().toISOString(),
        data
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 animate-pulse flex items-center justify-center min-h-[200px]">
        <div className="flex flex-col items-center gap-3">
          <Radar className="w-8 h-8 text-slate-600 animate-spin-slow" />
          <p className="text-sm text-slate-500 font-medium">Загрузка радара трендов...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Radar className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              Радар Трендов
              <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] uppercase font-bold tracking-wider">AI</span>
            </h3>
            <p className="text-xs text-slate-400">
              {report 
                ? `Обновлено ${formatDistanceToNow(new Date(report.createdAt), { addSuffix: true, locale: ru })}`
                : 'Поиск пересекающихся тем у конкурентов'}
            </p>
          </div>
        </div>

        <button
          onClick={generateTrends}
          disabled={generating}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin text-purple-400' : ''}`} />
          {generating ? 'Анализируем...' : 'Обновить радар'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-200">{error}</p>
        </div>
      )}

      {!report && !generating && !error && (
        <div className="text-center py-8">
          <p className="text-sm text-slate-400 mb-4">Тренды еще не генерировались. Нажмите кнопку, чтобы запустить анализ.</p>
        </div>
      )}

      {report && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-slate-800/50 border border-border text-sm text-slate-300 leading-relaxed">
            <span className="font-semibold text-white">Сводка:</span> {report.data.summary}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.data.trends.map((trend, idx) => (
              <div key={idx} className="bg-slate-900/50 rounded-2xl border border-border p-5 space-y-4 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    {trend.topic}
                  </h4>
                </div>
                
                <p className="text-sm text-slate-300 flex-1 leading-relaxed">
                  {trend.description}
                </p>

                {trend.quote && (
                  <div className="pl-3 border-l-2 border-purple-500/30 text-xs text-slate-400 italic">
                    «{trend.quote}»
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 mt-auto">
                  {trend.channels.map((ch, i) => (
                    <span key={i} className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-medium text-slate-300">
                      {ch}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
