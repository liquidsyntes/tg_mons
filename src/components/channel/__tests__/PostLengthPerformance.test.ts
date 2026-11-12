/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PostLengthPerformance } from '../PostLengthPerformance';
import type { PostLengthAnalytics } from '@/lib/types';

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

describe('PostLengthPerformance component', () => {
  it('renders empty state when there are no posts in period', () => {
    render(
      React.createElement(PostLengthPerformance, {
        analytics: undefined,
        period: '7d',
      })
    );
    expect(
      screen.getByText(/Аналитика длины и структуры постов/)
    ).toBeDefined();
    expect(
      screen.getByText(
        /Нет публикаций за выбранный период для анализа длины и структуры постов/
      )
    ).toBeDefined();
  });

  it('renders length buckets, leaders and structure signals when analytics are provided', () => {
    const analytics: PostLengthAnalytics = {
      totalPosts: 10,
      textPostsCount: 8,
      avgTextLength: 420,
      items: [
        {
          bucket: 'short',
          label: 'Короткие (1-300 симв.)',
          postsCount: 5,
          sharePercent: 50,
          avgLength: 180,
          avgViews: 1500,
          medianViews: 1400,
          avgEr: 18.5,
          avgErr: 6.4,
          avgForwards: 4,
          avgComments: 2,
        },
        {
          bucket: 'long',
          label: 'Лонгриды (> 1000 симв.)',
          postsCount: 3,
          sharePercent: 30,
          avgLength: 1450,
          avgViews: 2100,
          medianViews: 2000,
          avgEr: 24.2,
          avgErr: 8.1,
          avgForwards: 9,
          avgComments: 5,
        },
      ],
      leaders: {
        byErr: 'long',
        byViews: 'long',
      },
      signals: [
        {
          signal: 'question_hook',
          label: 'Вопрос в зачине',
          postsCount: 4,
          sharePercent: 50,
          avgViews: 1800,
          avgEr: 21,
          avgErr: 7.5,
          avgForwards: 6,
        },
      ],
    };

    render(
      React.createElement(PostLengthPerformance, { analytics, period: '30d' })
    );

    expect(
      screen.getByText(/Аналитика длины и структуры постов/)
    ).toBeDefined();
    expect(screen.getByText(/420 симв\./)).toBeDefined();
    expect(screen.getByText('8 из 10')).toBeDefined();
    expect(screen.getByText(/Лидер по ERR:/)).toBeDefined();
    expect(screen.getByText(/Лидер по охвату:/)).toBeDefined();
    expect(screen.getByText(/Короткие \(1-300 симв\.\)/)).toBeDefined();
    expect(screen.getAllByText(/Лонгриды \(> 1000 симв\.\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Приёмы структуры и зачина \(хуки\)/)).toBeDefined();
    expect(screen.getByText('Вопрос в зачине')).toBeDefined();
    expect(screen.getByText('4 (50%)')).toBeDefined();
  });
});
