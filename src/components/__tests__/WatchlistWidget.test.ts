/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { WatchlistWidget } from '../WatchlistWidget';
import { channel } from '@/lib/__tests__/fixtures/channel-metrics';
import type { ChannelMetrics } from '@/lib/types';

describe('WatchlistWidget', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render if there are no favorite channels', () => {
    const { container } = render(React.createElement(WatchlistWidget, { channels: [] }));
    expect(container.firstChild).toBeNull();
  });

  it('renders regular favorite channels without "Молчит" badge', () => {
    const activeFav: ChannelMetrics = {
      ...channel,
      id: 101,
      title: 'Active Tech News',
      isFavorite: true,
      isMine: false,
      activityStatus: 'активен',
      posts7d: 14,
      posts24h: 2,
    };

    render(React.createElement(WatchlistWidget, { channels: [activeFav] }));

    expect(screen.getByText('Избранное')).toBeDefined();
    expect(screen.getByText('Active Tech News')).toBeDefined();
    expect(screen.queryByText('Молчит')).toBeNull();
  });

  it('visually highlights channels in status "молчит" with badge and distinct styling', () => {
    const silentFav: ChannelMetrics = {
      ...channel,
      id: 102,
      title: 'Dormant Crypto Channel',
      isFavorite: true,
      isMine: false,
      activityStatus: 'молчит',
      posts7d: 0,
      posts24h: 0,
      posts30d: 0,
    };

    render(React.createElement(WatchlistWidget, { channels: [silentFav] }));

    expect(screen.getByText('Dormant Crypto Channel')).toBeDefined();
    // Проверяем наличие бейджа "Молчит"
    const silentBadge = screen.getByText('Молчит');
    expect(silentBadge).toBeDefined();

    // Проверяем карточку со стилизацией выделения
    const link = screen.getByRole('link');
    expect(link.className).toContain('border-rose-500');
    expect(link.className).toContain('bg-rose-950/10');
  });

  it('automatically treats channel as silent when posts7d === 0 and posts24h === 0 even if activityStatus is undefined', () => {
    const fallbackSilentFav: ChannelMetrics = {
      ...channel,
      id: 103,
      title: 'Legacy Inactive Channel',
      isFavorite: true,
      isMine: false,
      activityStatus: undefined,
      posts7d: 0,
      posts24h: 0,
    };

    render(React.createElement(WatchlistWidget, { channels: [fallbackSilentFav] }));

    expect(screen.getByText('Legacy Inactive Channel')).toBeDefined();
    expect(screen.getByText('Молчит')).toBeDefined();
  });
});
