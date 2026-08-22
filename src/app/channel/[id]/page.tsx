'use client';

import React, { useEffect, useState, use, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Crown,
  Calendar,
  Layers,
  BarChart2,
  TrendingUp,
  FileText,
  Clock,
  Eye,
  Sparkles,
  Flame
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { ChannelDetailStats } from '@/lib/types';
import { DeltaBadge } from '@/components/DeltaBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { DetailSkeleton } from '@/components/SkeletonLoader';
import { formatNumber, formatPercent } from '@/lib/utils';
import { HeatmapChart } from '@/components/HeatmapChart';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ChannelDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const channelId = resolvedParams.id;

  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  const [showMyChannelOverlay, setShowMyChannelOverlay] = useState(true);
  const [chartMode, setChartMode] = useState<'absolute' | 'growth'>('absolute');
  const [data, setData] = useState<ChannelDetailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [aiCompareSummary, setAiCompareSummary] = useState<string | null>(null);
  const [aiCompareLoading, setAiCompareLoading] = useState(false);
  const [aiCompareError, setAiCompareError] = useState<string | null>(null);

  const fetchChannelData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats/channel/${channelId}?period=${period}`);
      if (!res.ok) {
        throw new Error('Не удалось загрузить данные канала');
      }
      const json: ChannelDetailStats = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [channelId, period]);

  useEffect(() => {
    fetchChannelData();
  }, [fetchChannelData]);

  const fetchAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, days: period === '30d' ? 30 : period === '7d' ? 7 : 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка генерации');
      setAiSummary(json.summary);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const fetchAiCompare = async () => {
    setAiCompareLoading(true);
    setAiCompareError(null);
    try {
      const res = await fetch('/api/ai/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, days: period === '30d' ? 30 : period === '7d' ? 7 : 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка генерации');
      setAiCompareSummary(json.summary);
    } catch (err: any) {
      console.error(err);
      setAiCompareError(err.message);
    } finally {
      setAiCompareLoading(false);
    }
  };

  const channel = data?.channel;
  const myChannel = data?.myChannel;
  const isMine = channel?.isMine;

  // Prepare subscriber chart data
  const subscriberChartData = (data?.membersHistory || []).map((item, index, arr) => {
    const d = new Date(item.collectedAt);
    const dateFormatted =
      period === '24h'
        ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

    let growth = 0;
    let myGrowth: number | undefined = undefined;
    
    if (index > 0) {
      growth = item.membersCount - arr[index - 1].membersCount;
      if (item.myMembersCount !== undefined && item.myMembersCount !== null && 
          arr[index - 1].myMembersCount !== undefined && arr[index - 1].myMembersCount !== null) {
        myGrowth = item.myMembersCount - arr[index - 1].myMembersCount!;
      }
    }

    return {
      time: dateFormatted,
      fullTime: d.toLocaleString('ru-RU'),
      members: item.membersCount,
      myMembers: item.myMembersCount ?? undefined,
      growth,
      myGrowth,
    };
  });

  // Prepare post chart data
  const postsChartData = (data?.postsDistribution || []).map((item) => {
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

  const maxHeatmapCount = Math.max(...(data?.heatmapData || []).map((d) => d.count), 1);

  const CustomSubscriberTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const isGrowthMode = chartMode === 'growth';
      
      return (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-lg max-w-[280px]">
          <p className="text-slate-400 text-xs mb-2 pb-2 border-b border-slate-800">{dataPoint.fullTime || label}</p>
          
          <div className="space-y-2 text-sm">
            {/* Competitor / Current Channel */}
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-sky-400">{channel?.title}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-white font-mono">{formatNumber(isGrowthMode ? dataPoint.growth : dataPoint.members)}</span>
                {!isGrowthMode && dataPoint.growth !== 0 && (
                  <span className={`text-[11px] font-mono ${dataPoint.growth > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ({dataPoint.growth > 0 ? '+' : ''}{formatNumber(dataPoint.growth)} {period === '24h' ? 'за час' : 'за период'})
                  </span>
                )}
                {isGrowthMode && dataPoint.members !== undefined && (
                  <span className="text-[11px] text-slate-400 font-mono">
                    (всего: {formatNumber(dataPoint.members)})
                  </span>
                )}
              </div>
            </div>

            {/* My Channel */}
            {!isMine && showMyChannelOverlay && dataPoint.myMembers !== undefined && myChannel && (
              <div className="flex flex-col gap-0.5 pt-1.5 border-t border-slate-800">
                <span className="font-semibold text-violet-400">Мой: {myChannel.title}</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-white font-mono">{formatNumber(isGrowthMode ? (dataPoint.myGrowth || 0) : dataPoint.myMembers)}</span>
                  {!isGrowthMode && dataPoint.myGrowth !== undefined && dataPoint.myGrowth !== 0 && (
                    <span className={`text-[11px] font-mono ${dataPoint.myGrowth > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ({dataPoint.myGrowth > 0 ? '+' : ''}{formatNumber(dataPoint.myGrowth)})
                    </span>
                  )}
                  {isGrowthMode && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      (всего: {formatNumber(dataPoint.myMembers)})
                    </span>
                  )}
                </div>
                
                {/* Difference in Absolute mode */}
                {!isGrowthMode && dataPoint.members !== undefined && (
                  <div className="text-[11px] text-slate-400 mt-1">
                    {dataPoint.myMembers > dataPoint.members ? (
                      <span>Вы опережаете на <strong className="text-emerald-400">{formatNumber(dataPoint.myMembers - dataPoint.members)}</strong></span>
                    ) : dataPoint.myMembers < dataPoint.members ? (
                      <span>Вы отстаете на <strong className="text-rose-400">{formatNumber(dataPoint.members - dataPoint.myMembers)}</strong></span>
                    ) : (
                      <span className="text-slate-300">Аудитории равны</span>
                    )}
                  </div>
                )}

                {/* Difference in Growth mode */}
                {isGrowthMode && dataPoint.myGrowth !== undefined && dataPoint.growth !== undefined && (
                  <div className="text-[11px] text-slate-400 mt-1">
                    {dataPoint.myGrowth > dataPoint.growth ? (
                      <span>Растёте быстрее на <strong className="text-emerald-400">{formatNumber(dataPoint.myGrowth - dataPoint.growth)}</strong></span>
                    ) : dataPoint.myGrowth < dataPoint.growth ? (
                      <span>Растёте медленнее на <strong className="text-rose-400">{formatNumber(dataPoint.growth - dataPoint.myGrowth)}</strong></span>
                    ) : (
                      <span className="text-slate-300">Темп роста одинаковый</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      {/* Top Bar */}
      <div className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Назад ко всем каналам</span>
          </Link>

          {/* Period selector */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-border">
            {(['24h', '7d', '30d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-mono font-medium rounded-lg transition-all ${
                  period === p
                    ? 'bg-accent text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p === '24h' ? '24ч' : p === '7d' ? '7 дней' : '30 дней'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {loading ? (
          <DetailSkeleton />
        ) : error || !channel ? (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-8 text-center space-y-3">
            <h3 className="text-base font-semibold text-white">Канал не найден или произошла ошибка</h3>
            <p className="text-xs text-rose-300/80">{error}</p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
            >
              Вернуться на главную
            </Link>
          </div>
        ) : (
          <>
            {/* Channel Hero Header */}
            <div className="bg-surface border border-border rounded-2xl p-6 relative overflow-hidden shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {isMine && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-accent/20 text-accent font-semibold border border-accent/30">
                        <Crown className="w-3.5 h-3.5" />
                        Мой канал
                      </span>
                    )}
                    <StatusBadge
                      status={channel.status}
                      lastCollectedAt={channel.lastCollectedAt}
                      lastError={channel.lastError}
                    />
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    {channel.title}
                  </h1>

                  {channel.username && (
                    <a
                      href={`https://t.me/${channel.username}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-400 hover:text-accent font-mono inline-flex items-center gap-1 transition-colors"
                    >
                      @{channel.username}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-left md:text-right">
                    <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tabular-nums">
                      {formatNumber(channel.currentMembers)}
                    </div>
                    <div className="text-xs text-slate-400">текущих подписчиков</div>
                  </div>
                </div>
              </div>

              {/* KPI Cards Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-border/70">
                <div className="bg-slate-900/60 p-3 rounded-xl border border-border/50">
                  <span className="text-[11px] text-slate-400 block mb-1">Δ 24 часа</span>
                  <DeltaBadge abs={channel.delta24h.abs} percent={channel.delta24h.percent} size="md" />
                </div>
                <div className="bg-slate-900/60 p-3 rounded-xl border border-border/50">
                  <span className="text-[11px] text-slate-400 block mb-1">Δ 7 дней</span>
                  <DeltaBadge abs={channel.delta7d.abs} percent={channel.delta7d.percent} size="md" />
                </div>
                <div className="bg-slate-900/60 p-3 rounded-xl border border-border/50">
                  <span className="text-[11px] text-slate-400 block mb-1">Δ 30 дней</span>
                  <DeltaBadge abs={channel.delta30d.abs} percent={channel.delta30d.percent} size="md" />
                </div>
                <div className="bg-slate-900/60 p-3 rounded-xl border border-border/50">
                  <span className="text-[11px] text-slate-400 block mb-1">Публикаций (30д)</span>
                  <div className="text-xs font-mono font-semibold text-white">
                    {channel.posts30d}{' '}
                    <span className="text-slate-400 font-normal">({channel.avgPostsPerDay}/д)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Subscriber Dynamics Chart */}
            <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-accent" />
                    Динамика участников
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    История изменения числа подписчиков по снапшотам
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-border">
                    <button
                      onClick={() => setChartMode('absolute')}
                      className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                        chartMode === 'absolute' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Абсолютные
                    </button>
                    <button
                      onClick={() => setChartMode('growth')}
                      className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                        chartMode === 'growth' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Прирост
                    </button>
                  </div>

                  {!isMine && myChannel && (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-900/80 px-3 py-1.5 rounded-xl border border-border hover:border-slate-700 transition-colors">
                      <input
                        type="checkbox"
                        checked={showMyChannelOverlay}
                        onChange={(e) => setShowMyChannelOverlay(e.target.checked)}
                        className="rounded border-slate-700 text-accent focus:ring-accent bg-slate-800"
                      />
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-violet-400"></span>
                        Наложить кривую «{myChannel.title}»
                      </span>
                    </label>
                  )}
                </div>
              </div>

              <div className="h-72 w-full pt-4">
                {subscriberChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                    Нет накопленных снапшотов за выбранный период
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    {chartMode === 'absolute' ? (
                      <LineChart data={subscriberChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                          dataKey="time"
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          axisLine={{ stroke: '#1e293b' }}
                        />
                        <YAxis
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          axisLine={{ stroke: '#1e293b' }}
                          domain={['auto', 'auto']}
                          tickFormatter={(v) => formatNumber(v)}
                        />
                        <Tooltip content={<CustomSubscriberTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }} />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Line
                          type="monotone"
                          dataKey="members"
                          name={channel.title}
                          stroke="#38bdf8"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#38bdf8' }}
                          activeDot={{ r: 5 }}
                        />
                        {!isMine && showMyChannelOverlay && myChannel && (
                          <Line
                            type="monotone"
                            dataKey="myMembers"
                            name={`Мой: ${myChannel.title}`}
                            stroke="#a855f7"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={{ r: 2, fill: '#a855f7' }}
                          />
                        )}
                      </LineChart>
                    ) : (
                      <BarChart data={subscriberChartData.slice(1)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                          dataKey="time"
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          axisLine={{ stroke: '#1e293b' }}
                        />
                        <YAxis
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          axisLine={{ stroke: '#1e293b' }}
                          tickFormatter={(v) => (v > 0 ? `+${formatNumber(v)}` : formatNumber(v))}
                        />
                        <Tooltip content={<CustomSubscriberTooltip />} cursor={{ fill: '#334155', opacity: 0.2 }} />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Bar
                          dataKey="growth"
                          name={channel.title}
                          fill="#38bdf8"
                          radius={[4, 4, 0, 0]}
                        />
                        {!isMine && showMyChannelOverlay && myChannel && (
                          <Bar
                            dataKey="myGrowth"
                            name={`Мой: ${myChannel.title}`}
                            fill="#a855f7"
                            radius={[4, 4, 0, 0]}
                          />
                        )}
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                )}
              </div>
            </div>

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
                      <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                      />
                      <Bar
                        dataKey="posts"
                        name="Количество постов"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      />
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
                      <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                      />
                      <YAxis
                        yAxisId="left"
                        stroke="#fbbf24"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                        tickFormatter={(v) => formatNumber(v)}
                        orientation="left"
                      />
                      <YAxis
                        yAxisId="right"
                        stroke="#f472b6"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: '#1e293b' }}
                        tickFormatter={(v) => `${v}%`}
                        orientation="right"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#f8fafc',
                        }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                        formatter={(value: number, name: string) => [
                          name === 'ERR' ? `${value}%` : formatNumber(value),
                          name
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="viewsAvg"
                        name="Ср. просмотры"
                        stroke="#fbbf24"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#fbbf24' }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="err"
                        name="ERR"
                        stroke="#f472b6"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#f472b6' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Heatmap Section */}
            <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-500" />
                    Тепловая карта публикаций
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    В какие дни недели и часы выходит больше всего постов (за выбранный период)
                  </p>
                </div>
                
                {!isMine && myChannel && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-900/80 px-3 py-1.5 rounded-xl border border-border hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={showMyChannelOverlay}
                      onChange={(e) => setShowMyChannelOverlay(e.target.checked)}
                      className="rounded border-slate-700 text-accent focus:ring-accent bg-slate-800"
                    />
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm border-2 border-violet-500"></span>
                      Наложить мои посты
                    </span>
                  </label>
                )}
              </div>

              <div className="pt-2 overflow-x-auto scrollbar-hide">
                <div className="min-w-[600px]">
                  {/* Hours Header */}
                  <div className="flex">
                    <div className="w-8 shrink-0"></div>
                    <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div key={i} className="text-[10px] text-slate-500 text-center">
                          {i}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Grid Rows */}
                  <div className="mt-1 flex flex-col gap-1">
                    {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => {
                      const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
                      return (
                        <div key={dayIdx} className="flex items-center">
                          <div className="w-8 shrink-0 text-[10px] font-medium text-slate-400 flex items-center justify-end pr-2">
                            {dayNames[dayIdx]}
                          </div>
                          <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                            {Array.from({ length: 24 }).map((_, hour) => {
                              const cellData = data?.heatmapData?.find(
                                (d) => d.day === dayIdx && d.hour === hour
                              );
                              const count = cellData?.count || 0;
                              
                              let myCount = 0;
                              if (!isMine && showMyChannelOverlay && data?.myHeatmapData) {
                                myCount = data.myHeatmapData.find(
                                  (d) => d.day === dayIdx && d.hour === hour
                                )?.count || 0;
                              }
                              
                              // Calculate color intensity (0.1 to 1) based on max count
                              const intensity = count > 0 ? Math.max(0.2, count / maxHeatmapCount) : 0;
                              
                              // Tooltip text
                              let tooltipText = `${dayNames[dayIdx]}, ${hour}:00 — Конкурент: ${count}`;
                              if (!isMine && showMyChannelOverlay) {
                                tooltipText += ` | Мой канал: ${myCount}`;
                                if (count === 0 && myCount > 0) tooltipText += ' (Свободное окно!)';
                                if (count > 0 && myCount > 0) tooltipText += ' (Пересечение)';
                              }
                              
                              return (
                                <div
                                  key={hour}
                                  title={tooltipText}
                                  className={`aspect-square rounded-sm transition-all duration-200 cursor-pointer ${
                                    myCount > 0 
                                      ? 'ring-2 ring-violet-500 ring-inset z-10 scale-105' 
                                      : 'hover:ring-1 hover:ring-white/50'
                                  }`}
                                  style={{
                                    backgroundColor: count > 0 ? `rgba(249, 115, 22, ${intensity})` : 'rgba(30, 41, 59, 0.5)',
                                  }}
                                ></div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Summary Section */}
            <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    AI-анализ контента
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Нейросеть проанализирует посты канала и сделает выжимку
                  </p>
                </div>
                <button
                  onClick={fetchAiSummary}
                  disabled={aiLoading}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-slate-950 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {aiLoading ? 'Анализирую...' : 'Сгенерировать саммари'}
                </button>
              </div>

              {aiError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                  {aiError}
                </div>
              )}

              {aiSummary && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-border/60 prose prose-invert prose-sm max-w-none text-slate-300">
                  <div dangerouslySetInnerHTML={{ 
                    __html: aiSummary
                      .replace(/\n/g, '<br />')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                  }} />
                </div>
              )}
            </div>

            {/* AI Comparative Summary Section */}
            {!isMine && myChannel && (
              <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-violet-400" />
                      Сравнительный AI-анализ
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Сравнить контент этого канала с вашим («{myChannel.title}»)
                    </p>
                  </div>
                  <button
                    onClick={fetchAiCompare}
                    disabled={aiCompareLoading}
                    className="px-4 py-2 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {aiCompareLoading ? 'Сравниваю...' : 'Сравнить каналы'}
                  </button>
                </div>

                {aiCompareError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                    {aiCompareError}
                  </div>
                )}

                {aiCompareSummary && (
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-border/60 prose prose-invert prose-sm max-w-none text-slate-300">
                    <div dangerouslySetInnerHTML={{ 
                      __html: aiCompareSummary
                        .replace(/\n/g, '<br />')
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    }} />
                  </div>
                )}
              </div>
            )}

            {/* Heatmap Chart */}
            <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4 overflow-hidden">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-violet-400" />
                  Тепловая карта публикаций
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  В какие дни недели и часы выходит больше всего постов (за выбранный период)
                </p>
              </div>
              <div className="pt-4">
                {data.heatmapData && data.heatmapData.length > 0 ? (
                  <HeatmapChart data={data.heatmapData} />
                ) : (
                  <div className="h-32 flex items-center justify-center text-xs text-slate-500 font-mono">
                    Нет данных для тепловой карты
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
