'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GitCompareArrows } from 'lucide-react';
import { Header } from '@/components/Header';
import { CompareChannelSelectors, CompareTopBar } from '@/components/compare/CompareControls';
import { CompareSummarySection } from '@/components/compare/CompareSummarySection';
import { CompareChartsSection } from '@/components/compare/CompareChartsSection';
import {
  buildMultiChannelComparison,
  type CompareParticipantStats,
  type ComparePeriod,
  type MultiChannelComparisonResult,
  type TagBenchmarkProfileResult,
} from '@/lib/compare';
import type { ChannelDetailStats, ChannelMetrics } from '@/lib/types';

interface CompareData {
  a: ChannelDetailStats;
  b?: ChannelDetailStats;
  period: string;
  participants?: CompareParticipantStats[];
  comparison?: MultiChannelComparisonResult;
  benchmarkProfile?: TagBenchmarkProfileResult | null;
}

function buildCompareApiUrl(
  ids: ReadonlyArray<string>,
  useBenchmark: boolean,
  benchmarkTag: string,
  period: ComparePeriod
): string | null {
  const validIds = ids.map((id) => id.trim()).filter(Boolean);
  if (validIds.length === 0 || validIds.length > 4) return null;
  if (new Set(validIds).size !== validIds.length) return null;

  const activeTag = useBenchmark ? benchmarkTag.trim() : '';
  const totalParticipants = validIds.length + (activeTag ? 1 : 0);
  if (totalParticipants < 2) return null;

  if (validIds.length === 2 && !activeTag) {
    return `/api/stats/compare?a=${validIds[0]}&b=${validIds[1]}&period=${period}`;
  }

  const tagPart = activeTag ? `&benchmarkTag=${encodeURIComponent(activeTag)}` : '';
  return `/api/stats/compare?ids=${validIds.join(',')}${tagPart}&period=${period}`;
}

function ComparePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const idsParam = searchParams.get('ids');
  const aId = searchParams.get('a');
  const bId = searchParams.get('b');
  const benchmarkParam = searchParams.get('benchmarkTag') || '';

  const [period, setPeriod] = useState<ComparePeriod>('7d');
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [channels, setChannels] = useState<ChannelMetrics[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (idsParam) {
      const list = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
      if (list.length > 0) return list;
    }
    if (aId || bId) {
      return [aId || '', bId || ''].filter((_, idx) => idx === 0 || Boolean(bId) || !benchmarkParam);
    }
    return ['', ''];
  });
  const [useBenchmark, setUseBenchmark] = useState<boolean>(Boolean(benchmarkParam));
  const [benchmarkTag, setBenchmarkTag] = useState<string>(benchmarkParam);

  useEffect(() => {
    fetch('/api/channels')
      .then((r) => r.json())
      .then((list) => setChannels(Array.isArray(list) ? list : []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (idsParam) {
      const list = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
      if (list.length > 0) setSelectedIds(list);
    } else if (aId || bId) {
      if (benchmarkParam) {
        setSelectedIds([aId || bId || ''].filter(Boolean));
      } else {
        setSelectedIds([aId || '', bId || '']);
      }
    }
    if (benchmarkParam) {
      setUseBenchmark(true);
      setBenchmarkTag(benchmarkParam);
    }
  }, [idsParam, aId, bId, benchmarkParam]);

  const compareApiUrl = useMemo(
    () => buildCompareApiUrl(selectedIds, useBenchmark, benchmarkTag, period),
    [selectedIds, useBenchmark, benchmarkTag, period]
  );

  useEffect(() => {
    if (!compareApiUrl) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(compareApiUrl)
      .then(async (r) => {
        if (!r.ok) {
          const errPayload =
            r.status < 500
              ? ((await r.json().catch(() => null)) as { error?: string } | null)
              : null;
          throw new Error(errPayload?.error || 'Ошибка загрузки данных');
        }
        return r.json() as Promise<CompareData>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compareApiUrl]);

  const handleCompare = () => {
    const validIds = selectedIds.map((id) => id.trim()).filter(Boolean);
    const activeTag = useBenchmark ? benchmarkTag.trim() : '';
    if (validIds.length === 0 || new Set(validIds).size !== validIds.length) return;
    if (validIds.length + (activeTag ? 1 : 0) < 2) return;

    if (validIds.length === 2 && !activeTag) {
      router.push(`/compare?a=${validIds[0]}&b=${validIds[1]}`);
      return;
    }

    const params = new URLSearchParams({ ids: validIds.join(',') });
    if (activeTag) params.set('benchmarkTag', activeTag);
    router.push(`/compare?${params.toString()}`);
  };

  const handleToggleBenchmark = (enabled: boolean) => {
    setUseBenchmark(enabled);
    if (!enabled) {
      setSelectedIds((prev) => (prev.length < 2 ? [...prev, ''] : prev));
    }
  };

  const resolvedParticipants = useMemo<CompareParticipantStats[]>(() => {
    if (!data) return [];
    if (Array.isArray(data.participants) && data.participants.length > 0) {
      return data.participants;
    }
    const list: CompareParticipantStats[] = [];
    if (data.a) list.push(data.a);
    if (data.b && data.b.channel.id !== data.a?.channel.id) list.push(data.b);
    return list;
  }, [data]);

  const resolvedComparison = useMemo<MultiChannelComparisonResult | null>(() => {
    if (!data || resolvedParticipants.length === 0) return null;
    return data.comparison ?? buildMultiChannelComparison(resolvedParticipants, period);
  }, [data, resolvedParticipants, period]);

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Header />
      <CompareTopBar period={period} onPeriodChange={setPeriod} />

      <main className="flex-1 site-shell w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-[6px]">
        <CompareChannelSelectors
          channels={channels}
          selectedIds={selectedIds}
          onSelectIds={setSelectedIds}
          useBenchmark={useBenchmark}
          onToggleBenchmark={handleToggleBenchmark}
          benchmarkTag={benchmarkTag}
          onBenchmarkTagChange={setBenchmarkTag}
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

        {!loading && resolvedParticipants.length >= 2 && (
          <>
            <CompareSummarySection
              participants={resolvedParticipants}
              comparison={resolvedComparison}
              benchmarkProfile={data?.benchmarkProfile ?? null}
            />
            <CompareChartsSection
              participants={resolvedParticipants}
              comparison={resolvedComparison}
            />
          </>
        )}

        {!loading && resolvedParticipants.length === 0 && !error && (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center space-y-3">
            <GitCompareArrows className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">Выберите два канала для сравнения</h3>
            <p className="text-xs text-slate-500">
              Выберите от 2 до 4 каналов выше или включите сравнение с папкой (нишей), затем нажмите «Сравнить»
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
