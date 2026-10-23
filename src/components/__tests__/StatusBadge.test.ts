/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge UI Component', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Activity status badge mode', () => {
    it('renders "активен" state with emerald styling and label', () => {
      render(React.createElement(StatusBadge, { variant: 'activity', activityStatus: 'активен' }));
      const badge = screen.getByTestId('status-badge-activity');
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain('Активен');
      expect(badge.className).toContain('text-emerald-400');
      expect(badge.className).toContain('bg-emerald-500/10');
      expect(badge.getAttribute('title')).toContain('Канал активен');
    });

    it('renders "замедлился" state with amber styling and label', () => {
      render(React.createElement(StatusBadge, { variant: 'activity', activityStatus: 'замедлился' }));
      const badge = screen.getByTestId('status-badge-activity');
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain('Замедлился');
      expect(badge.className).toContain('text-amber-400');
      expect(badge.className).toContain('bg-amber-500/10');
      expect(badge.getAttribute('title')).toContain('Канал замедлился');
    });

    it('renders "молчит" state with rose styling and label', () => {
      render(React.createElement(StatusBadge, { variant: 'activity', activityStatus: 'молчит' }));
      const badge = screen.getByTestId('status-badge-activity');
      expect(badge).toBeDefined();
      expect(badge.textContent).toContain('Молчит');
      expect(badge.className).toContain('text-rose-400');
      expect(badge.className).toContain('bg-rose-500/10');
      expect(badge.getAttribute('title')).toContain('Канал молчит');
    });

    it('automatically determines status from lastPostAt', () => {
      const nowMs = Date.now();
      const MS_DAY = 24 * 3600 * 1000;

      // 1 day ago -> активен
      const { unmount: u1 } = render(
        React.createElement(StatusBadge, { variant: 'activity', lastPostAt: new Date(nowMs - 1 * MS_DAY).toISOString() })
      );
      expect(screen.getByTestId('status-badge-activity').textContent).toContain('Активен');
      u1();

      // 5 days ago -> замедлился
      const { unmount: u2 } = render(
        React.createElement(StatusBadge, { variant: 'activity', lastPostAt: new Date(nowMs - 5 * MS_DAY).toISOString() })
      );
      expect(screen.getByTestId('status-badge-activity').textContent).toContain('Замедлился');
      u2();

      // 10 days ago -> молчит
      const { unmount: u3 } = render(
        React.createElement(StatusBadge, { variant: 'activity', lastPostAt: new Date(nowMs - 10 * MS_DAY).toISOString() })
      );
      expect(screen.getByTestId('status-badge-activity').textContent).toContain('Молчит');
      u3();

      // null -> молчит
      render(React.createElement(StatusBadge, { variant: 'activity', lastPostAt: null }));
      expect(screen.getByTestId('status-badge-activity').textContent).toContain('Молчит');
    });

    it('supports direct status string "активен" / "замедлился" / "молчит"', () => {
      render(React.createElement(StatusBadge, { status: 'активен' }));
      expect(screen.getByTestId('status-badge-activity').textContent).toContain('Активен');
    });

    it('renders compact mode without text when showText={false}', () => {
      render(
        React.createElement(StatusBadge, {
          variant: 'activity',
          activityStatus: 'активен',
          showText: false,
        })
      );
      const badge = screen.getByTestId('status-badge-activity');
      expect(badge.textContent).toBe('');
      expect(badge.className).toContain('w-7 h-7');
    });
  });

  describe('Collection status badge mode (backward compatibility)', () => {
    it('renders error state with alert circle', () => {
      render(React.createElement(StatusBadge, { status: 'error', lastError: 'Connection timed out' }));
      const badge = screen.getByTitle('Connection timed out');
      expect(badge).toBeDefined();
      expect(badge.className).toContain('text-rose-400');
    });

    it('renders recent collection state (<= 30 min) in emerald', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      render(React.createElement(StatusBadge, { status: 'success', lastCollectedAt: tenMinutesAgo }));
      const badge = screen.getByTitle(/Последний сбор/);
      expect(badge.className).toContain('text-emerald-400');
    });
  });
});
