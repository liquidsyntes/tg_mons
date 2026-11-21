'use client';

import React, { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { Award, ChevronDown, ExternalLink, Link2, MessageSquareText } from 'lucide-react';
import { buildTelegramPostUrl } from '@/components/channel/PostReaderModal';
import type { NewsReactionItem, NewsTopicCluster } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import {
  annotateClusterTimeline,
  formatDelayRu,
  formatErr,
  formatTimeHHMM,
  pluralizeChannels,
  pluralizePosts,
  shouldShowClusterExcerpt,
  type SeriesColorKey,
} from './newsjacking-ui';

interface NewsjackingClusterCardProps {
  cluster: NewsTopicCluster;
}

const SERIES_STYLES: Record<
  SeriesColorKey,
  { borderLeft: string; badge: string }
> = {
  violet: {
    borderLeft: 'border-l-violet-400',
    badge: 'border-violet-500/30 bg-violet-500/15 text-violet-200',
  },
  cyan: {
    borderLeft: 'border-l-cyan-400',
    badge: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-200',
  },
  rose: {
    borderLeft: 'border-l-rose-400',
    badge: 'border-rose-500/30 bg-rose-500/15 text-rose-200',
  },
  teal: {
    borderLeft: 'border-l-teal-400',
    badge: 'border-teal-500/30 bg-teal-500/15 text-teal-200',
  },
};

function getCardLeftAccent(cluster: NewsTopicCluster): string {
  if (!cluster.coveredByMyChannel) return 'border-l-amber-400/70';
  if (cluster.myChannelDelayMinutes === 0) return 'border-l-emerald-400/70';
  return 'border-l-sky-400/70';
}

function renderCoverageBadge(cluster: NewsTopicCluster) {
  if (!cluster.coveredByMyChannel) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
        Пропущено вами
      </span>
    );
  }
  if (cluster.myChannelDelayMinutes === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
        Вы - первоисточник
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-200">
      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" aria-hidden="true" />
      {`Вы: +${formatDelayRu(cluster.myChannelDelayMinutes ?? 0)}`}
    </span>
  );
}

function getDotClass(item: NewsReactionItem): string {
  if (item.isMine) return 'bg-sky-400 ring-2 ring-slate-950 z-20';
  if (item.isFirst) return 'bg-amber-400 ring-2 ring-slate-950 z-10';
  if (item.isPeak) return 'bg-emerald-400 ring-2 ring-slate-950 z-10';
  return 'bg-slate-400/90 ring-1 ring-slate-950';
}

function getBarColorClass(item: NewsReactionItem): string {
  if (item.isFirst) return 'bg-amber-400/80';
  if (item.isPeak) return 'bg-emerald-400/80';
  if (item.isMine) return 'bg-sky-400/80';
  return 'bg-slate-500';
}

