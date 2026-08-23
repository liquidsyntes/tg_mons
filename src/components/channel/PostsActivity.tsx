'use client';

import { BarChart2, Eye } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { ChannelMetrics } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

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

    let err = 0;
    if (item.viewsAvg && channel?.currentMembers) {
      err = Number(((item.viewsAvg / channel.currentMembers) * 100).toFixed(1));
    }

    return {
      date: dateFormatted,
      posts: item.postsCount,
      viewsAvg: item.viewsAvg ?? 0,
      err,
    };
  });

  return (
    <>
      {/* Posts Activity Chart */}
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
                <Bar dataKey="posts" name="Количество постов" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Engagement (Views/ERR) Chart */}
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Eye className="w-4 h-4 text-amber-400" />
            Вовлеченность (Просмотры & ERR)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Средние просмотры на пост по дням и уровень вовлеченности (ERR)
          </p>
        </div>

        <div className="h-64 w-full pt-4">
          {postsChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
              Нет постов за выбранный период
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={postsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
                <YAxis yAxisId="left" stroke="#fbbf24" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} tickFormatter={(v) => formatNumber(v)} orientation="left" />
                <YAxis yAxisId="right" stroke="#f472b6" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} tickFormatter={(v) => `${v}%`} orientation="right" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px', color: '#f8fafc' }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                  formatter={(value: number, name: string) => [name === 'ERR' ? `${value}%` : formatNumber(value), name]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line yAxisId="left" type="monotone" dataKey="viewsAvg" name="Ср. просмотры" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 3, fill: '#fbbf24' }} activeDot={{ r: 5 }} />
                <Line yAxisId="right" type="monotone" dataKey="err" name="ERR" stroke="#f472b6" strokeWidth={2.5} dot={{ r: 3, fill: '#f472b6' }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
