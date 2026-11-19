/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/Header', () => ({ Header: () => null }));

import EventsPage from '../page';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('events page dismissal', () => {
  it('removes a card after a successful dismissal request', async () => {
    const event = {
      id: 42,
      title: 'Событие для проверки',
      date: new Date().toISOString(),
      timeStr: null,
      organizer: null,
      prices: [],
      mentions: [],
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
      url === '/api/events'
        ? { ok: true, json: async () => ({ events: [event] }) }
        : { ok: true, json: async () => ({ success: true }) }
    ));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.stubGlobal('alert', vi.fn());

    render(React.createElement(EventsPage));
    expect(await screen.findByText(event.title)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: `Убрать событие «${event.title}» из афиши` }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/events/42/dismiss', { method: 'PATCH' });
      expect(screen.queryByText(event.title)).toBeNull();
    });
  });

  it('renders calendar export actions and filters events by search and free admission', async () => {
    const todayIso = new Date().toISOString();
    const events = [
      {
        id: 1,
        title: 'Бесплатный митап',
        date: todayIso,
        timeStr: '19:00',
        organizer: 'Tech Community',
        prices: ['Бесплатно'],
        mentions: [],
      },
      {
        id: 2,
        title: 'Платный концерт',
        date: todayIso,
        timeStr: '21:00',
        organizer: 'Arena',
        prices: ['1000 грн'],
        mentions: [],
      },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events }),
    }));

    render(React.createElement(EventsPage));
    expect(await screen.findByText('Бесплатный митап')).toBeDefined();
    expect(screen.getByText('Платный концерт')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Скачать .ics для события «Бесплатный митап»' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Добавить событие «Бесплатный митап» в Google Календарь' })).toBeDefined();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Только бесплатные' }));
    expect(screen.getByText('Бесплатный митап')).toBeDefined();
    expect(screen.queryByText('Платный концерт')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Только бесплатные' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск событий' }), { target: { value: 'Arena' } });
    expect(screen.queryByText('Бесплатный митап')).toBeNull();
    expect(screen.getByText('Платный концерт')).toBeDefined();
  });
});

describe('events page inline status banners and error handling', () => {
  it('shows a dismissible role="status" banner after successful scan without calling alert()', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/events') {
        return Promise.resolve(new Response(JSON.stringify({ events: [] }), { status: 200 }));
      }
      if (url === '/api/events/scan') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true, savedCount: 3, selectionMode: 'keyword_fallback' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(EventsPage));
    expect(await screen.findByText('Событий не найдено')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Сканировать события/ }));

    const statusText = await screen.findByText(/Сканирование завершено\. Найдено новых событий: 3/);
    const statusBanner = statusText.closest('[role="status"]');
    expect(statusBanner).not.toBeNull();
    expect(statusBanner?.textContent).toContain('Jev недоступен: использован прежний отбор по ключевым словам.');
    expect(alertMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
    expect(screen.queryByText(/Сканирование завершено/)).toBeNull();
  });

  it('shows role="alert" banners when scan or dismiss fails without calling alert()', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));

    const event = {
      id: 42,
      title: 'Тестовый митап',
      date: new Date().toISOString(),
      timeStr: '18:00',
      organizer: 'Сообщество',
      prices: ['Бесплатно'],
      mentions: [],
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/events') {
        return Promise.resolve(new Response(JSON.stringify({ events: [event] }), { status: 200 }));
      }
      if (url === '/api/events/scan') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Сбой провайдера' }), { status: 500 }));
      }
      if (url === '/api/events/42/dismiss') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'DB error' }), { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(EventsPage));
    expect(await screen.findByText('Тестовый митап')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Сканировать события/ }));
    const scanAlert = await screen.findByRole('alert');
    expect(scanAlert.textContent).toContain('Ошибка: Сбой провайдера');
    expect(alertMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
    fireEvent.click(screen.getByRole('button', { name: `Убрать событие «${event.title}» из афиши` }));

    const dismissAlert = await screen.findByRole('alert');
    expect(dismissAlert.textContent).toContain('Не удалось убрать событие из афиши');
    expect(screen.getByText('Тестовый митап')).toBeDefined();
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('shows an error card with retry action instead of empty state when initial load fails', async () => {
    const todayIso = new Date().toISOString();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: [
            {
              id: 77,
              title: 'Восстановленное событие',
              date: todayIso,
              timeStr: null,
              organizer: null,
              prices: [],
              mentions: [],
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(React.createElement(EventsPage));

    const loadAlert = await screen.findByRole('alert');
    expect(loadAlert.textContent).toContain('Не удалось загрузить список событий');
    expect(screen.queryByText('Событий не найдено')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Повторить загрузку/ }));

    expect(await screen.findByText('Восстановленное событие')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
