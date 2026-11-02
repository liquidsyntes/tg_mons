import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, GitCompareArrows } from 'lucide-react';
import type { ComparePeriod } from '@/lib/compare';
import type { ChannelMetrics } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

const COMPARE_PERIODS: ReadonlyArray<{ id: ComparePeriod; label: string }> = [
  { id: '24h', label: '24ч' },
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
];

export interface CompareTopBarProps {
  period: ComparePeriod;
  onPeriodChange: (period: ComparePeriod) => void;
}

export function CompareTopBar({ period, onPeriodChange }: CompareTopBarProps) {
  return (
    <div className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-30">
      <div className="site-shell mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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

        <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-border">
          {COMPARE_PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
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
  selectedA: string;
  selectedB: string;
  onSelectA: (channelId: string) => void;
  onSelectB: (channelId: string) => void;
  onCompare: () => void;
}

export function CompareChannelSelectors({
  channels,
  selectedA,
  selectedB,
  onSelectA,
  onSelectB,
  onCompare,
}: CompareChannelSelectorsProps) {
  const canCompare = Boolean(selectedA && selectedB && selectedA !== selectedB);

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-end">
        <div>
          <label htmlFor="compare-channel-a" className="text-xs text-slate-400 block mb-1.5 font-medium">
            Канал A
          </label>
          <div className="relative">
            <select
              id="compare-channel-a"
              value={selectedA}
              onChange={(e) => onSelectA(e.target.value)}
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
            type="button"
            onClick={onCompare}
            disabled={!canCompare}
            className="px-5 py-2.5 rounded-xl bg-accent text-slate-950 font-bold text-sm hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <GitCompareArrows className="w-4 h-4" />
            Сравнить
          </button>
        </div>

        <div>
          <label htmlFor="compare-channel-b" className="text-xs text-slate-400 block mb-1.5 font-medium">
            Канал B
          </label>
          <div className="relative">
            <select
              id="compare-channel-b"
              value={selectedB}
              onChange={(e) => onSelectB(e.target.value)}
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
  );
}
