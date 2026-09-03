import { useState, useMemo, useCallback } from 'react';
import { ChannelMetrics } from '@/lib/types';

export type SortField = 'title' | 'members' | 'delta24h' | 'delta7d' | 'delta30d' | 'posts7d' | 'share' | 'views' | 'err' | 'score' | 'ep' | 'lastFact';
export type SortOrder = 'asc' | 'desc';

export function useChannelsData(channels: ChannelMetrics[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('members');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [localFavorites, setLocalFavorites] = useState<Record<number, boolean>>({});
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }, [sortField, sortOrder]);

  const toggleFavorite = useCallback(async (e: React.MouseEvent, channelId: number, currentFav: boolean) => {
    e.stopPropagation();
    e.preventDefault();
    const newFav = !currentFav;
    setLocalFavorites(prev => ({ ...prev, [channelId]: newFav }));
    
    try {
      const res = await fetch(`/api/channels/${channelId}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: newFav })
      });
      if (!res.ok) throw new Error('Failed to update favorite');
    } catch (err) {
      console.error(err);
      setLocalFavorites(prev => ({ ...prev, [channelId]: currentFav }));
    }
  }, []);

  const processedChannels = useMemo(() => {
    let list = [...channels];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.username && c.username.toLowerCase().includes(q))
      );
    }

    const myCh = list.find((c) => c.isMine);
    const competitors = list.filter((c) => !c.isMine);

    competitors.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortField) {
        case 'title':
          return sortOrder === 'asc'
            ? a.title.localeCompare(b.title)
            : b.title.localeCompare(a.title);
        case 'members':
          valA = a.currentMembers ?? -1;
          valB = b.currentMembers ?? -1;
          break;
        case 'delta24h':
          valA = a.delta24h.percent ?? (a.delta24h.abs !== null ? a.delta24h.abs : -999999);
          valB = b.delta24h.percent ?? (b.delta24h.abs !== null ? b.delta24h.abs : -999999);
          break;
        case 'delta7d':
          valA = a.delta7d.percent ?? (a.delta7d.abs !== null ? a.delta7d.abs : -999999);
          valB = b.delta7d.percent ?? (b.delta7d.abs !== null ? b.delta7d.abs : -999999);
          break;
        case 'delta30d':
          valA = a.delta30d.percent ?? (a.delta30d.abs !== null ? a.delta30d.abs : -999999);
          valB = b.delta30d.percent ?? (b.delta30d.abs !== null ? b.delta30d.abs : -999999);
          break;
        case 'posts7d':
          valA = a.posts7d;
          valB = b.posts7d;
          break;
        case 'share':
          valA = a.comparison?.audienceSharePercent ?? -1;
          valB = b.comparison?.audienceSharePercent ?? -1;
          break;
        case 'views':
          valA = a.avgViews24h ?? a.avgViews7d ?? -1;
          valB = b.avgViews24h ?? b.avgViews7d ?? -1;
          break;
        case 'err':
          valA = a.vr24h ?? a.vr7d ?? -1;
          valB = b.vr24h ?? b.vr7d ?? -1;
          break;
        case 'score':
          valA = a.contentScore ?? -1;
          valB = b.contentScore ?? -1;
          break;
        case 'ep':
          valA = a.ep ?? -1;
          valB = b.ep ?? -1;
          break;
        case 'lastFact':
          valA = a.lastPostViews ?? -1;
          valB = b.lastPostViews ?? -1;
          break;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return myCh ? [myCh, ...competitors] : competitors;
  }, [channels, searchQuery, sortField, sortOrder]);

  return {
    searchQuery,
    setSearchQuery,
    sortField,
    sortOrder,
    handleSort,
    localFavorites,
    toggleFavorite,
    actionLoadingId,
    setActionLoadingId,
    processedChannels
  };
}
