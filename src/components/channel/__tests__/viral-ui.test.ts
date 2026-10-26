/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { detectAd } from '@/lib/adDetector';
import { RecentPosts } from '../RecentPosts';
import { ViralBadge } from '../ViralBadge';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const viralPost = {
  id: 1, messageId: '10', publishedAt: '2026-10-23T12:00:00Z',
  views: 250, reactions: 3, comments: 0, forwards: 12, text: 'Пост',
  isViral: true, viralReasons: ['views', 'forwards'] as Array<'views' | 'forwards' | 'err'>,
  viralPrimaryReason: 'forwards' as const, viralMultiplier: 6,
};

describe('viral post UI', () => {
  it('shows a compact badge with the leading reason', () => {
    render(React.createElement(ViralBadge, { result: viralPost }));
    expect(screen.getByText('🔥 Вирусный · 6.0x пересылки')).toBeDefined();
  });

  it('sends the channel viral filter to search and keeps the badge visible', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: [{ ...viralPost, ad: detectAd(viralPost.text) }], total: 1, absoluteTotal: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(React.createElement(RecentPosts, {
      initialPosts: [viralPost], channelId: 7, channelUsername: 'tech', channelTgId: null,
    }));
    expect(screen.getByText('🔥 Вирусный · 6.0x пересылки')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Только вирусные' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes('onlyViral=true') && String(url).includes('channelId=7'))).toBe(true));
  });
});
