/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EventCard } from '../EventCard';

afterEach(cleanup);

const event = {
  title: 'Концерт',
  date: '2026-10-18T00:00:00.000Z',
  timeStr: null,
  organizer: null,
  prices: null,
};

describe('EventCard mention links', () => {
  it('links every repeated channel badge to its own announcement post', () => {
    render(React.createElement(EventCard, {
      event: {
        ...event,
        mentions: [101, 102].map((messageId, index) => ({
          id: index + 1,
          post: {
            messageId: String(messageId),
            channel: { title: 'Канал А', username: 'channel_a', tgId: '123456' },
          },
        })),
      },
    }));

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      'https://t.me/channel_a/101',
      'https://t.me/channel_a/102',
    ]);
    for (const link of links) {
      expect(link.textContent).toBe('Канал А');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it.each(['123456', '-100123456'])('links a channel without username by tgId %s', tgId => {
    render(React.createElement(EventCard, {
      event: {
        ...event,
        mentions: [{
          id: 1,
          post: { messageId: '77', channel: { title: 'Закрытый канал', username: null, tgId } },
        }],
      },
    }));

    expect(screen.getByRole('link').getAttribute('href')).toBe('https://t.me/c/123456/77');
  });

  it('does not create a broken link when post identifiers are missing', () => {
    render(React.createElement(EventCard, {
      event: {
        ...event,
        mentions: [{
          id: 1,
          post: { messageId: '0', channel: { title: 'Канал А', username: null, tgId: null } },
        }],
      },
    }));

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Канал А').getAttribute('title')).toBe('Ссылка на сообщение недоступна');
  });
});
