/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PostsPage from '../page';

vi.mock('@/components/Header', () => ({ Header: () => React.createElement('div') }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('global post filters', () => {
  it('combines Ad Spy and viral filters in the search request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ posts: [], total: 0, niches: [], channels: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(React.createElement(PostsPage));
    fireEvent.click(screen.getByRole('button', { name: 'Только реклама (Ad Spy)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Только вирусные' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes('onlyAds=true') && String(url).includes('onlyViral=true'))).toBe(true));
  });
});
