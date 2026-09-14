'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export interface AdReachDataPoint {
  hoursAfterPost: number;
  views: number;
}

export interface AdReachChartProps {
  data: AdReachDataPoint[];
  className?: string;
}

export function AdReachChart({ data, className = '' }: AdReachChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={`p-4 bg-surface rounded-xl shadow-sm border border-border flex items-center justify-center text-sm text-slate-500 h-[250px] ${className}`}>
        Нет данных об охвате
      </div>
    );
  }

  // Format data for Recharts, if hours are missing we just connect the dots
  const chartData = data.map(d => ({
    time: `${d.hoursAfterPost}ч`,
    views: d.views,
  }));

  return (
    <div className={`p-4 bg-surface rounded-xl shadow-sm border border-border ${className}`}>
      <h3 className="text-sm font-semibold text-white mb-4">Динамика охвата</h3>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
            <XAxis 
              dataKey="time" 
              axisLine={{ stroke: '#1e293b' }}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
              dy={10}
            />
            <YAxis 
              axisLine={{ stroke: '#1e293b' }}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
              dx={-10}
              domain={['auto', 'auto']}
              tickFormatter={(val) => val > 1000 ? `${(val / 1000).toFixed(1)}k` : val}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderRadius: '3px', border: '1px solid #1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.5)' }}
              itemStyle={{ color: '#f8fafc' }}
              labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
              cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Line 
              type="monotone" 
              dataKey="views" 
              stroke="#38bdf8" 
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#38bdf8' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
