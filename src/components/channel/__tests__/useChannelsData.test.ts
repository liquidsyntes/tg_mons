/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useChannelsData } from '../useChannelsData';
import { ChannelMetrics } from '@/lib/types';

describe('useChannelsData', () => {
  const mockChannels = [
    { id: 1, title: 'Channel B', isMine: false, currentMembers: 100 },
    { id: 2, title: 'My Channel', isMine: true, currentMembers: 50 },
    { id: 3, title: 'Channel A', isMine: false, currentMembers: 200 }
  ] as unknown as ChannelMetrics[];

  it('initializes with members desc sort and pinned myChannel', () => {
    const { result } = renderHook(() => useChannelsData(mockChannels));
    
    expect(result.current.sortField).toBe('members');
    expect(result.current.sortOrder).toBe('desc');
    
    expect(result.current.processedChannels[0].id).toBe(2); // My Channel pinned
    expect(result.current.processedChannels[1].id).toBe(3); // 200 members
    expect(result.current.processedChannels[2].id).toBe(1); // 100 members
  });

  it('filters by search query', () => {
    const { result } = renderHook(() => useChannelsData(mockChannels));
    
    act(() => {
      result.current.setSearchQuery('Channel A');
    });

    expect(result.current.processedChannels.length).toBe(1);
    expect(result.current.processedChannels[0].id).toBe(3);
  });

  it('toggles sort order', () => {
    const { result } = renderHook(() => useChannelsData(mockChannels));
    
    act(() => {
      result.current.handleSort('title');
    });
    
    expect(result.current.sortField).toBe('title');
    expect(result.current.sortOrder).toBe('desc');
    expect(result.current.processedChannels[1].id).toBe(1);
    expect(result.current.processedChannels[2].id).toBe(3);

    act(() => {
      result.current.handleSort('title');
    });
    expect(result.current.sortOrder).toBe('asc');
    expect(result.current.processedChannels[1].id).toBe(3);
    expect(result.current.processedChannels[2].id).toBe(1);
  });
});
