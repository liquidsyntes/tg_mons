import { logger } from '@/lib/logger';

const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const BATCH_SIZE = 10;
const CONCURRENT_BATCHES = 4;
const MAX_TEXT_LENGTH = 4000;
// Conservative pilot threshold: only clear negatives are excluded until labeled posts are available.
const MIN_ANNOUNCEMENT_PROBABILITY = 0.2;
const REQUEST_TIMEOUT_MS = 15000;
const SIGNALS = [
  { id: 'announcement', weight: 0.6, question: 'Does the text announce or remind readers of a specific scheduled gathering, such as a concert, party, lecture or meetup? Product advertising, event reviews, general schedules and vague plans do not count.' },
  { id: 'date', weight: 0.12, question: 'Does the text state a calendar date or relative day for that gathering, such as tomorrow or next Saturday? Do not infer a date.' },
  { id: 'time', weight: 0.08, question: 'Does the text state a clock time or time range for that gathering? Do not infer a time.' },
  { id: 'invitation', weight: 0.08, question: 'Does the text invite readers to attend the gathering or ask them to take action to attend it?' },
  { id: 'tickets', weight: 0.06, question: 'Does the text mention admission tickets or a price for attending the gathering?' },
  { id: 'registration', weight: 0.06, question: 'Does the text mention registering, reserving or booking a place at the gathering?' },
] as const;

export interface EventCandidate {
  id: number;
  text: string;
}

export type EventSelectionMode = 'jev' | 'keyword_fallback';

export interface EventSelection<T extends EventCandidate> {
  posts: T[];
  mode: EventSelectionMode;
}

function readProbability(answers: Record<string, unknown>, key: string): number {
  const answer = answers[key];
  if (!answer || typeof answer !== 'object' || !('type' in answer) || !('noul' in answer) ||
      answer.type !== 'noul' || typeof answer.noul !== 'number' ||
      !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1) {
    throw new Error('Invalid Jev answer');
  }
  return answer.noul;
}

function readAnswers(value: unknown, posts: EventCandidate[]): Map<number, number> {
  if (!value || typeof value !== 'object' || !('answers' in value)) {
    throw new Error('Invalid Jev response');
  }

  const answers = value.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new Error('Invalid Jev answers');
  }

  const answerMap = answers as Record<string, unknown>;
  const selected = new Map<number, number>();
  for (const post of posts) {
    let announcement = 0;
    let priority = 0;
    for (const signal of SIGNALS) {
      const probability = readProbability(answerMap, `${signal.id}_${post.id}`);
      if (signal.id === 'announcement') announcement = probability;
      priority += signal.weight * probability;
    }
    if (announcement >= MIN_ANNOUNCEMENT_PROBABILITY) selected.set(post.id, priority);
  }
  return selected;
}

async function evaluateBatch(posts: EventCandidate[], apiKey: string): Promise<Map<number, number>> {
  const state = {
    posts: posts.map(post => ({
      id: post.id,
      text: post.text.slice(0, MAX_TEXT_LENGTH),
    })),
  };
  const questions = Object.fromEntries(posts.flatMap((post, index) => SIGNALS.map(signal => [
    `${signal.id}_${post.id}`,
    { type: 'noul', instructions: `Evaluate only posts[${index}]. ${signal.question}` },
  ])));

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(JEV_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state, model: '~typesafe/jev-latest', questions }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if ((response.status === 429 || response.status === 529) && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
      continue;
    }
    if (!response.ok) throw new Error(`Jev API status ${response.status}`);
    return readAnswers(await response.json() as unknown, posts);
  }

  throw new Error('Jev API retries exhausted');
}

export async function selectEventCandidatesWithJev<T extends EventCandidate>(posts: T[]): Promise<EventSelection<T>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { posts, mode: 'keyword_fallback' };

  try {
    const selectedPriorities = new Map<number, number>();
    for (let offset = 0; offset < posts.length; offset += BATCH_SIZE * CONCURRENT_BATCHES) {
      const batches = Array.from({ length: CONCURRENT_BATCHES }, (_, index) =>
        posts.slice(offset + index * BATCH_SIZE, offset + (index + 1) * BATCH_SIZE)
      ).filter(batch => batch.length > 0);
      const results = await Promise.allSettled(batches.map(batch => evaluateBatch(batch, apiKey)));
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
        for (const [id, priority] of result.value) selectedPriorities.set(id, priority);
      }
    }
    return {
      posts: posts.filter(post => selectedPriorities.has(post.id))
        .sort((a, b) => (selectedPriorities.get(b.id) ?? 0) - (selectedPriorities.get(a.id) ?? 0)),
      mode: 'jev',
    };
  } catch (error) {
    logger.warn('Jev event screening unavailable; using keyword candidates', undefined, error);
    return { posts, mode: 'keyword_fallback' };
  }
}
