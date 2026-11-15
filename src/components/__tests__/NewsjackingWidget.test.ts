/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewsjackingWidget } from '../NewsjackingWidget';
import type { NewsjackingApiResponse } from '@/lib/types';

function makeApiResponse(hours: 24 | 48 | 72 = 48): NewsjackingApiResponse {
  return {
    windowHours: hours,
    analyzedPostsCount: 42,
    totalClusters: 2,
    uncoveredByMyChannelCount: 1,
    tag: null,
    niche: null,
    myChannelId: 3,
    availableTags: ['новости', 'тех'],
    clusters: [
      {
        topicId: 'nj_topic_1',
        title: 'Банк России поднял ключевую ставку до 21%',
        keywords: ['ключевой', 'ставки', '21'],
        firstPublishedAt: '2026-11-15T11:05:00.000Z',
        lastPublishedAt: '2026-11-15T12:25:00.000Z',
        channelsCount: 3,
        postsCount: 3,
        totalViews: 45000,
        avgErr: 8.5,
        coveredByMyChannel: false,
        myChannelDelayMinutes: null,
        firstPost: {
          postId: 10,
          messageId: '100',
          channelId: 1,
          channelTitle: 'Канал А',
          channelUsername: 'chan_a',
          isMine: false,
          publishedAt: '2026-11-15T11:05:00.000Z',
          delayMinutes: 0,
          isFirst: true,
          isPeak: false,
          views: 15000,
          err: 4.1,
          reactions: 300,
          comments: 50,
          forwards: 100,
          excerpt: 'Банк России поднял ключевую ставку',
        },
        peakPost: {
          postId: 12,
          messageId: '102',
          channelId: 4,
          channelTitle: 'Канал В',
          channelUsername: 'chan_v',
          isMine: false,
          publishedAt: '2026-11-15T12:25:00.000Z',
          delayMinutes: 80,
          isFirst: false,
          isPeak: true,
          views: 20000,
          err: 14.2,
          reactions: 1800,
          comments: 400,
          forwards: 640,
          excerpt: 'Подробный разбор влияния ставки на рынки',
        },
        timeline: [
          {
            postId: 10,
            messageId: '100',
            channelId: 1,
            channelTitle: 'Канал А',
            channelUsername: 'chan_a',
            isMine: false,
            publishedAt: '2026-11-15T11:05:00.000Z',
            delayMinutes: 0,
            isFirst: true,
            isPeak: false,
            views: 15000,
            err: 4.1,
            reactions: 300,
            comments: 50,
            forwards: 100,
            excerpt: 'Банк России поднял ключевую ставку',
          },
          {
            postId: 11,
            messageId: '101',
            channelId: 2,
            channelTitle: 'Канал Б',
            channelUsername: 'chan_b',
            isMine: false,
            publishedAt: '2026-11-15T11:23:00.000Z',
            delayMinutes: 18,
            isFirst: false,
            isPeak: false,
            views: 10000,
            err: 7.2,
            reactions: 400,
            comments: 100,
            forwards: 220,
            excerpt: 'Реакция биржи на решение ЦБ',
          },
          {
            postId: 12,
            messageId: '102',
            channelId: 4,
            channelTitle: 'Канал В',
            channelUsername: 'chan_v',
            isMine: false,
            publishedAt: '2026-11-15T12:25:00.000Z',
            delayMinutes: 80,
            isFirst: false,
            isPeak: true,
            views: 20000,
            err: 14.2,
            reactions: 1800,
            comments: 400,
            forwards: 640,
            excerpt: 'Подробный разбор влияния ставки на рынки',
          },
        ],
      },
      {
        topicId: 'nj_topic_2',
        title: 'Запуск новой модели GPT-5 для разработчиков',
        keywords: ['OpenAI', 'GPT-5'],
        firstPublishedAt: '2026-11-15T09:00:00.000Z',
        lastPublishedAt: '2026-11-15T09:45:00.000Z',
        channelsCount: 2,
        postsCount: 2,
        totalViews: 22000,
        avgErr: 6.0,
        coveredByMyChannel: true,
        myChannelDelayMinutes: 45,
        firstPost: {
          postId: 20,
          messageId: '200',
          channelId: 1,
          channelTitle: 'Канал А',
          channelUsername: 'chan_a',
          isMine: false,
          publishedAt: '2026-11-15T09:00:00.000Z',
          delayMinutes: 0,
          isFirst: true,
          isPeak: true,
          views: 14000,
          err: 7.5,
          reactions: 600,
          comments: 100,
          forwards: 350,
          excerpt: 'OpenAI представила GPT-5',
        },
        peakPost: {
          postId: 20,
          messageId: '200',
          channelId: 1,
          channelTitle: 'Канал А',
          channelUsername: 'chan_a',
          isMine: false,
          publishedAt: '2026-11-15T09:00:00.000Z',
          delayMinutes: 0,
          isFirst: true,
          isPeak: true,
          views: 14000,
          err: 7.5,
          reactions: 600,
          comments: 100,
          forwards: 350,
          excerpt: 'OpenAI представила GPT-5',
        },
        timeline: [
          {
            postId: 20,
            messageId: '200',
            channelId: 1,
            channelTitle: 'Канал А',
            channelUsername: 'chan_a',
            isMine: false,
            publishedAt: '2026-11-15T09:00:00.000Z',
            delayMinutes: 0,
            isFirst: true,
            isPeak: true,
            views: 14000,
            err: 7.5,
            reactions: 600,
            comments: 100,
            forwards: 350,
            excerpt: 'OpenAI представила GPT-5',
          },
          {
            postId: 21,
            messageId: '201',
            channelId: 3,
            channelTitle: 'Мой Канал',
            channelUsername: 'my_channel',
            isMine: true,
            publishedAt: '2026-11-15T09:45:00.000Z',
            delayMinutes: 45,
            isFirst: false,
            isPeak: false,
            views: 8000,
            err: 4.5,
            reactions: 200,
            comments: 40,
            forwards: 120,
            excerpt: 'Наш разбор GPT-5',
          },
        ],
      },
    ],
    speedLeaderboard: [
      {
        channelId: 1,
        channelTitle: 'Канал А',
        channelUsername: 'chan_a',
        isMine: false,
        topicsCovered: 2,
        firstCount: 2,
        peakCount: 1,
        medianDelayMinutes: 0,
        avgDelayMinutes: 0,
      },
      {
        channelId: 2,
        channelTitle: 'Канал Б',
        channelUsername: 'chan_b',
        isMine: false,
        topicsCovered: 1,
        firstCount: 0,
        peakCount: 0,
        medianDelayMinutes: 18,
        avgDelayMinutes: 18,
      },
    ],
  };
}

