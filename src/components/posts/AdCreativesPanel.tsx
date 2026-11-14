'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Filter, Layers, Sparkles } from 'lucide-react';
import { sortAdCreativeClusters } from '@/lib/metrics/ad-creatives';
import type { AdCreativeCluster, AdCreativeSortBy } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

interface AdCreativesPanelProps {
  clusters: AdCreativeCluster[];
  loading?: boolean;
  activeClusterId: string | null;
  onSelectCluster: (cluster: AdCreativeCluster | null) => void;
  onAdvertiserClick?: (advertiser: string) => void;
}

const INITIAL_VISIBLE_CLUSTERS = 8;

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'н/д';
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function formatDateRange(firstSeenAt: string, lastSeenAt: string): string {
  const first = formatShortDate(firstSeenAt);
  const last = formatShortDate(lastSeenAt);
  return first === last ? first : `${first} - ${last}`;
}

function formatPercent(value: number | null): string {
  return value === null ? 'н/д' : `${value.toFixed(1)}%`;
}

function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function AdCreativesPanel({
  clusters,
  loading = false,
  activeClusterId,
  onSelectCluster,
  onAdvertiserClick,
}: AdCreativesPanelProps) {
  const [sortBy, setSortBy] = useState<AdCreativeSortBy>('placementsCount');
  const [onlyRepeated, setOnlyRepeated] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const repeatedCount = useMemo(
    () => clusters.filter((cluster) => cluster.placementsCount >= 2).length,
    [clusters],
  );

  const displayedClusters = useMemo(() => {
    const filtered = onlyRepeated
      ? clusters.filter((cluster) => cluster.placementsCount >= 2)
      : clusters;
    return sortAdCreativeClusters(filtered, sortBy);
  }, [clusters, onlyRepeated, sortBy]);

  const visibleClusters = showAll
    ? displayedClusters
    : displayedClusters.slice(0, INITIAL_VISIBLE_CLUSTERS);

  const toggleExpanded = (clusterId: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [clusterId]: !prev[clusterId],
    }));
  };

  return (
    <section
      className="rounded-2xl border border-border bg-surface p-5 space-y-4"
      aria-label="Аналитика рекламных креативов"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              Аналитика креативов (Ad Spy)
            </h2>
            {!loading && clusters.length > 0 && (
              <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                {clusters.length}{' '}
                {pluralizeRu(clusters.length, 'креатив', 'креатива', 'креативов')} ·{' '}
                {repeatedCount}{' '}
                {pluralizeRu(repeatedCount, 'сетевой посев', 'сетевых посева', 'сетевых посевов')}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Группировка схожих рекламных текстов без учета UTM-меток, ссылок и сравнение ERR по каналам
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed((value) => !value)}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          {isCollapsed ? (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Развернуть
            </>
          ) : (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Свернуть
            </>
          )}
        </button>
      </div>

      {!isCollapsed && (
        <div className="space-y-4">
          {clusters.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Сортировка креативов">
                <span className="text-xs text-slate-400">Сортировка:</span>
                {(
                  [
                    ['placementsCount', 'По посевам'],
                    ['totalViews', 'По охвату'],
                    ['avgErr', 'По ERR'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={sortBy === value}
                    onClick={() => setSortBy(value)}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      sortBy === value
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={onlyRepeated}
                  onClick={() => {
                    setOnlyRepeated((value) => !value);
                    setShowAll(false);
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    onlyRepeated
                      ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                      : 'border-border text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Только сетевые (2+)
                </button>
                {activeClusterId && (
                  <button
                    type="button"
                    onClick={() => onSelectCluster(null)}
                    className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
                  >
                    Сбросить фильтр креатива
                  </button>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-400">Группировка и оценка рекламных креативов...</p>
          ) : clusters.length === 0 ? (
            <p className="text-sm text-slate-400">
              Рекламные креативы для анализа в текущей выборке не найдены.
            </p>
          ) : displayedClusters.length === 0 ? (
            <div className="rounded-xl border border-border bg-slate-900/60 p-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
              <span>Повторяющихся сетевых креативов (2+ размещений) в этой выборке не найдено.</span>
              <button
                type="button"
                onClick={() => setOnlyRepeated(false)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-white hover:bg-slate-800"
              >
                Показать все креативы
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                {visibleClusters.map((cluster) => {
                  const isSelected = activeClusterId === cluster.clusterId;
                  const isExpanded = Boolean(expandedIds[cluster.clusterId]);

                  return (
                    <article
                      key={cluster.clusterId}
                      className={`rounded-xl border bg-slate-900 p-4 space-y-3 flex flex-col ${
                        isSelected ? 'border-accent ring-1 ring-accent/40' : 'border-border'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-300">
                            {cluster.placementsCount}{' '}
                            {pluralizeRu(cluster.placementsCount, 'размещение', 'размещения', 'размещений')}
                          </span>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                            {cluster.uniqueChannelsCount}{' '}
                            {pluralizeRu(cluster.uniqueChannelsCount, 'канал', 'канала', 'каналов')}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {formatDateRange(cluster.firstSeenAt, cluster.lastSeenAt)}
                        </span>
                      </div>

                      {cluster.advertisers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {cluster.advertisers.map((adv) => (
                            <button
                              key={adv}
                              type="button"
                              onClick={() => onAdvertiserClick?.(adv)}
                              className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent hover:bg-accent/20"
                              title={`Фильтровать по ${adv}`}
                            >
                              {adv}
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-200 flex-1">
                        {cluster.sampleText}
                      </p>

                      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border border-border/60 bg-slate-950/50 p-2.5 text-xs">
                        <div>
                          <dt className="text-slate-500">Сумм. охват</dt>
                          <dd className="font-semibold text-white">
                            {formatNumber(cluster.totalViews)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Сред. охват</dt>
                          <dd className="font-semibold text-white">
                            {formatNumber(cluster.avgViews)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Сред. ERR</dt>
                          <dd className="font-semibold text-emerald-400">
                            {cluster.avgErr.toFixed(1)}%
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Макс. ERR</dt>
                          <dd className="font-semibold text-amber-300">
                            {cluster.maxErr.toFixed(1)}%
                          </dd>
                        </div>
                      </dl>

                      {cluster.bestPlacement && (
                        <p className="text-xs text-slate-400 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            Лучший отклик:{' '}
                            <Link
                              href={`/channel/${cluster.bestPlacement.channel.id}`}
                              className="text-slate-200 hover:text-accent font-medium"
                            >
                              {cluster.bestPlacement.channel.title}
                            </Link>
                            {' '}(ERR {formatPercent(cluster.bestPlacement.err)},{' '}
                            {cluster.bestPlacement.views === null
                              ? 'н/д'
                              : `${formatNumber(cluster.bestPlacement.views)} просм.`}
                            )
                          </span>
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => onSelectCluster(isSelected ? null : cluster)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            isSelected
                              ? 'border-accent bg-accent text-slate-950'
                              : 'border-accent/40 text-accent hover:bg-accent/10'
                          }`}
                        >
                          <Filter className="w-3.5 h-3.5" />
                          {isSelected ? 'Сбросить фильтр креатива' : 'Показать посты креатива'}
                        </button>

                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpanded(cluster.clusterId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
                        >
                          <span>Каналы размещения ({cluster.placementsCount})</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="space-y-2 border-t border-border/70 pt-3">
                          {cluster.posts.map((placement, index) => (
                            <div
                              key={placement.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-slate-950/60 px-3 py-2 text-xs"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-slate-500 font-mono">#{index + 1}</span>
                                  <Link
                                    href={`/channel/${placement.channel.id}`}
                                    className="font-medium text-white hover:text-accent truncate"
                                  >
                                    {placement.channel.title}
                                  </Link>
                                  {placement.channel.niche && (
                                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                                      {placement.channel.niche}
                                    </span>
                                  )}
                                  {index === 0 && cluster.placementsCount > 1 && (
                                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                                      Лучший ERR
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500">
                                  {new Date(placement.publishedAt).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>

                              <div className="flex items-center gap-3 text-right shrink-0">
                                <div>
                                  <div className="text-[10px] text-slate-500">Просм.</div>
                                  <div className="text-slate-200 font-medium">
                                    {placement.views === null ? 'н/д' : formatNumber(placement.views)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-500">ER</div>
                                  <div className="text-slate-200 font-medium">
                                    {formatPercent(placement.er)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-slate-500">ERR</div>
                                  <div className="font-semibold text-emerald-400">
                                    {formatPercent(placement.err)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>

              {displayedClusters.length > INITIAL_VISIBLE_CLUSTERS && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll((value) => !value)}
                    className="rounded-lg border border-border bg-slate-900 px-4 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    {showAll
                      ? 'Свернуть список креативов'
                      : `Показать все креативы (${displayedClusters.length})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
