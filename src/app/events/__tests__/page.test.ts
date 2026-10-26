/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/Header', () => ({ Header: () => null }));

import EventsPage from '../page';

afterEach(() => {
  cleanup();
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
