/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiUsageSettings } from '../AiUsageSettings';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function buildUsageResponse(overrides: Record<string, unknown> = {}) {
  return {
    budget: {
      periods: [
        {
          period: 'day',
          start: '2026-11-18T00:00:00.000Z',
          end: '2026-11-19T00:00:00.000Z',
          budget: '5.0000000000',
          knownCostUsd: '4.2500000000',
          unknownCostCalls: 1,
          reached: false,
        },
        {
          period: 'month',
          start: '2026-11-01T00:00:00.000Z',
          end: '2026-12-01T00:00:00.000Z',
          budget: null,
          knownCostUsd: '12.5',
          unknownCostCalls: 2,
          reached: false,
        },
      ],
      notices: [
        {
          id: 'notice-1',
          period: 'day',
          periodStart: '2026-11-18T00:00:00.000Z',
          threshold: 80,
          delivery: 'SENT',
        },
      ],
    },
    operations: [
      {
        id: 'op-1',
        actor: 'user:1',
        kind: 'summary',
        status: 'SUCCEEDED',
        createdAt: '2026-11-18T10:15:00.000Z',
        calls: [
          {
            model: 'google/gemini-2.5-flash',
            stage: 'generate',
            status: 'SUCCEEDED',
            cost: '0.0042000000',
            durationMs: 840,
            inputTokens: 1200,
            outputTokens: 350,
          },
        ],
      },
    ],
    total: 30,
    settings: {
      aiHourlyLimit: 10,
      aiConcurrentLimit: 2,
      aiProviderConcurrency: 4,
      aiDailyBudget: '5.0',
      aiMonthlyBudget: null,
      aiBudgetMode: 'WARN',
      aiBudgetWarning: 80,
      aiBudgetTelegram: true,
    },
    summary: {
      knownCostUsd: '12.5000000000',
      unknownCostCalls: 2,
      calls: 15,
    },
    ...overrides,
  };
}

describe('AiUsageSettings', () => {
  it('renders cost summary, UTC budget periods, threshold notices, and operation log', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildUsageResponse(),
    });
    vi.stubGlobal('fetch', fetcher);

    render(React.createElement(AiUsageSettings));

    expect(await screen.findByText('12.5 USD')).toBeDefined();
    expect(screen.getByText('2 запросов')).toBeDefined();
    expect(screen.getByText('День UTC')).toBeDefined();
    expect(screen.getByText('Месяц UTC')).toBeDefined();
    expect(screen.getByText('4.25 / 5 USD')).toBeDefined();
    expect(screen.getByText('12.5 / отключено')).toBeDefined();

    const statusNotice = screen.getByRole('status');
    expect(statusNotice.textContent).toContain('80%');
    expect(statusNotice.textContent).toContain('Telegram: доставлено');

    expect(screen.getByText('user:1')).toBeDefined();
    expect(screen.getByText('summary')).toBeDefined();
    expect(screen.getByText('google/gemini-2.5-flash')).toBeDefined();
    expect(screen.getByText('0.0042 USD')).toBeDefined();
    expect(screen.getByText('840 мс')).toBeDefined();
    expect(screen.getByText('Токены: 1200 / 350')).toBeDefined();
  });

  it('saves updated limits and budgets via POST and shows confirmation status', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => buildUsageResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildUsageResponse({
            settings: {
              aiHourlyLimit: 25,
              aiConcurrentLimit: 2,
              aiProviderConcurrency: 4,
              aiDailyBudget: '10',
              aiMonthlyBudget: '100',
              aiBudgetMode: 'BLOCK',
              aiBudgetWarning: 85,
              aiBudgetTelegram: true,
            },
          }),
      });
    vi.stubGlobal('fetch', fetcher);

    render(React.createElement(AiUsageSettings));
    await screen.findByText('12.5 USD');

    fireEvent.change(screen.getByLabelText(/Операций за час на инициатора/), {
      target: { value: '25' },
    });
    fireEvent.change(screen.getByLabelText('Дневной бюджет USD'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText('Месячный бюджет USD'), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByLabelText('Режим'), {
      target: { value: 'BLOCK' },
    });
    fireEvent.change(screen.getByLabelText('Порог предупреждения (%)'), {
      target: { value: '85' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить лимиты' }));

    await waitFor(() => {
      const postCall = fetcher.mock.calls.find(
        ([url, init]) =>
          url === '/api/admin/ai-usage' && (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String((postCall![1] as RequestInit).body));
      expect(body).toEqual({
        aiHourlyLimit: 25,
        aiConcurrentLimit: 2,
        aiProviderConcurrency: 4,
        aiDailyBudget: '10',
        aiMonthlyBudget: '100',
        aiBudgetMode: 'BLOCK',
        aiBudgetWarning: 85,
        aiBudgetTelegram: true,
      });
    });

    expect(await screen.findByText('Лимиты и настройки бюджета сохранены')).toBeDefined();
  });

  it('supports filtering by period, actor, kind and pagination controls', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildUsageResponse(),
    });
    vi.stubGlobal('fetch', fetcher);

    render(React.createElement(AiUsageSettings));
    await screen.findByText('12.5 USD');

    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/admin/ai-usage?page=1&days=7&actor=&kind=',
        expect.any(Object),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/admin/ai-usage?page=0&days=7&actor=&kind=',
        expect.any(Object),
      ),
    );

    fireEvent.change(screen.getByLabelText('Период'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Инициатор'), { target: { value: 'user:7' } });
    fireEvent.change(screen.getByLabelText('Операция'), { target: { value: 'events-scan' } });

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/api/admin/ai-usage?page=0&days=30&actor=user%3A7&kind=events-scan',
        expect.any(Object),
      ),
    );
  });

  it('shows empty state and error alerts when load or save fails', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Ошибка сервера при загрузке' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildUsageResponse({ operations: [], total: 0 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Некорректные настройки бюджета' }),
      });
    vi.stubGlobal('fetch', fetcher);

    render(React.createElement(AiUsageSettings));
    const initialAlert = await screen.findByRole('alert');
    expect(initialAlert.textContent).toContain('Ошибка сервера при загрузке');

    // Trigger reload via filter change
    fireEvent.change(screen.getByLabelText('Период'), { target: { value: '30' } });
    expect(await screen.findByText('Операций за период нет')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить лимиты' }));
    const saveAlert = await screen.findByRole('alert');
    expect(saveAlert.textContent).toContain('Некорректные настройки бюджета');
  });
});
