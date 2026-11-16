const MAX_TEXT_LENGTH = 4000;
// Conservative pilot threshold: only clear negatives are excluded until labeled posts are available.
export const MIN_ANNOUNCEMENT_PROBABILITY = 0.2;
export const MIN_DIGEST_PROBABILITY = 0.8;
export const MIN_FOCUSED_PROBABILITY = 0.5;
export const MIN_ACTIONABLE_PROBABILITY = 0.5;
export const MIN_RECAP_PROBABILITY = 0.8;
export const SIGNALS = [
  { id: 'announcement', weight: 0.6, question: 'Does the text announce or remind readers of a specific scheduled gathering, such as a concert, party, lecture or meetup? Product advertising, event reviews, general schedules and vague plans do not count.' },
  { id: 'date', weight: 0.12, question: 'Does the text state a calendar date or relative day for that gathering, such as tomorrow or next Saturday? Do not infer a date.' },
  { id: 'time', weight: 0.08, question: 'Does the text state a clock time or time range for that gathering? Do not infer a time.' },
  { id: 'invitation', weight: 0.08, question: 'Does the text invite readers to attend the gathering or ask them to take action to attend it?' },
  { id: 'tickets', weight: 0.06, question: 'Does the text mention admission tickets or a price for attending the gathering?' },
  { id: 'registration', weight: 0.06, question: 'Does the text mention registering, reserving or booking a place at the gathering?' },
  { id: 'digest', weight: 0, question: 'Is this post primarily a roundup of several independent events, each with its own title, date or destination, rather than an announcement of one event? A multi-day festival or the program of one gathering is not a roundup.' },
  { id: 'focused', weight: 0, question: 'Is the main purpose of this post to invite readers to one specific future event? An article, recap, general course promotion or list of upcoming events does not count, even when it mentions dates.' },
  { id: 'actionable', weight: 0, question: 'Does this post give both a specific event date and at least one practical attendance detail for that same event, such as a start time, venue, online platform, ticket terms, registration link or contact? A date-only teaser is insufficient.' },
  { id: 'recap', weight: 0, question: 'Is this post mainly looking back at a completed activity, including photos, video or reflections, even if a short list of future events appears near the end?' },
] as const;

export interface EventCandidate {
  id: number;
  text: string;
}

export type EventSelectionMode = 'jev' | 'gemini' | 'keyword_fallback';

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

export function readDecisionAnswers(value: unknown, posts: EventCandidate[], thresholds: Record<string, number> = DECISION_THRESHOLDS): Map<number, number> {
  if (!value || typeof value !== 'object' || !('answers' in value)) {
    throw new Error('Invalid Jev response');
  }

  const answers = value.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new Error('Invalid Jev answers');
  }

  for (const key of Object.keys(DECISION_THRESHOLDS)) {
    const value = thresholds[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid decision threshold');
  }
  const answerMap = answers as Record<string, unknown>;
  const selected = new Map<number, number>();
  for (const post of posts) {
    let announcement = 0;
    let digest = 0;
    let focused = 0;
    let actionable = 0;
    let recap = 0;
    let priority = 0;
    for (const signal of SIGNALS) {
      const probability = readProbability(answerMap, `${signal.id}_${post.id}`);
      if (signal.id === 'announcement') announcement = probability;
      if (signal.id === 'digest') digest = probability;
      if (signal.id === 'focused') focused = probability;
      if (signal.id === 'actionable') actionable = probability;
      if (signal.id === 'recap') recap = probability;
      priority += signal.weight * probability;
    }
    if (announcement >= thresholds.announcement && digest < thresholds.digest &&
        focused >= thresholds.focused && actionable >= thresholds.actionable &&
        recap < thresholds.recap) {
      selected.set(post.id, priority);
    }
  }
  return selected;
}


export const DECISION_MODELS = ['~typesafe/jev-latest', 'google/gemini-decision-1'] as const;
export type DecisionModel = typeof DECISION_MODELS[number];
export function parseDecisionModel(value: string): DecisionModel {
  if (value === DECISION_MODELS[0] || value === DECISION_MODELS[1]) return value;
  throw new Error('Unsupported event decision model');
}
export function buildDecisionRequest(posts: EventCandidate[], model: DecisionModel) {
  return {
    model,
    state: { posts: posts.map(post => ({id: post.id, text: post.text.slice(0, MAX_TEXT_LENGTH)})) },
    questions: Object.fromEntries(posts.flatMap((post, index) => SIGNALS.map(signal => [
      `${signal.id}_${post.id}`, {type: 'noul', instructions: `Evaluate only posts[${index}]. ${signal.question}`},
    ]))),
  };
}
export function keywordCandidate(text: string): boolean {
  return ['вечеринка', 'старт', 'начало', 'билет', 'dj', 'вход', 'line-up', 'мероприятие', 'анонс', 'событие'].some(word => text.toLowerCase().includes(word));
}
export const DECISION_THRESHOLDS = {
  announcement: MIN_ANNOUNCEMENT_PROBABILITY, digest: MIN_DIGEST_PROBABILITY,
  focused: MIN_FOCUSED_PROBABILITY, actionable: MIN_ACTIONABLE_PROBABILITY, recap: MIN_RECAP_PROBABILITY,
};
