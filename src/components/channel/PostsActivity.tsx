'use client';

import { BarChart2 } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ChannelMetrics } from '@/lib/types';

interface PostsActivityProps {
  postsDistribution: { date: string; postsCount: number; viewsAvg?: number | null }[];
  channel: ChannelMetrics;
  period: '24h' | '7d' | '30d';
}

export function PostsActivity({ postsDistribution, channel, period }: PostsActivityProps) {
  const postsChartData = (postsDistribution || []).map((item) => {
    let dateFormatted = item.date;
    if (period !== '24h') {
      const parts = item.date.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        dateFormatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      }
    }

    return {
      date: dateFormatted,
      posts: item.postsCount,
    };
  });

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-emerald-400" />
          Публикационная активность
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Распределение опубликованных постов по дням / часам
        </p>
      </div>

      <div className="h-64 w-full pt-4">
        {postsChartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
            Нет постов за выбранный период
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={postsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px', color: '#f8fafc' }}
                labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
              />
              <Bar dataKey="posts" name="Количество постов" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
