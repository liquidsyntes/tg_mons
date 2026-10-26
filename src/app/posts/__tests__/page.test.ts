/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PostsPage from '../page';

vi.mock('@/components/Header', () => ({ Header: () => React.createElement('div') }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('global post filters', () => {
  it('combines Ad Spy and viral filters in the search request', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/api/posts/advertisers')
        ? { days: 30, niche: null, advertisers: [] }
        : { posts: [], total: 0, niches: [], channels: [] },
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(React.createElement(PostsPage));
    fireEvent.click(screen.getByRole('button', { name: 'Только реклама (Ad Spy)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Только вирусные' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes('onlyAds=true') && String(url).includes('onlyViral=true'))).toBe(true));
  });

  it('filters the post list when an advertiser is selected', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/api/posts/advertisers')
        ? { days: 30, niche: null, advertisers: [{
          username: 'brand', placementsCount: 2, channelsCount: 1,
          donorChannels: [{ id: 7, title: 'Технологии', username: 'tech', placementsCount: 2 }],
          totalViews: 3000, avgViews: 1500, estimatedSpendUah: 600,
          firstSeenAt: '2026-10-20T12:00:00Z', lastSeenAt: '2026-10-22T12:00:00Z',
          isTrackedChannel: false, channelId: null,
        }] }
        : { posts: [], total: 0, niches: [], channels: [] },
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(React.createElement(PostsPage));
    fireEvent.click(screen.getByRole('button', { name: 'Только реклама (Ad Spy)' }));
    await waitFor(() => expect(screen.getByText('@brand')).toBeDefined());
    expect(screen.getByText('600 ₴')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Показать размещения' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes('advertiser=brand') && String(url).includes('onlyAds=true'))).toBe(true));
    fireEvent.change(screen.getByLabelText(/Период рейтинга/), { target: { value: '7' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes('/api/posts/advertisers?') && String(url).includes('days=7'))).toBe(true));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes('/api/posts/search?') && String(url).includes('advertiser=brand') && String(url).includes('days=7'))).toBe(true));
  });
});
