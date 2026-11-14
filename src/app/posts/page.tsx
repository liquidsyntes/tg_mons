'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FileSearch } from 'lucide-react';
import { Header } from '@/components/Header';
import { formatNumber } from '@/lib/utils';
import type {
  AdCreativeCluster,
  AdCreativePostItem,
  ContentPlanRecommendations,
  GlobalPostSearchResponse,
  SavedPostItem,
  SearchPost,
} from '@/lib/types';
import { ViralBadge } from '@/components/channel/ViralBadge';
import { ReactionBreakdownInline } from '@/components/channel/ReactionBreakdownInline';
import { PostBookmarkButton } from '@/components/channel/PostBookmarkButton';
import { PostReaderModal, buildTelegramPostUrl } from '@/components/channel/PostReaderModal';
import { TopAdvertisersPanel } from '@/components/posts/TopAdvertisersPanel';
import { AdCreativesPanel } from '@/components/posts/AdCreativesPanel';
import { ContentPlanBoard, type ContentPlanPatchPayload } from '@/components/posts/ContentPlanBoard';
import { AdRetentionBadge } from '@/components/AdRetentionBadge';
import { isDeletedRetentionFormat } from '@/lib/adReach';

type SortBy = 'publishedAt' | 'views' | 'er' | 'err' | 'forwards';

function formatPercent(value: number | null): string {
  return value === null ? 'н/д' : `${value.toFixed(1)}%`;
}

function toSearchPost(item: AdCreativePostItem): SearchPost {
  return {
    id: item.id,
    messageId: item.messageId ?? String(item.id),
    publishedAt: item.publishedAt,
    text: item.text,
    isAd: item.isAd ?? true,
    views: item.views,
    reactions: item.reactions,
    reactionBreakdown: item.reactionBreakdown ?? null,
    comments: item.comments,
    forwards: item.forwards,
    er: item.er,
    err: item.err,
    hasImage: item.hasImage ?? false,
    mentions: item.mentions,
    isViral: item.isViral ?? false,
    viralReasons: item.viralReasons ?? [],
    viralPrimaryReason: item.viralPrimaryReason ?? null,
    viralMultiplier: item.viralMultiplier ?? null,
    isSaved: item.isSaved,
    savedNote: item.savedNote ?? null,
    savedAt: item.savedAt ?? null,
    savedStatus: item.savedStatus,
    savedPlannedFor: item.savedPlannedFor ?? null,
    savedDraftText: item.savedDraftText ?? null,
    deletedAt: item.deletedAt ?? null,
    deletedAfterHours: item.deletedAfterHours ?? null,
    retentionFormat: item.retentionFormat,
    lastCapturedViews: item.lastCapturedViews ?? null,
    channel: {
      id: item.channel.id,
      title: item.channel.title,
      username: item.channel.username,
      niche: item.channel.niche ?? 'general',
    },
  };
}

