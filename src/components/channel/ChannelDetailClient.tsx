'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChannelDetailStats } from '@/lib/types';
import { DetailSkeleton } from '@/components/SkeletonLoader';
import { ChannelHeader } from '@/components/channel/ChannelHeader';
import { ScoreGauge } from '@/components/channel/ScoreGauge';
import { SubscriberChart } from '@/components/channel/SubscriberChart';
import { PostsActivity } from '@/components/channel/PostsActivity';
import { ErrChart } from '@/components/channel/ErrChart';
import { ChannelHeatmap } from '@/components/channel/ChannelHeatmap';
import { RecentPosts } from '@/components/channel/RecentPosts';
import { AIReportsSection } from '@/components/channel/AIReportsSection';
import CitationNetworkWidget from '@/components/CitationNetworkWidget';
import ContentLTVChart from '@/components/channel/ContentLTVChart';
import { WrappedCard } from '@/components/channel/WrappedCard';
import { ChannelDangerZone } from '@/components/channel/ChannelDangerZone';
import { Header } from '@/components/Header';

interface ChannelDetailClientProps {
  channelId: string;
}

export function ChannelDetailClient({ channelId }: ChannelDetailClientProps) {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  const [data, setData] = useState<ChannelDetailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChannelData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats/channel/${channelId}?period=${period}`);
      if (!res.ok) throw new Error('Не удалось загрузить данные канала');
      const json: ChannelDetailStats = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [channelId, period]);

  useEffect(() => { fetchChannelData(); }, [fetchChannelData]);

  const channel = data?.channel;
  const myChannel = data?.myChannel ?? null;
  const isMine = channel?.isMine ?? false;

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-[6px]">
        {loading ? (
          <DetailSkeleton />
        ) : error || !channel ? (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-8 text-center space-y-3">
            <h3 className="text-base font-semibold text-white">Канал не найден или произошла ошибка</h3>
            <p className="text-xs text-rose-300/80">{error}</p>
            <Link href="/" className="inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold">
              Вернуться на главную
            </Link>
          </div>
        ) : (
          <>
            <div id="report-content" className="flex flex-col gap-[6px]">
              <ChannelHeader channel={channel} period={period} onPeriodChange={setPeriod} />
              {data!.scoreBreakdown && <ScoreGauge breakdown={data!.scoreBreakdown} />}
              <SubscriberChart data={data!} channel={channel} myChannel={myChannel} isMine={!!isMine} period={period} />
              <PostsActivity postsDistribution={data!.postsDistribution} channel={channel} period={period} />
              <ErrChart vrHistory={data!.vrHistory || []} period={period} />
              <ChannelHeatmap heatmapData={data!.heatmapData} myHeatmapData={data!.myHeatmapData} isMine={!!isMine} hasMyChannel={!!myChannel} />
              <AIReportsSection channelId={channelId} channel={channel} myChannel={myChannel} period={period} />
              <CitationNetworkWidget channelId={Number(channelId)} />
              <ContentLTVChart channelId={Number(channelId)} />
              <RecentPosts 
                initialPosts={data!.recentPosts || []} 
                channelId={channelId} 
                channelUsername={channel.username} 
                channelTgId={channel.tgId} 
              />
              <WrappedCard channel={channel} stats={data!} />
              <ChannelDangerZone channelId={channel.id} channelTitle={channel.title} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
