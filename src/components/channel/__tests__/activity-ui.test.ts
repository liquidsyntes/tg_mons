/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChannelActivityTimeline } from '../ChannelActivityTimeline';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('opens a 48-hour row with audience change, posts and observed engagement', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ timeZone: 'Europe/Moscow', rows: [
    { hourStart: '2026-10-28T12:00:00.000Z', sampledAt: '2026-10-28T12:05:00.000Z',
      membersCount: 2688, membersDelta: 2, posts: [{ id: 1, messageId: '42', isForwarded: false }],
      reactionsAdded: 5, forwardsAdded: 1 },
    { hourStart: '2026-10-28T11:00:00.000Z', sampledAt: null,
      membersCount: null, membersDelta: null, posts: [], reactionsAdded: 0, forwardsAdded: 0 },
  ] }) });
  vi.stubGlobal('fetch', fetcher);
  render(React.createElement(ChannelActivityTimeline, { channelId: 7, username: 'example', tgId: null }));

  const toggle = screen.getByRole('button', { name: 'Развернуть' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  await waitFor(() => expect(screen.getByText('Реакции +5')).toBeDefined());
  expect(screen.getByText('Вышел пост ×1')).toBeDefined();
  expect(screen.getByText('Пересылки +1')).toBeDefined();
  expect(screen.getByText('Нет замера')).toBeDefined();
  expect(screen.getByRole('link', { name: 'Открыть пост' }).getAttribute('href')).toBe('https://t.me/example/42');
  expect(fetcher).toHaveBeenCalledWith('/api/stats/channel/7/activity', expect.objectContaining({ signal: expect.any(AbortSignal) }));

  fireEvent.click(screen.getByLabelText('Реакции'));
  expect(screen.queryByText('Реакции +5')).toBeNull();
});
