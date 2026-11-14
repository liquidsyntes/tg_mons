/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../AddChannelModal', () => ({ AddChannelModal: () => null }));

import { Header } from '../Header';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Header', () => {
  it('shows the running commit below the product name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '280762e' }) }));
    render(React.createElement(Header, { totalChannels: 1, activeChannels: 1 }));

    expect(await screen.findByText('v. 280762e')).toBeDefined();
    expect(fetch).toHaveBeenCalledWith('/api/version', { cache: 'no-store' });
  });

  it('opens dropdown menus for Публикации, Аналитика, and Управление and closes on Escape / outside click', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '280762e' }) }));
    render(
      React.createElement(
        'div',
        null,
        React.createElement(Header, { totalChannels: 26, activeChannels: 25 }),
        React.createElement('button', { type: 'button' }, 'Внешний элемент'),
      ),
    );

    const postsBtn = screen.getByRole('button', { name: 'Публикации' });
    fireEvent.click(postsBtn);
    expect(postsBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menuitem', { name: /Поиск постов/ }).getAttribute('href')).toBe('/posts');
    expect(screen.getByRole('menuitem', { name: /Контент-план \(Доска\)/ }).getAttribute('href')).toBe('/posts?saved=1&view=board');
    expect(screen.getByRole('menuitem', { name: /Закладки \(Список\)/ }).getAttribute('href')).toBe('/posts?saved=1');
    expect(screen.getByRole('menuitem', { name: /Реклама и креативы \(Ad Spy\)/ }).getAttribute('href')).toBe('/posts?onlyAds=true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(postsBtn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu', { name: 'Раздел публикаций' })).toBeNull();

    const analyticsBtn = screen.getByRole('button', { name: 'Аналитика' });
    fireEvent.click(analyticsBtn);
    expect(screen.getByRole('menuitem', { name: /AI Отчёты/ }).getAttribute('href')).toBe('/reports');
    expect(screen.getByRole('menuitem', { name: /Афиша событий/ }).getAttribute('href')).toBe('/events');
    expect(screen.getByRole('menuitem', { name: /Сравнение каналов/ }).getAttribute('href')).toBe('/compare');

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Внешний элемент' }));
    expect(analyticsBtn.getAttribute('aria-expanded')).toBe('false');

    const manageBtn = screen.getByRole('button', { name: 'Управление' });
    fireEvent.click(manageBtn);
    expect(screen.getByText('25 из 26 активны')).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Собрать сейчас' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Настройки' }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('menuitem', { name: 'Выйти' })).toBeDefined();
  });
});
