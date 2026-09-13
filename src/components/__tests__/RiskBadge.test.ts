/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { RiskBadge, FraudScoreBadge } from '../RiskBadge';

describe('RiskBadge UI Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders low risk state (score 0%) with ShieldCheck icon and emerald styling', () => {
    render(React.createElement(RiskBadge, { score: 0 }));
    const badge = screen.getByTestId('risk-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('Risk of Artificial Traffic: 0%');
    expect(badge.className).toContain('text-emerald-400');
    expect(badge.className).toContain('bg-emerald-500/15');
    expect(badge.getAttribute('title')).toContain('Низкий риск накрутки');
  });

  it('renders medium risk state (score 25%) with AlertTriangle icon and amber styling', () => {
    render(React.createElement(RiskBadge, { score: 25 }));
    const badge = screen.getByTestId('risk-badge');
    expect(badge.textContent).toContain('Risk of Artificial Traffic: 25%');
    expect(badge.className).toContain('text-amber-400');
    expect(badge.className).toContain('bg-amber-500/15');
  });

  it('renders high risk state (score 50%, 75%, 100%) with AlertTriangle icon and rose styling', () => {
    const { unmount } = render(React.createElement(RiskBadge, { score: 50 }));
    let badge = screen.getByTestId('risk-badge');
    expect(badge.textContent).toContain('Risk of Artificial Traffic: 50%');
    expect(badge.className).toContain('text-rose-400');
    expect(badge.className).toContain('bg-rose-500/15');
    unmount();

    render(React.createElement(RiskBadge, { score: 75 }));
    badge = screen.getByTestId('risk-badge');
    expect(badge.textContent).toContain('Risk of Artificial Traffic: 75%');
    expect(badge.className).toContain('text-rose-400');
  });

  it('safely clamps scores < 0 to 0% and > 100 to 100%', () => {
    const { unmount } = render(React.createElement(RiskBadge, { score: -20 }));
    let badge = screen.getByTestId('risk-badge');
    expect(badge.textContent).toContain('Risk of Artificial Traffic: 0%');
    unmount();

    render(React.createElement(RiskBadge, { score: 180 }));
    badge = screen.getByTestId('risk-badge');
    expect(badge.textContent).toContain('Risk of Artificial Traffic: 100%');
  });

  it('parses numeric strings and BigInt scores accurately', () => {
    const { unmount } = render(React.createElement(RiskBadge, { score: '75' as any }));
    let badge = screen.getByTestId('risk-badge');
    expect(badge.textContent).toContain('Risk of Artificial Traffic: 75%');
    unmount();

    render(React.createElement(RiskBadge, { score: 50n as any }));
    badge = screen.getByTestId('risk-badge');
    expect(badge.textContent).toContain('Risk of Artificial Traffic: 50%');
  });

  it('handles null, undefined, and NaN scores by defaulting to 0%', () => {
    const { unmount: u1 } = render(React.createElement(RiskBadge, { score: null }));
    expect(screen.getByTestId('risk-badge').textContent).toContain('Risk of Artificial Traffic: 0%');
    u1();

    const { unmount: u2 } = render(React.createElement(RiskBadge, { score: undefined }));
    expect(screen.getByTestId('risk-badge').textContent).toContain('Risk of Artificial Traffic: 0%');
    u2();

    render(React.createElement(RiskBadge, { score: NaN }));
    expect(screen.getByTestId('risk-badge').textContent).toContain('Risk of Artificial Traffic: 0%');
  });

  it('handles null and undefined signals parameter without crashing', () => {
    expect(() => render(React.createElement(RiskBadge, { score: 50, signals: null as any }))).not.toThrow();
    cleanup();
    expect(() => render(React.createElement(RiskBadge, { score: 50, signals: undefined as any }))).not.toThrow();
  });

  it('formats tooltip with diagnostic reasons from signals and provides fallbacks', () => {
    const signals = [
      { signalType: 'views_to_subs_ratio', value: 0.02, reason: 'Низкие просмотры' },
      { signalType: 'uniform_err', value: 0.01, reason: '' },
      { signalType: '', value: 1, reason: '' },
    ];

    render(React.createElement(RiskBadge, { score: 50, signals: signals as any }));
    const badge = screen.getByTestId('risk-badge');
    const title = badge.getAttribute('title') || '';
    expect(title).toContain('Risk of Artificial Traffic: 50%');
    expect(title).toContain('• Низкие просмотры');
    expect(title).toContain('• uniform_err');
    expect(title).toContain('• Подозрительная активность');
  });

  it('allows alias FraudScoreBadge to be used identically', () => {
    render(React.createElement(FraudScoreBadge, { score: 75 }));
    expect(screen.getByTestId('risk-badge').textContent).toContain('Risk of Artificial Traffic: 75%');
  });

  it('applies custom className prop correctly', () => {
    render(React.createElement(RiskBadge, { score: 25, className: 'custom-test-class' }));
    expect(screen.getByTestId('risk-badge').className).toContain('custom-test-class');
  });
});
