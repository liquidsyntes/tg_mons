import React, { useEffect, useState } from 'react';
import { BestTimeRecommendation } from '@/lib/types';
import { Clock, Eye, Activity, Sparkles } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export function BestTimeWidget() {
  const [data, setData] = useState<BestTimeRecommendation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats/best-time')
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load best time stats:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6 h-32 animate-pulse flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-800"></div>
          <div className="h-3 w-48 bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data || (data as any).error || data.bestHour === undefined) return null;

  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const dayName = days[data.bestDay];
  
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-emerald-400" />
        <h3 className="text-base font-bold text-white">Лучшее время для поста</h3>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="flex-1 bg-slate-900 border border-emerald-500/20 rounded-xl p-4 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50"></div>
          <div className="text-slate-400 text-xs mb-1">Окно возможностей</div>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400">{dayName}</span>
            <span className="text-slate-500">в</span>
            <span>{data.bestHour.toString().padStart(2, '0')}:00</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed max-w-xs">
            Основано на анализе постов конкурентов за последние 30 дней.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex-1">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
              <Eye className="w-3 h-3" /> Охваты в это время
            </span>
            <span className="text-base font-bold text-slate-200">
              {formatNumber(data.avgViews)} <span className="text-xs font-normal text-slate-500">просм.</span>
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
              <Activity className="w-3 h-3" /> Средний ERR
            </span>
            <span className="text-base font-bold text-slate-200">
              {data.avgErr}%
            </span>
          </div>
          <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Конкуренция
            </span>
            <span className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
              <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                data.postCount < 5 ? 'bg-emerald-500/20 text-emerald-400' :
                data.postCount < 15 ? 'bg-amber-500/20 text-amber-400' :
                'bg-rose-500/20 text-rose-400'
              }`}>
                {data.postCount < 5 ? 'НИЗКАЯ' : data.postCount < 15 ? 'СРЕДНЯЯ' : 'ВЫСОКАЯ'}
              </span>
              <span className="text-xs text-slate-500">({data.postCount} постов от конкурентов)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
