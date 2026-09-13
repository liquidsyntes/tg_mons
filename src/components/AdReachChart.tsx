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
      <div className={`p-4 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-sm text-slate-500 h-[250px] ${className}`}>
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
    <div className={`p-4 bg-white rounded-xl shadow-sm border border-slate-100 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-800 mb-4">Динамика охвата</h3>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="time" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              dy={10}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              dx={-10}
              tickFormatter={(val) => val > 1000 ? `${(val / 1000).toFixed(1)}k` : val}
            />
            <Tooltip
              contentStyle={{ borderRadius: '3px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              itemStyle={{ color: '#0f172a' }}
              labelStyle={{ color: '#64748b', marginBottom: '4px' }}
            />
            <Line 
              type="monotone" 
              dataKey="views" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
              activeDot={{ r: 6, fill: '#3b82f6' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
