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
    expect(screen.getByText(/Эффективность по типам контента/)).toBeDefined();
    expect(screen.getByText(/Нет публикаций за выбранный период/)).toBeDefined();
  });

  it('renders all content types and metrics when data is provided', () => {
    const data: ContentTypePerformanceItem[] = [
      { type: 'text', label: 'Текст', er: 12.5, postsCount: 10, avgViews: 1200 },
      { type: 'photo', label: 'Фото', er: 22.1, postsCount: 5, avgViews: 2400 },
      { type: 'video', label: 'Видео', er: null, postsCount: 0, avgViews: null },
      { type: 'poll', label: 'Опросы', er: 8.4, postsCount: 2, avgViews: 900 },
      { type: 'link', label: 'Ссылки', er: 5.0, postsCount: 1, avgViews: 500 },
    ];

    render(React.createElement(ContentTypePerformance, { data, period: '7d' }));

    expect(screen.getByText(/Эффективность по типам контента/)).toBeDefined();
    expect(screen.getByText(/Всего постов:/)).toBeDefined();
    expect(screen.getByText('18')).toBeDefined(); // 10+5+0+2+1 = 18

    // Cards
    expect(screen.getByText('12.5%')).toBeDefined();
    expect(screen.getByText('22.1%')).toBeDefined();
    expect(screen.getByText('8.4%')).toBeDefined();
    expect(screen.getByText('5%')).toBeDefined();
    expect(screen.getByText('10 постов')).toBeDefined();
    expect(screen.getByText('1 пост')).toBeDefined();
  });
});
