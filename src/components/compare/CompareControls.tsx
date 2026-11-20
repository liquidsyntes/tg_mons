import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Folder, GitCompareArrows, Plus, X } from 'lucide-react';
import type { ComparePeriod } from '@/lib/compare';
import type { ChannelMetrics } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import { COMPARE_BENCHMARK_STYLE, getParticipantStyle } from './compareTheme';
import { HelpPopover } from '@/components/help/HelpPopover';

const COMPARE_PERIODS: ReadonlyArray<{ id: ComparePeriod; label: string }> = [
  { id: '24h', label: '24ч' },
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
];

const MAX_COMPARE_SLOTS = 4;

export interface CompareTopBarProps {
  period: ComparePeriod;
  onPeriodChange: (period: ComparePeriod) => void;
}

export function CompareTopBar({ period, onPeriodChange }: CompareTopBarProps) {
  return (
    <div className="border-b border-border bg-surface/80 backdrop-blur sticky top-16 z-20">
      <div className="site-shell mx-auto px-3 sm:px-6 lg:px-8 min-h-16 py-2 gap-3 flex flex-wrap items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Назад</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <GitCompareArrows className="w-5 h-5 text-accent shrink-0" />
          <h1 className="text-sm font-bold text-white">Сравнение каналов</h1>
          <HelpPopover sectionId="channels-compare" />
        </div>

        <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-border">
          {COMPARE_PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={period === item.id}
              onClick={() => onPeriodChange(item.id)}
              className={`px-3 py-1 text-xs font-mono font-medium rounded-lg transition-all ${
                period === item.id
                  ? 'bg-accent text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface CompareChannelSelectorsProps {
  channels: ReadonlyArray<ChannelMetrics>;
  selectedIds?: ReadonlyArray<string>;
  onSelectIds?: (ids: string[]) => void;
  useBenchmark?: boolean;
  onToggleBenchmark?: (enabled: boolean) => void;
  benchmarkTag?: string;
  onBenchmarkTagChange?: (tag: string) => void;
  // Обратная совместимость со старым контрактом
  selectedA?: string;
  selectedB?: string;
  onSelectA?: (channelId: string) => void;
  onSelectB?: (channelId: string) => void;
  onCompare: () => void;
}

export function CompareChannelSelectors({
  channels,
  selectedIds,
  onSelectIds,
  useBenchmark = false,
  onToggleBenchmark,
  benchmarkTag = '',
  onBenchmarkTagChange,
  selectedA = '',
  selectedB = '',
  onSelectA,
  onSelectB,
  onCompare,
}: CompareChannelSelectorsProps) {
  const ids = selectedIds ? [...selectedIds] : [selectedA, selectedB];
  const minSlots = useBenchmark ? 1 : 2;
  const availableTags = Array.from(
    new Set(channels.flatMap((ch) => (Array.isArray(ch.tags) ? ch.tags : [])).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'ru'));

  const validIds = ids.map((id) => id.trim()).filter(Boolean);
  const uniqueValid = new Set(validIds).size === validIds.length;
  const hasValidBenchmark = !useBenchmark || Boolean(benchmarkTag.trim());
  const totalParticipants = validIds.length + (useBenchmark && benchmarkTag.trim() ? 1 : 0);
  const canCompare = uniqueValid && hasValidBenchmark && validIds.length >= 1 && totalParticipants >= 2;

  const updateSlot = (index: number, value: string) => {
    if (onSelectIds) {
      const next = [...ids];
      next[index] = value;
      onSelectIds(next);
      return;
    }
    if (index === 0) onSelectA?.(value);
    if (index === 1) onSelectB?.(value);
  };

  const addSlot = () => {
    if (!onSelectIds || ids.length >= MAX_COMPARE_SLOTS) return;
    onSelectIds([...ids, '']);
  };

  const removeSlot = (index: number) => {
    if (!onSelectIds || ids.length <= minSlots) return;
    onSelectIds(ids.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {onSelectIds && ids.length < MAX_COMPARE_SLOTS && (
            <button
              type="button"
              onClick={addSlot}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-accent/60 hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-accent" />
              <span>+ Добавить канал к сравнению</span>
            </button>
          )}

          {onToggleBenchmark && (
            <button
              type="button"
              role="switch"
              aria-checked={useBenchmark}
              onClick={() => onToggleBenchmark(!useBenchmark)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                useBenchmark
                  ? 'border-pink-400/60 bg-pink-500/15 text-pink-200'
                  : 'border-border bg-slate-900 text-slate-300 hover:text-white'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              <span>Сравнить с папкой (нишей)</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onCompare}
          disabled={!canCompare}
          className="px-5 py-2 rounded-xl bg-accent text-slate-950 font-bold text-sm hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          <GitCompareArrows className="w-4 h-4" />
          Сравнить
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ids.map((selectedValue, index) => {
          const style = getParticipantStyle(index);
          const selectId = index === 0 ? 'compare-channel-a' : index === 1 ? 'compare-channel-b' : `compare-channel-${index + 1}`;
          const takenByOthers = new Set(ids.filter((val, idx) => idx !== index && val.trim() !== ''));

          return (
            <div key={selectId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={selectId} className="text-xs text-slate-400 font-medium inline-flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${style.dotBg}`} />
                  <span>{style.slotLabel}</span>
                </label>
                {onSelectIds && ids.length > minSlots && (
                  <button
                    type="button"
                    aria-label={`Удалить ${style.slotLabel}`}
                    onClick={() => removeSlot(index)}
                    className="text-slate-500 hover:text-rose-300 transition-colors p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="relative">
                <select
                  id={selectId}
                  value={selectedValue}
                  onChange={(e) => updateSlot(index, e.target.value)}
                  className="w-full bg-slate-900 border border-border rounded-xl px-3 py-2.5 pr-8 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-accent"
                >
                  <option value="">Выберите канал...</option>
                  {channels.map((ch) => (
                    <option
                      key={ch.id}
                      value={ch.id}
                      disabled={takenByOthers.has(String(ch.id))}
                    >
                      {ch.title} {ch.isMine ? '⭐' : ''} ({formatNumber(ch.currentMembers)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          );
        })}

        {useBenchmark && (
          <div className="space-y-1.5">
            <label htmlFor="compare-benchmark-tag" className="text-xs text-pink-300 font-medium inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${COMPARE_BENCHMARK_STYLE.dotBg}`} />
              <span>Папка для бенчмарка</span>
            </label>
            <div className="relative">
              <select
                id="compare-benchmark-tag"
                value={benchmarkTag}
                onChange={(e) => onBenchmarkTagChange?.(e.target.value)}
                className="w-full bg-slate-900 border border-pink-500/40 rounded-xl px-3 py-2.5 pr-8 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:border-pink-400"
              >
                <option value="">Выберите папку...</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    Папка: {tag}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {availableTags.length === 0 && (
              <p className="text-[11px] text-slate-500">
                Добавьте теги каналам в таблице, чтобы сравнивать со средним по папке.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
