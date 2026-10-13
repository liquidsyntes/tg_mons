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
});
