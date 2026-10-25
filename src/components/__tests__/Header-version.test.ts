/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../AddChannelModal', () => ({ AddChannelModal: () => null }));

import { Header } from '../Header';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows the running commit below the product name', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '280762e' }) }));
  render(React.createElement(Header, { totalChannels: 1, activeChannels: 1 }));

  expect(await screen.findByText('v. 280762e')).toBeDefined();
  expect(fetch).toHaveBeenCalledWith('/api/version', { cache: 'no-store' });
});
