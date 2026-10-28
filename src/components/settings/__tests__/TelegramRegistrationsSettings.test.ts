/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TelegramRegistrationsSettings } from '../TelegramRegistrationsSettings';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows a pending Telegram identity and approves it through the admin API', async () => {
  const applicant = { id: 9, telegramSub: '123456789', telegramName: 'Виталий',
    telegramUsername: 'vitaliy', telegramPhotoUrl: null, accessStatus: 'PENDING',
    createdAt: '2026-10-28T12:00:00.000Z' };
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ users: [applicant] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ users: [{ ...applicant, accessStatus: 'ACTIVE' }] }) });
  vi.stubGlobal('fetch', fetcher);
  render(React.createElement(TelegramRegistrationsSettings));

  expect(await screen.findByText('Виталий')).toBeDefined();
  expect(screen.getByText('@vitaliy · ID 123456789')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Одобрить' }));
  await waitFor(() => expect(screen.getByText(/Доступ открыт/)).toBeDefined());
  expect(fetcher).toHaveBeenCalledWith('/api/admin/registrations', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 9, action: 'approve' }),
  });
});
