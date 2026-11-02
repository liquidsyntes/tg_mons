'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GitCompareArrows } from 'lucide-react';
import { Header } from '@/components/Header';
import { CompareChannelSelectors, CompareTopBar } from '@/components/compare/CompareControls';
import { CompareSummarySection } from '@/components/compare/CompareSummarySection';
import { CompareChartsSection } from '@/components/compare/CompareChartsSection';
import { mergePostsDistribution, mergeSubscriberHistory, type ComparePeriod } from '@/lib/compare';
import type { ChannelDetailStats, ChannelMetrics } from '@/lib/types';

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

  const [period, setPeriod] = useState<ComparePeriod>('7d');
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [channels, setChannels] = useState<ChannelMetrics[]>([]);
  const [selectedA, setSelectedA] = useState<string>(aId || '');
  const [selectedB, setSelectedB] = useState<string>(bId || '');

  useEffect(() => {
    fetch('/api/channels')
      .then((r) => r.json())
      .then((list) => setChannels(Array.isArray(list) ? list : []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (aId) setSelectedA(aId);
    if (bId) setSelectedB(bId);
  }, [aId, bId]);

  useEffect(() => {
    if (!selectedA || !selectedB || selectedA === selectedB) return;
    setLoading(true);
    setError(null);
    fetch(`/api/stats/compare?a=${selectedA}&b=${selectedB}&period=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error('Ошибка загрузки данных');
        return r.json();
      })
      .then((json: CompareData) => setData(json))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Ошибка загрузки данных'))
      .finally(() => setLoading(false));
  }, [selectedA, selectedB, period]);

  const handleCompare = () => {
    if (selectedA && selectedB && selectedA !== selectedB) {
      router.push(`/compare?a=${selectedA}&b=${selectedB}`);
    }
  };

  const mergedSubscriberData = useMemo(
    () => (data ? mergeSubscriberHistory(data.a.membersHistory, data.b.membersHistory, period) : []),
    [data, period]
  );

  const mergedPostsData = useMemo(
    () => (data ? mergePostsDistribution(data.a.postsDistribution, data.b.postsDistribution, period) : []),
    [data, period]
  );

  const chA = data?.a?.channel;
  const chB = data?.b?.channel;

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Header />
      <CompareTopBar period={period} onPeriodChange={setPeriod} />

      <main className="flex-1 site-shell w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-[6px]">
        <CompareChannelSelectors
          channels={channels}
          selectedA={selectedA}
          selectedB={selectedB}
          onSelectA={setSelectedA}
          onSelectB={setSelectedB}
          onCompare={handleCompare}
        />

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
            <CompareSummarySection channelA={chA} channelB={chB} />
            <CompareChartsSection
              titleA={chA.title}
              titleB={chB.title}
              mergedSubscriberData={mergedSubscriberData}
              mergedPostsData={mergedPostsData}
            />
          </>
        )}

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
