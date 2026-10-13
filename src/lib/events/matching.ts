type EventForMatching = {
  title: string;
  date: Date;
  timeStr?: string | null;
  organizer?: string | null;
};

const titleWords = (value: string): Set<string> => new Set(
  value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)
    ?.filter(word => word.length >= 4 && !['майстер', 'клас', 'заняття', 'подія', 'вечірка'].includes(word)) ?? []
);

const organizerWords = (value: string): Set<string> => new Set(
  value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(word => word.length >= 4) ?? []
);

export function isSameEvent(first: EventForMatching, second: EventForMatching): boolean {
  if (first.date.getTime() !== second.date.getTime()) return false;
  if (first.timeStr && second.timeStr && first.timeStr.trim() !== second.timeStr.trim()) return false;

  const left = first.title.toLocaleLowerCase().trim();
  const right = second.title.toLocaleLowerCase().trim();
  if (left === right || left.includes(right) || right.includes(left)) return true;

  // Different titles need a matching time, organizer and several shared title details.
  if (!first.timeStr || !second.timeStr || !first.organizer || !second.organizer) return false;
  const firstOrganizers = organizerWords(first.organizer);
  if (![...organizerWords(second.organizer)].some(word => firstOrganizers.has(word))) return false;

  const firstWords = titleWords(first.title);
  const secondWords = titleWords(second.title);
  const shared = [...firstWords].filter(word => secondWords.has(word)).length;
  return shared >= 2 && shared / Math.min(firstWords.size, secondWords.size) >= 0.6;
}
