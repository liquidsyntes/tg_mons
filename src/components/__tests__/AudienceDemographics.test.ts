/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { AudienceDemographics } from '../AudienceDemographics';
const data = { demographics: { capturedAt: '2026-09-01T00:00:00Z', countries: null, geographyStatus: 'unsupported',
  languages: [{ code: 'en', name: 'English', percent: 40 }, { code: 'uk', name: 'Ukrainian', percent: 30 },
    { code: 'de', name: 'German', percent: 20 }, { code: 'fr', name: 'French', percent: 10 }] } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('AudienceDemographics', () => {
  it('shows the top three languages, date, stale notice and geography limitation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
    render(React.createElement(AudienceDemographics, { channelId: 1 }));
    expect(await screen.findByText('English')).toBeDefined();
    expect(screen.queryByText('French')).toBeNull();
    expect(screen.getByText(/Данные старше недели/)).toBeDefined();
    expect(screen.getByText(/География недоступна/)).toBeDefined();
  });
  it.each([false, true])('shows empty or error state', async failed => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: !failed, json: async () => ({ demographics: null }) }));
    render(React.createElement(AudienceDemographics, { channelId: 1 }));
    expect(await screen.findByText(failed ? /Не удалось загрузить/ : /Демография пока недоступна/)).toBeDefined();
  });
  it('aborts a previous request and ignores late responses after channel changes', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    const fetcher = vi.fn().mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ demographics: null }) });
    vi.stubGlobal('fetch', fetcher);
    const { rerender } = render(React.createElement(AudienceDemographics, { channelId: 1 }));
    expect(screen.getByText(/Загрузка демографии/)).toBeDefined();
    rerender(React.createElement(AudienceDemographics, { channelId: 2 }));
    await screen.findByText(/Демография пока недоступна/);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { resolveOld({ ok: true, json: async () => data }); });
    expect(screen.queryByText('English')).toBeNull();
  });
});
