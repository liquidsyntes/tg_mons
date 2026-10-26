/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdPriceSettings } from '../AdPriceSettings';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('saves the personal price in hryvnia and resets both overrides', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      canEdit: true, priceSource: 'niche_estimate', customAdPriceUah: null, customCpmUah: null,
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      customAdPriceUah: 800, customCpmUah: 300, priceSource: 'custom_price',
    }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      customAdPriceUah: null, customCpmUah: null, priceSource: 'niche_estimate',
    }) });
  vi.stubGlobal('fetch', fetcher);
  const onSaved = vi.fn();
  render(React.createElement(AdPriceSettings, { channelId: 7, onSaved }));

  fireEvent.click(await screen.findByRole('button', { name: 'Указать цену поста / CPM' }));
  fireEvent.change(screen.getByLabelText('Цена одного поста, ₴'), { target: { value: '800' } });
  fireEvent.change(screen.getByLabelText('CPM, ₴ за 1000 просмотров'), { target: { value: '300' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ customAdPriceUah: 800, customCpmUah: 300 });
  expect(screen.getByText('Указанная цена поста')).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: 'Указать цену поста / CPM' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сбросить к оценке по нише' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ customAdPriceUah: null, customCpmUah: null });
  expect(screen.getByText('Оценка по нише')).toBeDefined();
});

it('does not offer editing in a read-only session', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    canEdit: false, priceSource: 'niche_estimate', customAdPriceUah: null, customCpmUah: null,
  }) }));
  render(React.createElement(AdPriceSettings, { channelId: 7, onSaved: vi.fn() }));
  expect(await screen.findByText('Оценка по нише')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Указать цену поста / CPM' })).toBeNull();
});
