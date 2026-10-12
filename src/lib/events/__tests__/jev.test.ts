import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/logger';
import { selectEventCandidatesWithJev } from '../jev';

const posts = [
  { id: 1, text: 'Концерт состоится завтра в 19:00.', publishedAt: new Date('2026-10-12T12:00:00Z') },
  { id: 2, text: 'Вспоминаем концерт прошлого года.', publishedAt: new Date('2026-10-12T12:00:00Z') },
];

function answersFor(id: number, announcement: number, support: number) {
  const values: Record<string, number> = {
    announcement,
    date: support,
    time: support,
    invitation: support,
    tickets: support,
    registration: support,
  };
  return Object.fromEntries(Object.entries(values).map(([signal, probability]) => [
    `${signal}_${id}`, { type: 'noul', noul: probability },
  ]));
}

describe('selectEventCandidatesWithJev', () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves keyword candidates when the OpenRouter key is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await selectEventCandidatesWithJev(posts)).toEqual({ posts, mode: 'keyword_fallback' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses OpenRouter Decisions and excludes only clear negatives', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answers: {
        ...answersFor(1, 0.2, 0),
        ...answersFor(2, 0.19, 1),
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await selectEventCandidatesWithJev(posts)).toEqual({ posts: [posts[0]], mode: 'jev' });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(options.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer test-key' }));
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('~typesafe/jev-latest');
    expect(body.state.posts).toHaveLength(2);
    expect(body.questions.announcement_1.type).toBe('noul');
    expect(body.questions.date_1.instructions).toContain('posts[0]');
    expect(body.questions.registration_2.instructions).toContain('posts[1]');
  });

  it('ranks likely announcements higher when supporting cues are present', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answers: { ...answersFor(1, 0.6, 0), ...answersFor(2, 0.6, 1) },
    }), { status: 200 })));

    expect(await selectEventCandidatesWithJev(posts)).toEqual({ posts: [posts[1], posts[0]], mode: 'jev' });
  });

  it('preserves all candidates if the provider response is incomplete', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answers: { ...answersFor(1, 0.9, 1) },
    }), { status: 200 })));

    expect(await selectEventCandidatesWithJev(posts)).toEqual({ posts, mode: 'keyword_fallback' });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('preserves all candidates if a later batch fails', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const manyPosts = Array.from({ length: 11 }, (_, index) => ({ ...posts[0], id: index + 1 }));
    const firstBatchAnswers = Object.assign({}, ...manyPosts.slice(0, 10).map(post => answersFor(post.id, 0.01, 0)));
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ answers: firstBatchAnswers }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 })));

    expect(await selectEventCandidatesWithJev(manyPosts)).toEqual({ posts: manyPosts, mode: 'keyword_fallback' });
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
