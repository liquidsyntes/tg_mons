'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FileSearch, Megaphone, X } from 'lucide-react';
import { Header } from '@/components/Header';
import { formatNumber } from '@/lib/utils';
import type { GlobalPostSearchResponse, SearchPost } from '@/lib/types';
import { ViralBadge } from '@/components/channel/ViralBadge';
import { ReactionBreakdownInline } from '@/components/channel/ReactionBreakdownInline';
import { TopAdvertisersPanel } from '@/components/posts/TopAdvertisersPanel';

type SortBy = 'publishedAt' | 'views' | 'er' | 'err' | 'forwards';

function formatPercent(value: number | null): string {
  return value === null ? 'н/д' : `${value.toFixed(1)}%`;
}

export default function PostsPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [onlyAds, setOnlyAds] = useState(false);
  const [advertiserUsername, setAdvertiserUsername] = useState('');
  const [advertiserDays, setAdvertiserDays] = useState<7 | 30>(30);
  const [onlyViral, setOnlyViral] = useState(false);
  const [niche, setNiche] = useState('');
  const [channelId, setChannelId] = useState('');
  const [days, setDays] = useState(30);
  const [sortBy, setSortBy] = useState<SortBy>('publishedAt');
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [total, setTotal] = useState(0);
  const [niches, setNiches] = useState<string[]>([]);
  const [channels, setChannels] = useState<GlobalPostSearchResponse['channels']>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<SearchPost | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const searchUrl = useCallback((offset: number): string => {
    const params = new URLSearchParams({
      days: String(days), sortBy, onlyAds: String(onlyAds), onlyViral: String(onlyViral), limit: '20', offset: String(offset),
    });
    if (search) params.set('q', search);
    if (niche) params.set('niche', niche);
    if (channelId) params.set('channelId', channelId);
    if (advertiserUsername) params.set('advertiser', advertiserUsername);
    return `/api/posts/search?${params.toString()}`;
  }, [days, sortBy, onlyAds, onlyViral, search, niche, channelId, advertiserUsername]);

  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    setLoading(true);
    setPosts([]);
    setTotal(0);
    setError(null);
    fetch(searchUrl(0), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Не удалось найти публикации');
        return await response.json() as GlobalPostSearchResponse;
      })
      .then(data => {
        if (version !== requestVersion.current) return;
        setPosts(data.posts);
        setTotal(data.total);
        setNiches(data.niches);
        setChannels(data.channels);
      })
      .catch(reason => {
        if (version === requestVersion.current && !controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Ошибка поиска');
        }
      })
      .finally(() => { if (version === requestVersion.current) setLoading(false); });
    return () => controller.abort();
  }, [searchUrl]);

  useEffect(() => {
    if (!selectedPost) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedPost(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedPost]);

  async function loadMore() {
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetch(searchUrl(posts.length));
      if (!response.ok) throw new Error('Не удалось загрузить следующие публикации');
      const data = await response.json() as GlobalPostSearchResponse;
      if (version === requestVersion.current) {
        setPosts(current => [...current, ...data.posts]);
        setTotal(data.total);
      }
    } catch (reason) {
      if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : 'Ошибка загрузки');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-slate-100">
      <Header />
      <main className="site-shell mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><FileSearch className="w-6 h-6 text-accent" />Поиск и креативы</h1>
          <p className="mt-1 text-sm text-slate-400">Публикации из отслеживаемых вами каналов.</p>
        </div>

        <section className="rounded-2xl border border-border bg-surface p-5 space-y-4" aria-label="Фильтры публикаций">
          <label className="block space-y-1.5 text-sm text-slate-300">
            <span>Поиск по тексту</span>
            <input value={q} onChange={event => setQ(event.target.value)} maxLength={200} placeholder="Тема, бренд или ключевое слово"
              className="w-full rounded-xl border border-border bg-slate-900 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </label>
          <div className="flex gap-2" role="group" aria-label="Режим поиска">
            <button type="button" onClick={() => { setOnlyAds(false); setAdvertiserUsername(''); }} aria-pressed={!onlyAds}
              className={`rounded-xl border px-3 py-2 text-sm ${!onlyAds ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}>
              Все посты
            </button>
            <button type="button" onClick={() => setOnlyAds(true)} aria-pressed={onlyAds}
              className={`rounded-xl border px-3 py-2 text-sm ${onlyAds ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}>
              Только реклама (Ad Spy)
            </button>
          </div>
          <button type="button" onClick={() => setOnlyViral(value => !value)} aria-pressed={onlyViral}
            className={`rounded-xl border px-3 py-2 text-sm ${onlyViral ? 'border-rose-400 bg-rose-500/15 text-rose-300' : 'border-border text-slate-300'}`}>
            Только вирусные
          </button>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5 text-xs text-slate-300"><span>Ниша</span>
              <select value={niche} onChange={event => { setNiche(event.target.value); setChannelId(''); setAdvertiserUsername(''); }}
                className="w-full rounded-xl border border-border bg-slate-900 px-3 py-2.5 text-sm text-white">
                <option value="">Все ниши</option>
                {niches.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-slate-300"><span>Канал</span>
              <select value={channelId} onChange={event => setChannelId(event.target.value)}
                className="w-full rounded-xl border border-border bg-slate-900 px-3 py-2.5 text-sm text-white">
                <option value="">Все каналы</option>
                {channels.filter(channel => !niche || channel.niche === niche).map(channel =>
                  <option key={channel.id} value={channel.id}>{channel.title}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-slate-300"><span>Период</span>
              <select value={days} onChange={event => setDays(Number(event.target.value))}
                className="w-full rounded-xl border border-border bg-slate-900 px-3 py-2.5 text-sm text-white">
                {[7, 14, 30, 90].map(value => <option key={value} value={value}>{value} дн.</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-slate-300"><span>Сортировка</span>
              <select value={sortBy} onChange={event => setSortBy(event.target.value as SortBy)}
                className="w-full rounded-xl border border-border bg-slate-900 px-3 py-2.5 text-sm text-white">
                <option value="publishedAt">По дате</option><option value="views">По охвату</option>
                <option value="er">По ER</option><option value="err">По ERR</option>
                <option value="forwards">По пересылкам</option>
              </select>
            </label>
          </div>
        </section>

        {onlyAds && <TopAdvertisersPanel niche={niche} days={advertiserDays} selectedUsername={advertiserUsername}
          onDaysChange={value => { setAdvertiserDays(value); if (advertiserUsername) setDays(value); }}
          onSelect={username => { setAdvertiserUsername(username); setDays(advertiserDays); }} />}

        {advertiserUsername && <div className="flex items-center gap-2 text-sm text-slate-300">
          Публикации @{advertiserUsername}
          <button type="button" onClick={() => setAdvertiserUsername('')} className="rounded-lg border border-border px-2 py-1 text-xs text-white hover:bg-slate-800">
            Сбросить рекламодателя
          </button>
        </div>}

        <section aria-label="Результаты поиска" className="space-y-4">
          <p className="text-sm text-slate-400">Найдено публикаций: {formatNumber(total)}</p>
          {error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}
          {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Загрузка публикаций">
            {[1, 2, 3].map(value => <div key={value} className="h-64 animate-pulse rounded-xl border border-border bg-surface" />)}
          </div> : posts.length === 0 ?
            <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-slate-400">Публикации не найдены. Измените фильтры или период.</p> :
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map(post => <article key={post.id} className="overflow-hidden rounded-xl border border-border bg-surface flex flex-col">
                {post.hasImage && <Image src={`/api/posts/${post.id}/image`} alt="Изображение публикации" width={640} height={360} unoptimized
                  className="h-40 w-full object-cover" />}
                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/channel/${post.channel.id}`} className="text-sm font-semibold text-white hover:text-accent">
                      {post.channel.title}
                    </Link>
                    {post.isAd && <span className="shrink-0 rounded bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-300">Реклама</span>}
                  </div>
                  <ViralBadge result={post} />
                  <p className="text-xs text-slate-500">{post.channel.niche} · {new Date(post.publishedAt).toLocaleString('ru-RU')}</p>
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-slate-300 flex-1">{post.text || 'Текст публикации недоступен'}</p>
                  {post.mentions.length > 0 && <p className="text-xs text-slate-400 break-words">Упомянуты: {post.mentions.map(value => `@${value}`).join(', ')}</p>}
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
                    <span>Просмотры: {post.views === null ? 'н/д' : formatNumber(post.views)}</span>
                    <span>ER: {formatPercent(post.er)}</span><span>ERR: {formatPercent(post.err)}</span>
                    <ReactionBreakdownInline total={post.reactions} breakdown={post.reactionBreakdown} /><span>Комментарии: {post.comments ?? 'н/д'}</span>
                    <span>Пересылки: {post.forwards ?? 'н/д'}</span>
                  </div>
                  <button type="button" onClick={() => setSelectedPost(post)}
                    className="self-start rounded-xl border border-border px-3 py-1.5 text-xs text-white hover:bg-slate-800">
                    Читать полностью
                  </button>
                </div>
              </article>)}
            </div>}
          {!loading && posts.length < total && <div className="text-center">
            <button type="button" disabled={loadingMore} onClick={() => void loadMore()}
              className="rounded-xl border border-border bg-surface px-5 py-2.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50">
              {loadingMore ? 'Загрузка...' : 'Показать ещё'}
            </button>
          </div>}
        </section>
      </main>

      {selectedPost && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedPost(null)}>
        <div role="dialog" aria-modal="true" aria-label="Текст публикации"
          className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface"
          onClick={event => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-border p-4">
            <p className="text-sm font-semibold text-white">{selectedPost.channel.title} · {new Date(selectedPost.publishedAt).toLocaleString('ru-RU')}</p>
            <button type="button" onClick={() => setSelectedPost(null)} aria-label="Закрыть" className="rounded p-1.5 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="overflow-y-auto p-5 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
            {selectedPost.text || 'Текст публикации не получен. Это может быть медиа без подписи.'}
          </div>
        </div>
      </div>}
    </div>
  );
}
