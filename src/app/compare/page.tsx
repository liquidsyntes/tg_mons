'use client';

import React, { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  GitCompareArrows,
  TrendingUp,
  BarChart2,
  Users,
  Eye,
  FileText,
  ChevronDown,
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
  Legend,
} from 'recharts';
import { ChannelDetailStats, ChannelMetrics } from '@/lib/types';
import { DeltaBadge } from '@/components/DeltaBadge';
import { formatNumber, formatPercent } from '@/lib/utils';

interface CompareData {
  a: ChannelDetailStats;
  b: ChannelDetailStats;
  period: string;
}

function ComparePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const aId = searchParams.get('a');
  const bId = searchParams.get('b');

  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Channel list for selectors
  const [channels, setChannels] = useState<ChannelMetrics[]>([]);
  const [selectedA, setSelectedA] = useState<string>(aId || '');
  const [selectedB, setSelectedB] = useState<string>(bId || '');

  // Fetch channel list
  useEffect(() => {
    fetch('/api/channels')
      .then((r) => r.json())
      .then((list) => setChannels(list))
      .catch(console.error);
  }, []);

  // Sync URL params
  useEffect(() => {
    if (aId) setSelectedA(aId);
    if (bId) setSelectedB(bId);
  }, [aId, bId]);

  // Fetch comparison data
  useEffect(() => {
    if (!selectedA || !selectedB || selectedA === selectedB) return;
    setLoading(true);
    setError(null);
    fetch(`/api/stats/compare?a=${selectedA}&b=${selectedB}&period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error('Ошибка загрузки данных');
        return r.json();
      })
      .then((json) => setData(json))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedA, selectedB, period]);

  const handleCompare = () => {
    if (selectedA && selectedB && selectedA !== selectedB) {
      router.push(`/compare?a=${selectedA}&b=${selectedB}`);
    }
  };

  // Merge subscriber histories for overlay chart
  const mergedSubscriberData = useMemo(() => {
    if (!data) return [];
    const aHistory = data.a.membersHistory || [];
    const bHistory = data.b.membersHistory || [];

    const allTimes = new Set<string>();
    const aMap = new Map<string, number>();
    const bMap = new Map<string, number>();

    for (const point of aHistory) {
      const key = new Date(point.collectedAt).toISOString();
      allTimes.add(key);
      aMap.set(key, point.membersCount);
    }
    for (const point of bHistory) {
      const key = new Date(point.collectedAt).toISOString();
      allTimes.add(key);
      bMap.set(key, point.membersCount);
    }

    const sorted = Array.from(allTimes).sort();
    let lastA: number | undefined;
    let lastB: number | undefined;

    return sorted.map((t) => {
      const d = new Date(t);
      const dateFormatted =
        period === '24h'
          ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

      if (aMap.has(t)) lastA = aMap.get(t)!;
      if (bMap.has(t)) lastB = bMap.get(t)!;

      return {
        time: dateFormatted,
        fullTime: d.toLocaleString('ru-RU'),
        membersA: lastA,
        membersB: lastB,
      };
    });
  }, [data, period]);

  // Merge posts distribution
  const mergedPostsData = useMemo(() => {
    if (!data) return [];
    const aDistribution = data.a.postsDistribution || [];
    const bDistribution = data.b.postsDistribution || [];

    const map = new Map<string, { date: string; postsA: number; postsB: number; viewsA: number; viewsB: number }>();

    for (const item of aDistribution) {
      const entry = map.get(item.date) || { date: item.date, postsA: 0, postsB: 0, viewsA: 0, viewsB: 0 };
      entry.postsA = item.postsCount;
      entry.viewsA = item.viewsAvg ?? 0;
      map.set(item.date, entry);
    }
    for (const item of bDistribution) {
      const entry = map.get(item.date) || { date: item.date, postsA: 0, postsB: 0, viewsA: 0, viewsB: 0 };
      entry.postsB = item.postsCount;
      entry.viewsB = item.viewsAvg ?? 0;
      map.set(item.date, entry);
    }

    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => {
        let dateFormatted = item.date;
        if (period !== '24h') {
          const parts = item.date.split('-');
          if (parts.length === 3) {
            const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            dateFormatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
          }
        }
        return { ...item, date: dateFormatted };
      });
  }, [data, period]);

  const chA = data?.a?.channel;
  const chB = data?.b?.channel;

  const CompareMetricCard = ({
    label,
    valueA,
    valueB,
    formatFn = (v: any) => (v !== null && v !== undefined ? String(v) : '—'),
    highlight = false,
  }: {
    label: string;
    valueA: any;
    valueB: any;
    formatFn?: (v: any) => string;
    highlight?: boolean;
  }) => {
    const vA = formatFn(valueA);
    const vB = formatFn(valueB);
    const numA = typeof valueA === 'number' ? valueA : 0;
    const numB = typeof valueB === 'number' ? valueB : 0;
    const aWins = numA > numB;
    const bWins = numB > numA;

    return (
      <div className="bg-slate-900/60 rounded-xl border border-border/50 p-3">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 text-center">{label}</div>
        <div className="grid grid-cols-3 items-center gap-2">
          <div className={`text-right font-mono font-semibold text-sm ${highlight && aWins ? 'text-sky-400' : 'text-slate-200'}`}>
            {vA}
          </div>
          <div className="text-center text-slate-500 text-xs">vs</div>
          <div className={`text-left font-mono font-semibold text-sm ${highlight && bWins ? 'text-amber-400' : 'text-slate-200'}`}>
            {vB}
          </div>
        </div>
      </div>
    );
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
            <span>Назад</span>
          </Link>

          <div className="flex items-center gap-3">
            <GitCompareArrows className="w-5 h-5 text-accent" />
            <h1 className="text-sm font-bold text-white">Сравнение каналов</h1>
          </div>

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
        {/* Channel Selectors */}
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-end">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Канал A</label>
              <div className="relative">
                <select
                  value={selectedA}
                  onChange={(e) => setSelectedA(e.target.value)}
                  className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-accent"
                >
                  <option value="">Выберите канал...</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title} {ch.isMine ? '⭐' : ''} ({formatNumber(ch.currentMembers)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleCompare}
                disabled={!selectedA || !selectedB || selectedA === selectedB}
                className="px-5 py-2.5 rounded-xl bg-accent text-slate-950 font-bold text-sm hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <GitCompareArrows className="w-4 h-4" />
                Сравнить
              </button>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Канал B</label>
              <div className="relative">
                <select
                  value={selectedB}
                  onChange={(e) => setSelectedB(e.target.value)}
                  className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-accent"
                >
                  <option value="">Выберите канал...</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title} {ch.isMine ? '⭐' : ''} ({formatNumber(ch.currentMembers)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center">
            <div className="animate-pulse text-slate-400 text-sm">Загрузка данных для сравнения...</div>
          </div>
        )}

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 text-center text-rose-300 text-sm">
            {error}
          </div>
        )}

        {!loading && data && chA && chB && (
          <>
            {/* Header: A vs B */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
              <div className="bg-surface border border-sky-500/30 rounded-2xl p-5 text-center">
                <div className="text-xs text-sky-400 font-semibold uppercase tracking-wider mb-1">Канал A</div>
                <h2 className="text-lg font-extrabold text-white truncate">{chA.title}</h2>
                {chA.username && (
                  <a href={`https://t.me/${chA.username}`} target="_blank" rel="noreferrer" className="text-xs text-slate-400 font-mono">
                    @{chA.username}
                  </a>
                )}
                <div className="text-2xl font-extrabold text-white font-mono mt-2">{formatNumber(chA.currentMembers)}</div>
                <div className="text-[10px] text-slate-400">подписчиков</div>
              </div>

              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-border flex items-center justify-center">
                  <GitCompareArrows className="w-5 h-5 text-accent" />
                </div>
              </div>

              <div className="bg-surface border border-amber-500/30 rounded-2xl p-5 text-center">
                <div className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-1">Канал B</div>
                <h2 className="text-lg font-extrabold text-white truncate">{chB.title}</h2>
                {chB.username && (
                  <a href={`https://t.me/${chB.username}`} target="_blank" rel="noreferrer" className="text-xs text-slate-400 font-mono">
                    @{chB.username}
                  </a>
                )}
                <div className="text-2xl font-extrabold text-white font-mono mt-2">{formatNumber(chB.currentMembers)}</div>
                <div className="text-[10px] text-slate-400">подписчиков</div>
              </div>
            </div>

            {/* KPI Comparison Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CompareMetricCard
                label="Δ 24ч"
                valueA={chA.delta24h.abs}
                valueB={chB.delta24h.abs}
                formatFn={(v) => (v !== null ? `${v > 0 ? '+' : ''}${formatNumber(v)}` : '—')}
                highlight
              />
              <CompareMetricCard
                label="Δ 7д"
                valueA={chA.delta7d.abs}
                valueB={chB.delta7d.abs}
                formatFn={(v) => (v !== null ? `${v > 0 ? '+' : ''}${formatNumber(v)}` : '—')}
                highlight
              />
              <CompareMetricCard
                label="Просм. (24ч)"
                valueA={chA.avgViews24h}
                valueB={chB.avgViews24h}
                formatFn={(v) => (v !== null ? formatNumber(v) : '—')}
                highlight
              />
              <CompareMetricCard
                label="ERR (7д)"
                valueA={chA.vr7d}
                valueB={chB.vr7d}
                formatFn={(v) => (v !== null ? `${v}%` : '—')}
                highlight
              />
              <CompareMetricCard
                label="Постов (7д)"
                valueA={chA.posts7d}
                valueB={chB.posts7d}
                formatFn={(v) => String(v)}
                highlight
              />
              <CompareMetricCard
                label="Постов (30д)"
                valueA={chA.posts30d}
                valueB={chB.posts30d}
                formatFn={(v) => String(v)}
                highlight
              />
              <CompareMetricCard
                label="Ср. постов/д"
                valueA={chA.avgPostsPerDay}
                valueB={chB.avgPostsPerDay}
                formatFn={(v) => String(v)}
                highlight
              />
              <CompareMetricCard
                label="Просм. (7д)"
                valueA={chA.avgViews7d}
                valueB={chB.avgViews7d}
                formatFn={(v) => (v !== null ? formatNumber(v) : '—')}
                highlight
              />
            </div>

            {/* Subscriber Growth Overlay Chart */}
            <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  Динамика подписчиков
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Наложение кривых роста двух каналов
                </p>
              </div>

              <div className="h-72 w-full">
                {mergedSubscriberData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mergedSubscriberData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis
                        yAxisId="left"
                        stroke="#38bdf8"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => formatNumber(v)}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#fbbf24"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) => formatNumber(v)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="membersA"
                        name={chA.title}
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="membersB"
                        name={chB.title}
                        stroke="#fbbf24"
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Нет данных для отображения
                  </div>
                )}
              </div>
            </div>

            {/* Posts Activity Comparison */}
            <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-accent" />
                  Активность публикаций
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Количество постов по дням
                </p>
              </div>

              <div className="h-64 w-full">
                {mergedPostsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mergedPostsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Bar dataKey="postsA" name={chA.title} fill="#38bdf8" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="postsB" name={chB.title} fill="#fbbf24" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Нет данных для отображения
                  </div>
                )}
              </div>
            </div>

            {/* Views Comparison Chart */}
            <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-accent" />
                  Средние просмотры
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Средние просмотры на пост по дням
                </p>
              </div>

              <div className="h-64 w-full">
                {mergedPostsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mergedPostsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="viewsA" name={`${chA.title} (просм.)`} stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="viewsB" name={`${chB.title} (просм.)`} stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Нет данных для отображения
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && !data && !error && (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center space-y-3">
            <GitCompareArrows className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">Выберите два канала для сравнения</h3>
            <p className="text-xs text-slate-500">
              Используйте селекторы выше, чтобы выбрать каналы A и B, затем нажмите «Сравнить»
            </p>
          </div>
        )}
      </main>
    </div>
  );
}


export default function ComparePageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ComparePage />
    </Suspense>
  );
}