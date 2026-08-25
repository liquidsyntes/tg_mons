import React, { useEffect, useState } from 'react';
import { BestTimeRecommendation } from '@/lib/types';
import { Clock, Eye, Activity, Sparkles, TrendingUp } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export function BestTimeWidget() {
  const [data, setData] = useState<BestTimeRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [upcomingSlots, setUpcomingSlots] = useState<any[]>([]);

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

  useEffect(() => {
    if (!data || !data.heatmap || data.heatmap.length === 0) return;

    // Filter valid slots and sort by score
    const validSlots = data.heatmap.filter(s => s.postCount > 0);
    if (validSlots.length === 0) return;

    // We want the absolute best slots in terms of score.
    const topSlotsRaw = [...validSlots].sort((a, b) => b.score - a.score).slice(0, 5);

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    const getNextDate = (day: number, hour: number) => {
      const date = new Date(now);
      let daysAhead = day - currentDay;
      // If it's earlier in the week, or it's today but the hour has passed, it's next week
      if (daysAhead < 0 || (daysAhead === 0 && hour <= currentHour)) {
        daysAhead += 7;
      }
      date.setDate(date.getDate() + daysAhead);
      date.setHours(hour, 0, 0, 0);
      return date;
    };

    const upcoming = topSlotsRaw.map(slot => ({
      ...slot,
      nextDate: getNextDate(slot.day, slot.hour)
    }));

    // Sort by chronological order, but we only want to pick the top 2 overall scores
    // Actually, user wants the "Best" and "Second best". We already sliced top 5.
    // Let's just take the top 2 highest scoring slots and show when they occur next.
    const top2 = upcoming.slice(0, 2);
    setUpcomingSlots(top2);
  }, [data]);

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

  if (!data || (data as any).error || upcomingSlots.length === 0) return null;

  const daysFull = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  
  const bestSlot = upcomingSlots[0];
  const secondSlot = upcomingSlots[1];

  const formatNextDate = (date: Date) => {
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
    
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth();

    if (isToday) return 'Сегодня';
    if (isTomorrow) return 'Завтра';
    return daysFull[date.getDay()];
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-[6px]">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-emerald-400" />
        <h3 className="text-base font-bold text-white">Лучшее время для поста</h3>
      </div>
      
      <div className="flex flex-col md:flex-row gap-[6px]">
        <div className="flex-1 bg-slate-900 border border-emerald-500/20 rounded-xl p-4 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50"></div>
          <div className="text-emerald-400/80 text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Топ-1 Окно
          </div>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400">{formatNextDate(bestSlot.nextDate)}</span>
            <span className="text-slate-500">в</span>
            <span>{bestSlot.hour.toString().padStart(2, '0')}:00</span>
          </div>
          
          <div className="mt-4 flex gap-4 text-xs">
            <div>
              <div className="text-slate-500 mb-0.5">Охваты</div>
              <div className="font-semibold text-slate-200">{formatNumber(bestSlot.avgViews)}</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Средний ERR</div>
              <div className="font-semibold text-slate-200">{Number((bestSlot.avgErr * 100).toFixed(1))}%</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">Постов (30д)</div>
              <div className="font-semibold text-slate-200">{bestSlot.postCount}</div>
            </div>
          </div>
        </div>

        {secondSlot && (
          <div className="flex-1 bg-slate-900 border border-blue-500/20 rounded-xl p-4 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50"></div>
            <div className="text-blue-400/80 text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" /> Топ-2 Окно
            </div>
            <div className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-blue-400">{formatNextDate(secondSlot.nextDate)}</span>
              <span className="text-slate-500">в</span>
              <span>{secondSlot.hour.toString().padStart(2, '0')}:00</span>
            </div>
            
            <div className="mt-4 flex gap-4 text-xs">
              <div>
                <div className="text-slate-500 mb-0.5">Охваты</div>
                <div className="font-semibold text-slate-200">{formatNumber(secondSlot.avgViews)}</div>
              </div>
              <div>
                <div className="text-slate-500 mb-0.5">Средний ERR</div>
                <div className="font-semibold text-slate-200">{Number((secondSlot.avgErr * 100).toFixed(1))}%</div>
              </div>
              <div>
                <div className="text-slate-500 mb-0.5">Постов (30д)</div>
                <div className="font-semibold text-slate-200">{secondSlot.postCount}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Время рассчитано на основе анализа охватов, вовлеченности (ERR) и уровня конкуренции (количества публикаций) среди всех отслеживаемых чужих каналов за последние 30 дней. Указано ближайшее окно.
      </p>
    </div>
  );
}
