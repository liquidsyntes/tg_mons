/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getHelpSectionById } from '@/lib/help/help-content';
import { HelpPopover } from '../HelpPopover';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('HelpPopover', () => {
  it('renders trigger button with accessible attributes and data-pdf-hide', () => {
    const section = getHelpSectionById('antifraud-score');
    expect(section).toBeDefined();

    render(React.createElement(HelpPopover, { sectionId: 'antifraud-score' }));

    const trigger = screen.getByRole('button', {
      name: `Справка: ${section!.title}`,
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('data-pdf-hide')).toBe('true');
  });

  it('opens on click with shortSummary, section link, and closes on second click', () => {
    const section = getHelpSectionById('watchlist-widget')!;

    render(React.createElement(HelpPopover, { sectionId: 'watchlist-widget' }));

    const trigger = screen.getByRole('button', { name: `Справка: ${section.title}` });
    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-pdf-hide')).toBe('true');
    expect(screen.getByText(section.shortSummary)).toBeTruthy();

    const detailsLink = screen.getByRole('link', { name: /подробнее в справке/i });
    expect(detailsLink.getAttribute('href')).toBe('/help#watchlist-widget');

    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape key and on outside mousedown', () => {
    const section = getHelpSectionById('best-time-widget')!;

    render(React.createElement(HelpPopover, { sectionId: 'best-time-widget' }));

    const trigger = screen.getByRole('button', { name: `Справка: ${section.title}` });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on mouseEnter, stays open when hovering dialog, and closes after delay on mouseLeave', () => {
    vi.useFakeTimers();
    const section = getHelpSectionById('trend-spotter')!;

    render(React.createElement(HelpPopover, { sectionId: 'trend-spotter' }));

    const trigger = screen.getByRole('button', { name: `Справка: ${section.title}` });
    fireEvent.mouseEnter(trigger);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();

    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(dialog);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.mouseLeave(dialog);
    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stops click propagation when placed near clickable ancestors', () => {
    const parentClick = vi.fn();
    const section = getHelpSectionById('channels-table')!;

    render(
      React.createElement(
        'div',
        { onClick: parentClick },
        React.createElement(HelpPopover, { sectionId: 'channels-table' })
      )
    );

    const trigger = screen.getByRole('button', { name: `Справка: ${section.title}` });
    fireEvent.click(trigger);

    expect(parentClick).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
