/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChannelPdfTemplate } from '../ChannelPdfTemplate';
import { ExportPdfButton } from '../../ExportPdfButton';
import { channel } from '@/lib/__tests__/fixtures/channel-metrics';
import type { ChannelDetailStats } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mockStats: ChannelDetailStats = {
  channel: {
    ...channel,
    title: 'Тестовый Канал',
    username: 'test_channel',
    currentMembers: 24680,
    delta7d: { abs: 2801, percent: 12.8, coverageDays: 7 },
    delta24h: { abs: 120, percent: 0.5, coverageDays: 1 },
    delta30d: { abs: 4500, percent: 22.3, coverageDays: 30 },
    avgViews7d: 1280,
    vr7d: 8.42,
    err7d: 8.42,
    posts7d: 48,
    posts30d: 180,
    citationIndex: 12.4,
  },
  myChannel: null,
  period: '7d',
  membersHistory: [
    { collectedAt: '2026-10-20T10:00:00Z', membersCount: 22000 },
    { collectedAt: '2026-10-22T10:00:00Z', membersCount: 23200 },
    { collectedAt: '2026-10-24T10:00:00Z', membersCount: 24000 },
    { collectedAt: '2026-10-27T10:00:00Z', membersCount: 24680 },
  ],
  postsDistribution: [
    { date: '2026-10-20', postsCount: 6 },
    { date: '2026-10-21', postsCount: 8 },
    { date: '2026-10-22', postsCount: 7 },
  ],
  heatmapData: [],
  contentTypePerformance: [
    {
      type: 'text',
      label: 'Текстовые публикации',
      er: 2.1,
      avgEr: 2.1,
      avgErr: 8.4,
      postsCount: 22,
      sharePercent: 46,
      avgViews: 1400,
      medianViews: 1350,
      avgForwards: 4,
      avgComments: 2,
    },
    {
      type: 'photo',
      label: 'Фото и медиа',
      er: 1.8,
      avgEr: 1.8,
      avgErr: 7.2,
      postsCount: 15,
      sharePercent: 32,
      avgViews: 1200,
      medianViews: 1150,
      avgForwards: 2,
      avgComments: 1,
    },
    {
      type: 'video',
      label: 'Видео и кружки',
      er: 1.5,
      avgEr: 1.5,
      avgErr: 6.5,
      postsCount: 11,
      sharePercent: 22,
      avgViews: 1100,
      medianViews: 1050,
      avgForwards: 3,
      avgComments: 2,
    },
  ],
};

describe('ChannelPdfTemplate', () => {
  it('renders all 3 distinct A4 pages with correct section headers and footers', () => {
    const { container } = render(
      React.createElement(ChannelPdfTemplate, {
        stats: mockStats,
        period: '7d',
      })
    );

    const page1 = container.querySelector('#pdf-page-1');
    const page2 = container.querySelector('#pdf-page-2');
    const page3 = container.querySelector('#pdf-page-3');

    expect(page1).not.toBeNull();
    expect(page2).not.toBeNull();
    expect(page3).not.toBeNull();

    // Verify footer page indicators
    expect(page1?.textContent).toContain('01 / 03');
    expect(page2?.textContent).toContain('02 / 03');
    expect(page3?.textContent).toContain('03 / 03');

    // Verify section kickers
    expect(page1?.textContent).toContain('ОБЩИЙ ОБЗОР');
    expect(page2?.textContent).toContain('ДИНАМИКА И СРАВНЕНИЕ');
    expect(page3?.textContent).toContain('ПОДРОБНЫЕ ДАННЫЕ');
  });

  it('renders KPI metric cards and key observation on page 1', () => {
    const { container } = render(
      React.createElement(ChannelPdfTemplate, {
        stats: mockStats,
        period: '7d',
      })
    );

    const page1 = container.querySelector('#pdf-page-1');
    expect(page1).not.toBeNull();

    // Main title
    expect(page1?.textContent).toContain('Статистика за период');

    // KPI Card values
    expect(page1?.textContent).toContain('24\u00A0680'); // Russian non-breaking space
    expect(page1?.textContent).toContain('8.42%');
    expect(page1?.textContent).toContain('МЕТРИКА 01 · ПОДПИСЧИКИ');

    // Key observation box
    expect(page1?.textContent).toContain('Ключевое наблюдение');
    expect(page1?.textContent).toMatch(/Аудитория канала демонстрирует уверенный прирост/);
  });

  it('renders comparison chart, distribution and donut chart on page 2', () => {
    const { container } = render(
      React.createElement(ChannelPdfTemplate, {
        stats: mockStats,
        period: '7d',
      })
    );

    const page2 = container.querySelector('#pdf-page-2');
    expect(page2?.textContent).toContain('Показатели в сравнении');
    expect(page2?.textContent).toContain('Сравнение по периодам');
    expect(page2?.textContent).toContain('Структура долей');
    expect(page2?.textContent).toContain('100%');
    expect(page2?.textContent).toContain('всего');
    expect(page2?.textContent).toContain('Примечание');
  });

  it('renders the detailed summary table and report notes on page 3', () => {
    const { container } = render(
      React.createElement(ChannelPdfTemplate, {
        stats: mockStats,
        period: '7d',
      })
    );

    const page3 = container.querySelector('#pdf-page-3');
    expect(page3?.textContent).toContain('Детализация показателей');
    expect(page3?.textContent).toContain('Сводная таблица');
    expect(page3?.textContent).toContain('Источник данных');
    expect(page3?.textContent).toContain('Методика и ограничения');
    expect(page3?.textContent).toContain('Итого по аудитории');
  });

  it('handles empty history and missing metrics gracefully without crashing', () => {
    const emptyStats: ChannelDetailStats = {
      channel: {
        ...channel,
        title: 'Пустой канал',
        username: null,
        currentMembers: null,
        delta7d: { abs: null, percent: null },
        avgViews7d: null,
        vr7d: null,
        err7d: null,
      },
      myChannel: null,
      period: '7d',
      membersHistory: [],
      postsDistribution: [],
      heatmapData: [],
    };

    const { container } = render(
      React.createElement(ChannelPdfTemplate, {
        stats: emptyStats,
        period: '7d',
      })
    );

    expect(container.querySelector('#pdf-page-1')).not.toBeNull();
    expect(container.querySelector('#pdf-page-2')).not.toBeNull();
    expect(container.querySelector('#pdf-page-3')).not.toBeNull();
  });
});

describe('ExportPdfButton', () => {
  it('renders the download button and the hidden offscreen template root', () => {
    render(
      React.createElement(ExportPdfButton, {
        channelTitle: 'Тестовый Канал',
        period: '7d',
        stats: mockStats,
      })
    );

    const btn = screen.getByRole('button', { name: /Скачать PDF/i });
    expect(btn).toBeDefined();

    // Verify hidden print container exists
    const hiddenRoot = document.getElementById('pdf-render-root');
    expect(hiddenRoot).not.toBeNull();
    expect(hiddenRoot?.querySelector('#pdf-page-1')).not.toBeNull();
  });
});
