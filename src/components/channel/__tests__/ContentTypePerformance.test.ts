/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ContentTypePerformance } from '../ContentTypePerformance';
import type { ContentTypePerformanceItem } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('ContentTypePerformance component', () => {
  it('renders empty state when there are no posts in period', () => {
    render(React.createElement(ContentTypePerformance, { data: [], period: '7d' }));
    expect(screen.getByText(/Аналитика по форматам контента/)).toBeDefined();
    expect(screen.getByText(/Нет публикаций за выбранный период/)).toBeDefined();
  });

  it('renders all content types and metrics when data is provided', () => {
    const data: ContentTypePerformanceItem[] = [
      { type: 'text', label: 'Текст', er: 12.5, avgEr: 12.5, avgErr: 5, postsCount: 10, sharePercent: 66.67, avgViews: 1200, medianViews: 1100, avgForwards: 2, avgComments: 1 },
      { type: 'photo', label: 'Фото', er: null, avgEr: null, avgErr: null, postsCount: 5, sharePercent: 33.33, avgViews: null, medianViews: null, avgForwards: 0, avgComments: 0 },
    ];

    render(React.createElement(ContentTypePerformance, { data, leaders: { byErr: 'text', byViews: 'text' }, period: '7d' }));

    expect(screen.getByText(/Аналитика по форматам контента/)).toBeDefined();
    expect(screen.getByText(/Всего постов:/)).toBeDefined();
    expect(screen.getByText('15')).toBeDefined();
    expect(screen.getByText(/Лидер по ERR:/)).toBeDefined();
    expect(screen.getByText(/Лидер по охвату:/)).toBeDefined();
    expect(screen.getByText('66.67% публикаций', { exact: false })).toBeDefined();
    expect(screen.getAllByText('н/д').length).toBeGreaterThan(0);
    expect(screen.getByText('12.5%')).toBeDefined();
    expect(screen.getByText(/10 постов ·/)).toBeDefined();
    expect(screen.getByText(/5 постов ·/)).toBeDefined();
  });
});
