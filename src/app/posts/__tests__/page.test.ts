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

  it('switches saved bookmarks view to ContentPlanBoard and updates status via PATCH', async () => {
    const savedPost = {
      id: 701,
      messageId: '201',
      publishedAt: '2026-11-12T10:00:00.000Z',
      text: 'Отличный пост-референс для переработки в свой канал',
      isAd: false,
      views: 5200,
      reactions: 90,
      reactionBreakdown: null,
      comments: 12,
      forwards: 30,
      er: 14,
      err: 3.1,
      hasImage: false,
      mentions: [],
      isViral: false,
      viralReasons: [],
      viralPrimaryReason: null,
      viralMultiplier: null,
      isSaved: true,
      savedNote: 'Раскрыть подробнее',
      savedAt: '2026-11-12T12:00:00.000Z',
      savedStatus: 'idea',
      savedPlannedFor: null,
      savedDraftText: null,
      channel: { id: 7, title: 'Dev Channel', username: 'devchan', niche: 'tech' },
    };

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/posts/saved' && (!init || !init.method || init.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({
            savedPosts: [
              {
                id: 1,
                postId: 701,
                note: 'Раскрыть подробнее',
                status: 'idea',
                plannedFor: null,
                draftText: null,
                createdAt: '2026-11-12T12:00:00.000Z',
                updatedAt: '2026-11-12T12:00:00.000Z',
              },
            ],
            recommendations: {
              slots: [
                {
                  dateTime: '2026-11-19T15:00:00.000Z',
                  dateKey: '2026-11-19',
                  dayOfWeek: 4,
                  hour: 18,
                  label: 'Чт, 18:00',
                  score: 88,
                  avgViews: 4500,
                },
              ],
              formatGuidance: {
                channelId: 1,
                channelTitle: 'Мой канал',
                bestLengthBucket: 'medium',
                bestLengthLabel: 'Средние (301-1000 симв.)',
                recommendedRangeLabel: '300-1000 зн.',
                bestStructureSignal: null,
                bestStructureLabel: null,
                withMediaRecommended: true,
                summaryText: 'Оптимальный формат для вашего канала: 300-1000 зн. с медиа · Лучшие окна: Чт, 18:00',
              },
            },
          }),
        };
      }
      if (url === '/api/posts/saved' && init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({
            savedPost: {
              id: 1,
              postId: 701,
              note: 'Раскрыть подробнее',
              status: 'in_progress',
              plannedFor: null,
              draftText: null,
              createdAt: '2026-11-12T12:00:00.000Z',
              updatedAt: '2026-11-14T06:00:00.000Z',
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          posts: [savedPost],
          total: 1,
          niches: ['tech'],
          channels: [{ id: 7, title: 'Dev Channel', username: 'devchan', niche: 'tech' }],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(PostsPage));
    fireEvent.click(screen.getByRole('button', { name: 'В закладках' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Контент-план (Доска)' })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Контент-план (Доска)' }));

    await waitFor(() =>
      expect(
        screen.getByText('Оптимальный формат для вашего канала: 300-1000 зн. с медиа · Лучшие окна: Чт, 18:00'),
      ).toBeDefined(),
    );

    const statusSelect = screen.getByLabelText('Статус карточки') as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === '/api/posts/saved' &&
            (init as RequestInit | undefined)?.method === 'PATCH' &&
            String((init as RequestInit | undefined)?.body).includes('"status":"in_progress"'),
        ),
      ).toBe(true),
    );
  });

  it('activates ContentPlanBoard directly from the top mode button Контент-план (Доска)', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/posts/saved') {
        return {
          ok: true,
          json: async () => ({
            savedPosts: [],
            recommendations: { slots: [], formatGuidance: null },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          posts: [],
          total: 0,
          niches: [],
          channels: [],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(PostsPage));
    const boardBtn = screen.getByRole('button', { name: 'Контент-план (Доска)' });
    fireEvent.click(boardBtn);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url).includes('/api/posts/search') && String(url).includes('onlySaved=true'),
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole('region', { name: 'Доска контент-плана' })).toBeDefined());
  });

  it('syncs filters when receiving tgmon:posts-navigate events between /posts query modes', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/posts/saved') {
        return {
          ok: true,
          json: async () => ({
            savedPosts: [],
            recommendations: { slots: [], formatGuidance: null },
          }),
        };
      }
      if (String(url).includes('/api/posts/advertisers')) {
        return {
          ok: true,
          json: async () => ({ days: 30, niche: null, advertisers: [] }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          posts: [],
          total: 0,
          niches: [],
          channels: [],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(PostsPage));

    window.dispatchEvent(new CustomEvent('tgmon:posts-navigate', { detail: '/posts?onlyAds=true' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/api/posts/search') && String(url).includes('onlyAds=true')),
      ).toBe(true),
    );

    window.dispatchEvent(new CustomEvent('tgmon:posts-navigate', { detail: '/posts?saved=1&view=board' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Доска контент-плана' })).toBeDefined());
  });
});
