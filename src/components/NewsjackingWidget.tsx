'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Award, ChevronDown, Clock, ExternalLink, Flame, RefreshCw, Trophy } from 'lucide-react';
import { buildTelegramPostUrl } from '@/components/channel/PostReaderModal';
import { HelpPopover } from '@/components/help/HelpPopover';
import type {
  NewsReactionItem,
  NewsTopicCluster,
  NewsjackingApiResponse,
  NewsjackingWindowHours,
} from '@/lib/types';
import { formatNumber } from '@/lib/utils';

export interface NewsjackingWidgetProps {
  initialTag?: string;
  initialNiche?: string;
  showTagSelector?: boolean;
  defaultHours?: NewsjackingWindowHours;
}

const WINDOW_OPTIONS: NewsjackingWindowHours[] = [24, 48, 72];
const INITIAL_VISIBLE_CLUSTERS = 4;

export function formatDelayRu(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes === 0) return '0 мин';
  if (safeMinutes < 60) return `${safeMinutes} мин`;
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return rest === 0 ? `${hours}ч` : `${hours}ч ${rest}м`;
}

function formatTimeHHMM(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatErr(value: number | null): string {
  return value === null ? 'н/д' : `${value.toFixed(1)}%`;
}

function pluralizeChannels(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'каналов';
  const mod10 = count % 10;
  if (mod10 === 1) return 'канал';
  if (mod10 >= 2 && mod10 <= 4) return 'канала';
  return 'каналов';
}

function renderCoverageBadge(cluster: NewsTopicCluster) {
  if (!cluster.coveredByMyChannel) {
    return (
      <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        Не освещено в вашем канале
      </span>
    );
  }
  if (cluster.myChannelDelayMinutes === 0) {
    return (
      <span className="inline-flex items-center rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
        Освещено · Первоисточник
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
      {`Освещено (задержка +${formatDelayRu(cluster.myChannelDelayMinutes ?? 0)})`}
    </span>
  );
}

function renderTimelineChip(item: NewsReactionItem, index: number) {
  const timeOrDelay = item.isFirst
    ? formatTimeHHMM(item.publishedAt)
    : `+${formatDelayRu(item.delayMinutes)}`;
  const telegramUrl = buildTelegramPostUrl({
    channelUsername: item.channelUsername,
    messageId: item.messageId,
  });

  return (
    <React.Fragment key={item.postId}>
      {index > 0 && (
        <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      )}
      <div
        className={`inline-flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
          item.isFirst
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
            : item.isPeak
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
              : item.isMine
                ? 'border-sky-500/40 bg-sky-500/10 text-sky-100'
                : 'border-border bg-slate-900/90 text-slate-200'
        }`}
      >
        <span className="font-mono text-[11px] font-semibold text-slate-300">
          {timeOrDelay}
        </span>
        <Link
          href={`/channel/${item.channelId}`}
          className="font-semibold text-white hover:text-accent transition-colors"
        >
          {item.channelTitle}
        </Link>
        {item.isFirst && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
            Первоисточник
          </span>
        )}
        {item.isPeak && (
          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
            <Award className="w-3 h-3" />
            {item.err !== null
              ? `Лидер по ERR: ${item.err.toFixed(1)}%`
              : `Лидер по охвату: ${formatNumber(item.views ?? 0)}`}
          </span>
        )}
        {item.views !== null && (
          <span className="text-[11px] text-slate-400">
            · {formatNumber(item.views)} просм.
          </span>
        )}
        {telegramUrl && (
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Открыть пост ${item.channelTitle} в Telegram`}
            className="text-slate-400 hover:text-accent"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </React.Fragment>
  );
}

export function NewsjackingWidget({
  initialTag = '',
  initialNiche = '',
  showTagSelector = false,
  defaultHours = 48,
}: NewsjackingWidgetProps) {
  const [hours, setHours] = useState<NewsjackingWindowHours>(defaultHours);
  const [selectedTag, setSelectedTag] = useState<string>(initialTag);
  const [onlyUncovered, setOnlyUncovered] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [data, setData] = useState<NewsjackingApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTag(initialTag);
  }, [initialTag]);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ hours: String(hours) });
      const activeTag = selectedTag.trim();
      const activeNiche = initialNiche.trim();
      if (activeTag) params.set('tag', activeTag);
      if (activeNiche) params.set('niche', activeNiche);

      const response = await fetch(`/api/analytics/newsjacking?${params.toString()}`, { signal });
      if (!response.ok) {
        throw new Error('Не удалось загрузить скорость реакции на инфоповоды');
      }
      const json = (await response.json()) as NewsjackingApiResponse;
      setData(json);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Ошибка загрузки инфоповодов');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [hours, selectedTag, initialNiche]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const clusters = useMemo(
    () => (Array.isArray(data?.clusters) ? data.clusters : []),
    [data],
  );
  const speedLeaderboard = useMemo(
    () => (Array.isArray(data?.speedLeaderboard) ? data.speedLeaderboard : []),
    [data],
  );
  const availableTags = useMemo(
    () => (Array.isArray(data?.availableTags) ? data.availableTags : []),
    [data],
  );

  const filteredClusters = useMemo(
    () => (onlyUncovered ? clusters.filter((cluster) => !cluster.coveredByMyChannel) : clusters),
    [clusters, onlyUncovered],
  );

  const visibleClusters = showAll
    ? filteredClusters
    : filteredClusters.slice(0, INITIAL_VISIBLE_CLUSTERS);

  const uncoveredCount = data?.uncoveredByMyChannelCount
    ?? clusters.filter((cluster) => !cluster.coveredByMyChannel).length;

  return (
    <section
      className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4"
      aria-label="Скорость реакции на инфоповоды"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-white tracking-tight">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls="newsjacking-widget-body"
                  onClick={() => setExpanded((value) => !value)}
                  className="inline-flex items-center gap-2 rounded hover:text-accent transition-colors text-left"
                >
                  Скорость реакции на инфоповоды
                  <ChevronDown
                    aria-hidden="true"
                    className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </h2>
              <HelpPopover sectionId="newsjacking" />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Сквозные темы ниши, первоисточники и задержка реакции каналов (Newsjacking Speed).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-border bg-slate-900 p-0.5" role="group" aria-label="Окно инфоповодов">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={hours === option}
                onClick={() => {
                  setHours(option);
                  setShowAll(false);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  hours === option
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'text-slate-300 hover:text-white border border-transparent'
                }`}
              >
                {option}ч
              </button>
            ))}
          </div>

          {showTagSelector && availableTags.length > 0 && (
            <select
              aria-label="Папка инфоповодов"
              value={selectedTag}
              onChange={(event) => {
                setSelectedTag(event.target.value);
                setShowAll(false);
              }}
              className="rounded-xl border border-border bg-slate-900 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">Все папки</option>
              {availableTags.map((tagItem) => (
                <option key={tagItem} value={tagItem}>
                  {tagItem}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            aria-pressed={onlyUncovered}
            onClick={() => {
              setOnlyUncovered((value) => !value);
              setShowAll(false);
            }}
            className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
              onlyUncovered
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                : 'border-border bg-slate-900 text-slate-300 hover:text-white'
            }`}
          >
            Не освещено мной ({uncoveredCount})
          </button>

          <button
            type="button"
            onClick={() => void loadData()}
            aria-label="Обновить инфоповоды"
            className="rounded-xl border border-border bg-slate-900 p-1.5 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div id="newsjacking-widget-body" className="space-y-4">
          {!loading && !error && (
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-lg border border-border bg-slate-900 px-2.5 py-1">
                Сюжетов: <strong className="text-white">{clusters.length}</strong>
              </span>
              <span className="rounded-lg border border-border bg-slate-900 px-2.5 py-1">
                Пропущено вашим каналом:{' '}
                <strong className={uncoveredCount > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                  {uncoveredCount}
                </strong>
              </span>
              <span className="rounded-lg border border-border bg-slate-900 px-2.5 py-1">
                Постов в окне: <strong className="text-white">{data?.analyzedPostsCount ?? 0}</strong>
              </span>
            </div>
          )}

          {loading ? (
            <div className="space-y-2" aria-label="Загрузка инфоповодов">
              <div className="h-24 animate-pulse rounded-xl border border-border bg-slate-900/70" />
              <div className="h-24 animate-pulse rounded-xl border border-border bg-slate-900/70" />
            </div>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-center justify-between gap-3">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void loadData()}
                className="rounded-lg border border-rose-400/40 px-2.5 py-1 text-white hover:bg-rose-500/20"
              >
                Повторить
              </button>
            </div>
          ) : filteredClusters.length === 0 ? (
            <p className="rounded-xl border border-border bg-slate-900/60 p-5 text-center text-xs sm:text-sm text-slate-400">
              {onlyUncovered && clusters.length > 0
                ? 'Все обнаруженные сквозные инфоповоды уже освещены в вашем канале.'
                : 'За выбранное окно сквозные инфоповоды между каналами не обнаружены.'}
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-3">
                {visibleClusters.map((cluster) => (
                  <article
                    key={cluster.topicId}
                    className="rounded-xl border border-border bg-slate-900/60 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <h3 className="text-sm font-bold text-white leading-snug">
                          {cluster.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {cluster.keywords.map((kw) => (
                            <span
                              key={kw}
                              className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                      {renderCoverageBadge(cluster)}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>
                        <strong className="text-slate-200">{cluster.channelsCount}</strong>{' '}
                        {pluralizeChannels(cluster.channelsCount)} ({cluster.postsCount} публ.)
                      </span>
                      <span>
                        Охват: <strong className="text-slate-200">{formatNumber(cluster.totalViews)}</strong>
                      </span>
                      <span>
                        Средний ERR: <strong className="text-slate-200">{formatErr(cluster.avgErr)}</strong>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5" aria-label={`Таймлайн реакции: ${cluster.title}`}>
                      {cluster.timeline.map((item, idx) => renderTimelineChip(item, idx))}
                    </div>
                  </article>
                ))}

                {filteredClusters.length > INITIAL_VISIBLE_CLUSTERS && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAll((value) => !value)}
                      className="rounded-xl border border-border bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      {showAll
                        ? 'Свернуть список'
                        : `Показать все сюжеты (${filteredClusters.length})`}
                    </button>
                  </div>
                )}
              </div>

              <aside
                className="rounded-xl border border-border bg-slate-900/60 p-4 space-y-3 h-fit"
                aria-label="Лидеры оперативности"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Лидеры оперативности</h3>
                </div>

                {speedLeaderboard.length === 0 ? (
                  <p className="text-xs text-slate-400">Недостаточно совместных сюжетов.</p>
                ) : (
                  <ul className="space-y-2">
                    {speedLeaderboard.slice(0, 8).map((entry, idx) => (
                      <li
                        key={entry.channelId}
                        className="rounded-lg border border-border bg-slate-950/60 p-2.5 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-xs font-bold text-slate-400">
                              #{idx + 1}
                            </span>
                            <Link
                              href={`/channel/${entry.channelId}`}
                              className="text-xs font-semibold text-white truncate hover:text-accent"
                            >
                              {entry.channelTitle}
                            </Link>
                            {entry.isMine && (
                              <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                                Мой
                              </span>
                            )}
                          </div>
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 shrink-0">
                            Первым: {entry.firstCount}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Медиана: +{formatDelayRu(entry.medianDelayMinutes)}
                          </span>
                          <span>
                            Сюжетов: {entry.topicsCovered} · Пик ERR: {entry.peakCount}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
