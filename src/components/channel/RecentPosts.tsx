'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Eye, Megaphone, Handshake, ExternalLink, Search, Filter, Loader2, ArrowDownUp } from 'lucide-react';
import { detectAd } from '@/lib/adDetector';
import { formatNumber } from '@/lib/utils';

interface RecentPostsProps {
  initialPosts: any[];
  channelId: number | string;
  channelUsername: string | null;
  channelTgId: string | null;
}

export function RecentPosts({ initialPosts, channelId, channelUsername, channelTgId }: RecentPostsProps) {
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  
  // Search and Filter State
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minViews, setMinViews] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [type, setType] = useState<'all' | 'ads' | 'partners'>('all');
  const [sortBy, setSortBy] = useState('date');
  
  // Pagination & Data State
  const [offset, setOffset] = useState(0);
  const [limit] = useState(15);
  const [posts, setPosts] = useState<any[]>(initialPosts.map(p => ({ ...p, ad: detectAd(p.text) })));
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
  }, [debouncedQ, dateFrom, dateTo, minViews, maxViews, type, sortBy]);

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
      if (sortBy) params.append('sortBy', sortBy);

      const res = await fetch(`/api/posts/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      
      if (isLoadMore) {
        setPosts(prev => [...prev, ...data.posts]);
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
  }, [channelId, debouncedQ, dateFrom, dateTo, minViews, maxViews, type, sortBy, offset, limit]);

  // Fetch when filters or offset change.
  useEffect(() => {
    fetchPosts(offset > 0);
  }, [fetchPosts, offset]);

  // Helper to highlight search term
  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim() || !text) return text || '';
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={i} className="bg-accent/40 text-white rounded px-0.5">{part}</mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <>
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
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
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Поиск по тексту..." 
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-accent w-48 sm:w-64"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded-lg border transition-colors ${showFilters ? 'bg-accent/20 border-accent text-accent' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div className="space-y-1.5 text-xs">
              <label className="text-slate-500">Тип контента</label>
              <select value={type} onChange={e => setType(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white">
                <option value="all">Все посты</option>
                <option value="ads">Реклама</option>
                <option value="partners">Партнерские</option>
              </select>
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="text-slate-500">Сортировка</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white">
                <option value="date">По дате (новые)</option>
                <option value="views_desc">По просмотрам (max)</option>
                <option value="views_asc">По просмотрам (min)</option>
              </select>
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="text-slate-500">Просмотры</label>
              <div className="flex items-center gap-1">
                <input type="number" placeholder="Min" value={minViews} onChange={e => setMinViews(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white" />
                <span>-</span>
                <input type="number" placeholder="Max" value={maxViews} onChange={e => setMaxViews(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white" />
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="text-slate-500">Период</label>
              <div className="flex items-center gap-1">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white [color-scheme:dark]" />
                <span>-</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white [color-scheme:dark]" />
              </div>
            </div>
          </div>
        )}

        <div className="pt-2">
          {posts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => setSelectedPost(post)}
                    className={`bg-slate-900 border rounded-xl p-3 cursor-pointer hover:bg-slate-800/80 transition-colors flex flex-col ${
                      post.ad.isAd
                        ? 'border-orange-500/40 hover:border-orange-500/60'
                        : post.ad.isPartner
                        ? 'border-blue-500/30 hover:border-blue-500/50'
                        : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span>{new Date(post.publishedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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
                      {post.text ? highlightText(post.text, debouncedQ) : <span className="italic text-slate-500">Без текста (медиа)</span>}
                    </div>
                  </div>
                ))}
              </div>
              
              {posts.length < total && (
                <div className="flex justify-center mt-6">
                  <button 
                    onClick={() => setOffset(prev => prev + limit)}
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

      {/* Post Modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span>{new Date(selectedPost.publishedAt).toLocaleString('ru-RU')}</span>
                {selectedPost.views !== null && (
                  <span className="flex items-center gap-1.5 font-mono text-emerald-400">
                    <Eye className="w-4 h-4" />
                    {formatNumber(selectedPost.views)}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-5 overflow-y-auto custom-scrollbar text-slate-200 leading-relaxed whitespace-pre-wrap text-sm sm:text-base">
              {selectedPost.text ? highlightText(selectedPost.text, debouncedQ) : <span className="italic text-slate-500">Пост не содержит текста (возможно, это только фото или видео)</span>}
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <a
                href={`https://t.me/${channelUsername || 'c/' + channelTgId}/${selectedPost.messageId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent hover:bg-accent hover:text-slate-900 transition-colors rounded-xl text-sm font-semibold"
              >
                Открыть в Telegram
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
