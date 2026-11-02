/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChannelDetailStats, ChannelMetrics } from '@/lib/types';

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const navigationState = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigationState.params,
  useRouter: () => ({ push: navigationState.push }),
  usePathname: () => '/compare',
}));

vi.mock('@/components/Header', () => ({
  Header: () => React.createElement('header', { 'data-testid': 'mock-header' }),
}));

import ComparePageWrapper from '@/app/compare/page';

function buildChannelMetrics(overrides: Partial<ChannelMetrics> & { id: number; title: string }): ChannelMetrics {
  return {
    id: overrides.id,
    username: overrides.username ?? `channel_${overrides.id}`,
    tgId: overrides.tgId ?? String(overrides.id),
    title: overrides.title,
    type: 'channel',
    niche: 'tech',
    tags: [],
    isMine: overrides.isMine ?? false,
    isFavorite: false,
    isActive: true,
    consecutiveErrors: 0,
    lastMessageId: '100',
    lastError: null,
    lastCollectedAt: '2026-11-01T10:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
    currentMembers: overrides.currentMembers ?? 10000,
    delta24h: overrides.delta24h ?? { abs: 120, percent: 1.2 },
    delta7d: overrides.delta7d ?? { abs: 650, percent: 6.5 },
    delta30d: overrides.delta30d ?? { abs: 2100, percent: 21 },
    posts24h: 3,
    posts7d: overrides.posts7d ?? 18,
    posts30d: overrides.posts30d ?? 72,
    avgPostsPerDay: overrides.avgPostsPerDay ?? 2.4,
    avgViews24h: overrides.avgViews24h ?? 4200,
    vr24h: 42,
    avgViews7d: overrides.avgViews7d ?? 4500,
    vr7d: overrides.vr7d ?? 45,
    avgViews30d: 4600,
    vr30d: 46,
    lastPostViews: 4100,
    trueErr7d: 3.2,
    er24h: 3.1,
    er7d: 3.4,
    err24h: 7.2,
    err7d: 7.5,
    cr7d: null,
    adShare7d: { percent: 5.5, level: 'low' },
    adShare30d: { percent: 5.5, level: 'low' },
    status: 'success',
    sparkline7d: [9500, 9800, 10000],
    contentScore: 78,
    contentGrade: 'B',
    citationIndex: 12.5,
    activityStatus: 'активен',
    lastPostAt: '2026-11-01T09:00:00.000Z',
  };
}

function buildDetailStats(channel: ChannelMetrics): ChannelDetailStats {
  return {
    channel,
    myChannel: null,
    period: '7d',
    scoreBreakdown: {
      errScore: 20,
      frequencyScore: 20,
      growthScore: 20,
      stabilityScore: 18,
      total: 78,
      grade: 'B',
    },
    membersHistory: [
      { collectedAt: '2026-10-30T10:00:00.000Z', membersCount: (channel.currentMembers ?? 1000) - 100, myMembersCount: null },
      { collectedAt: '2026-10-31T10:00:00.000Z', membersCount: channel.currentMembers ?? 1000, myMembersCount: null },
    ],
    postsDistribution: [
      { date: '2026-10-30', postsCount: 2, viewsAvg: 3800 },
      { date: '2026-10-31', postsCount: 3, viewsAvg: 4200 },
    ],
    heatmapData: [],
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  navigationState.params = new URLSearchParams();
  navigationState.push.mockReset();
  vi.unstubAllGlobals();
});

describe('ComparePage', () => {
  it('renders empty state before channels are selected', async () => {
    const channelA = buildChannelMetrics({ id: 1, title: 'Альфа Канал', isMine: true });
    const channelB = buildChannelMetrics({ id: 2, title: 'Бета Канал' });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [channelA, channelB],
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(ComparePageWrapper));

    expect(await screen.findByText('Выберите два канала для сравнения')).toBeDefined();
    expect(screen.getByRole('button', { name: /Сравнить/i }).hasAttribute('disabled')).toBe(true);
  });

  it('loads and displays comparison metrics, charts, and switches period when a and b are provided', async () => {
    navigationState.params = new URLSearchParams('a=1&b=2');
    const channelA = buildChannelMetrics({
      id: 1,
      title: 'Альфа Канал',
      username: 'alpha_ch',
      currentMembers: 15000,
      vr7d: 52.4,
    });
    const channelB = buildChannelMetrics({
      id: 2,
      title: 'Бета Канал',
      username: 'beta_ch',
      currentMembers: 9500,
      vr7d: 31.2,
    });

    const comparePayload = {
      a: buildDetailStats(channelA),
      b: buildDetailStats(channelB),
      period: '7d',
    };

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/channels') {
        return Promise.resolve({ ok: true, json: async () => [channelA, channelB] });
      }
      if (url.startsWith('/api/stats/compare')) {
        return Promise.resolve({ ok: true, json: async () => comparePayload });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(ComparePageWrapper));

    expect(await screen.findByRole('heading', { name: 'Альфа Канал' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Бета Канал' })).toBeDefined();
    expect(screen.getByText('@alpha_ch')).toBeDefined();
    expect(screen.getByText('@beta_ch')).toBeDefined();
    expect(screen.getByText('52.4%')).toBeDefined();
    expect(screen.getByText('31.2%')).toBeDefined();
    expect(screen.getByText('Динамика подписчиков')).toBeDefined();
    expect(screen.getByText('Активность публикаций')).toBeDefined();
    expect(screen.getByText('Средние просмотры')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '30 дней' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stats/compare?a=1&b=2&period=30d');
    });
  });

  it('displays error message when comparison request fails', async () => {
    navigationState.params = new URLSearchParams('a=1&b=2');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/channels') {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Ошибка сервера' }) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(ComparePageWrapper));

    expect(await screen.findByText('Ошибка загрузки данных')).toBeDefined();
  });
});
