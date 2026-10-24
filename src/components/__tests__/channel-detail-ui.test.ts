/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { channel } from '@/lib/__tests__/fixtures/channel-metrics';
import { ChannelHeader } from '../channel/ChannelHeader';
import { SubscriberChart } from '../channel/SubscriberChart';
import CitationNetworkWidget from '../CitationNetworkWidget';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('shows channel summary values in the shared metric layout', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => ({ estimatedPricePerPost: 375, cpm: 0, confidence: 'high' }),
  }));

  render(React.createElement(ChannelHeader, {
    channel, period: '7d', onPeriodChange: vi.fn(),
  }));

  expect(screen.getByText('Динамика · 7д')).toBeDefined();
  expect(screen.getByText('Посты · 30д')).toBeDefined();
  expect(screen.getByText('1/д в среднем')).toBeDefined();
  expect(await screen.findByText('375 ₴')).toBeDefined();
});

it('starts with my channel comparison off and lets the user enable it', () => {
  render(React.createElement(SubscriberChart, {
    data: { membersHistory: [] }, channel, myChannel: { ...channel, id: 2, title: 'Мой канал' },
    isMine: false, period: '7d',
  }));

  const toggle = screen.getByRole('checkbox', { name: 'Мой канал' }) as HTMLInputElement;
  expect(toggle.checked).toBe(false);
  fireEvent.click(toggle);
  expect(toggle.checked).toBe(true);
});

it('collapses and expands the loaded channel network without refetching', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      focalChannelId: 7,
      days: 30,
      nodes: [
        { id: 'channel:7', channelId: 7, title: 'Главный канал', username: 'main', subscribers: 100,
          niche: 'news', isTracked: true, inboundCount: 0, outboundCount: 3, isMutualWithFocal: false },
        { id: 'external:hubchannel', channelId: null, title: '@hubchannel', username: 'hubchannel', subscribers: null,
          niche: null, isTracked: false, inboundCount: 3, outboundCount: 0, isMutualWithFocal: false },
      ],
      edges: [{ source: 'channel:7', target: 'external:hubchannel', count: 3,
        forwardsCount: 0, mentionsCount: 3, isBidirectional: false }],
      discoveredHubs: [],
    }),
  });
  vi.stubGlobal('fetch', fetcher);
  render(React.createElement(CitationNetworkWidget, { channelId: 7 }));

  expect(await screen.findByText('@hubchannel')).toBeDefined();
  const content = document.getElementById('network-content-7');
  const collapse = screen.getByRole('button', { name: 'Свернуть' });
  expect(collapse.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(collapse);
  expect(content?.className).toBe('hidden');
  const expand = screen.getByRole('button', { name: 'Развернуть' });
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(expand);
  expect(content?.className).toContain('mt-6');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
