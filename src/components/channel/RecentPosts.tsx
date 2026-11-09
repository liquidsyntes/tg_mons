'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, ArrowDownUp } from 'lucide-react';
import { detectAd } from '@/lib/adDetector';
import type { ChannelDetailStats } from '@/lib/types';
import { PostReaderModal, buildTelegramPostUrl } from './PostReaderModal';
import {
  RecentPostCard,
  RecentPostsFilterBar,
  type RecentPostContentType,
  type RecentPostItem,
} from './RecentPostCard';

interface RecentPostsProps {
  initialPosts: NonNullable<ChannelDetailStats['recentPosts']>;
  channelId: number | string;
  channelUsername: string | null;
  channelTgId: string | null;
}

export function RecentPosts({ initialPosts, channelId, channelUsername, channelTgId }: RecentPostsProps) {
  const [selectedPost, setSelectedPost] = useState<RecentPostItem | null>(null);

  // Search and Filter State
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minViews, setMinViews] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [type, setType] = useState<RecentPostContentType>('all');
  const [onlyViral, setOnlyViral] = useState(false);
  const [sortBy, setSortBy] = useState('date');

  // Pagination & Data State
  const [offset, setOffset] = useState(0);
  const [limit] = useState(15);
  const [posts, setPosts] = useState<RecentPostItem[]>(
    initialPosts.map((post) => ({ ...post, ad: detectAd(post.text) }))
  );
  const [total, setTotal] = useState<number>(initialPosts.length);
  const [absoluteTotal, setAbsoluteTotal] = useState<number>(initialPosts.length);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, dateFrom, dateTo, minViews, maxViews, type, onlyViral, sortBy]);

  const fetchPosts = useCallback(async (isLoadMore = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        channelId: channelId.toString(),
        limit: limit.toString(),
        offset: offset.toString(),
      });
      if (debouncedQ) params.append('q', debouncedQ);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      if (minViews) params.append('minViews', minViews);
      if (maxViews) params.append('maxViews', maxViews);
      if (type !== 'all') params.append('type', type);
      if (onlyViral) params.append('onlyViral', 'true');
      if (sortBy) params.append('sortBy', sortBy);

      const res = await fetch(`/api/posts/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      const data: { posts: RecentPostItem[]; total: number; absoluteTotal: number } = await res.json();

      if (isLoadMore) {
        setPosts((prev) => [...prev, ...data.posts]);
      } else {
        setPosts(data.posts);
      }
      setTotal(data.total);
      setAbsoluteTotal(data.absoluteTotal);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [channelId, debouncedQ, dateFrom, dateTo, minViews, maxViews, type, onlyViral, sortBy, offset, limit]);

  // Fetch when filters or offset change.
  useEffect(() => {
    fetchPosts(offset > 0);
  }, [fetchPosts, offset]);

  const handleSavedChange = useCallback((id: number, isSaved: boolean, savedNote: string | null) => {
    setPosts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isSaved, savedNote } : item))
    );
  }, []);

  return (
    <>
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <RecentPostsFilterBar
          total={total}
          absoluteTotal={absoluteTotal}
          q={q}
          onQueryChange={setQ}
          onlyViral={onlyViral}
          onToggleOnlyViral={() => setOnlyViral((value) => !value)}
          showFilters={showFilters}
          onToggleShowFilters={() => setShowFilters((value) => !value)}
          type={type}
          onTypeChange={setType}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          minViews={minViews}
          onMinViewsChange={setMinViews}
          maxViews={maxViews}
          onMaxViewsChange={setMaxViews}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
        />

        <div className="pt-2">
          {posts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {posts.map((post) => (
                  <RecentPostCard
                    key={post.id}
                    post={post}
                    highlightQuery={debouncedQ}
                    onSelect={setSelectedPost}
                    onSavedChange={handleSavedChange}
                  />
                ))}
              </div>

              {posts.length < total && (
                <div className="flex justify-center mt-6">
                  <button
                    type="button"
                    onClick={() => setOffset((prev) => prev + limit)}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownUp className="w-4 h-4" />}
                    Показать ещё
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="h-32 flex flex-col items-center justify-center text-xs text-slate-500 font-mono gap-2">
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
              ) : (
                <>
                  <Search className="w-6 h-6 text-slate-600" />
                  Посты не найдены
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedPost && (
        <PostReaderModal
          publishedAt={selectedPost.publishedAt}
          text={selectedPost.text}
          views={selectedPost.views}
          highlightQuery={debouncedQ}
          telegramUrl={buildTelegramPostUrl({
            channelUsername,
            channelTgId,
            messageId: selectedPost.messageId,
          })}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </>
  );
}
