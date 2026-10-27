/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChannelListTransfer } from '../ChannelListTransfer';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('imports a selected list and refreshes the overview', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ user: { role: 'USER' } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ added: 2, alreadyPresent: 1 }) });
  vi.stubGlobal('fetch', fetcher);
  const onImported = vi.fn().mockResolvedValue(undefined);
  render(React.createElement(ChannelListTransfer, { onImported }));

  const file = new File(['{"version":1}'], 'channels.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => '{"version":1}' });
  fireEvent.change(screen.getByLabelText('Файл списка каналов'), { target: { files: [file] } });

  await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
  expect(fetcher).toHaveBeenCalledWith('/api/channels/list-transfer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"version":1}',
  });
  expect(screen.getByRole('status').textContent).toContain('Добавлено: 2');
});

it('offers export only to an administrator', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { role: 'ADMIN' } }) }));
  render(React.createElement(ChannelListTransfer, { onImported: vi.fn() }));
  expect((await screen.findByRole('link', { name: 'Скачать список каналов' })).getAttribute('href')).toBe('/api/channels/list-transfer');
});
