'use client';

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, Flame, RefreshCw } from 'lucide-react';
import { HelpPopover } from '@/components/help/HelpPopover';
import type {
  NewsjackingApiResponse,
  NewsjackingWindowHours,
} from '@/lib/types';
import { NewsjackingClusterCard } from './newsjacking/NewsjackingClusterCard';
import { NewsjackingSpeedTable } from './newsjacking/NewsjackingSpeedTable';
import { formatDelayRu } from './newsjacking/newsjacking-ui';

export { formatDelayRu };

export interface NewsjackingWidgetProps {
  initialTag?: string;
  initialNiche?: string;
  showTagSelector?: boolean;
  defaultHours?: NewsjackingWindowHours;
}

type NewsjackingTab = 'topics' | 'leaderboard';

const WINDOW_OPTIONS: NewsjackingWindowHours[] = [24, 48, 72];
const INITIAL_VISIBLE_CLUSTERS = 4;

export function NewsjackingWidget({
  initialTag = '',
  initialNiche = '',
  showTagSelector = false,
  defaultHours = 48,
}: NewsjackingWidgetProps) {
  const widgetId = useId();
  const [hours, setHours] = useState<NewsjackingWindowHours>(defaultHours);
  const [selectedTag, setSelectedTag] = useState<string>(initialTag);
  const [activeTab, setActiveTab] = useState<NewsjackingTab>('topics');
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

  const topicsTabId = `${widgetId}-tab-topics`;
  const leaderboardTabId = `${widgetId}-tab-leaderboard`;
  const topicsPanelId = `${widgetId}-panel-topics`;
  const leaderboardPanelId = `${widgetId}-panel-leaderboard`;

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
              Сквозные темы ниши: кто публикует первым, кто собирает лучший отклик и что вы пропустили
              {!loading && !error && data ? ` · постов в окне: ${data.analyzedPostsCount}` : '.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-border bg-slate-900 p-0.5"
            role="group"
            aria-label="Окно инфоповодов"
          >
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
            onClick={() => void loadData()}
            aria-label="Обновить инфоповоды"
            className="rounded-xl border border-border bg-slate-900 p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div id="newsjacking-widget-body" className="space-y-4">
          {loading ? (
            <div className="space-y-2" aria-label="Загрузка инфоповодов">
              <div className="h-28 animate-pulse rounded-xl border border-border bg-slate-900/70" />
              <div className="h-28 animate-pulse rounded-xl border border-border bg-slate-900/70" />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-center justify-between gap-3"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void loadData()}
                className="rounded-lg border border-rose-400/40 px-2.5 py-1 text-white hover:bg-rose-500/20"
              >
                Повторить
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/70">
                <div
                  className="inline-flex rounded-xl border border-border bg-slate-900 p-0.5"
                  role="tablist"
                  aria-label="Режим просмотра инфоповодов"
                >
                  <button
                    id={topicsTabId}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'topics'}
                    aria-controls={topicsPanelId}
                    onClick={() => setActiveTab('topics')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === 'topics'
                        ? 'bg-accent/15 text-accent border border-accent/30'
                        : 'text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <span>Инфоповоды</span>
                    <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-mono text-slate-200">
                      {clusters.length}
                    </span>
                  </button>

                  <button
                    id={leaderboardTabId}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'leaderboard'}
                    aria-controls={leaderboardPanelId}
                    onClick={() => setActiveTab('leaderboard')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === 'leaderboard'
                        ? 'bg-accent/15 text-accent border border-accent/30'
                        : 'text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <span>Рейтинг скорости</span>
                    <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-mono text-slate-200">
                      {speedLeaderboard.length}
                    </span>
                  </button>
                </div>

                {activeTab === 'topics' && (
                  <div
                    className="inline-flex rounded-xl border border-border bg-slate-900 p-0.5"
                    role="group"
                    aria-label="Фильтр инфоповодов"
                  >
                    <button
                      type="button"
                      aria-pressed={!onlyUncovered}
                      onClick={() => {
                        setOnlyUncovered(false);
                        setShowAll(false);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        !onlyUncovered
                          ? 'bg-slate-800 text-white border border-slate-700'
                          : 'text-slate-300 hover:text-white border border-transparent'
                      }`}
                    >
                      {`Все (${clusters.length})`}
                    </button>
                    <button
                      type="button"
                      aria-pressed={onlyUncovered}
                      onClick={() => {
                        setOnlyUncovered(true);
                        setShowAll(false);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        onlyUncovered
                          ? 'border border-amber-400/50 bg-amber-500/15 text-amber-200'
                          : 'text-slate-300 hover:text-white border border-transparent'
                      }`}
                    >
                      {`Пропущено мной (${uncoveredCount})`}
                    </button>
                  </div>
                )}
              </div>

              {activeTab === 'topics' ? (
                <div
                  id={topicsPanelId}
                  role="tabpanel"
                  aria-labelledby={topicsTabId}
                  className="space-y-3"
                >
                  {filteredClusters.length === 0 ? (
                    <div className="rounded-xl border border-border bg-slate-900/60 p-5 text-center space-y-2.5">
                      <p className="text-xs sm:text-sm text-slate-400">
                        {onlyUncovered && clusters.length > 0
                          ? 'Все обнаруженные сквозные инфоповоды уже освещены в вашем канале.'
                          : 'За выбранное окно сквозные инфоповоды между каналами не обнаружены.'}
                      </p>
                      {onlyUncovered && clusters.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOnlyUncovered(false)}
                          className="rounded-lg border border-border bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
                        >
                          Показать все сюжеты
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {visibleClusters.map((cluster) => (
                          <NewsjackingClusterCard key={cluster.topicId} cluster={cluster} />
                        ))}
                      </div>

                      {filteredClusters.length > INITIAL_VISIBLE_CLUSTERS && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAll((value) => !value)}
                            className="rounded-xl border border-border bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
                          >
                            {showAll
                              ? 'Свернуть список'
                              : `Показать все сюжеты (${filteredClusters.length})`}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div
                  id={leaderboardPanelId}
                  role="tabpanel"
                  aria-labelledby={leaderboardTabId}
                >
                  <NewsjackingSpeedTable
                    entries={speedLeaderboard}
                    totalTopics={clusters.length}
                    myChannelId={data?.myChannelId ?? null}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
