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
    fireEvent.click(screen.getByRole('button', { name: 'В закладках' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes('onlyAds=true') && String(url).includes('onlyViral=true') && String(url).includes('onlySaved=true'))).toBe(true));
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

  it('displays creative clusters in Ad Spy mode and filters feed by selected creative', async () => {
    const postInFeed = {
      id: 501,
      messageId: '100',
      publishedAt: '2026-11-10T10:00:00.000Z',
      text: 'Скидка 40% на облачную БД для стартапов',
      isAd: true,
      views: 3000,
      reactions: 40,
      reactionBreakdown: null,
      comments: 10,
      forwards: 10,
      er: 15,
      err: 2,
      hasImage: false,
      mentions: ['db_cloud'],
      isViral: false,
      viralReasons: [],
      viralPrimaryReason: null,
      viralMultiplier: null,
      channel: { id: 7, title: 'Dev Channel', username: 'devchan', niche: 'tech' },
    };
    const otherPostInFeed = {
      ...postInFeed,
      id: 502,
      text: 'Совсем другое рекламное предложение без кластера',
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/api/posts/advertisers')
        ? { days: 30, niche: null, advertisers: [] }
        : {
          posts: [postInFeed, otherPostInFeed],
          total: 2,
          niches: ['tech'],
          channels: [{ id: 7, title: 'Dev Channel', username: 'devchan', niche: 'tech' }],
          creativeClusters: [{
            clusterId: 'cr_cloud',
            sampleText: 'Скидка 40% на облачную БД для стартапов',
            normalizedPreview: 'скидка 40 на облачную бд для стартапов',
            advertisers: ['@db_cloud'],
            placementsCount: 1,
            uniqueChannelsCount: 1,
            totalViews: 3000,
            avgViews: 3000,
            avgEr: 15,
            avgErr: 2,
            maxErr: 2,
            firstSeenAt: '2026-11-10T10:00:00.000Z',
            lastSeenAt: '2026-11-10T10:00:00.000Z',
            bestPlacement: postInFeed,
            posts: [postInFeed],
          }],
        },
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(PostsPage));
    fireEvent.click(screen.getByRole('button', { name: 'Только реклама (Ad Spy)' }));

    await waitFor(() => expect(screen.getByText('Аналитика креативов (Ad Spy)')).toBeDefined());
    expect(screen.getByText(otherPostInFeed.text)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Показать посты креатива' }));
    await waitFor(() => expect(screen.getByText('Показаны размещения выбранного креатива (1)')).toBeDefined());
    expect(screen.queryByText(otherPostInFeed.text)).toBeNull();
  });
});
