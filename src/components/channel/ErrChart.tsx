'use client';

import React, { useState, useEffect } from 'react';
import { Eye } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine
} from 'recharts';
import { formatNumber } from '@/lib/utils';

interface ErrChartProps {
  vrHistory: { date: string; vr: number; avgViews: number; membersCount: number }[];
  period: '24h' | '7d' | '30d';
  benchmarkErr?: number;
}

export function ErrChart({ vrHistory, period, benchmarkErr: initialBenchmarkErr }: ErrChartProps) {
  const [benchmarkErr, setBenchmarkErr] = useState<number | undefined>(initialBenchmarkErr);

  useEffect(() => {
    if (benchmarkErr === undefined) {
      fetch('/api/stats/dashboard')
        .then(res => res.json())
        .then(data => {
          if (data && data.avgErr !== undefined) {
            setBenchmarkErr(data.avgErr);
          }
        })
        .catch(() => {});
    }
  }, [benchmarkErr]);

  const chartData = (vrHistory || []).map((item) => {
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
      viewsAvg: item.avgViews ?? 0,
      vr: item.vr,
    };
  });

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-400" />
          Вовлеченность (Просмотры & исторический ERR)
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Средние просмотры на пост по дням и динамика уровня вовлеченности (ERR)
        </p>
      </div>

      <div className="h-64 w-full pt-4">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
            Нет постов за выбранный период
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} />
              <YAxis yAxisId="left" stroke="#fbbf24" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} tickFormatter={(v) => formatNumber(v)} orientation="left" />
              <YAxis yAxisId="right" stroke="#10b981" fontSize={11} tickLine={false} axisLine={{ stroke: '#1e293b' }} tickFormatter={(v) => `${v}%`} orientation="right" />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px', color: '#f8fafc' }}
                labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                formatter={(value: number, name: string) => [name === 'ERR' ? `${value}%` : formatNumber(value), name]}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              {benchmarkErr !== undefined && (
                <ReferenceLine y={benchmarkErr} yAxisId="right" stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: 'Средний по нише', fill: '#64748b', fontSize: 10 }} />
              )}
              <Line yAxisId="left" type="monotone" dataKey="viewsAvg" name="Ср. просмотры" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 3, fill: '#fbbf24' }} activeDot={{ r: 5 }} />
              <Line yAxisId="right" type="monotone" dataKey="vr" name="ERR" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
