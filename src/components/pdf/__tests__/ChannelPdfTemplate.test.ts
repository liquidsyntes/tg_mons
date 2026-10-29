/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChannelPdfTemplate } from '../ChannelPdfTemplate';
import { ExportPdfButton } from '../../ExportPdfButton';
import { channel } from '@/lib/__tests__/fixtures/channel-metrics';
import type { ChannelDetailStats } from '@/lib/types';

const pdfMocks = vi.hoisted(() => ({ canvas: vi.fn(), addPage: vi.fn(), addImage: vi.fn(), save: vi.fn() }));
vi.mock('html2canvas-pro', () => ({ default: pdfMocks.canvas }));
vi.mock('jspdf', () => ({ jsPDF: class {
  addPage = pdfMocks.addPage;
  addImage = pdfMocks.addImage;
  save = pdfMocks.save;
} }));

const mockStats: ChannelDetailStats = {
  channel: {
    ...channel,
    title: 'Тестовый канал', username: 'test_channel', currentMembers: 24680,
    delta24h: { abs: 120, percent: 0.5 },
    delta7d: { abs: 2801, percent: 12.8, coverageDays: 7 },
    delta30d: { abs: 4500, percent: 22.3 },
    posts24h: 3, posts7d: 48, posts30d: 180,
    avgViews24h: 900, avgViews7d: 1280, avgViews30d: 1600,
    vr24h: 3.6, vr7d: 5.1, vr30d: 6.4,
    er24h: 1.2, er7d: 2.1, err24h: 1.8, err7d: 3.4,
    citationIndex: 12.4, contentScore: 73, contentGrade: 'B',
    adShare7d: { percent: 4.2, level: 'low' }, adShare30d: { percent: 6.3, level: 'low' },
    fraudScore: 25, fraudSignals: [{ signalType: 'growth_smoothness', value: 0.1, reason: 'Подозрительно ровный рост' }],
  },
  myChannel: null,
  period: '7d',
  membersHistory: [
    { collectedAt: '2026-10-20T10:00:00Z', membersCount: 22000 },
    { collectedAt: '2026-10-27T10:00:00Z', membersCount: 24680 },
  ],
  postsDistribution: [
    { date: '2026-10-20', postsCount: 6, viewsAvg: 1100 },
    { date: '2026-10-21', postsCount: 8, viewsAvg: 1400 },
  ],
  heatmapData: [],
  contentTypePerformance: [{
    type: 'text', label: 'Текстовые публикации', er: 2.1, avgEr: 2.1, avgErr: 8.4,
    postsCount: 22, sharePercent: 46, avgViews: 1400, medianViews: 1350,
    avgForwards: 4, avgComments: 2,
  }],
  contentFormatLeaders: { byErr: 'text', byViews: 'text' },
  popularReactions: { totalReactions: 12, coveredPosts: 3, top: [{ emoji: '👍', count: 9, sharePercent: 75 }] },
  recentPosts: [{
    id: 7, messageId: '77', publishedAt: '2026-10-27T10:00:00Z', text: 'Текст тестовой публикации',
    views: 1400, reactions: 20, reactionBreakdown: null, comments: 3, forwards: 4,
    isViral: false, viralReasons: [], viralPrimaryReason: null, viralMultiplier: null,
  }],
  nicheBenchmark: { status: 'insufficient_cohort', niche: 'Новости', cohortSize: 2 },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ChannelPdfTemplate', () => {
  it('renders five A4 pages with real channel sections', () => {
    const { container } = render(React.createElement(ChannelPdfTemplate, { stats: mockStats, period: '7d' }));
    const pages = container.querySelectorAll('[data-pdf-page]');
    expect(pages).toHaveLength(5);
    expect(pages[0].textContent).toContain('Обзор канала');
    expect(pages[1].textContent).toContain('Динамика подписчиков');
    expect(pages[2].textContent).toContain('Текстовые публикации');
    expect(pages[2].textContent).toContain('Популярные реакции');
    expect(pages[2].textContent).toContain('Лидер по ERR: Текстовые публикации');
    expect(pages[3].textContent).toContain('Текст тестовой публикации');
    expect(pages[4].textContent).toContain('Подозрительно ровный рост');
    expect(pages[4].textContent).toContain('Доля рекламы 30д');
    expect(pages[4].textContent).toContain('Для сравнения нужны минимум 3');
  });

  it('uses metrics from the selected period and labels shorter metrics explicitly', () => {
    const { container, rerender } = render(React.createElement(ChannelPdfTemplate, { stats: mockStats, period: '24h' }));
    expect(container.querySelector('#pdf-page-1')?.textContent).toContain('900');
    expect(container.querySelector('#pdf-page-1')?.textContent).toContain('За 24 часа');
    rerender(React.createElement(ChannelPdfTemplate, { stats: mockStats, period: '30d' }));
    expect(container.querySelector('#pdf-page-1')?.textContent).toContain('1\u00A0600');
    expect(container.querySelector('#pdf-page-1')?.textContent).toContain('ER за 7 дней');
    expect(container.querySelector('#pdf-page-1')?.textContent).toContain('ERR за 7 дней');
  });

  it('shows missing data without synthetic figures or growth claims', () => {
    const empty: ChannelDetailStats = {
      ...mockStats,
      channel: {
        ...channel, title: 'Пустой канал', currentMembers: null,
        delta24h: { abs: null, percent: null }, delta7d: { abs: null, percent: null },
        delta30d: { abs: null, percent: null }, avgViews7d: null, vr7d: null, err7d: null,
        citationIndex: null, fraudScore: null,
      },
      membersHistory: [], postsDistribution: [], recentPosts: [],
      contentTypePerformance: [], popularReactions: undefined, nicheBenchmark: undefined,
    };
    const { container } = render(React.createElement(ChannelPdfTemplate, { stats: empty, period: '7d' }));
    expect(container.querySelectorAll('[data-pdf-page]')).toHaveLength(5);
    expect(container.textContent).toContain('Недостаточно снимков аудитории');
    expect(container.textContent).toContain('Разбивка реакций пока недоступна');
    expect(container.textContent).toContain('Нет публикаций за выбранный период');
    expect(container.textContent).toContain('н/д');
    expect(container.textContent).not.toContain('1 280');
    expect(container.textContent).not.toContain('46%');
    expect(container.textContent).not.toContain('среднерыночным');
  });
});

describe('ExportPdfButton', () => {
  it('renders the download button and all printable pages', () => {
    render(React.createElement(ExportPdfButton, {
      channelTitle: 'Тестовый канал', period: '7d', stats: mockStats,
    }));
    expect(screen.getByRole('button', { name: /Скачать PDF/i })).toBeDefined();
    expect(document.querySelectorAll('#pdf-render-root [data-pdf-page]')).toHaveLength(5);
  });

  it('captures every printable page in the downloaded PDF', async () => {
    pdfMocks.canvas.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,dGVzdA==' });
    render(React.createElement(ExportPdfButton, {
      channelTitle: 'Тестовый канал', period: '7d', stats: mockStats,
    }));
    fireEvent.click(screen.getByRole('button', { name: /Скачать PDF/i }));
    await waitFor(() => expect(pdfMocks.save).toHaveBeenCalledOnce());
    expect(pdfMocks.canvas).toHaveBeenCalledTimes(5);
    expect(pdfMocks.addPage).toHaveBeenCalledTimes(4);
    expect(pdfMocks.addImage).toHaveBeenCalledTimes(5);
  });
});
