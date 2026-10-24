import type { Event, Prisma } from '@prisma/client';

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

function hasPrices(value: Prisma.JsonValue | null): boolean {
  return value !== null && (!Array.isArray(value) || value.length > 0);
}

/** Moves links and dismissals to the oldest matching Event before deleting duplicates. */
export async function mergeDuplicateEventsInDb(): Promise<number> {
  const { prisma } = await import('../prisma');
  const events = await prisma.event.findMany({
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const groupsByDate = new Map<number, Event[][]>();
  for (const event of events) {
    const date = event.date.getTime();
    const groups = groupsByDate.get(date) ?? [];
    const group = groups.find(candidate => isSameEvent(candidate[0], event));
    if (group) group.push(event);
    else groups.push([event]);
    groupsByDate.set(date, groups);
  }

  let merged = 0;
  for (const groups of groupsByDate.values()) {
    for (const group of groups) {
      if (group.length < 2) continue;
      merged += await prisma.$transaction(async tx => {
        const records = await tx.event.findMany({
          where: { id: { in: group.map(event => event.id) } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            mentions: { select: { postId: true } },
            dismissedByUsers: { select: { userId: true, dismissedAt: true } },
          },
        });
        const canonical = records.find(event => event.id === group[0].id);
        if (!canonical) return 0;
        const duplicates = records.filter(event => event.id !== canonical.id);
        if (duplicates.length === 0) return 0;

        const postIds = [...new Set(duplicates.flatMap(event => event.mentions.map(mention => mention.postId)))];
        if (postIds.length > 0) {
          await tx.eventMention.createMany({
            data: postIds.map(postId => ({ eventId: canonical.id, postId })),
            skipDuplicates: true,
          });
        }
        const dismissals = duplicates.flatMap(event => event.dismissedByUsers.map(dismissal => ({
          userId: dismissal.userId, eventId: canonical.id, dismissedAt: dismissal.dismissedAt,
        })));
        if (dismissals.length > 0) {
          await tx.userDismissedEvent.createMany({ data: dismissals, skipDuplicates: true });
        }

        const updates: Prisma.EventUpdateInput = {};
        if (!canonical.timeStr?.trim()) {
          const timeStr = duplicates.find(event => event.timeStr?.trim())?.timeStr;
          if (timeStr) updates.timeStr = timeStr;
        }
        if (!canonical.organizer?.trim()) {
          const organizer = duplicates.find(event => event.organizer?.trim())?.organizer;
          if (organizer) updates.organizer = organizer;
        }
        if (!hasPrices(canonical.prices)) {
          const prices = duplicates.find(event => hasPrices(event.prices))?.prices;
          if (prices !== undefined && prices !== null) updates.prices = prices as Prisma.InputJsonValue;
        }
        if (!canonical.dismissedAt) {
          const dismissedAt = duplicates.flatMap(event => event.dismissedAt ? [event.dismissedAt] : [])
            .sort((left, right) => left.getTime() - right.getTime())[0];
          if (dismissedAt) updates.dismissedAt = dismissedAt;
        }
        if (Object.keys(updates).length > 0) {
          await tx.event.update({ where: { id: canonical.id }, data: updates });
        }
        await tx.event.deleteMany({ where: { id: { in: duplicates.map(event => event.id) } } });
        return duplicates.length;
      });
    }
  }
  return merged;
}
