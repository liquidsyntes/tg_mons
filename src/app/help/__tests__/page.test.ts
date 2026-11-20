/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/Header', () => ({ Header: () => null }));

import HelpPage from '../page';
import {
  ANTIFRAUD_HEURISTICS_GUIDE,
  CHANNELS_TABLE_COLUMNS_GUIDE,
  HELP_CHAPTERS,
} from '@/lib/help/help-content';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/help');
  vi.restoreAllMocks();
});

describe('/help page', () => {
  it('renders table of contents, all 4 chapters, 12 dashboard columns guide, and 7 antifraud heuristics', () => {
    render(React.createElement(HelpPage));

    expect(screen.getByRole('heading', { name: /Справка по блокам и метрикам сервиса/ })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Оглавление справочника' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Быстрый переход по главам' })).toBeDefined();

    for (const chapter of HELP_CHAPTERS) {
      expect(screen.getByRole('heading', { name: chapter.title })).toBeDefined();
      for (const section of chapter.sections) {
        const element = document.getElementById(section.id);
        expect(element).not.toBeNull();
        expect(element?.className).toContain('scroll-mt-24');
      }
    }

    for (const col of CHANNELS_TABLE_COLUMNS_GUIDE) {
      expect(screen.getByRole('cell', { name: col.column })).toBeDefined();
    }
    expect(CHANNELS_TABLE_COLUMNS_GUIDE).toHaveLength(12);

    for (const heuristic of ANTIFRAUD_HEURISTICS_GUIDE) {
      expect(screen.getByRole('heading', { name: heuristic.title })).toBeDefined();
    }
    expect(ANTIFRAUD_HEURISTICS_GUIDE).toHaveLength(7);
  });

  it('filters sections by search query and resets empty state', () => {
    render(React.createElement(HelpPage));

    const searchInput = screen.getByRole('textbox', { name: 'Поиск по справочнику' });
    fireEvent.change(searchInput, { target: { value: 'ночная активность' } });

    expect(screen.getByRole('heading', { name: 'Подробный разбор всех 7 эвристик антифрода' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Виджет «Избранное» (Watchlist)' })).toBeNull();

    fireEvent.change(searchInput, { target: { value: 'несуществующий_запрос_xyz' } });
    expect(screen.getByText('Ничего не найдено')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить поиск и фильтры' }));
    expect(screen.getByRole('heading', { name: 'Виджет «Избранное» (Watchlist)' })).toBeDefined();
  });

  it('filters sections by user role and copies direct anchor link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(React.createElement(HelpPage));

    const buyerBtn = screen.getByRole('button', { name: 'Закупщик рекламы' });
    fireEvent.click(buyerBtn);
    expect(buyerBtn.getAttribute('aria-pressed')).toBe('true');

    expect(screen.getByRole('heading', { name: 'Рекламный охват, кривая 1ч–48ч и удержание постов' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Статус «Мой канал» (эталонная точка сравнения)' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Скопировать ссылку на Рекламный охват/ }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/help#ad-reach'));
    });
  });
});
