/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdCreativesPanel } from '../AdCreativesPanel';
import type { AdCreativeCluster } from '@/lib/types';

afterEach(() => {
  cleanup();
});

const clusterRepeated: AdCreativeCluster = {
  clusterId: 'cr_alpha',
  sampleText: 'Курс по аналитике данных для продактов со скидкой 30%',
  normalizedPreview: 'курс по аналитике данных для продактов со скидкой 30',
  advertisers: ['@edu_promo', 'edu.example.com'],
  placementsCount: 2,
  uniqueChannelsCount: 2,
  totalViews: 5000,
  avgViews: 2500,
  avgEr: 12.0,
  avgErr: 3.2,
  maxErr: 4.8,
  firstSeenAt: '2026-11-08T10:00:00.000Z',
  lastSeenAt: '2026-11-10T10:00:00.000Z',
  bestPlacement: {
    id: 102,
    channel: { id: 2, title: 'Product Channel', username: 'prodchan', niche: 'business' },
    publishedAt: '2026-11-10T10:00:00.000Z',
    text: 'Курс по аналитике данных для продактов со скидкой 30%',
    views: 3000,
    er: 14.0,
    err: 4.8,
    reactions: 60,
    comments: 12,
    forwards: 18,
    mentions: ['edu_promo'],
  },
  posts: [
    {
      id: 102,
      channel: { id: 2, title: 'Product Channel', username: 'prodchan', niche: 'business' },
      publishedAt: '2026-11-10T10:00:00.000Z',
      text: 'Курс по аналитике данных для продактов со скидкой 30%',
      views: 3000,
      er: 14.0,
      err: 4.8,
      reactions: 60,
      comments: 12,
      forwards: 18,
      mentions: ['edu_promo'],
    },
    {
      id: 101,
      channel: { id: 1, title: 'Tech News', username: 'technews', niche: 'tech' },
      publishedAt: '2026-11-08T10:00:00.000Z',
      text: 'Курс по аналитике данных для продактов со скидкой 30%',
      views: 2000,
      er: 10.0,
      err: 1.6,
      reactions: 20,
      comments: 4,
      forwards: 8,
      mentions: ['edu_promo'],
    },
  ],
};

const clusterSingleHighErr: AdCreativeCluster = {
  clusterId: 'cr_beta',
  sampleText: 'Облачный хостинг GPU для ML-задач на 14 дней бесплатно',
  normalizedPreview: 'облачный хостинг gpu для ml задач на 14 дней бесплатно',
  advertisers: ['@gpu_cloud'],
  placementsCount: 1,
  uniqueChannelsCount: 1,
  totalViews: 12000,
  avgViews: 12000,
  avgEr: 22.0,
  avgErr: 6.4,
  maxErr: 6.4,
  firstSeenAt: '2026-11-11T12:00:00.000Z',
  lastSeenAt: '2026-11-11T12:00:00.000Z',
  bestPlacement: {
    id: 201,
    channel: { id: 3, title: 'AI Lab', username: 'ailab', niche: 'tech' },
    publishedAt: '2026-11-11T12:00:00.000Z',
    text: 'Облачный хостинг GPU для ML-задач на 14 дней бесплатно',
    views: 12000,
    er: 22.0,
    err: 6.4,
    reactions: 150,
    comments: 30,
    forwards: 45,
    mentions: ['gpu_cloud'],
  },
  posts: [
    {
      id: 201,
      channel: { id: 3, title: 'AI Lab', username: 'ailab', niche: 'tech' },
      publishedAt: '2026-11-11T12:00:00.000Z',
      text: 'Облачный хостинг GPU для ML-задач на 14 дней бесплатно',
      views: 12000,
      er: 22.0,
      err: 6.4,
      reactions: 150,
      comments: 30,
      forwards: 45,
      mentions: ['gpu_cloud'],
    },
  ],
};

describe('AdCreativesPanel', () => {
  it('renders cluster cards, KPI badges, sorting, repeated toggle, and placement breakdown', () => {
    const onSelectCluster = vi.fn();
    const onAdvertiserClick = vi.fn();

    render(
      React.createElement(AdCreativesPanel, {
        clusters: [clusterRepeated, clusterSingleHighErr],
        activeClusterId: null,
        onSelectCluster,
        onAdvertiserClick,
      }),
    );

    expect(screen.getByText('2 креатива · 1 сетевой посев')).toBeDefined();
    expect(screen.getByText(clusterRepeated.sampleText)).toBeDefined();
    expect(screen.getByText(clusterSingleHighErr.sampleText)).toBeDefined();
    expect(screen.getByText('3.2%')).toBeDefined();
    expect(screen.getByText('4.8%')).toBeDefined();

    // Sort by ERR puts clusterSingleHighErr first
    fireEvent.click(screen.getByRole('button', { name: 'По ERR' }));
    const cardsAfterSort = screen.getAllByRole('article');
    expect(cardsAfterSort[0].textContent).toContain('Облачный хостинг GPU');

    // Toggle 2+ placements filters down to clusterRepeated only
    fireEvent.click(screen.getByRole('button', { name: 'Только сетевые (2+)' }));
    expect(screen.queryByText(clusterSingleHighErr.sampleText)).toBeNull();
    expect(screen.getByText(clusterRepeated.sampleText)).toBeDefined();

    // Expand donor channel placements
    fireEvent.click(screen.getByRole('button', { name: /Каналы размещения \(2\)/ }));
    expect(screen.getByText('Tech News')).toBeDefined();
    expect(screen.getByText('Лучший ERR')).toBeDefined();

    // Filter feed by cluster
    fireEvent.click(screen.getByRole('button', { name: 'Показать посты креатива' }));
    expect(onSelectCluster).toHaveBeenCalledWith(clusterRepeated);

    // Click advertiser pill
    fireEvent.click(screen.getByRole('button', { name: '@edu_promo' }));
    expect(onAdvertiserClick).toHaveBeenCalledWith('@edu_promo');
  });

  it('allows clearing the active creative filter and displays loading/empty states', () => {
    const onSelectCluster = vi.fn();
    const { rerender } = render(
      React.createElement(AdCreativesPanel, {
        clusters: [clusterRepeated],
        activeClusterId: 'cr_alpha',
        onSelectCluster,
      }),
    );

    const clearButtons = screen.getAllByRole('button', { name: 'Сбросить фильтр креатива' });
    fireEvent.click(clearButtons[0]);
    expect(onSelectCluster).toHaveBeenCalledWith(null);

    rerender(
      React.createElement(AdCreativesPanel, {
        clusters: [],
        loading: true,
        activeClusterId: null,
        onSelectCluster,
      }),
    );
    expect(screen.getByText(/Группировка и оценка рекламных креативов/)).toBeDefined();

    rerender(
      React.createElement(AdCreativesPanel, {
        clusters: [],
        loading: false,
        activeClusterId: null,
        onSelectCluster,
      }),
    );
    expect(screen.getByText(/Рекламные креативы для анализа в текущей выборке не найдены/)).toBeDefined();
  });
});
