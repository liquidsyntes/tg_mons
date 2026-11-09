'use client';

import React from 'react';
import { FileText, Eye, Megaphone, Handshake, Search, Filter } from 'lucide-react';
import type { detectAd } from '@/lib/adDetector';
import { formatNumber } from '@/lib/utils';
import type { ChannelDetailStats } from '@/lib/types';
import { ViralBadge } from './ViralBadge';
import { ReactionBreakdownInline } from './ReactionBreakdownInline';
import { PostBookmarkButton } from './PostBookmarkButton';
import { highlightSearchText } from './PostReaderModal';

export type RecentPostContentType = 'all' | 'ads' | 'partners';

export function isRecentPostContentType(value: string): value is RecentPostContentType {
  return value === 'all' || value === 'ads' || value === 'partners';
}

export type RecentPostItem = NonNullable<ChannelDetailStats['recentPosts']>[number] & {
  ad: ReturnType<typeof detectAd>;
};

export interface RecentPostsFilterBarProps {
  total: number;
  absoluteTotal: number;
  q: string;
  onQueryChange: (value: string) => void;
  onlyViral: boolean;
  onToggleOnlyViral: () => void;
  showFilters: boolean;
  onToggleShowFilters: () => void;
  type: RecentPostContentType;
  onTypeChange: (value: RecentPostContentType) => void;
  sortBy: string;
  onSortByChange: (value: string) => void;
  minViews: string;
  onMinViewsChange: (value: string) => void;
  maxViews: string;
  onMaxViewsChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
}

export function RecentPostsFilterBar({
  total,
  absoluteTotal,
  q,
  onQueryChange,
  onlyViral,
  onToggleOnlyViral,
  showFilters,
  onToggleShowFilters,
  type,
  onTypeChange,
  sortBy,
  onSortByChange,
  minViews,
  onMinViewsChange,
  maxViews,
  onMaxViewsChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}: RecentPostsFilterBarProps) {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            Публикации
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Найдено {formatNumber(total)} постов из {formatNumber(absoluteTotal)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleOnlyViral}
            aria-pressed={onlyViral}
            className={`rounded-lg border px-2 py-1.5 text-xs ${
              onlyViral
                ? 'border-rose-400 bg-rose-500/15 text-rose-300'
                : 'border-slate-700 bg-slate-800 text-slate-300'
            }`}
          >
            Только вирусные
          </button>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по тексту..."
              value={q}
              onChange={(event) => onQueryChange(event.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-accent w-48 sm:w-64"
            />
          </div>
          <button
            type="button"
            aria-label="Дополнительные фильтры"
            aria-expanded={showFilters}
            onClick={onToggleShowFilters}
            className={`p-1.5 rounded-lg border transition-colors ${
              showFilters
                ? 'bg-accent/20 border-accent text-accent'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          <div className="space-y-1.5 text-xs">
            <label className="text-slate-500">Тип контента</label>
            <select
              value={type}
              onChange={(event) => {
                if (isRecentPostContentType(event.target.value)) {
                  onTypeChange(event.target.value);
                }
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
            >
              <option value="all">Все посты</option>
              <option value="ads">Реклама</option>
              <option value="partners">Партнерские</option>
            </select>
          </div>
          <div className="space-y-1.5 text-xs">
            <label className="text-slate-500">Сортировка</label>
            <select
              value={sortBy}
              onChange={(event) => onSortByChange(event.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
            >
              <option value="date">По дате (новые)</option>
              <option value="views_desc">По просмотрам (max)</option>
              <option value="views_asc">По просмотрам (min)</option>
            </select>
          </div>
          <div className="space-y-1.5 text-xs">
            <label className="text-slate-500">Просмотры</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                placeholder="Min"
                value={minViews}
                onChange={(event) => onMinViewsChange(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
              />
              <span>-</span>
              <input
                type="number"
                placeholder="Max"
                value={maxViews}
                onChange={(event) => onMaxViewsChange(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            <label className="text-slate-500">Период</label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => onDateFromChange(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white [color-scheme:dark]"
              />
              <span>-</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => onDateToChange(event.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white [color-scheme:dark]"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export interface RecentPostCardProps {
  post: RecentPostItem;
  highlightQuery: string;
  onSelect: (post: RecentPostItem) => void;
  onSavedChange: (id: number, isSaved: boolean, savedNote: string | null) => void;
}

export function RecentPostCard({
  post,
  highlightQuery,
  onSelect,
  onSavedChange,
}: RecentPostCardProps) {
  return (
    <div
      onClick={() => onSelect(post)}
      className={`bg-slate-900 border rounded-xl p-3 cursor-pointer hover:bg-slate-800/80 transition-colors flex flex-col ${
        post.ad.isAd
          ? 'border-orange-500/40 hover:border-orange-500/60'
          : post.ad.isPartner
          ? 'border-blue-500/30 hover:border-blue-500/50'
          : 'border-slate-800 hover:border-slate-600'
      }`}
    >
      <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span>
            {new Date(post.publishedAt).toLocaleString('ru-RU', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <ViralBadge result={post} />
          {post.ad.isAd && (
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                post.ad.confidence === 'high'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-amber-500/15 text-amber-400/80 border border-amber-500/20'
              }`}
            >
              <Megaphone className="w-2.5 h-2.5" />
              Реклама
            </span>
          )}
          {post.ad.isPartner && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-400/80 border border-blue-500/20">
              <Handshake className="w-2.5 h-2.5" />
              Партнёр
            </span>
          )}
        </div>
        {post.views !== null && (
          <span className="flex items-center gap-1 font-mono text-slate-400">
            <Eye className="w-3 h-3" />
            {formatNumber(post.views)}
          </span>
        )}
      </div>

      <div className="text-sm text-slate-300 line-clamp-3 leading-relaxed flex-1">
        {post.text ? (
          highlightSearchText(post.text, highlightQuery)
        ) : (
          <span className="italic text-slate-500">Текст недоступен</span>
        )}
      </div>

      {(post.reactions !== null || post.reactionBreakdown?.length) && (
        <div className="mt-2">
          <ReactionBreakdownInline total={post.reactions} breakdown={post.reactionBreakdown} />
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-slate-800/80">
        <PostBookmarkButton
          postId={post.id}
          isSaved={post.isSaved}
          savedNote={post.savedNote}
          onSavedChange={onSavedChange}
        />
      </div>
    </div>
  );
}
