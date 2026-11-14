/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdAttributionWidget } from '../AdAttributionWidget';
import type { ChannelAdAttribution } from '@/lib/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('../AdPriceSettings', () => ({
  AdPriceSettings: () => React.createElement('div', { 'data-testid': 'ad-price-settings' }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AdAttributionWidget', () => {
  it('renders KPI summary, placement cards with factual CPM/CPF badges and manual placements', async () => {
    const payload: ChannelAdAttribution = {
      periodDays: 30,
      inbound: [
        {
          postId: 101,
          messageId: '101',
          publishedAt: '2026-11-10T10:00:00.000Z',
          sourceChannel: { id: 1, title: 'Донор Один', username: 'donor1' },
          targetChannel: { id: 2, title: 'Мой Канал', username: 'mychan' },
          isAd: true,
          views: 2500,
          deltaSubscribers24h: 25,
          deltaSubscribers48h: 35,
          estimatedPricePerPost: 1000,
          priceSource: 'niche_estimate',
          estimatedCpf: 40,
          conversionPercent: null,
          overlappingCampaigns: false,
          deletedAt: '2026-11-10T22:00:00.000Z',
          deletedAfterHours: 12,
          retentionFormat: 'early_delete',
          lastCapturedViews: 2950,
          deal: {
            id: 10,
            targetChannelId: 2,
            donorChannelId: 1,
            targetChannel: { id: 2, title: 'Мой Канал', username: 'mychan' },
            donorChannel: { id: 1, title: 'Донор Один', username: 'donor1' },
            postId: 101,
            priceAmount: 1500,
            currency: 'UAH',
            format: '2/48',
            status: 'completed',
            scheduledAt: '2026-11-10T10:00:00.000Z',
            inviteLink: 'https://t.me/+testinvite',
            actualJoins: 30,
            notes: 'Отличная отдача по инвайту',
            effectiveGain: 30,
            factualCpm: 600,
            factualCpf: 50,
            createdAt: '2026-11-10T10:00:00.000Z',
            updatedAt: '2026-11-10T10:00:00.000Z',
          },
        },
      ],
      outbound: [],
      manualPlacements: [
        {
          id: 11,
          targetChannelId: 2,
          donorChannelId: 3,
          targetChannel: { id: 2, title: 'Мой Канал', username: 'mychan' },
          donorChannel: { id: 3, title: 'План Донор', username: 'plandonor' },
          postId: null,
          priceAmount: 800,
          currency: 'UAH',
          format: '1/24',
          status: 'planned',
          scheduledAt: '2026-11-15T12:00:00.000Z',
          inviteLink: null,
          actualJoins: null,
          notes: 'Бронь на пятницу',
          effectiveGain: null,
          factualCpm: null,
          factualCpf: null,
          createdAt: '2026-11-10T10:00:00.000Z',
          updatedAt: '2026-11-10T10:00:00.000Z',
        },
      ],
      summary: {
        dealsCount: 2,
        activeDealsCount: 1,
        totalSpent: 2300,
        currency: 'UAH',
        totalGainedSubscribers: 30,
        avgCpf: 50,
        avgCpm: 600,
        bestDonor: {
          channelId: 1,
          title: 'Донор Один',
          username: 'donor1',
          cpf: 50,
          gainedSubscribers: 30,
          spent: 1500,
        },
      },
      accessibleChannels: [
        { id: 1, title: 'Донор Один', username: 'donor1' },
        { id: 3, title: 'План Донор', username: 'plandonor' },
      ],
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    }));

    render(React.createElement(AdAttributionWidget, { channelId: 2 }));

    await waitFor(() => {
      expect(screen.getByText('Потрачено всего')).toBeDefined();
    });

    expect(screen.getByText(/2\s?300 ₴/)).toBeDefined();
    expect(screen.getByText(/CPM 600 ₴/)).toBeDefined();
    expect(screen.getByText(/CPF 50 ₴/)).toBeDefined();
    expect(screen.getByText('Внимание: удалён раньше 24ч')).toBeDefined();
    expect(screen.getByText(/Сохранённый охват:\s*2\s?950/)).toBeDefined();
    expect(screen.getByText('Отличная отдача по инвайту')).toBeDefined();
    expect(screen.getByText(/Запланированные и ручные закупки \(1\)/)).toBeDefined();
    expect(screen.getByText('Бронь на пятницу')).toBeDefined();

    fireEvent.click(screen.getByText('Добавить закупку'));
    expect(screen.getByLabelText('Форма условий рекламной закупки')).toBeDefined();
  });

  it('renders empty state when there are no placements or manual deals', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        periodDays: 30,
        inbound: [],
        outbound: [],
        manualPlacements: [],
        accessibleChannels: [],
      }),
    }));

    render(React.createElement(AdAttributionWidget, { channelId: 2 }));

    await waitFor(() => {
      expect(screen.getByText('Размещений за выбранный период нет.')).toBeDefined();
    });
  });
});
