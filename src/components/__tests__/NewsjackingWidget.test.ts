/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NewsjackingWidget } from '../NewsjackingWidget';
import type { ChannelReactionSpeedSummary, NewsjackingApiResponse } from '@/lib/types';

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
          excerpt: 'Регулятор повысил ставку сразу на два процентных пункта',
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
          excerpt: 'Подробный разбор влияния ставки на рынки и ипотеку',
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
            excerpt: 'Регулятор повысил ставку сразу на два процентных пункта',
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
            excerpt: 'Подробный разбор влияния ставки на рынки и ипотеку',
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
          excerpt: 'OpenAI представила GPT-5 с длинным контекстом',
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
          excerpt: 'OpenAI представила GPT-5 с длинным контекстом',
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
            excerpt: 'OpenAI представила GPT-5 с длинным контекстом',
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

  it('renders compact topic cards with anchor roles, excerpt, expandable chronology, and quote toggle', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeApiResponse(48),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(NewsjackingWidget, { showTagSelector: true }));

    await waitFor(() =>
      expect(screen.getByText('Банк России поднял ключевую ставку до 21%')).toBeDefined(),
    );

    expect(
      screen.getByText('Регулятор повысил ставку сразу на два процентных пункта'),
    ).toBeDefined();
    expect(screen.getByText('Пропущено вами')).toBeDefined();
    expect(screen.getByText('Вы: +45 мин')).toBeDefined();
    expect(screen.getByText(/Лучший отклик · ERR 14\.2%/)).toBeDefined();
    expect(screen.getByText('Тема ещё не освещена')).toBeDefined();

    // Chronology is collapsed by default
    expect(screen.queryByText('+18 мин')).toBeNull();

    const expandButton = screen.getByRole('button', { name: 'Хронология (3 поста)' });
    expect(expandButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(expandButton);

    expect(expandButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('+18 мин')).toBeDefined();
    expect(screen.getByText('+1ч 20м')).toBeDefined();
    expect(screen.getByText('Пик ERR 14.2%')).toBeDefined();

    const quoteButtons = screen.getAllByRole('button', { name: 'Цитата' });
    fireEvent.click(quoteButtons[2]);

    expect(
      screen.getByText('Подробный разбор влияния ставки на рынки и ипотеку'),
    ).toBeDefined();
    expect(screen.getByText('Пересылки: 640')).toBeDefined();
  });

  it('renders each repeated post of the same channel on its own row with linked topic badges', async () => {
    const response = makeApiResponse(48);
    response.clusters = [
      {
        ...response.clusters[0],
        postsCount: 3,
        channelsCount: 2,
        timeline: [
          response.clusters[0].timeline[0],
          response.clusters[0].timeline[1],
          {
            postId: 13,
            messageId: '103',
            channelId: 1,
            channelTitle: 'Канал А',
            channelUsername: 'chan_a',
            isMine: false,
            publishedAt: '2026-11-15T12:00:00.000Z',
            delayMinutes: 55,
            isFirst: false,
            isPeak: true,
            views: 25000,
            err: 11.4,
            reactions: 900,
            comments: 150,
            forwards: 310,
            excerpt: 'Дополнение Канала А по решению регулятора',
          },
        ],
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(NewsjackingWidget));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Хронология (3 поста)' })).toBeDefined(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Хронология (3 поста)' }));

    const chronology = screen.getByLabelText(
      'Хронология реакции: Банк России поднял ключевую ставку до 21%',
    );
    expect(
      within(chronology).getByText(
        'Повторные посты одного канала отмечены общим цветным маркером',
      ),
    ).toBeDefined();

    const rows = within(chronology).getAllByRole('listitem');
    expect(rows).toHaveLength(3);

    expect(within(chronology).getByText('Пост 1 из 2 по теме')).toBeDefined();
    expect(within(chronology).getByText('По теме · пост 2 из 2')).toBeDefined();
    expect(within(chronology).getByText('(+55 мин к пред.)')).toBeDefined();
  });

  it('switches to speed leaderboard tab and pins my channel when ranked outside top 10', async () => {
    const response = makeApiResponse(48);
    const manyEntries: ChannelReactionSpeedSummary[] = Array.from({ length: 12 }, (_, idx) => ({
      channelId: idx + 100,
      channelTitle: idx === 11 ? 'Мой Канал в нише' : `Канал ${idx + 1}`,
      channelUsername: `chan_${idx + 1}`,
      isMine: idx === 11,
      topicsCovered: 1,
      firstCount: idx === 0 ? 2 : 0,
      peakCount: idx === 1 ? 1 : 0,
      medianDelayMinutes: idx * 10,
      avgDelayMinutes: idx * 10,
    }));
    response.speedLeaderboard = manyEntries;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(NewsjackingWidget));

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Рейтинг скорости/ })).toBeDefined(),
    );

    expect(screen.queryByText('Лидеры оперативности')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Рейтинг скорости/ }));

    expect(screen.getByText('Лидеры оперативности')).toBeDefined();
    expect(screen.getByText('Первым: 2')).toBeDefined();
    expect(screen.getByText('Ваш канал · #12')).toBeDefined();
    expect(screen.getByText('Мой Канал в нише')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Показать все каналы (12)' })).toBeDefined();
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

    fireEvent.click(screen.getByRole('button', { name: 'Пропущено мной (1)' }));
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
