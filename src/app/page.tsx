'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { MyChannelCard } from '@/components/MyChannelCard';
import { ChannelsTable } from '@/components/ChannelsTable';
import { AddChannelModal } from '@/components/AddChannelModal';
import { OverviewSkeleton } from '@/components/SkeletonLoader';
import { Dashboard } from '@/components/Dashboard';
import { WatchlistWidget } from '@/components/WatchlistWidget';
import { OverviewStats } from '@/lib/types';
import { BestTimeWidget } from '@/components/BestTimeWidget';
import { TrendSpotterWidget } from '@/components/TrendSpotterWidget';
import Link from 'next/link';
import { Plus, Radio, AlertCircle, GitCompareArrows } from 'lucide-react';

export default function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/stats/overview');
      if (!res.ok) {
        throw new Error('Ошибка загрузки статистики с сервера');
      }
      const data: OverviewStats = await res.json();
      setStats(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100">
      <Header
        lastGlobalUpdate={stats?.lastGlobalUpdate ?? null}
        totalChannels={stats?.totalChannels ?? 0}
        activeChannels={stats?.activeChannels ?? 0}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onRefresh={fetchOverview}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {loading ? (
          <OverviewSkeleton />
        ) : error ? (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <h3 className="text-base font-semibold text-white">Ошибка подключения к серверу</h3>
            <p className="text-xs text-rose-300/80">{error}</p>
            <button
              onClick={fetchOverview}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold"
            >
              Попробовать снова
            </button>
          </div>
        ) : stats && stats.channels.length === 0 ? (
          /* Empty State */
          <div className="bg-surface border border-border rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-5 my-12">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent mx-auto">
              <Radio className="w-7 h-7 stroke-[2.2]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Добро пожаловать в TG Monitor</h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                Добавьте свой первый канал или каналы конкурентов для отслеживания динамики подписчиков, частоты постов и сравнительного анализа.
              </p>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent hover:bg-accent-hover text-slate-950 text-xs font-bold transition-all shadow-lg shadow-accent/15"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Добавить первый канал</span>
            </button>
          </div>
        ) : stats ? (
          <>
            {/* My Channel Hero Card */}
            <MyChannelCard
              channel={stats.myChannel}
              onOpenAddModal={() => setIsAddModalOpen(true)}
            />

            {/* AI Recommendation: Best Time to Post */}
            <BestTimeWidget />

            {/* Watchlist / Favorites */}
            <WatchlistWidget channels={stats.channels} />

            {/* AI Trend Spotter */}
            <TrendSpotterWidget />

            {/* Dashboard Block */}
            <Dashboard />

            {/* Comparative Channels Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Сравнительный мониторинг каналов
                </h3>
                <Link
                  href="/compare"
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 border border-border hover:border-accent hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  <GitCompareArrows className="w-3.5 h-3.5" />
                  Сравнить каналы
                </Link>
              </div>
              <ChannelsTable
                channels={stats.channels}
                myChannel={stats.myChannel}
                onRefresh={fetchOverview}
              />
            </div>
          </>
        ) : null}
      </main>

      <AddChannelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchOverview}
      />
    </div>
  );
}
