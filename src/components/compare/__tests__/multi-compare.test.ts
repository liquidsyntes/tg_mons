/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChannelDetailStats, ChannelMetrics } from '@/lib/types';
import { buildMultiChannelComparison, buildTagBenchmarkProfile } from '@/lib/compare';

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

function buildChannelMetrics(
  overrides: Partial<ChannelMetrics> & { id: number; title: string }
): ChannelMetrics {
  return {
    id: overrides.id,
    username: overrides.username ?? `ch_${overrides.id}`,
    tgId: String(100 + overrides.id),
    title: overrides.title,
    type: 'channel',
    niche: 'tech',
    tags: overrides.tags ?? [],
    isMine: overrides.isMine ?? false,
    isFavorite: false,
    isActive: true,
    consecutiveErrors: 0,
    lastMessageId: '10',
    lastError: null,
    lastCollectedAt: '2026-11-10T10:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
    currentMembers: overrides.currentMembers ?? 10000,
    delta24h: { abs: 100, percent: 1 },
    delta7d: { abs: 500, percent: 5 },
    delta30d: overrides.delta30d ?? { abs: 2000, percent: 20 },
    posts24h: 2,
    posts7d: 14,
    posts30d: 60,
    avgPostsPerDay: 2,
    avgViews24h: 3500,
    vr24h: 35,
    avgViews7d: 3600,
    vr7d: 36,
    avgViews30d: overrides.avgViews30d ?? 4000,
    vr30d: 40,
    lastPostViews: 3800,
    trueErr7d: 4.5,
    er24h: 3,
    er7d: 3.1,
    er30d: overrides.er30d ?? 3.5,
    err24h: 6.5,
    err7d: 7,
    err30d: overrides.err30d ?? 8,
    cr7d: null,
    adShare7d: { percent: 10, level: 'medium' },
    adShare30d: overrides.adShare30d ?? { percent: 10, level: 'medium' },
    status: 'success',
    sparkline7d: [],
    fraudScore: overrides.fraudScore ?? 10,
  };
}

function buildStats(channel: ChannelMetrics): ChannelDetailStats {
  return {
    channel,
    myChannel: null,
    period: '30d',
    membersHistory: [
      { collectedAt: '2026-11-01T10:00:00.000Z', membersCount: Math.max(100, (channel.currentMembers ?? 1000) - 500) },
      { collectedAt: '2026-11-10T10:00:00.000Z', membersCount: channel.currentMembers ?? 1000 },
    ],
    postsDistribution: [{ date: '2026-11-05', postsCount: 3, viewsAvg: channel.avgViews30d ?? 3000 }],
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

describe('Multi-channel comparison and folder benchmark UI', () => {
  it('supports adding up to 4 channels, folder benchmark mode, KPI leader highlighting, shared advertisers, and chart scale toggle', async () => {
    const ch1 = buildChannelMetrics({
      id: 1,
      title: 'Канал Один',
      tags: ['crypto'],
      currentMembers: 20000,
      err30d: 12.5,
      fraudScore: 5,
    });
    const ch2 = buildChannelMetrics({
      id: 2,
      title: 'Канал Два',
      tags: ['crypto'],
      currentMembers: 10000,
      err30d: 8.2,
      fraudScore: 15,
    });
    const ch3 = buildChannelMetrics({
      id: 3,
      title: 'Канал Три',
      tags: ['news'],
      currentMembers: 30000,
      err30d: 6.4,
      fraudScore: 20,
    });

    const p1 = {
      ...buildStats(ch1),
      mentions: [{ sourceChannelId: 1, targetUsername: 'super_sponsor', type: 'mention', isAd: true }],
    };
    const p2 = {
      ...buildStats(ch2),
      mentions: [{ sourceChannelId: 2, targetUsername: 'super_sponsor', type: 'mention', isAd: true }],
    };
    const p3 = { ...buildStats(ch3), mentions: [] };
    const benchmarkProfile = buildTagBenchmarkProfile('crypto', [p1, p2], '7d');
    const participants = [p1, p2, p3, benchmarkProfile!.participant];
    const comparison = buildMultiChannelComparison(participants, '7d');

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/channels') {
        return { ok: true, json: async () => [ch1, ch2, ch3] };
      }
      if (url.startsWith('/api/stats/compare')) {
        return {
          ok: true,
          json: async () => ({
            a: p1,
            b: p2,
            period: '7d',
            participants,
            comparison,
            benchmarkProfile,
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(ComparePageWrapper));

    await screen.findByText('Выберите два канала для сравнения');

    // Добавляем третий канал
    fireEvent.click(screen.getByRole('button', { name: /\+ Добавить канал к сравнению/i }));
    expect(screen.getByLabelText('Канал C')).toBeDefined();

    // Включаем режим сравнения с папкой
    fireEvent.click(screen.getByRole('switch', { name: 'Сравнить с папкой (нишей)' }));
    const tagSelect = screen.getByLabelText('Папка для бенчмарка') as HTMLSelectElement;

    fireEvent.change(screen.getByLabelText('Канал A'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Канал B'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Канал C'), { target: { value: '3' } });
    fireEvent.change(tagSelect, { target: { value: 'crypto' } });

    fireEvent.click(screen.getByRole('button', { name: /Сравнить$/i }));

    expect(navigationState.push).toHaveBeenCalledWith('/compare?ids=1%2C2%2C3&benchmarkTag=crypto');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/stats/compare?ids=1,2,3&benchmarkTag=crypto&period=7d')
    );

    expect(await screen.findByRole('heading', { name: 'Канал Три' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Среднее по папке: crypto' })).toBeDefined();
    expect(screen.getByText('Сводная таблица KPI')).toBeDefined();
    expect(screen.getByText('Медиана папки')).toBeDefined();
    expect(screen.getAllByText('Лидер').length).toBeGreaterThan(0);
    expect(screen.getByText('Общие рекламодатели')).toBeDefined();
    expect(screen.getByText('@super_sponsor')).toBeDefined();
    expect(screen.getByText('Матрица взаимных упоминаний')).toBeDefined();

    const relBtn = screen.getByRole('button', { name: 'Относительный рост (%)' });
    fireEvent.click(relBtn);
    expect(relBtn.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Относительный рост в % от первой точки выбранного периода/)).toBeDefined();
  });
});
