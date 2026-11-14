/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { detectAd } from '@/lib/adDetector';
import { RecentPosts } from '../RecentPosts';
import { splitHighlightedText } from '../PostReaderModal';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const samplePost = {
  id: 42,
  messageId: '777',
  publishedAt: '2026-11-01T14:30:00.000Z',
  views: 1250,
  reactions: 18,
  reactionBreakdown: [{ emoji: '🔥', count: 18 }],
  comments: 4,
  forwards: 6,
  text: 'Разбор [тест] (100%) c++ и сложных регулярных выражений $100 \\path',
  isViral: false,
  viralReasons: [] as Array<'views' | 'forwards' | 'err'>,
  viralPrimaryReason: null,
  viralMultiplier: null,
};

describe('RecentPosts and PostReaderModal', () => {
  it('safely splits and highlights search queries containing RegExp special characters', async () => {
    const query = '[тест] (100%) c++';
    const segments = splitHighlightedText(samplePost.text, query);
    expect(segments).toEqual([
      { text: 'Разбор ', matched: false },
      { text: '[тест] (100%) c++', matched: true },
      { text: ' и сложных регулярных выражений $100 \\path', matched: false },
    ]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        posts: [{ ...samplePost, ad: detectAd(samplePost.text) }],
        total: 1,
        absoluteTotal: 1,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      React.createElement(RecentPosts, {
        initialPosts: [samplePost],
        channelId: 9,
        channelUsername: 'dev_channel',
        channelTgId: null,
      })
    );

    const searchInput = screen.getByPlaceholderText('Поиск по тексту...');
    fireEvent.change(searchInput, { target: { value: query } });

    await waitFor(() => {
      const mark = container.querySelector('mark');
      expect(mark).not.toBeNull();
      expect(mark?.textContent).toBe('[тест] (100%) c++');
    });
  });

  it('opens the post reader modal on card click, renders Telegram link, and closes on Escape', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        posts: [{ ...samplePost, ad: detectAd(samplePost.text) }],
        total: 1,
        absoluteTotal: 1,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      React.createElement(RecentPosts, {
        initialPosts: [samplePost],
        channelId: 9,
        channelUsername: 'dev_channel',
        channelTgId: null,
      })
    );

    expect(screen.queryByRole('dialog', { name: 'Текст публикации' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Контент-план' }).getAttribute('href')).toBe('/posts?saved=1&view=board');

    fireEvent.click(screen.getByText(/Разбор \[тест\]/));

    const dialog = await screen.findByRole('dialog', { name: 'Текст публикации' });
    expect(dialog).toBeDefined();

    const tgLink = screen.getByRole('link', { name: /Открыть в Telegram/i });
    expect(tgLink.getAttribute('href')).toBe('https://t.me/dev_channel/777');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Текст публикации' })).toBeNull();
    });
  });
});
