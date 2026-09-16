/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BestTimeRecommendation, ChannelMetrics } from '@/lib/types';
import { channel } from '@/lib/__tests__/fixtures/channel-metrics';
import { BestTimeWidget } from '../BestTimeWidget';
import { MyChannelCard } from '../MyChannelCard';
import { WatchlistWidget } from '../WatchlistWidget';
import { TrendSpotterWidget } from '../TrendSpotterWidget';
import { ChannelsDesktopTable } from '../channel/ChannelsDesktopTable';
import { MetricCell } from '../channel/cells/MetricCell';

vi.mock('../AudienceDemographics', () => ({ AudienceDemographics: () => null }));

const recommendation: BestTimeRecommendation = {
  bestDay: 1, bestHour: 12, score: 50, avgViews: 200, avgVr: 25, postCount: 2,
  heatmap: [{ day: 1, hour: 12, score: 50, avgViews: 200, avgVr: 25, postCount: 2 }],
};
const report = {
  createdAt: '2026-09-16T12:00:00Z',
  data: { summary: 'Example summary', trends: [{ topic: 'Example trend', description: 'Description', channels: [], quote: '' }] },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('metric presentation', () => {
  it.each(['card', 'favorites'])('renders ERR rather than VR in %s', variant => {
    render(variant === 'card'
      ? React.createElement(MyChannelCard, { channel, onOpenAddModal: vi.fn() })
      : React.createElement(WatchlistWidget, { channels: [channel] }));
    expect(screen.getByText('2.5%')).toBeDefined();
    expect(screen.queryByText('50%')).toBeNull();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it.each(['card', 'favorites'])('renders CR for groups in %s', variant => {
    const group: ChannelMetrics = { ...channel, type: 'group' };
    render(variant === 'card'
      ? React.createElement(MyChannelCard, { channel: group, onOpenAddModal: vi.fn() })
      : React.createElement(WatchlistWidget, { channels: [group] }));
    expect(screen.getByText('3.75%')).toBeDefined();
    expect(screen.queryByText('2.5%')).toBeNull();
  });

  it.each([
    ['не постил 7д', 'Нет постов за последние 7 дней'],
    ['нет постов за 24ч', 'Нет постов за последние 24 часа'],
  ])('explains %s with a labelled dot without hiding genuine zero values', (reason, label) => {
    const { rerender } = render(React.createElement(MetricCell, { value: null, reason }));
    const marker = screen.getByRole('img', { name: label });
    expect(marker.title).toBe(label);
    expect(marker.textContent).toBe('');
    expect(screen.queryByText(/No posts/)).toBeNull();
    rerender(React.createElement(MetricCell, { value: 0, suffix: '%', reason }));
    expect(screen.getByText('0%')).toBeDefined();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('uses the API VR percentage directly, including zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...recommendation,
      heatmap: [...recommendation.heatmap, { ...recommendation.heatmap[0], hour: 14, avgVr: 0, score: 10 }],
    }) }));
    render(React.createElement(BestTimeWidget));
    expect(await screen.findByText('25.0%')).toBeDefined();
    expect(screen.getByText('0.0%')).toBeDefined();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/Средний ERR/)).toBeNull();
  });

  it.each([null, { ...recommendation, heatmap: [] }])('explains absent recommendation data', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
    render(React.createElement(BestTimeWidget));
    expect(await screen.findByText(/Недостаточно публикаций/)).toBeDefined();
  });

  it('shows a request failure instead of an empty recommendation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(React.createElement(BestTimeWidget));
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить');
  });
});

describe('trend radar disclosure', () => {
  it('opens and closes without generating a report or repeating the fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => report });
    vi.stubGlobal('fetch', fetcher);
    render(React.createElement(TrendSpotterWidget));
    await screen.findByText('Example trend');
    const toggle = screen.getByRole('button', { name: 'Радар трендов' });
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.hidden).toBe(false);
    fireEvent.click(toggle);
    expect(panel?.hidden).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/stats/trends');
  });

  it('keeps generation failures visible while collapsed and preserves the old report', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => report })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Example failure' }) });
    vi.stubGlobal('fetch', fetcher);
    render(React.createElement(TrendSpotterWidget));
    const refresh = screen.getByRole('button', { name: 'Обновить радар' });
    await waitFor(() => expect(refresh.hasAttribute('disabled')).toBe(false));
    fireEvent.click(refresh);
    expect((await screen.findByRole('alert')).textContent).toContain('Example failure');
    expect(screen.getByText('Example trend')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Радар трендов' }).getAttribute('aria-expanded')).toBe('false');
  });
});

it('exposes sortable English headers as buttons and announces sorting', () => {
  const onSort = vi.fn();
  render(React.createElement(ChannelsDesktopTable, {
    channels: [{ ...channel, sparkline7d: [] }], sortField: 'members', sortOrder: 'desc', onSort,
    localFavorites: {}, onToggleFavorite: vi.fn(),
  }));
  expect(screen.queryByRole('columnheader', { name: 'Act.' })).toBeNull();
  expect(screen.queryByTitle('Поставить на паузу')).toBeNull();
  expect(screen.queryByTitle('Возобновить сбор')).toBeNull();
  const header = screen.getByRole('columnheader', { name: 'Subscribers' });
  expect(header.getAttribute('aria-sort')).toBe('descending');
  fireEvent.click(screen.getByRole('button', { name: 'Subscribers' }));
  expect(onSort).toHaveBeenCalledWith('members');
});
