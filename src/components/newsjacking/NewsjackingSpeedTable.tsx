'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Clock, Trophy } from 'lucide-react';
import type { ChannelReactionSpeedSummary } from '@/lib/types';
import { formatDelayRu } from './newsjacking-ui';

interface NewsjackingSpeedTableProps {
  entries: readonly ChannelReactionSpeedSummary[];
  totalTopics: number;
  myChannelId?: number | null;
}

const INITIAL_LIMIT = 10;

function renderSpeedRow(
  entry: ChannelReactionSpeedSummary,
  rank: number,
  maxMedian: number,
  totalTopics: number,
) {
  const safeMedian = Math.max(0, entry.medianDelayMinutes);
  const safeAvg = Math.max(0, entry.avgDelayMinutes);
  const barPercent =
    maxMedian === 0 ? 0 : Math.min(100, Math.round((safeMedian / maxMedian) * 100));

  return (
    <div
      key={entry.channelId}
      className={`grid grid-cols-1 md:grid-cols-[3rem_minmax(0,1.6fr)_6.5rem_minmax(0,1.4fr)_5.5rem_6rem] gap-2 md:gap-3 items-center rounded-lg border px-3 py-2.5 text-xs ${
        entry.isMine
          ? 'border-sky-500/40 bg-sky-500/[0.08]'
          : 'border-border bg-slate-950/60'
      }`}
    >
      <div className="flex items-center justify-between md:justify-start gap-2 min-w-0 md:contents">
        <span className="font-mono text-xs font-bold text-slate-400">#{rank}</span>

        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Link
            href={`/channel/${entry.channelId}`}
            className="font-semibold text-white hover:text-accent transition-colors truncate"
          >
            {entry.channelTitle}
          </Link>
          {entry.isMine && (
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300 shrink-0">
              Мой
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 md:contents">
        <div>
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 font-semibold text-[11px] ${
              entry.firstCount > 0
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                : 'bg-slate-900 text-slate-400 border border-border'
            }`}
          >
            {`Первым: ${entry.firstCount}`}
          </span>
        </div>

        <div className="space-y-1 min-w-[140px] flex-1 md:flex-none">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1 font-mono font-semibold ${
                safeMedian === 0 ? 'text-emerald-300' : 'text-slate-100'
              }`}
            >
              <Clock className="w-3 h-3 shrink-0 text-slate-400" aria-hidden="true" />
              {safeMedian === 0 ? '0 мин' : `+${formatDelayRu(safeMedian)}`}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {safeAvg === 0 ? 'ср. 0 мин' : `ср. +${formatDelayRu(safeAvg)}`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-sm bg-slate-800 overflow-hidden" aria-hidden="true">
            <div
              className={`h-full rounded-sm ${
                safeMedian === 0
                  ? 'bg-emerald-400'
                  : entry.isMine
                    ? 'bg-sky-400'
                    : 'bg-amber-400/80'
              }`}
              style={{ width: `${safeMedian === 0 ? 8 : Math.max(8, barPercent)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 md:contents text-[11px] md:text-xs text-slate-300">
          <span className="font-mono">
            <span className="md:hidden text-slate-400">Пик ERR: </span>
            {entry.peakCount}
          </span>
          <span className="font-mono text-slate-300">
            <span className="md:hidden text-slate-400">Сюжетов: </span>
            {totalTopics > 0 ? `${entry.topicsCovered} из ${totalTopics}` : entry.topicsCovered}
          </span>
        </div>
      </div>
    </div>
  );
}

export function NewsjackingSpeedTable({
  entries,
  totalTopics,
  myChannelId = null,
}: NewsjackingSpeedTableProps) {
  const [showAll, setShowAll] = useState(false);

  const maxMedian = useMemo(
    () => Math.max(...entries.map((entry) => Math.max(0, entry.medianDelayMinutes)), 0),
    [entries],
  );

  const visibleEntries = showAll ? entries : entries.slice(0, INITIAL_LIMIT);

  const myIndex = useMemo(
    () =>
      entries.findIndex(
        (entry) => entry.isMine || (myChannelId !== null && entry.channelId === myChannelId),
      ),
    [entries, myChannelId],
  );
  const myEntry = myIndex >= 0 ? entries[myIndex] : null;
  const showPinnedMyRow = !showAll && myEntry !== null && myIndex >= INITIAL_LIMIT;

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-slate-900/60 p-6 text-center text-xs sm:text-sm text-slate-400">
        Недостаточно совместных сюжетов за выбранный период для расчёта рейтинга скорости.
      </p>
    );
  }

  return (
    <div className="space-y-3" aria-label="Рейтинг скорости реакции каналов">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="inline-flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-white">Лидеры оперативности</span>
        </div>
        <span>
          Каналы отсортированы по количеству публикаций первыми и медианной задержке реакции.
        </span>
      </div>

      <div className="hidden md:grid md:grid-cols-[3rem_minmax(0,1.6fr)_6.5rem_minmax(0,1.4fr)_5.5rem_6rem] gap-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <span>#</span>
        <span>Канал</span>
        <span>Первым</span>
        <span>Медиана реакции</span>
        <span>Пик ERR</span>
        <span>Сюжетов</span>
      </div>

      <div className="space-y-2">
        {visibleEntries.map((entry, idx) =>
          renderSpeedRow(entry, idx + 1, maxMedian, totalTopics),
        )}
      </div>

      {showPinnedMyRow && myEntry && (
        <div className="pt-2 border-t border-border/70 space-y-1.5">
          <p className="text-[11px] font-semibold text-sky-300">
            {`Ваш канал · #${myIndex + 1}`}
          </p>
          {renderSpeedRow(myEntry, myIndex + 1, maxMedian, totalTopics)}
        </div>
      )}

      {entries.length > INITIAL_LIMIT && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="rounded-xl border border-border bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {showAll ? 'Свернуть список' : `Показать все каналы (${entries.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