export default function PostsPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [onlyAds, setOnlyAds] = useState(false);
  const [advertiserUsername, setAdvertiserUsername] = useState('');
  const [advertiserDays, setAdvertiserDays] = useState<7 | 30>(30);
  const [onlyViral, setOnlyViral] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [recommendations, setRecommendations] = useState<ContentPlanRecommendations | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [niche, setNiche] = useState('');
  const [tag, setTag] = useState('');
  const [channelId, setChannelId] = useState('');
  const [days, setDays] = useState(30);
  const [sortBy, setSortBy] = useState<SortBy>('publishedAt');
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [total, setTotal] = useState(0);
  const [creativeClusters, setCreativeClusters] = useState<AdCreativeCluster[]>([]);
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);
  const [niches, setNiches] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
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

  const syncFiltersFromSearch = useCallback((searchString: string) => {
    const params = new URLSearchParams(searchString);
    const adsParam = params.get('onlyAds');
    const savedParam = params.get('saved') ?? params.get('onlySaved');
    const viewParam = params.get('view');

    const nextOnlyAds = adsParam === 'true' || adsParam === '1';
    const nextViewMode: 'list' | 'board' = viewParam === 'board' ? 'board' : 'list';
    const nextOnlySaved = savedParam === '1' || savedParam === 'true' || nextViewMode === 'board';

    setOnlyAds(nextOnlyAds);
    setOnlySaved(nextOnlySaved);
    setViewMode(nextViewMode);
    if (!nextOnlyAds) {
      setAdvertiserUsername('');
      setActiveClusterId(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    syncFiltersFromSearch(window.location.search);

    const handlePopState = () => {
      syncFiltersFromSearch(window.location.search);
    };
    const handlePostsNavigate = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string') {
        const parsed = new URL(detail, window.location.origin);
        syncFiltersFromSearch(parsed.search);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('tgmon:posts-navigate', handlePostsNavigate);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('tgmon:posts-navigate', handlePostsNavigate);
    };
  }, [syncFiltersFromSearch]);

  const searchUrl = useCallback((offset: number): string => {
    const params = new URLSearchParams({
      days: String(days), sortBy, onlyAds: String(onlyAds), onlyViral: String(onlyViral), limit: '20', offset: String(offset),
    });
    if (onlyAds) params.set('includeCreatives', 'true');
    if (onlySaved) params.set('onlySaved', 'true');
    if (search) params.set('q', search);
    if (niche) params.set('niche', niche);
    if (tag) params.set('tag', tag);
    if (channelId) params.set('channelId', channelId);
    if (advertiserUsername) params.set('advertiser', advertiserUsername);
    return `/api/posts/search?${params.toString()}`;
  }, [days, sortBy, onlyAds, onlyViral, onlySaved, search, niche, tag, channelId, advertiserUsername]);

  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    setLoading(true);
    setPosts([]);
    setTotal(0);
    setCreativeClusters([]);
    setActiveClusterId(null);
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
        setCreativeClusters(data.creativeClusters ?? []);
        setNiches(data.niches);
        setTags(data.tags ?? []);
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

  const activeCluster = useMemo(
    () => (onlyAds && activeClusterId
      ? creativeClusters.find(cluster => cluster.clusterId === activeClusterId) ?? null
      : null),
    [onlyAds, activeClusterId, creativeClusters],
  );

  const displayedPosts = useMemo(
    () => (activeCluster ? activeCluster.posts.map(toSearchPost) : posts),
    [activeCluster, posts],
  );

  const displayedTotal = activeCluster ? displayedPosts.length : total;

  const loadPlanData = useCallback(async () => {
    setRecommendationsLoading(true);
    try {
      const response = await fetch('/api/posts/saved');
      if (!response.ok) return;
      const data = (await response.json()) as {
        savedPosts?: SavedPostItem[];
        recommendations?: ContentPlanRecommendations;
      };
      if (data.recommendations) {
        setRecommendations(data.recommendations);
      }
      if (Array.isArray(data.savedPosts) && data.savedPosts.length > 0) {
        const byPostId = new Map(data.savedPosts.map((item) => [item.postId, item]));
        setPosts((current) =>
          current.map((post) => {
            const meta = byPostId.get(post.id);
            if (!meta) return post;
            return {
              ...post,
              isSaved: true,
              savedNote: meta.note,
              savedStatus: meta.status,
              savedPlannedFor: meta.plannedFor,
              savedDraftText: meta.draftText,
            };
          }),
        );
      }
    } catch {
      // Опциональные рекомендации не блокируют просмотр закладок
    } finally {
      setRecommendationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (onlySaved && viewMode === 'board' && !loading) {
      void loadPlanData();
    }
  }, [onlySaved, viewMode, loading, loadPlanData]);

  const handleUpdateContentPlan = useCallback(
    async (postId: number, patch: ContentPlanPatchPayload) => {
      const response = await fetch('/api/posts/saved', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, ...patch }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        savedPost?: SavedPostItem;
      } | null;
      if (!response.ok || !data?.savedPost) {
        throw new Error(data?.error || 'Не удалось обновить карточку');
      }
      const updated = data.savedPost;
      setPosts((current) =>
        current.map((item) =>
          item.id === postId
            ? {
                ...item,
                isSaved: true,
                savedNote: updated.note,
                savedStatus: updated.status,
                savedPlannedFor: updated.plannedFor,
                savedDraftText: updated.draftText,
              }
            : item,
        ),
      );
      await loadPlanData();
    },
    [loadPlanData],
  );

  const handleRemoveFromPlan = useCallback(
    async (postId: number) => {
      const response = await fetch(`/api/posts/saved?postId=${postId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || 'Не удалось удалить пост из закладок');
      }
      setPosts((current) => current.filter((item) => item.id !== postId));
      setTotal((current) => Math.max(0, current - 1));
      await loadPlanData();
    },
    [loadPlanData],
  );

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
          <div className="flex flex-wrap gap-2" role="group" aria-label="Режим поиска">
            <button
              type="button"
              onClick={() => {
                setOnlyAds(false);
                setOnlySaved(false);
                setViewMode('list');
                setAdvertiserUsername('');
                setActiveClusterId(null);
              }}
              aria-pressed={!onlyAds && !(onlySaved && viewMode === 'board')}
              className={`rounded-xl border px-3 py-2 text-sm ${
                !onlyAds && !(onlySaved && viewMode === 'board')
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-slate-300'
              }`}
            >
              Все посты
            </button>
            <button
              type="button"
              onClick={() => {
                setOnlyAds(true);
                if (viewMode === 'board') {
                  setOnlySaved(false);
                  setViewMode('list');
                }
              }}
              aria-pressed={onlyAds}
              className={`rounded-xl border px-3 py-2 text-sm ${
                onlyAds ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'
              }`}
            >
              Только реклама (Ad Spy)
            </button>
            <button
              type="button"
              onClick={() => {
                setOnlyAds(false);
                setOnlySaved(true);
                setViewMode('board');
                setAdvertiserUsername('');
                setActiveClusterId(null);
              }}
              aria-pressed={onlySaved && viewMode === 'board'}
              className={`rounded-xl border px-3 py-2 text-sm ${
                onlySaved && viewMode === 'board'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-slate-300'
              }`}
            >
              Контент-план (Доска)
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setOnlyViral(value => !value)} aria-pressed={onlyViral}
              className={`rounded-xl border px-3 py-2 text-sm ${onlyViral ? 'border-rose-400 bg-rose-500/15 text-rose-300' : 'border-border text-slate-300'}`}>
              Только вирусные
            </button>
            <button type="button" onClick={() => {
              setOnlySaved(value => {
                const next = !value;
                if (!next) setViewMode('list');
                return next;
              });
            }} aria-pressed={onlySaved}
              className={`rounded-xl border px-3 py-2 text-sm ${onlySaved ? 'border-amber-400 bg-amber-500/15 text-amber-300' : 'border-border text-slate-300'}`}>
              В закладках
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="space-y-1.5 text-xs text-slate-300"><span>Ниша</span>
              <select value={niche} onChange={event => { setNiche(event.target.value); setChannelId(''); setAdvertiserUsername(''); }}
                className="w-full rounded-xl border border-border bg-slate-900 px-3 py-2.5 text-sm text-white">
                <option value="">Все ниши</option>
                {niches.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-slate-300"><span>Папка / тег</span>
              <select value={tag} onChange={event => { setTag(event.target.value); setChannelId(''); }}
                className="w-full rounded-xl border border-border bg-slate-900 px-3 py-2.5 text-sm text-white">
                <option value="">Все теги</option>
                {tags.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-slate-300"><span>Канал</span>
              <select value={channelId} onChange={event => setChannelId(event.target.value)}
                className="w-full rounded-xl border border-border bg-slate-900 px-3 py-2.5 text-sm text-white">
                <option value="">Все каналы</option>
                {channels.filter(channel => (!niche || channel.niche === niche) && (!tag || (channel.tags ?? []).includes(tag))).map(channel =>
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

        {onlyAds && (
          <AdCreativesPanel
            clusters={creativeClusters}
            loading={loading}
            activeClusterId={activeClusterId}
            onSelectCluster={cluster => setActiveClusterId(cluster?.clusterId ?? null)}
            onAdvertiserClick={adv => {
              setActiveClusterId(null);
              if (adv.startsWith('@')) {
                setAdvertiserUsername(adv.slice(1));
              } else {
                setQ(adv);
              }
            }}
          />
        )}

        {advertiserUsername && <div className="flex items-center gap-2 text-sm text-slate-300">
          Публикации @{advertiserUsername}
          <button type="button" onClick={() => setAdvertiserUsername('')} className="rounded-lg border border-border px-2 py-1 text-xs text-white hover:bg-slate-800">
            Сбросить рекламодателя
          </button>
        </div>}

        {activeCluster && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm text-slate-200">
            <span>
              Показаны размещения выбранного креатива ({activeCluster.placementsCount})
            </span>
            <button
              type="button"
              onClick={() => setActiveClusterId(null)}
              className="rounded-lg border border-border bg-slate-900 px-2.5 py-1 text-xs text-white hover:bg-slate-800"
            >
              Сбросить фильтр креатива
            </button>
          </div>
        )}

        <section aria-label="Результаты поиска" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">Найдено публикаций: {formatNumber(displayedTotal)}</p>
            {onlySaved && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Режим отображения закладок">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${viewMode === 'list' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}
                >
                  Список закладок
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('board')}
                  aria-pressed={viewMode === 'board'}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${viewMode === 'board' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-slate-300'}`}
                >
                  Доска идей
                </button>
              </div>
            )}
          </div>
          {error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}
          {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Загрузка публикаций">
            {[1, 2, 3].map(value => <div key={value} className="h-64 animate-pulse rounded-xl border border-border bg-surface" />)}
          </div> : onlySaved && viewMode === 'board' ? (
            <ContentPlanBoard
              posts={displayedPosts}
              recommendations={recommendations}
              recommendationsLoading={recommendationsLoading}
              onUpdatePlan={handleUpdateContentPlan}
              onRemoveSaved={handleRemoveFromPlan}
              onOpenPost={setSelectedPost}
            />
          ) : displayedPosts.length === 0 ?
            <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-slate-400">Публикации не найдены. Измените фильтры или период.</p> :
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayedPosts.map(post => <article key={post.id} className="overflow-hidden rounded-xl border border-border bg-surface flex flex-col">
                {post.hasImage && <Image src={`/api/posts/${post.id}/image`} alt="Изображение публикации" width={640} height={360} unoptimized
                  className="h-40 w-full object-cover" />}
                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/channel/${post.channel.id}`} className="text-sm font-semibold text-white hover:text-accent">
                      {post.channel.title}
                    </Link>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                      {post.isAd && <span className="rounded bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-300">Реклама</span>}
                      <AdRetentionBadge format={post.retentionFormat} deletedAt={post.deletedAt} variant="compact" />
                    </div>
                  </div>
                  <ViralBadge result={post} />
                  <p className="text-xs text-slate-500">{post.channel.niche} · {new Date(post.publishedAt).toLocaleString('ru-RU')}</p>
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-slate-300 flex-1">{post.text || 'Текст публикации недоступен'}</p>
                  {post.mentions.length > 0 && <p className="text-xs text-slate-400 break-words">Упомянуты: {post.mentions.map(value => `@${value}`).join(', ')}</p>}
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
                    <span>
                      {Boolean(post.deletedAt) || isDeletedRetentionFormat(post.retentionFormat) ? 'Сохран. охват' : 'Просмотры'}:{' '}
                      {(post.lastCapturedViews ?? post.views) === null ? 'н/д' : formatNumber((post.lastCapturedViews ?? post.views)!)}
                    </span>
                    <span>ER: {formatPercent(post.er)}</span><span>ERR: {formatPercent(post.err)}</span>
                    <ReactionBreakdownInline total={post.reactions} breakdown={post.reactionBreakdown} /><span>Комментарии: {post.comments ?? 'н/д'}</span>
                    <span>Пересылки: {post.forwards ?? 'н/д'}</span>
                  </div>
                  <button type="button" onClick={() => setSelectedPost(post)}
                    className="self-start rounded-xl border border-border px-3 py-1.5 text-xs text-white hover:bg-slate-800">
                    Читать полностью
                  </button>
                  <PostBookmarkButton
                    postId={post.id}
                    isSaved={post.isSaved}
                    savedNote={post.savedNote}
                    onSavedChange={(id, isSaved, savedNote) => {
                      setPosts(current =>
                        onlySaved && !isSaved
                          ? current.filter(item => item.id !== id)
                          : current.map(item => item.id === id ? { ...item, isSaved, savedNote } : item)
                      );
                      setCreativeClusters(current =>
                        current.map(cluster => ({
                          ...cluster,
                          posts: cluster.posts.map(item =>
                            item.id === id ? { ...item, isSaved, savedNote } : item
                          ),
                        }))
                      );
                      if (onlySaved && !isSaved) {
                        setTotal(current => Math.max(0, current - 1));
                      }
                    }}
                  />
                </div>
              </article>)}
            </div>}
          {!loading && !activeCluster && posts.length < total && <div className="text-center">
            <button type="button" disabled={loadingMore} onClick={() => void loadMore()}
              className="rounded-xl border border-border bg-surface px-5 py-2.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50">
              {loadingMore ? 'Загрузка...' : 'Показать ещё'}
            </button>
          </div>}
        </section>
      </main>

      {selectedPost && (
        <PostReaderModal
          channelTitle={selectedPost.channel.title}
          publishedAt={selectedPost.publishedAt}
          text={selectedPost.text}
          views={selectedPost.views}
          highlightQuery={search}
          telegramUrl={buildTelegramPostUrl({
            channelUsername: selectedPost.channel.username,
            messageId: selectedPost.messageId,
          })}
          emptyTextMessage="Текст публикации не получен. Это может быть медиа без подписи."
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
