'use client';

import { useState } from 'react';
import { FileText, Eye, Megaphone, Handshake, ExternalLink } from 'lucide-react';
import { detectAd } from '@/lib/adDetector';
import { formatNumber } from '@/lib/utils';

interface RecentPostsProps {
  posts: {
    id: number;
    messageId: string;
    publishedAt: string;
    views: number | null;
    text: string | null;
  }[];
  channelUsername: string | null;
  channelTgId: string | null;
}

export function RecentPosts({ posts, channelUsername, channelTgId }: RecentPostsProps) {
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [postFilter, setPostFilter] = useState<'all' | 'ads' | 'partners'>('all');

  return (
    <>
      <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              Последние публикации
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Последние 15 постов канала</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPostFilter(postFilter === 'ads' ? 'all' : 'ads')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                postFilter === 'ads'
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                  : 'bg-slate-800 border-border text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              <Megaphone className="w-3 h-3" />
              Реклама
            </button>
            <button
              onClick={() => setPostFilter(postFilter === 'partners' ? 'all' : 'partners')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                postFilter === 'partners'
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                  : 'bg-slate-800 border-border text-slate-400 hover:text-white hover:border-slate-600'
              }`}
            >
              <Handshake className="w-3 h-3" />
              Партнёры
            </button>
          </div>
        </div>
        <div className="pt-2">
          {posts && posts.length > 0 ? (() => {
            const postsWithAd = posts.map((post) => ({ ...post, ad: detectAd(post.text) }));
            const adCount = postsWithAd.filter((p) => p.ad.isAd).length;
            const partnerCount = postsWithAd.filter((p) => p.ad.isPartner).length;
            const filtered = postFilter === 'ads'
              ? postsWithAd.filter((p) => p.ad.isAd)
              : postFilter === 'partners'
              ? postsWithAd.filter((p) => p.ad.isPartner)
              : postsWithAd;

            return (
              <>
                {(adCount > 0 || partnerCount > 0) && (
                  <div className="mb-3 flex flex-wrap items-center gap-3 text-xs px-3 py-2 rounded-lg bg-slate-900/60 border border-border/50">
                    {adCount > 0 && (
                      <span className="flex items-center gap-1.5 text-orange-400/80">
                        <Megaphone className="w-3.5 h-3.5" />
                        Реклама: <strong>{adCount}</strong>
                      </span>
                    )}
                    {partnerCount > 0 && (
                      <span className="flex items-center gap-1.5 text-blue-400/80">
                        <Handshake className="w-3.5 h-3.5" />
                        Партнёры: <strong>{partnerCount}</strong>
                      </span>
                    )}
                    <span className="text-slate-500">из {posts.length} постов</span>
                  </div>
                )}
                {filtered.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map((post) => (
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
                                title={post.ad.signals.join(' · ')}
                              >
                                <Megaphone className="w-2.5 h-2.5" />
                                Реклама
                              </span>
                            )}
                            {post.ad.isPartner && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-400/80 border border-blue-500/20"
                                title={post.ad.signals.join(' · ')}
                              >
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
                          {post.text || <span className="italic text-slate-500">Без текста (медиа)</span>}
                        </div>
                        {(post.ad.isAd || post.ad.isPartner) && post.ad.signals.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-800/60">
                            <div className="flex flex-wrap gap-1">
                              {post.ad.signals.map((s: string, i: number) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-border/50">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-xs text-slate-500 font-mono">
                    {postFilter === 'ads' ? 'Рекламных постов не обнаружено' : postFilter === 'partners' ? 'Партнёрских постов не обнаружено' : 'Нет последних постов'}
                  </div>
                )}
              </>
            );
          })() : (
            <div className="h-32 flex items-center justify-center text-xs text-slate-500 font-mono">
              Нет последних постов
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
              {selectedPost.text || <span className="italic text-slate-500">Пост не содержит текста (возможно, это только фото или видео)</span>}
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
