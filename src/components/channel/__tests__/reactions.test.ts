/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReactionBreakdownInline } from '../ReactionBreakdownInline';
import { PopularReactionsWidget } from '../PopularReactionsWidget';

afterEach(cleanup);

describe('reaction breakdown UI', () => {
  it('shows only three leading reactions beside the total', () => {
    render(React.createElement(ReactionBreakdownInline, { total: 16, breakdown: [
      { emoji: '👍', count: 7 }, { emoji: '🔥', count: 5 },
      { emoji: '❤️', count: 3 }, { emoji: '👎', count: 1 },
    ] }));
    expect(screen.getByText('Реакции: 16')).toBeDefined();
    expect(screen.getByText('👍 7')).toBeDefined();
    expect(screen.getByText('🔥 5')).toBeDefined();
    expect(screen.getByText('❤️ 3')).toBeDefined();
    expect(screen.queryByText('👎 1')).toBeNull();
  });

  it('shows the channel summary and a clear empty state', () => {
    const view = render(React.createElement(PopularReactionsWidget, { summary: undefined }));
    expect(screen.getByText('Разбивка реакций пока недоступна')).toBeDefined();
    view.rerender(React.createElement(PopularReactionsWidget, { summary: {
      coveredPosts: 2, totalReactions: 10,
      top: [{ emoji: '👍', count: 6, sharePercent: 60 }],
    } }));
    expect(screen.getByText('👍 6')).toBeDefined();
    expect(screen.getByText('60%')).toBeDefined();
  });
});
