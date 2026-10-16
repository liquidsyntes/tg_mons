/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import { ReportsListClient } from '../ReportsListClient';

const reports = [
  { id: 1, type: 'summary', createdAt: '2026-10-01T12:00:00.000Z', channel: { title: 'Канал один' } },
  { id: 2, type: 'summary', createdAt: '2026-10-02T12:00:00.000Z', channel: { title: 'Канал два' } },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ReportsListClient deletion', () => {
  it('requires confirmation and removes only the deleted report after success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', confirmMock);
    render(React.createElement(ReportsListClient, { reports }));

    fireEvent.click(screen.getByRole('button', { name: 'Удалить отчет 1' }));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Удалить отчет 1' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/reports/1', { method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByText('Канал один')).toBeNull());
    expect(screen.getByText('Канал два')).toBeDefined();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('keeps the report and shows an error if deletion fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    render(React.createElement(ReportsListClient, { reports }));

    fireEvent.click(screen.getByRole('button', { name: 'Удалить отчет 1' }));

    expect(await screen.findByText('Не удалось удалить отчет')).toBeDefined();
    expect(screen.getByText('Канал один')).toBeDefined();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
