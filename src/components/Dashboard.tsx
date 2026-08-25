'use client';

import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Radio, 
  Activity, 
  BarChart2 
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import Link from 'next/link';
import { formatNumber, formatPercent } from '@/lib/utils';
import { DeltaBadge } from './DeltaBadge';
import type { DashboardStats } from '@/lib/dashboard';

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/stats/dashboard')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch dashboard stats');
        return res.json();
      })
      .then(data => {
        setStats(data);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-surface border border-border rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-2xl h-64 animate-pulse" />
          <div className="bg-surface border border-border rounded-2xl h-64 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return null; // Silent fail or you can show error banner
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Radio className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Всего каналов</span>
          </div>
          <span className="text-2xl font-bold text-white">{formatNumber(stats.totalChannels)}</span>
        </div>
        
        <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Users className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Аудитория (сумма)</span>
          </div>
          <span className="text-2xl font-bold text-white">{formatNumber(stats.totalSubscribers)}</span>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">Рост за 7 дн</span>
          </div>
          <span className="text-2xl font-bold text-white">{formatPercent(stats.avgGrowthRate)}</span>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Activity className="w-4 h-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider">Средний ERR</span>
          </div>
          <span className="text-2xl font-bold text-white">{formatPercent(stats.avgErr)}</span>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider">Средний Score</span>
          </div>
          <span className="text-2xl font-bold text-white">
            {stats.avgScore !== undefined ? Math.round(stats.avgScore) : 'н/д'}
          </span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subscribers Chart */}
        <div className="bg-surface border border-border rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            Динамика аудитории ниши (30д)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.subscribersTimeline} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => {
                    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                    if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
                    return val;
                  }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}
                  itemStyle={{ color: '#0ea5e9' }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                  formatter={(value: number) => [formatNumber(value), 'Подписчиков']}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#0ea5e9" 
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: '#0ea5e9', stroke: '#0f172a', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Posts Chart */}
        <div className="bg-surface border border-border rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-purple-400" />
            Публикационная активность (30д)
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.postsTimeline} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}
                  itemStyle={{ color: '#a855f7' }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                  formatter={(value: number) => [value, 'Постов']}
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                />
                <Bar 
                  dataKey="count" 
                  fill="#a855f7" 
                  radius={[3, 3, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Gainers / Losers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Лидеры роста (7 дней)
          </h3>
          <div className="flex flex-col gap-3">
            {stats.topGainers.length > 0 ? (
              stats.topGainers.map((channel) => (
                <Link key={channel.id} href={`/channel/${channel.id}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700 group">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-200 group-hover:text-accent transition-colors truncate max-w-[200px]">
                      {channel.title}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {formatNumber(channel.currentMembers || 0)}
                    </span>
                  </div>
                  <DeltaBadge 
                    abs={channel.delta7d} 
                    percent={channel.percent7d} 
                  />
                </Link>
              ))
            ) : (
              <div className="text-xs text-slate-500 py-4 text-center">Нет растущих каналов</div>
            )}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-rose-400" />
            Слив аудитории (7 дней)
          </h3>
          <div className="flex flex-col gap-3">
            {stats.topLosers.length > 0 ? (
              stats.topLosers.map((channel) => (
                <Link key={channel.id} href={`/channel/${channel.id}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700 group">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-200 group-hover:text-accent transition-colors truncate max-w-[200px]">
                      {channel.title}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {formatNumber(channel.currentMembers || 0)}
                    </span>
                  </div>
                  <DeltaBadge 
                    abs={channel.delta7d} 
                    percent={channel.percent7d} 
                  />
                </Link>
              ))
            ) : (
              <div className="text-xs text-slate-500 py-4 text-center">Нет падающих каналов</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