describe('NewsjackingWidget', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders news topic clusters, timeline delays, ERR leader badge, and speed leaderboard', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(48),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(NewsjackingWidget, { showTagSelector: true }));

    await waitFor(() =>
      expect(screen.getByText('Банк России поднял ключевую ставку до 21%')).toBeDefined(),
    );

    expect(screen.getByText('Не освещено в вашем канале')).toBeDefined();
    expect(screen.getByText('Освещено (задержка +45 мин)')).toBeDefined();
    expect(screen.getByText('+18 мин')).toBeDefined();
    expect(screen.getByText('+1ч 20м')).toBeDefined();
    expect(screen.getByText('Лидер по ERR: 14.2%')).toBeDefined();
    expect(screen.getByText('Лидеры оперативности')).toBeDefined();
    expect(screen.getByText('Первым: 2')).toBeDefined();
  });

  it('switches window period and filters uncovered topics', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => makeApiResponse(url.includes('hours=24') ? 24 : 48),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(NewsjackingWidget));

    await waitFor(() =>
      expect(screen.getByText('Запуск новой модели GPT-5 для разработчиков')).toBeDefined(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Не освещено мной (1)' }));
    expect(screen.queryByText('Запуск новой модели GPT-5 для разработчиков')).toBeNull();
    expect(screen.getByText('Банк России поднял ключевую ставку до 21%')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '24ч' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('hours=24'))).toBe(true),
    );
  });

  it('shows empty and error states gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        windowHours: 48,
        analyzedPostsCount: 5,
        totalClusters: 0,
        uncoveredByMyChannelCount: 0,
        tag: null,
        niche: null,
        myChannelId: null,
        clusters: [],
        speedLeaderboard: [],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(NewsjackingWidget));

    await waitFor(() =>
      expect(
        screen.getByText('За выбранное окно сквозные инфоповоды между каналами не обнаружены.'),
      ).toBeDefined(),
    );

    fetchMock.mockResolvedValueOnce({ ok: false });
    fireEvent.click(screen.getByRole('button', { name: '72ч' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });
});