export function NewsjackingClusterCard({ cluster }: NewsjackingClusterCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [openQuotePostId, setOpenQuotePostId] = useState<number | null>(null);
  const chronologyId = useId();

  const timelineInfo = useMemo(
    () => annotateClusterTimeline(cluster.timeline),
    [cluster.timeline],
  );

  const showExcerpt = shouldShowClusterExcerpt(cluster.title, cluster.firstPost?.excerpt);
  const myEarliestPost = useMemo(
    () => cluster.timeline.find((entry) => entry.isMine) ?? null,
    [cluster.timeline],
  );

  const firstTelegramUrl = cluster.firstPost
    ? buildTelegramPostUrl({
        channelUsername: cluster.firstPost.channelUsername,
        messageId: cluster.firstPost.messageId,
      })
    : null;

  return (
    <article
      className={`rounded-xl border border-border border-l-4 ${getCardLeftAccent(cluster)} bg-slate-900/55 p-4 sm:p-5 space-y-3.5 transition-colors hover:border-slate-700`}
    >
      {/* Top status and compact metrics */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {renderCoverageBadge(cluster)}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
          <span>
            <strong className="text-slate-200">{cluster.channelsCount}</strong>{' '}
            {pluralizeChannels(cluster.channelsCount)}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-slate-200">{cluster.postsCount}</strong> публ.
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Охват: <strong className="text-slate-200">{formatNumber(cluster.totalViews)}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            ср. ERR <strong className="text-slate-200">{formatErr(cluster.avgErr)}</strong>
          </span>
        </div>
      </div>

      {/* Topic headline + context excerpt */}
      <div className="space-y-1.5">
        <h3 className="text-sm sm:text-base font-bold text-white leading-snug">
          {cluster.title}
        </h3>
        {showExcerpt && (
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
            {cluster.firstPost.excerpt}
          </p>
        )}
      </div>

      {/* 3 Anchor Role Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/80 bg-slate-950/60 px-3 py-2 space-y-1 min-w-0">
          <div className="flex items-center justify-between gap-2 text-[11px] text-amber-300 font-medium">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
              Первым · {formatTimeHHMM(cluster.firstPost.publishedAt)}
            </span>
            {firstTelegramUrl && (
              <a
                href={firstTelegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Открыть первоисточник ${cluster.firstPost.channelTitle} в Telegram`}
                className="text-slate-400 hover:text-accent transition-colors shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <Link
            href={`/channel/${cluster.firstPost.channelId}`}
            className="block truncate text-xs font-semibold text-white hover:text-accent transition-colors"
          >
            {cluster.firstPost.channelTitle}
          </Link>
        </div>

        <div className="rounded-lg border border-border/80 bg-slate-950/60 px-3 py-2 space-y-1 min-w-0">
          <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-300 font-medium">
            <span className="inline-flex items-center gap-1.5 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
              {cluster.peakPost.err !== null
                ? `Лучший отклик · ERR ${cluster.peakPost.err.toFixed(1)}%`
                : `Лучший отклик · ${formatNumber(cluster.peakPost.views ?? 0)}`}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <Link
              href={`/channel/${cluster.peakPost.channelId}`}
              className="truncate text-xs font-semibold text-white hover:text-accent transition-colors"
            >
              {cluster.peakPost.channelTitle}
            </Link>
            <span className="text-[11px] text-slate-400 shrink-0">
              ({cluster.peakPost.isFirst ? 'первым' : `+${formatDelayRu(cluster.peakPost.delayMinutes)}`})
            </span>
          </div>
        </div>

        <div
          className={`rounded-lg border px-3 py-2 space-y-1 min-w-0 ${
            cluster.coveredByMyChannel
              ? 'border-sky-500/30 bg-sky-500/[0.06]'
              : 'border-amber-500/25 bg-amber-500/[0.04]'
          }`}
        >
          <div
            className={`flex items-center gap-1.5 text-[11px] font-medium ${
              cluster.coveredByMyChannel ? 'text-sky-300' : 'text-amber-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                cluster.coveredByMyChannel ? 'bg-sky-400' : 'bg-amber-400'
              }`}
              aria-hidden="true"
            />
            <span>Ваш канал</span>
          </div>
          {cluster.coveredByMyChannel ? (
            <div className="flex items-center justify-between gap-2 text-xs min-w-0">
              <span className="font-semibold text-white truncate">
                {cluster.myChannelDelayMinutes === 0
                  ? 'Первым (0 мин)'
                  : `+${formatDelayRu(cluster.myChannelDelayMinutes ?? 0)}`}
              </span>
              {myEarliestPost && (myEarliestPost.err !== null || myEarliestPost.views !== null) && (
                <span className="text-[11px] text-slate-400 shrink-0">
                  {myEarliestPost.err !== null
                    ? `ERR ${myEarliestPost.err.toFixed(1)}%`
                    : `${formatNumber(myEarliestPost.views ?? 0)} просм.`}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs font-medium text-amber-200/90 truncate">
              Тема ещё не освещена
            </p>
          )}
        </div>
      </div>

      {/* Timeline Track + Expand Chronology Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
            <span>{`0 мин (${formatTimeHHMM(cluster.firstPublishedAt)})`}</span>
            <span>
              {timelineInfo.maxDelayMinutes > 0
                ? `Волна ${formatDelayRu(timelineInfo.maxDelayMinutes)}`
                : 'Публикации в 1 минуту'}
            </span>
          </div>
          <div
            className="relative h-4 flex items-center"
            aria-hidden="true"
          >
            <div className="w-full h-1 rounded-sm bg-slate-800" />
            {timelineInfo.items.map((entry) => (
              <span
                key={entry.item.postId}
                title={`${entry.item.channelTitle} (${
                  entry.item.isFirst ? '0 мин' : `+${formatDelayRu(entry.item.delayMinutes)}`
                })`}
                style={{ left: `clamp(5px, ${entry.trackPercent}%, calc(100% - 5px))` }}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full ${getDotClass(
                  entry.item,
                )}`}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={chronologyId}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-accent/50 hover:text-white transition-colors shrink-0"
        >
          <span>
            {expanded
              ? 'Скрыть хронологию'
              : `Хронология (${cluster.postsCount} ${pluralizePosts(cluster.postsCount)})`}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Expandable Vertical Chronology */}
      {expanded && (
        <div
          id={chronologyId}
          className="pt-3 border-t border-border/70 space-y-3"
          aria-label={`Хронология реакции: ${cluster.title}`}
        >
          {(cluster.keywords.length > 0 || timelineInfo.repeatedChannelsCount > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
              {cluster.keywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>Ключевые слова:</span>
                  {cluster.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="rounded bg-slate-800/90 px-1.5 py-0.5 text-[11px] text-slate-300"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
              {timelineInfo.repeatedChannelsCount > 0 && (
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <Link2 className="w-3 h-3 text-slate-300" aria-hidden="true" />
                  Повторные посты одного канала отмечены общим цветным маркером
                </span>
              )}
            </div>
          )}

          <ul className="space-y-2">
            {timelineInfo.items.map((entry) => {
              const { item } = entry;
              const telegramUrl = buildTelegramPostUrl({
                channelUsername: item.channelUsername,
                messageId: item.messageId,
              });
              const hasQuote = item.excerpt.trim().length > 0;
              const isQuoteOpen = openQuotePostId === item.postId;
              const seriesStyle = entry.seriesColorKey ? SERIES_STYLES[entry.seriesColorKey] : null;

              const rowBorderClass = seriesStyle
                ? `border-y border-r ${
                    item.isMine ? 'border-sky-500/35' : 'border-border'
                  } border-l-2 ${seriesStyle.borderLeft}`
                : item.isMine
                  ? 'border border-sky-500/35'
                  : 'border border-border';

              return (
                <li
                  key={item.postId}
                  className={`rounded-lg ${rowBorderClass} ${
                    item.isMine ? 'bg-sky-500/[0.06]' : 'bg-slate-950/65'
                  } p-2.5 sm:px-3 space-y-2`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <div className="flex items-center gap-2 w-28 shrink-0">
                        <span className="font-mono text-[11px] text-slate-400">
                          {formatTimeHHMM(item.publishedAt)}
                        </span>
                        <span
                          className={`font-mono text-xs font-semibold ${
                            item.isFirst
                              ? 'text-amber-300'
                              : item.isMine
                                ? 'text-sky-300'
                                : 'text-slate-200'
                          }`}
                        >
                          {item.isFirst ? '0 мин' : `+${formatDelayRu(item.delayMinutes)}`}
                        </span>
                      </div>

                      <div
                        className="hidden md:block w-20 h-1.5 rounded-sm bg-slate-800 overflow-hidden shrink-0"
                        aria-hidden="true"
                      >
                        <div
                          className={`h-full rounded-sm ${getBarColorClass(item)}`}
                          style={{ width: `${item.isFirst ? 8 : Math.max(8, entry.delayPercent)}%` }}
                        />
                      </div>

                      <Link
                        href={`/channel/${item.channelId}`}
                        className="text-xs font-semibold text-white hover:text-accent transition-colors truncate"
                      >
                        {item.channelTitle}
                      </Link>

                      {item.isFirst && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                          Первоисточник
                        </span>
                      )}

                      {item.isPeak && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          <Award className="w-3 h-3" aria-hidden="true" />
                          {item.err !== null
                            ? `Пик ERR ${item.err.toFixed(1)}%`
                            : `Пик охвата: ${formatNumber(item.views ?? 0)}`}
                        </span>
                      )}

                      {item.isMine && (
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                          Мой
                        </span>
                      )}

                      {entry.isRepeatedChannel && seriesStyle && (
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${seriesStyle.badge}`}
                        >
                          <Link2 className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                          {entry.channelSeriesIndex === 1
                            ? `Пост 1 из ${entry.channelSeriesTotal} по теме`
                            : `По теме · пост ${entry.channelSeriesIndex} из ${entry.channelSeriesTotal}`}
                          {entry.deltaFromPrevSameChannelMinutes !== null && (
                            <span className="opacity-85">
                              {`(+${formatDelayRu(entry.deltaFromPrevSameChannelMinutes)} к пред.)`}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-400 shrink-0">
                      {item.views !== null && (
                        <span>
                          <strong className="text-slate-200">{formatNumber(item.views)}</strong> просм.
                        </span>
                      )}
                      {item.err !== null && (
                        <span>
                          ERR <strong className="text-slate-200">{item.err.toFixed(1)}%</strong>
                        </span>
                      )}
                      {hasQuote && (
                        <button
                          type="button"
                          aria-expanded={isQuoteOpen}
                          onClick={() =>
                            setOpenQuotePostId((current) =>
                              current === item.postId ? null : item.postId,
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            isQuoteOpen
                              ? 'border-accent/50 bg-accent/15 text-accent'
                              : 'border-border bg-slate-900 text-slate-300 hover:text-white'
                          }`}
                        >
                          <MessageSquareText className="w-3 h-3" aria-hidden="true" />
                          <span>{isQuoteOpen ? 'Скрыть' : 'Цитата'}</span>
                        </button>
                      )}
                      {telegramUrl && (
                        <a
                          href={telegramUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Открыть пост ${item.channelTitle} в Telegram`}
                          className="text-slate-400 hover:text-accent transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {isQuoteOpen && hasQuote && (
                    <div className="rounded-lg border border-border/70 bg-slate-900/90 p-2.5 space-y-1.5">
                      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                        {item.excerpt}
                      </p>
                      {(item.reactions !== null ||
                        item.comments !== null ||
                        item.forwards !== null) && (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                          {item.reactions !== null && (
                            <span>Реакции: {formatNumber(item.reactions)}</span>
                          )}
                          {item.comments !== null && (
                            <span>Комментарии: {formatNumber(item.comments)}</span>
                          )}
                          {item.forwards !== null && (
                            <span>Пересылки: {formatNumber(item.forwards)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}
