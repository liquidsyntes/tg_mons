/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdReachChart } from '../AdReachChart';
import type { AdRetentionSummary } from '@/lib/types';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  LineChart: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'line-chart' }, children),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

afterEach(() => {
  cleanup();
});

describe('AdReachChart retention summary', () => {
  it('renders retention distribution buckets and early deletion warning', () => {
    const retentionSummary: AdRetentionSummary = {
      totalAds: 5,
      evaluatedAds: 4,
      activeAds: 1,
      earlyDeleteCount: 1,
      format24hCount: 2,
      format48hCount: 0,
      retainedCount: 1,
      earlyDeletePercent: 25,
      format24hPercent: 50,
      format48hPercent: 0,
      retainedPercent: 25,
      hasEarlyDeletions: true,
      buckets: [
        { format: '24h', label: 'Формат ~24ч', count: 2, sharePercent: 50 },
        { format: '48h', label: 'Формат ~48ч', count: 0, sharePercent: 0 },
        { format: 'retained', label: 'Без удаления (48ч+)', count: 1, sharePercent: 25 },
        { format: 'early_delete', label: 'Удалён <24ч', count: 1, sharePercent: 25 },
      ],
    };

    render(
      React.createElement(AdReachChart, {
        data: [
          { hoursAfterPost: 1, views: 400 },
          { hoursAfterPost: 24, views: 1900 },
        ],
        retentionSummary,
      }),
    );

    expect(screen.getByText('Форматы удержания рекламы')).toBeDefined();
    expect(screen.getByText(/Оценено постов: 4 из 5/)).toBeDefined();
    expect(screen.getByText(/Зафиксированы ранние удаления/)).toBeDefined();
    expect(screen.getByText('Формат ~24ч')).toBeDefined();
    expect(screen.getByText('50%')).toBeDefined();
    expect(screen.getByText('Удалён <24ч')).toBeDefined();
  });

  it('renders empty state when neither curve nor retention summary exist', () => {
    render(React.createElement(AdReachChart, { data: [], retentionSummary: null }));
    expect(screen.getByText('Нет данных об охвате')).toBeDefined();
  });
});
