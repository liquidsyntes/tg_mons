import { trackedProviderFetch, AiOperationError } from '../ai-operations/store';
import { buildDecisionRequest, readDecisionAnswers, parseDecisionModel, type EventCandidate, type EventSelection } from './decisions';
import { logger } from '@/lib/logger';
import { getAiConfig } from '@/lib/ai-config';

const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const BATCH_SIZE = 10;
const CONCURRENT_BATCHES = 4;
const REQUEST_TIMEOUT_MS = 15000;
export type { EventCandidate, EventSelection, EventSelectionMode } from './decisions';

async function evaluateBatch(posts: EventCandidate[], apiKey: string): Promise<Map<number, number>> {
  const payload = buildDecisionRequest(posts, parseDecisionModel(process.env.EVENT_DECISION_MODEL || '~typesafe/jev-latest'));

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await trackedProviderFetch(payload.model, 'decisions', JEV_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
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
    return readDecisionAnswers(await response.json() as unknown, posts);
  }

  throw new Error('Jev API retries exhausted');
}

export async function selectEventCandidatesWithJev<T extends EventCandidate>(posts: T[]): Promise<EventSelection<T>> {
  const { apiKey } = await getAiConfig();
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
      mode: process.env.EVENT_DECISION_MODEL === 'google/gemini-decision-1' ? 'gemini' : 'jev',
    };
  } catch (error) {
    if (error instanceof AiOperationError) throw error;
    logger.warn('Jev event screening unavailable; using keyword candidates', undefined, error);
    return { posts, mode: 'keyword_fallback' };
  }
}
